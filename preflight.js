'use strict';
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
console.log('=== Windows ===');
const win = spawnSync(process.execPath, [path.join(__dirname, 'windows', 'builder', 'preflight.js')], { stdio: 'inherit' });
console.log('=== Android ===');
const android = spawnSync(process.execPath, [path.join(__dirname, 'android', 'preflight.js')], { stdio: 'inherit' });
if (win.status || android.status) process.exitCode = 1;
