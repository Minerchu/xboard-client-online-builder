'use strict';
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const cfg = require('./config');
let failed = false;
for (const [label, file] of [['APK template', cfg.template], ['apktool.jar', cfg.apktool], ['signing keystore', cfg.keystore]]) {
  const exists = fs.existsSync(file); console.log(`${label}: ${exists ? 'OK' : 'MISSING'} (${file})`); failed ||= !exists;
}
for (const [label, bin, args] of [['Java 17+', process.env.JAVA_BIN || 'java', ['-version']], ['zipalign', process.env.ZIPALIGN_BIN || 'zipalign', ['-h']], ['apksigner', process.env.APKSIGNER_BIN || 'apksigner', ['--version']]]) {
  const result = spawnSync(bin, args, { encoding: 'utf8' });
  const ok = !result.error && (result.status === 0 || label === 'zipalign' && result.status === 1);
  console.log(`${label}: ${ok ? 'OK' : 'MISSING'}`); failed ||= !ok;
}
for (const key of ['SIGN_STORE_PASS', 'SIGN_KEY_PASS']) { const ok = !!process.env[key]; console.log(`${key}: ${ok ? 'OK' : 'MISSING'}`); failed ||= !ok; }
process.exitCode = failed ? 1 : 0;
