'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { build } = require('../build');
const dir = path.join(os.tmpdir(), 'xboard-builder-e2e');
fs.mkdirSync(dir, { recursive: true });
build({
  name: '测试客户端',
  url: 'https://example.com/',
  icon: fs.readFileSync(path.join(os.tmpdir(), 'xboard-builder-test-icon.png')).toString('base64')
}, dir, console.log).then(file => console.log('BUILT', file, fs.statSync(file).size)).catch(error => { console.error(error); process.exitCode = 1; });
