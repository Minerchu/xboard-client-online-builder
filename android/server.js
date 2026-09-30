'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const cfg = require('./config');
const { validate } = require('./validate');
const { build } = require('./build');
fs.mkdirSync(cfg.store, { recursive: true });
const historyFile = path.join(cfg.store, 'history.jsonl');
const jobs = new Map(), queue = [], visits = new Map();
let submissions = fs.existsSync(historyFile) ? fs.readFileSync(historyFile, 'utf8').split('\n').filter(line => line.includes('"type":"submitted"')).length : 0;
let active = null;
function history(event) { fs.appendFileSync(historyFile, JSON.stringify(event) + '\n', { mode: 0o600 }); }
function json(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
function cookies(req) { return Object.fromEntries((req.headers.cookie || '').split(';').map(pair => pair.trim().split('=')).filter(parts => parts.length === 2)); }
function visitor(req, res) {
  const id = cookies(req).builder_session;
  if (id && /^[a-f0-9]{64}$/.test(id)) return id;
  const next = crypto.randomBytes(32).toString('hex');
  res.setHeader('Set-Cookie', `builder_session=${next}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.PUBLIC_HTTPS === '1' ? '; Secure' : ''}`);
  return next;
}
function schedule(job) {
  setTimeout(() => {
    if (job.state !== 'ready') return;
    job.state = 'expired';
    try { fs.rmSync(path.join(cfg.store, job.id), { recursive: true, force: true }); }
    catch (err) { console.error('Cleanup failed:', err); }
    setTimeout(() => jobs.delete(job.id), cfg.ttl).unref();
  }, Math.max(0, job.expiresAt - Date.now())).unref();
}
// A restarted service keeps accounting events but does not resurrect private downloads.
for (const entry of fs.readdirSync(cfg.store, { withFileTypes: true })) {
  if (entry.isDirectory() && /^[a-f0-9]{32}$/.test(entry.name)) fs.rmSync(path.join(cfg.store, entry.name), { recursive: true, force: true });
}
async function next() {
  if (active || !queue.length) return;
  const job = queue.shift(); active = job; job.state = 'running';
  const dir = path.join(cfg.store, job.id);
  fs.mkdirSync(dir, { recursive: true });
  try {
    await build(job.input, dir, stage => { job.stage = stage; });
    job.state = 'ready'; job.expiresAt = Date.now() + cfg.ttl;
    history({ type: 'finished', id: job.id, state: 'ready', time: Date.now() });
    schedule(job);
  } catch (error) {
    console.error('Build failed:', job.id, error);
    job.state = 'failed'; job.error = '构建失败，请联系管理员查看服务器日志';
    history({ type: 'finished', id: job.id, state: 'failed', time: Date.now() });
    fs.rmSync(dir, { recursive: true, force: true });
  } finally { job.input = null; active = null; next(); }
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let total = 0, done = false;
    req.on('data', chunk => {
      total += chunk.length;
      if (total > 1500000) { done = true; reject(Error('请求超过大小限制')); req.destroy(); }
      else chunks.push(chunk);
    });
    req.on('end', () => { if (!done) { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(Error('请求不是有效 JSON')); } } });
    req.on('error', reject);
  });
}
function publicState() {
  return { active: active && { name: active.name, stage: active.stage }, queue: queue.map((job, i) => ({ name: job.name, position: i + 1 })), total: submissions };
}
const server = http.createServer(async (req, res) => {
  const session = visitor(req, res);
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
    }
    if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, publicState());
    if (req.method === 'GET' && url.pathname === '/api/mine') {
      return json(res, 200, Array.from(jobs.values()).filter(job => job.session === session).map(job => ({ id: job.id, name: job.name, state: job.state, stage: job.stage, expiresAt: job.expiresAt, error: job.error, position: queue.indexOf(job) + 1 })).reverse());
    }
    if (req.method === 'POST' && url.pathname === '/api/build') {
      const remote = req.socket.remoteAddress;
      const ip = process.env.TRUST_PROXY === '1' && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote) ? (req.headers['x-forwarded-for'] || '').split(',')[0].trim() : remote;
      const previous = visits.get(ip) || [];
      const recent = previous.filter(time => time > Date.now() - 3600000);
      if (recent.length >= 5 || queue.length >= 8) return json(res, 429, { error: '提交过于频繁或队列已满，请稍后再试' });
      const input = validate(await readBody(req));
      const job = { id: crypto.randomBytes(16).toString('hex'), name: input.name, session, input: { name: input.name, url: input.url, icon: input.icon.toString('base64') }, state: 'queued', stage: '等待中' };
      history({ type: 'submitted', id: job.id, name: job.name, time: Date.now() });
      submissions++;
      jobs.set(job.id, job); queue.push(job); recent.push(Date.now()); visits.set(ip, recent);
      next();
      return json(res, 202, { id: job.id });
    }
    const download = /^\/api\/download\/([a-f0-9]{32})$/.exec(url.pathname);
    if (req.method === 'GET' && download) {
      const job = jobs.get(download[1]);
      if (!job || job.session !== session) return json(res, 404, { error: '没有这个下载任务' });
      if (job.state !== 'ready' || job.expiresAt <= Date.now()) return json(res, 410, { error: '文件已过期' });
      const file = path.join(cfg.store, job.id, 'client.apk');
      res.writeHead(200, { 'Content-Type': 'application/vnd.android.package-archive', 'Content-Disposition': 'attachment; filename="xboard-client.apk"', 'Content-Length': fs.statSync(file).size, 'Cache-Control': 'no-store' });
      return fs.createReadStream(file).pipe(res);
    }
    json(res, 404, { error: '页面不存在' });
  } catch (err) { json(res, 400, { error: err.message }); }
});
if (require.main === module) server.listen(cfg.port, '127.0.0.1', () => console.log(`Android builder listening on 127.0.0.1:${cfg.port}`));
module.exports = server;
