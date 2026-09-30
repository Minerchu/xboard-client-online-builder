'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const cfg = require('./config');
const { validate } = require('./validate');
function run(bin, args, cwd, env = {}) {
  return new Promise((resolve, reject) => {
    if (bin.endsWith('.jar')) { args = ['-jar', bin, ...args]; bin = java; }
    const child = spawn(bin, args, { cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', data => { stderr = (stderr + data).slice(-2000); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(Error(`${path.basename(bin)} exited ${code}: ${stderr}`)));
  });
}
const java = process.env.JAVA_BIN || 'java';
const zipalign = process.env.ZIPALIGN_BIN || 'zipalign';
const apksigner = process.env.APKSIGNER_BIN || 'apksigner';
async function build(input, dir, stage) {
  const { name, url, icon } = validate(input);
  const decoded = path.join(dir, 'decoded');
  const unsigned = path.join(dir, 'unsigned.apk');
  const aligned = path.join(dir, 'aligned.apk');
  const result = path.join(dir, 'client.apk');
  stage('解包客户端');
  await run(java, ['-jar', cfg.apktool, 'd', '-f', '-o', decoded, cfg.template], dir);
  const smali = path.join(decoded, 'smali_classes2', 'com', 'moetor', 'helper', 'ConfigHelper.smali');
  let code = fs.readFileSync(smali, 'utf8');
  const matcher = /(\.method public final getBaseUrl\(\)Ljava\/lang\/String;[\s\S]*?const-string v0, ")[^"]+("[\s\S]*?\.end method)/;
  if (!matcher.test(code)) throw Error('模板缺少 Xboard 地址入口');
  code = code.replace(matcher, (_, before, after) => before + url + after);
  fs.writeFileSync(smali, code);
  const strings = path.join(decoded, 'res', 'values', 'strings.xml');
  let xml = fs.readFileSync(strings, 'utf8');
  const appName = /(<string name="app_name">)[^<]*(<\/string>)/;
  if (!appName.test(xml)) throw Error('模板缺少软件名称资源');
  xml = xml.replace(appName, (_, before, after) => before + name.replace(/'/g, "\\'") + after);
  fs.writeFileSync(strings, xml);
  const png = path.join(dir, 'icon.png');
  fs.writeFileSync(png, icon);
  stage('生成图标');
  await run(java, [path.join(__dirname, 'IconMaker.java'), png, path.join(decoded, 'res')], dir, { JAVA_TOOL_OPTIONS: '-Djava.awt.headless=true' });
  stage('编译 APK');
  await run(java, ['-jar', cfg.apktool, 'b', decoded, '-o', unsigned], dir);
  await run(zipalign, ['-f', '-p', '4', unsigned, aligned], dir);
  stage('签名与校验');
  await run(apksigner, ['sign', '--ks', cfg.keystore, '--ks-key-alias', cfg.alias, '--ks-pass', 'env:SIGN_STORE_PASS', '--key-pass', 'env:SIGN_KEY_PASS', '--out', result, aligned], dir);
  await run(apksigner, ['verify', '--verbose', result], dir);
  for (const file of [decoded, unsigned, aligned, png]) fs.rmSync(file, { recursive: true, force: true });
  return result;
}
module.exports = { build };
