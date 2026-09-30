'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const server = require('../server');

test('one entry routes both independent builders', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const home = await fetch(base);
    assert.equal(home.status, 200);
    const html = await home.text();
    assert.match(html, /id="windows-panel"/);
    assert.match(html, /id="android-panel"/);
    assert.doesNotMatch(html, /<iframe/i);
    const script = await fetch(base + '/app.js');
    assert.equal(script.status, 200);
    const code = await script.text();
    assert.match(code, /request\('\/windows\/build'/);
    assert.match(code, /request\('\/android\/api\/build'/);
    assert.equal((await fetch(base + '/style.css')).status, 200);
    assert.equal((await fetch(base + '/icon.js')).status, 200);
    const win = await fetch(base + '/windows/');
    assert.equal(win.status, 200);
    assert.match(await win.text(), /fetch\('\/windows\/build'/);
    const android = await fetch(base + '/android/');
    assert.equal(android.status, 200);
    assert.match(await android.text(), /\/android\/api\/build/);
    assert.ok(android.headers.get('set-cookie').includes('builder_session='));
    const queue = await (await fetch(base + '/windows/queue')).json();
    assert.ok(Array.isArray(queue.items));
    const state = await (await fetch(base + '/android/api/state')).json();
    assert.ok(Array.isArray(state.queue));
    const privateDownload = await fetch(base + '/android/api/download/' + '0'.repeat(32));
    assert.equal(privateDownload.status, 404);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
