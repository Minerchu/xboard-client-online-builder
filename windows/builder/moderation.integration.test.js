const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xboard-moderation-test-'));
  for (const file of ['server.js', 'moderation.js', 'blocked-words.json', 'index.html']) {
    fs.copyFileSync(path.join(__dirname, file), path.join(dir, file));
  }
  fs.writeFileSync(path.join(dir, 'build-history.jsonl'), JSON.stringify({
    type: 'submitted', id: 'a'.repeat(32), name: 'fuck', time: Date.now()
  }) + '\n');
  const child = spawn(process.execPath, ['server.js'], { cwd: dir, env: { ...process.env, BUILDER_PORT: '0' } });
  try {
    const url = await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('Server startup timed out')), 5000);
      child.stdout.on('data', chunk => {
        output += chunk;
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
    });
    const body = { name: 'Ｆ.u c-k', remoteConfigUrl: 'https://example.com/client.json', fallbackApi: 'https://example.com' };
    const response = await fetch(`${url}/build`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /不允许/);
    const history = await (await fetch(`${url}/history?page=1`)).json();
    assert.equal(history.total, 1);
    assert.equal(history.items[0].name, '名称已隐藏');
    assert.equal(JSON.stringify(history).includes('a'.repeat(32)), false);
    fs.writeFileSync(path.join(dir, 'blocked-words.json'), JSON.stringify({ words: ['example'] }));
    body.name = 'example-client';
    const updated = await fetch(`${url}/build`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal(updated.status, 400);
    console.log('HTTP rejection, history masking, and dictionary reload passed');
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await new Promise(resolve => child.once('exit', resolve));
    }
    // This directory was created by this test and contains no user data.
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
