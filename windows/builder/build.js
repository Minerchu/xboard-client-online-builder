const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const template = path.resolve(__dirname, '../client-template');
const rcedit = path.join(__dirname, 'vendor/rcedit-x64.exe');
const [configFile, outputDir] = process.argv.slice(2);
if (!['win32', 'linux'].includes(process.platform) || !configFile || !outputDir) {
  throw new Error('Usage on Windows/Linux: node build.js config.json output-directory');
}

const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
if (typeof config.name !== 'string' || !config.name.trim() || config.name.length > 64 || /[<>:"/\\|?*\x00-\x1f]/.test(config.name) || /[. ]$/.test(config.name)) {
  throw new Error('Invalid Windows application name');
}
function checkUrl(value, label) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) throw new Error(`${label} must be an HTTPS URL`);
  return url;
}
const api = checkUrl(config.fallbackApi, 'Fallback API').origin;
const remote = checkUrl(config.remoteConfigUrl, 'Online JSON').toString();
const coverUrl = config.coverUrl ? checkUrl(config.coverUrl, 'Cover image').toString() : '';
if (config.cover && coverUrl) throw new Error('Choose either an uploaded cover or a cover URL');
const name = config.name.trim();
const assets = {};
for (const [field, signature, maxSize] of [
  ['icon', Buffer.from([0, 0, 1, 0]), 1024 * 1024],
  ['cover', Buffer.from([137, 80, 78, 71]), 8 * 1024 * 1024]
]) {
  if (!config[field]) continue;
  const asset = path.resolve(path.dirname(configFile), config[field]);
  const data = fs.readFileSync(asset);
  if (data.length > maxSize || !data.subarray(0, 4).equals(signature)) throw new Error(`Invalid ${field} file`);
  assets[field] = { path: asset, data };
}
if (!fs.existsSync(rcedit)) throw new Error('Missing rcedit tool');
if (fs.existsSync(outputDir)) throw new Error('Output directory already exists');
fs.cpSync(template, outputDir, { recursive: true, errorOnExist: true, force: false });

function rewriteAsar(file, replacements) {
  const source = fs.readFileSync(file);
  const header = JSON.parse(source.subarray(16, 16 + source.readUInt32LE(12)).toString('utf8'));
  const bodyStart = 8 + source.readUInt32LE(4);
  const entries = [];
  function visit(node, prefix = '') {
    for (const [name, entry] of Object.entries(node.files || {})) {
      const key = prefix ? `${prefix}/${name}` : name;
      if (entry.files) visit(entry, key);
      else if (!entry.link && !entry.unpacked) entries.push({ key, entry });
    }
  }
  visit(header);
  const unused = new Set(Object.keys(replacements));
  entries.sort((a, b) => Number(a.entry.offset) - Number(b.entry.offset));
  const chunks = [];
  let cursor = 0;
  for (const { key, entry } of entries) {
    const data = replacements[key] || source.subarray(bodyStart + Number(entry.offset), bodyStart + Number(entry.offset) + entry.size);
    if (!replacements[key] && data.length !== entry.size) throw new Error(`Truncated ASAR entry: ${key}`);
    unused.delete(key);
    entry.offset = String(cursor);
    entry.size = data.length;
    if (entry.integrity) {
      const hash = chunk => crypto.createHash('sha256').update(chunk).digest('hex');
      const blockSize = entry.integrity.blockSize || 4194304;
      entry.integrity.hash = hash(data);
      entry.integrity.blocks = [];
      for (let i = 0; i < data.length; i += blockSize) entry.integrity.blocks.push(hash(data.subarray(i, i + blockSize)));
    }
    chunks.push(data);
    cursor += data.length;
  }
  if (unused.size) throw new Error(`Missing ASAR entries: ${[...unused].join(', ')}`);
  const json = Buffer.from(JSON.stringify(header));
  const padded = (json.length + 3) & ~3;
  const preamble = Buffer.alloc(16 + padded);
  preamble.writeUInt32LE(4, 0);
  preamble.writeUInt32LE(8 + padded, 4);
  preamble.writeUInt32LE(4 + padded, 8);
  preamble.writeUInt32LE(json.length, 12);
  json.copy(preamble, 16);
  fs.writeFileSync(file, Buffer.concat([preamble, ...chunks]));
}

try {
  const main = fs.readFileSync(path.resolve(__dirname, '../main-fixed.js'), 'utf8');
  const baseAsar = fs.readFileSync(path.join(template, 'resources/app.asar'));
  const head = JSON.parse(baseAsar.subarray(16, 16 + baseAsar.readUInt32LE(12)).toString('utf8'));
  const entry = head.files.dist.files['index.html'];
  const start = 8 + baseAsar.readUInt32LE(4) + Number(entry.offset);
  const html = baseAsar.subarray(start, start + entry.size).toString('utf8');
  const htmlName = name.replace(/[&<>"']/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[value]);
  if (!html.includes('<title好臭啊</title>')) throw new Error('Unexpected page title in template');
  const page = html.replace('<title好臭啊</title>', `<title>${htmlName}</title>`);
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package-template.json'), 'utf8'));
  pkg.name = name;
  pkg.author = name;
  const replacements = {
    'main.js': Buffer.from(main),
    'package.json': Buffer.from(JSON.stringify(pkg, null, 2)),
    'dist/index.html': Buffer.from(page)
  };
  if (assets.cover || coverUrl) {
    const cssEntry = head.files.dist.files['umi.css'];
    const cssStart = 8 + baseAsar.readUInt32LE(4) + Number(cssEntry.offset);
    const css = baseAsar.subarray(cssStart, cssStart + cssEntry.size).toString('utf8');
    const marker = 'https://api.yimian.xyz/img';
    if (css.split(marker).length !== 3) throw new Error('Unexpected cover references in template');
    const background = coverUrl ? JSON.stringify(coverUrl) : "'./background.png'";
    replacements['dist/umi.css'] = Buffer.from(css.split(`'${marker}'`).join(background));
    if (assets.cover) replacements['dist/background.png'] = assets.cover.data;
  }
  if (assets.icon) {
    replacements['assets/iconOff.ico'] = assets.icon.data;
    replacements['assets/iconOn.ico'] = assets.icon.data;
  }
  rewriteAsar(path.join(outputDir, 'resources/app.asar'), replacements);
  fs.writeFileSync(path.join(outputDir, 'resources/backend.json'), JSON.stringify({ api, remoteConfigUrl: remote }, null, 2) + '\n');
  const executables = fs.readdirSync(outputDir).filter(file => {
    if (!file.toLowerCase().endsWith('.exe')) return false;
    return fs.statSync(path.join(outputDir, file)).size > 20 * 1024 * 1024;
  });
  if (executables.length !== 1) {
    throw new Error(`Expected one client executable, found: ${executables.join(', ') || 'none'}`);
  }
  const originalExe = path.join(outputDir, executables[0]);
  const outputExe = path.join(outputDir, `${name}.exe`);
  if (originalExe !== outputExe) fs.renameSync(originalExe, outputExe);
  const args = [outputExe, '--set-version-string', 'ProductName', name, '--set-version-string', 'FileDescription', name, '--set-version-string', 'CompanyName', name];
  if (assets.icon) args.push('--set-icon', assets.icon.path);
  if (process.platform === 'win32') {
    execFileSync(rcedit, args, { stdio: 'pipe', timeout: 120000 });
  } else {
    const winePath = value => execFileSync('winepath', ['-w', value], { encoding: 'utf8', timeout: 30000 }).trim();
    args[0] = winePath(path.resolve(outputExe));
    const iconIndex = args.indexOf('--set-icon');
    if (iconIndex !== -1) args[iconIndex + 1] = winePath(assets.icon.path);
    execFileSync('wine', [winePath(rcedit), ...args], {
      stdio: 'pipe', timeout: 120000, env: { ...process.env, WINEDEBUG: '-all' }
    });
  }
  console.log(`Built ${outputExe}`);
} catch (error) {
  fs.rmSync(outputDir, { recursive: true, force: true });
  throw error;
}
