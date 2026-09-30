'use strict';
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { validate } = require('../android/validate');
const root = path.join(__dirname, '..');
const submissions = [];
http.createServer(async (req, res) => {
  const reply = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (req.url === '/') {
    let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    html = html.replace('</body>', '<pre id="results">RUNNING</pre><textarea id="ico" hidden></textarea><script src="/test/icon-submit.js" defer></script></body>');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(html);
  }
  if (['/app.js', '/icon.js', '/style.css', '/test/icon-submit.js'].includes(req.url)) {
    res.writeHead(200, { 'Content-Type': req.url.endsWith('.css') ? 'text/css' : 'application/javascript; charset=utf-8' }); return res.end(fs.readFileSync(path.join(root, req.url.slice(1))));
  }
  if (req.url === '/windows/queue') return reply(200, { items: [] });
  if (req.url.startsWith('/windows/history')) return reply(200, { total: 0, completed: 0, browsers: 0, daily: [], items: [], pages: 0, page: 1 });
  if (req.url.startsWith('/windows/jobs/')) return reply(404, { error: 'Job not found' });
  if (req.url === '/android/api/state') return reply(200, { total: 0, active: null, queue: [] });
  if (req.url === '/android/api/mine') return reply(200, []);
  if (req.url === '/test/submissions') return reply(200, submissions);
  if (req.method === 'POST' && ['/windows/build', '/android/api/build'].includes(req.url)) {
    try {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks));
      if (req.url.startsWith('/android')) validate(body);
      else if (!Buffer.from(body.icon, 'base64').subarray(0, 4).equals(Buffer.from([0, 0, 1, 0]))) throw Error('Invalid ICO submitted');
      submissions.push({ platform: req.url.startsWith('/android') ? 'android' : 'windows', ...body });
      return reply(202, { id: String(submissions.length).padStart(32, '0'), position: 1 });
    } catch (error) { return reply(400, { error: error.message }); }
  }
  reply(404, { error: 'Not found' });
}).listen(19226, '127.0.0.1', () => console.log('Icon UI fixture: http://127.0.0.1:19226/'));
