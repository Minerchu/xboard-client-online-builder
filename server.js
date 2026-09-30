'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const windows = require('./windows/builder/server');
const android = require('./android/server');
const page = fs.readFileSync(path.join(__dirname, 'index.html'));
const style = fs.readFileSync(path.join(__dirname, 'style.css'));
const script = fs.readFileSync(path.join(__dirname, 'app.js'));

const server = http.createServer((req, res) => {
  const route = new URL(req.url, 'http://localhost').pathname;
  if (req.method === 'GET' && route === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return res.end(page);
  }
  if (req.method === 'GET' && (route === '/style.css' || route === '/app.js')) {
    res.writeHead(200, { 'Content-Type': route.endsWith('.css') ? 'text/css; charset=utf-8' : 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return res.end(route.endsWith('.css') ? style : script);
  }
  if (route === '/favicon.ico') { res.writeHead(204); return res.end(); }
  if (route === '/windows' || route.startsWith('/windows/')) {
    req.url = req.url.slice('/windows'.length) || '/';
    return windows.emit('request', req, res);
  }
  if (route === '/android' || route.startsWith('/android/')) {
    req.url = req.url.slice('/android'.length) || '/';
    if (req.method === 'GET' && req.url === '/') {
      const end = res.end.bind(res);
      res.end = (content, ...args) => end(Buffer.isBuffer(content) ? Buffer.from(content.toString('utf8').replaceAll('/api/', '/android/api/')) : String(content).replaceAll('/api/', '/android/api/'), ...args);
    }
    return android.emit('request', req, res);
  }
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});
if (require.main === module) server.listen(Number(process.env.PORT || 8790), '127.0.0.1', () => console.log(`Unified builder: http://127.0.0.1:${server.address().port}`));
module.exports = server;
