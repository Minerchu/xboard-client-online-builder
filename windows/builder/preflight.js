const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const template = path.resolve(__dirname, '../client-template/resources/app.asar');
let missing = false;
for (const [label, file] of [
  ['Client template', template],
  ['Main process source', path.resolve(__dirname, '../main-fixed.js')],
  ['EXE resource editor', path.join(__dirname, 'vendor/rcedit-x64.exe')]
]) {
  const exists = fs.existsSync(file);
  console.log(`${label}: ${exists ? 'OK' : 'MISSING'}`);
  missing ||= !exists;
}
const commands = process.platform === 'linux' ? ['wine', 'winepath', 'makensis', 'zip'] : ['makensis'];
for (const command of commands) {
  const result = spawnSync(command, command === 'winepath' ? ['-w', '.'] : ['-version'], {
    encoding: 'utf8', timeout: 10000, windowsHide: true
  });
  const exists = !result.error || result.error.code !== 'ENOENT';
  console.log(`${command}: ${exists ? 'OK' : 'MISSING'}`);
  missing ||= !exists;
}
if (missing) process.exitCode = 1;
