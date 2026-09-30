const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { validateName, publicName } = require('./moderation');

if (!['win32', 'linux'].includes(process.platform)) throw new Error('A Windows or Linux host is required');
const root = path.join(__dirname, 'build-output');
const lifetime = 300000;
const historyFile = path.join(__dirname, 'build-history.jsonl');
const history = [];
const historyById = new Map();
const browsers = new Set();
const daily = new Map();
let completed = 0;
const jobs = new Map();
const queue = [];
const requests = new Map();
let active = null;
fs.mkdirSync(root, { recursive: true });
function dayInChina(time) { return new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, 10); }
function countSubmission(time, browser) {
  const day = dayInChina(time);
  if (!daily.has(day)) daily.set(day, { date: day, submissions: 0, completed: 0, browsers: new Set() });
  const entry = daily.get(day);
  entry.submissions++;
  if (browser) { entry.browsers.add(browser); browsers.add(browser); }
}
function countSuccess(record) {
  completed++;
  const entry = daily.get(dayInChina(record.submittedAt));
  if (entry) entry.completed++;
}
if (fs.existsSync(historyFile)) {
  for (const line of fs.readFileSync(historyFile, 'utf8').split('\n')) {
    if (!line) continue;
    try {
      const event = JSON.parse(line);
      if (event.type === 'submitted' && /^[a-f0-9]{32}$/.test(event.id) && typeof event.name === 'string') {
        const record = { id: event.id, name: event.name, submittedAt: event.time, state: 'interrupted' };
        history.push(record);
        historyById.set(record.id, record);
        countSubmission(event.time, event.browser);
      } else if (event.type === 'finished' && historyById.has(event.id)) {
        const record = historyById.get(event.id);
        if (record.state !== 'ready' && event.state === 'ready') countSuccess(record);
        record.state = event.state;
        record.finishedAt = event.time;
      }
    } catch (error) { console.error(`Invalid history line: ${error.message}`); }
  }
}
function recordEvent(event) { fs.appendFileSync(historyFile, JSON.stringify(event) + '\n'); }
function finishHistory(job) {
  try {
    const time = Date.now();
    recordEvent({ type: 'finished', id: job.id, state: job.state, time });
    const record = historyById.get(job.id);
    if (record) {
      record.state = job.state;
      record.finishedAt = time;
      if (job.state === 'ready') countSuccess(record);
    }
  } catch (error) { console.error(`Cannot record build history: ${error.message}`); }
}
setInterval(() => {
  const cutoff = Date.now() - 60000;
  for (const [ip, times] of requests) {
    const recent = times.filter(time => time > cutoff);
    if (recent.length) requests.set(ip, recent);
    else requests.delete(ip);
  }
}, 60000).unref();

function reply(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let errors = '';
    child.stderr.on('data', chunk => { errors = (errors + chunk.toString()).slice(-4000); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(errors || `Build exited with code ${code}`)));
  });
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 13 * 1024 * 1024) {
        reject(new Error('Upload exceeds 13 MB'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}
function validate(input) {
  if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 64 ||
      /[<>:"/\\|?*\x00-\x1f]/.test(input.name) || /[. ]$/.test(input.name)) {
    throw new Error('Invalid Windows application name');
  }
  validateName(input.name);
  for (const field of ['remoteConfigUrl', 'fallbackApi']) {
    if (typeof input[field] !== 'string') throw new Error(`${field} must be an HTTPS URL`);
    const url = new URL(input[field]);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error(`${field} must be an HTTPS URL`);
  }
  if (input.coverUrl) {
    if (typeof input.coverUrl !== 'string') throw new Error('Invalid cover URL');
    const url = new URL(input.coverUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash || input.cover) throw new Error('Choose one HTTPS cover source');
  }
  for (const [field, limit, signature] of [
    ['icon', 1024 * 1024, Buffer.from([0, 0, 1, 0])],
    ['cover', 8 * 1024 * 1024, Buffer.from([137, 80, 78, 71])]
  ]) {
    if (!input[field]) continue;
    if (typeof input[field] !== 'string' || input[field].length > Math.ceil(limit * 4 / 3) + 4 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(input[field])) throw new Error(`Invalid ${field} upload`);
    const data = Buffer.from(input[field], 'base64');
    if (data.length > limit || !data.subarray(0, 4).equals(signature)) throw new Error(`Invalid ${field} file`);
  }
}
function directory(job) { return path.join(root, job.id); }
function persist(job) {
  fs.writeFileSync(path.join(directory(job), 'job.json'), JSON.stringify({ state: job.state, expiresAt: job.expiresAt }));
}
function expire(job) {
  if (job.state !== 'ready' && job.state !== 'expired') return;
  job.state = 'expired';
  if (job.downloads) return;
  try { fs.rmSync(directory(job), { recursive: true, force: true }); }
  catch (error) {
    console.error(`Cannot remove expired build ${job.id}: ${error.message}`);
    setTimeout(() => expire(job), 30000).unref();
    return;
  }
  setTimeout(() => jobs.delete(job.id), lifetime).unref();
}
function scheduleExpiry(job) {
  setTimeout(() => expire(job), Math.max(0, job.expiresAt - Date.now())).unref();
}

// Only restore directories created by this version. Older build files are not touched.
for (const name of fs.readdirSync(root)) {
  if (!/^[a-f0-9]{32}$/.test(name)) continue;
  const file = path.join(root, name, 'job.json');
  if (!fs.existsSync(file)) continue;
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (saved.state !== 'ready' || !Number.isFinite(saved.expiresAt) || saved.expiresAt <= Date.now()) {
      fs.rmSync(path.join(root, name), { recursive: true, force: true });
      continue;
    }
    const job = { id: name, state: 'ready', expiresAt: saved.expiresAt, downloads: 0 };
    jobs.set(name, job);
    scheduleExpiry(job);
  } catch (error) { console.error(`Cannot restore build ${name}: ${error.message}`); }
}

async function build(job) {
  const dir = directory(job);
  fs.mkdirSync(dir, { recursive: true });
  job.state = 'running';
  job.stage = '准备客户端';
  const record = historyById.get(job.id);
  if (record) record.state = 'running';
  persist(job);
  try {
    const input = job.input;
    const config = {
      name: input.name, remoteConfigUrl: input.remoteConfigUrl,
      fallbackApi: input.fallbackApi, coverUrl: input.coverUrl,
      icon: '', cover: ''
    };
    for (const [field, name] of [['icon', 'icon.ico'], ['cover', 'cover.png']]) {
      if (!input[field]) continue;
      fs.writeFileSync(path.join(dir, name), Buffer.from(input[field], 'base64'));
      config[field] = name;
    }
    job.input = null;
    const configFile = path.join(dir, 'config.json');
    fs.writeFileSync(configFile, JSON.stringify(config));
    const output = path.join(dir, 'client');
    await run(process.execPath, [path.join(__dirname, 'build.js'), configFile, output]);
    job.stage = '生成安装包';
    await run(process.execPath, [path.join(__dirname, 'installer.js'), configFile, output, path.join(dir, 'setup.exe')]);
    job.stage = '压缩便携版';
    const zip = path.join(dir, 'client.zip');
    if (process.platform === 'win32') {
      const quote = value => `'${value.replace(/'/g, "''")}'`;
      const script = `Compress-Archive -LiteralPath ${quote(output)} -DestinationPath ${quote(zip)} -CompressionLevel Optimal`;
      await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
    } else {
      await run('zip', ['-q', '-r', zip, 'client'], dir);
    }
    fs.rmSync(output, { recursive: true, force: true });
    for (const name of ['icon.ico', 'cover.png', 'config.json']) {
      const file = path.join(dir, name);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    job.state = 'ready';
    job.expiresAt = Date.now() + lifetime;
    persist(job);
    finishHistory(job);
    scheduleExpiry(job);
  } catch (error) {
    job.state = 'failed';
    job.error = error.message.slice(0, 400);
    job.input = null;
    finishHistory(job);
    try { fs.rmSync(dir, { recursive: true, force: true }); }
    catch (cleanupError) { console.error(`Cannot remove failed build ${job.id}: ${cleanupError.message}`); }
    setTimeout(() => jobs.delete(job.id), lifetime).unref();
  }
}
function next() {
  if (active || !queue.length) return;
  active = queue.shift();
  build(active).finally(() => { active = null; next(); });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return fs.createReadStream(path.join(__dirname, 'index.html')).pipe(res);
  }
  if (req.method === 'GET' && req.url === '/queue') {
    const pending = active ? [active, ...queue] : [...queue];
    return reply(res, 200, { items: pending.map((job, index) => ({
      name: publicName(job.name), state: job.state, position: index + 1,
      stage: job.state === 'running' ? job.stage : undefined
    })) });
  }
  if (req.method === 'GET' && /^\/history(?:\?page=\d+)?$/.test(req.url)) {
    const page = Math.min(1000000, Math.max(1, Number(new URL(req.url, 'http://localhost').searchParams.get('page')) || 1));
    const end = Math.max(0, history.length - (page - 1) * 20);
    const items = history.slice(Math.max(0, end - 20), end).reverse().map(({ name, submittedAt, finishedAt, state }) => ({ name: publicName(name), submittedAt, finishedAt, state }));
    return reply(res, 200, { total: history.length, completed, browsers: browsers.size, page,
      pages: Math.ceil(history.length / 20), items,
      daily: [...daily.values()].reverse().map(({ date, submissions, completed: successes, browsers: used }) =>
        ({ date, submissions, completed: successes, browsers: used.size })) });
  }
  if (req.method === 'GET' && /^\/jobs\/[a-f0-9]{32}$/.test(req.url)) {
    const job = jobs.get(req.url.slice('/jobs/'.length));
    if (!job) return reply(res, 404, { error: 'Job not found' });
    if (job.state === 'ready' && job.expiresAt <= Date.now()) expire(job);
    const status = { state: job.state };
    if (job.state === 'queued') status.position = queue.indexOf(job) + 1 + (active ? 1 : 0);
    if (job.state === 'running') status.stage = job.stage;
    if (job.state === 'ready') {
      status.expiresAt = job.expiresAt;
      status.installer = `/download/${job.id}/setup.exe`;
      status.portable = `/download/${job.id}/client.zip`;
    }
    if (job.state === 'failed') status.error = job.error;
    return reply(res, 200, status);
  }
  if (req.method === 'GET' && /^\/download\/[a-f0-9]{32}\/(setup\.exe|client\.zip)$/.test(req.url)) {
    const [, , id, filename] = req.url.split('/');
    const job = jobs.get(id);
    if (!job || job.state !== 'ready' || job.expiresAt <= Date.now()) {
      if (job && job.state === 'ready') expire(job);
      return reply(res, 404, { error: 'Build expired or unavailable' });
    }
    const file = path.join(directory(job), filename);
    if (!fs.existsSync(file)) return reply(res, 404, { error: 'Build not found' });
    job.downloads++;
    res.writeHead(200, {
      'Content-Type': filename.endsWith('.exe') ? 'application/vnd.microsoft.portable-executable' : 'application/zip',
      'Content-Length': fs.statSync(file).size,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Content-Type-Options': 'nosniff'
    });
    res.on('close', () => {
      job.downloads--;
      if (job.state === 'expired') expire(job);
    });
    const stream = fs.createReadStream(file);
    stream.on('error', () => res.destroy());
    return stream.pipe(res);
  }
  if (req.method !== 'POST' || req.url !== '/build') return reply(res, 404, { error: 'Not found' });
  if (queue.length >= 8) return reply(res, 429, { error: '队列已满，请稍后再试' });
  const ip = req.socket.remoteAddress || '';
  const now = Date.now();
  const recent = (requests.get(ip) || []).filter(time => now - time < 60000);
  if (recent.length >= 5) return reply(res, 429, { error: '请求过于频繁，请稍后再试' });
  try {
    const input = await readBody(req);
    validate(input);
    if (input.browserId !== undefined && (typeof input.browserId !== 'string' || !/^[a-f0-9]{32}$/.test(input.browserId))) {
      throw new Error('Invalid browser identifier');
    }
    requests.set(ip, [...recent, now]);
    const job = { id: crypto.randomBytes(16).toString('hex'), name: input.name.trim(), state: 'queued', input, expiresAt: null, downloads: 0 };
    const browser = input.browserId ? crypto.createHash('sha256').update(input.browserId).digest('hex') : null;
    recordEvent({ type: 'submitted', id: job.id, name: job.name, time: now, browser });
    const record = { id: job.id, name: job.name, submittedAt: now, state: 'queued' };
    history.push(record);
    historyById.set(job.id, record);
    countSubmission(now, browser);
    jobs.set(job.id, job);
    queue.push(job);
    reply(res, 202, { id: job.id, position: queue.length + (active ? 1 : 0) });
    setImmediate(next);
  } catch (error) {
    if (!res.destroyed) reply(res, 400, { error: error.message.slice(0, 400) });
  }
});
const host = process.env.BUILDER_HOST || '127.0.0.1';
const port = Number(process.env.BUILDER_PORT || 8787);
if (require.main === module) server.listen(port, host, () => console.log(`Builder listening on http://${host}:${server.address().port}`));
module.exports = server;
