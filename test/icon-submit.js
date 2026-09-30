'use strict';
(async () => {
  const messages = [];
  function assert(value, text) { if (!value) throw Error(text); }
  async function imageFile(color) {
    const canvas = document.createElement('canvas'); canvas.width = 360; canvas.height = 120;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0, 0, 360, 120);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
    return new File([blob], 'wide.jpg', { type: 'image/jpeg' });
  }
  function choose(id, file) {
    const transfer = new DataTransfer(); transfer.items.add(file);
    document.getElementById(id).files = transfer.files;
    document.getElementById(id).dispatchEvent(new Event('change', { bubbles: true }));
  }
  async function waitFor(count) {
    for (let i = 0; i < 50; i++) {
      const items = await (await fetch('/test/submissions')).json();
      if (items.length >= count) return items;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw Error('Submit timed out: ' + document.getElementById('win-message').textContent + ' / ' + document.getElementById('android-message').textContent);
  }
  try {
    const original = window.prepareIcon;
    window.prepareIcon = async (...args) => { await new Promise(resolve => setTimeout(resolve, 120)); return original(...args); };
    document.getElementById('win-name').value = '测试客户端';
    document.getElementById('win-api').value = 'https://example.com';
    document.getElementById('win-config').value = 'https://example.com/config.json';
    choose('win-icon', await imageFile('#ff0000'));
    choose('win-icon', await imageFile('#00ff00'));
    document.getElementById('windows-form').requestSubmit();
    const windows = (await waitFor(1))[0];
    assert(windows.platform === 'windows', 'Windows request reached wrong endpoint');
    const bytes = Uint8Array.from(atob(windows.icon), char => char.charCodeAt(0));
    const image = await createImageBitmap(new Blob([bytes.slice(22)], { type: 'image/png' }));
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const pixel = ctx.getImageData(128, 128, 1, 1).data;
    assert(pixel[1] > 240 && pixel[0] < 15, 'Submitted stale icon after rapid selection');
    messages.push('PASS Windows JPG -> ICO, immediate submit, latest selection');
    document.getElementById('android-tab').click();
    assert(!document.getElementById('android-panel').hidden, 'Platform selection failed');
    document.getElementById('android-name').value = '测试客户端';
    document.getElementById('android-url').value = 'https://example.com';
    choose('android-icon', await imageFile('#00ff00'));
    document.getElementById('android-form').requestSubmit();
    const android = (await waitFor(2))[1];
    assert(android.platform === 'android', 'Android request reached wrong endpoint');
    messages.push('PASS Android JPG -> PNG, immediate submit, backend validation');
    choose('android-icon', new File(['broken'], 'bad.png', { type: 'image/png' }));
    document.getElementById('android-form').requestSubmit();
    await new Promise(resolve => setTimeout(resolve, 500));
    assert((await (await fetch('/test/submissions')).json()).length === 2, 'Invalid image submitted');
    assert(document.getElementById('android-icon-status').textContent.includes('无法读取'), 'No actionable image error');
    messages.push('PASS invalid image rejected before API submission');
    const result = document.getElementById('results'); result.textContent = messages.join('\n'); result.dataset.state = 'passed';
    document.getElementById('ico').textContent = windows.icon;
  } catch (error) { const result = document.getElementById('results'); result.textContent = 'FAIL ' + error.message; result.dataset.state = 'failed'; }
})();
