'use strict';
const $ = id => document.getElementById(id);
const tabs = [$('win-tab'), $('android-tab')];
const panels = [$('windows-panel'), $('android-panel')];
function selectPlatform(index) {
  tabs.forEach((tab, i) => { tab.setAttribute('aria-selected', String(i === index)); tab.tabIndex = i === index ? 0 : -1; panels[i].hidden = i !== index; });
  history.replaceState(null, '', index ? '#android' : '#windows');
}
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => selectPlatform(i));
  tab.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault(); const next = 1 - i; selectPlatform(next); tabs[next].focus();
    }
  });
});
selectPlatform(location.hash === '#android' ? 1 : 0);
window.addEventListener('hashchange', () => selectPlatform(location.hash === '#android' ? 1 : 0));

async function request(url, options) {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const body = await response.json();
  if (!response.ok) throw Error(body.error || `请求失败 (${response.status})`);
  return body;
}
function empty(list, message) {
  list.replaceChildren();
  const li = document.createElement('li'); li.className = 'empty'; li.textContent = message; list.append(li);
}
function item(list, name, detail, links = []) {
  const li = document.createElement('li');
  const title = document.createElement('strong'); title.textContent = name;
  const info = document.createElement('span'); info.textContent = detail;
  for (const [label, href] of links) {
    const link = document.createElement('a'); link.textContent = label; link.href = href; info.append(link);
  }
  li.append(title, info); list.append(li);
}
function preview(input, image) {
  let previous;
  input.addEventListener('change', () => {
    if (previous) URL.revokeObjectURL(previous);
    const file = input.files[0]; image.hidden = !file;
    if (file) image.src = previous = URL.createObjectURL(file);
  });
  image.addEventListener('error', () => { image.hidden = true; });
}
preview($('win-cover'), $('win-cover-preview'));
function bindIcon(input, image, status, platform) {
  let task = Promise.resolve(), result = null, error = null;
  input.addEventListener('change', () => {
    const file = input.files[0]; result = null; error = null; image.hidden = true;
    if (!file) { status.textContent = ''; task = Promise.resolve(); return; }
    status.textContent = '正在裁切和转换图标...';
    const current = window.prepareIcon(file, platform).then(converted => {
      if (task !== current) return;
      result = converted; image.src = converted.preview; image.hidden = false;
      status.textContent = platform === 'windows' ? '已生成 Windows ICO 图标' : '已生成 Android PNG 图标';
    }).catch(reason => {
      if (task !== current) return;
      error = reason; status.textContent = reason.message;
    });
    task = current;
  });
  return async function getIcon() {
    // Selection can change while conversion is pending; submit only the latest file.
    let waiting;
    do { waiting = task; await waiting; } while (waiting !== task);
    if (error) throw error;
    if (input.files[0] && !result) throw Error('图标尚未处理完成，请重新选择图片');
    return result;
  };
}
const windowsIcon = bindIcon($('win-icon'), $('win-icon-preview'), $('win-icon-status'), 'windows');
const androidIcon = bindIcon($('android-icon'), $('android-icon-preview'), $('android-icon-status'), 'android');
const winForm = $('windows-form');
for (const radio of winForm.elements.coverMode) radio.addEventListener('change', () => {
  const online = winForm.elements.coverMode.value === 'url';
  $('cover-upload').hidden = online; $('cover-online').hidden = !online;
  $('win-cover').value = ''; $('win-cover-url').value = ''; $('win-cover-preview').hidden = true;
});
$('win-cover-url').addEventListener('change', () => {
  const image = $('win-cover-preview'); image.hidden = true;
  try { const url = new URL($('win-cover-url').value); if (url.protocol === 'https:' && !url.username && !url.password) { image.src = url.href; image.hidden = false; } } catch {}
});
const base64 = file => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result).split(',')[1]);
  reader.onerror = () => reject(Error('文件读取失败'));
  reader.readAsDataURL(file);
});
const validId = id => typeof id === 'string' && /^[a-f0-9]{32}$/.test(id);
let browserId = localStorage.getItem('xboard-builder-browser-id');
if (!validId(browserId)) {
  browserId = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
  localStorage.setItem('xboard-builder-browser-id', browserId);
}
let windowsJobs = [];
try {
  const stored = JSON.parse(localStorage.getItem('xboard-builder-jobs'));
  if (Array.isArray(stored)) windowsJobs = stored.filter(job => validId(job.id) && typeof job.name === 'string').slice(-30);
  const old = JSON.parse(localStorage.getItem('xboard-builder-job'));
  if (old && validId(old.id) && !windowsJobs.some(job => job.id === old.id)) windowsJobs.push({ id: old.id, name: old.name, state: 'queued' });
  localStorage.removeItem('xboard-builder-job');
} catch { windowsJobs = []; }
const saveWindows = () => localStorage.setItem('xboard-builder-jobs', JSON.stringify(windowsJobs.map(({ id, name, state, expiresAt }) => ({ id, name, state, expiresAt }))));
function renderWindowsJobs() {
  const list = $('win-jobs'); list.replaceChildren();
  if (!windowsJobs.length) return empty(list, '当前浏览器还没有提交任务');
  for (const job of [...windowsJobs].reverse()) {
    const ready = job.state === 'ready' && job.expiresAt > Date.now();
    const remaining = ready ? Math.ceil((job.expiresAt - Date.now()) / 1000) : 0;
    const detail = job.state === 'queued' ? `排队第 ${job.position || '?'} 位` : job.state === 'running' ? `正在编译：${job.stage || '准备中'}` : ready ? `下载剩余 ${Math.floor(remaining / 60)} 分 ${remaining % 60} 秒` : job.state === 'failed' ? `构建失败：${job.error || '请查看日志'}` : '文件已过期';
    item(list, job.name, detail, ready ? [['安装包 EXE', '/windows/download/' + job.id + '/setup.exe'], ['便携 ZIP', '/windows/download/' + job.id + '/client.zip']] : []);
  }
}
let windowsRefreshing = false;
async function refreshWindows() {
  if (windowsRefreshing) return;
  windowsRefreshing = true;
  try {
    const queue = await request('/windows/queue');
    $('win-connection').textContent = '服务已连接';
    const list = $('win-queue'); list.replaceChildren();
    if (!queue.items.length) empty(list, '目前无需排队');
    else queue.items.forEach(job => item(list, `${job.position}. ${job.name}`, job.state === 'running' ? `正在编译：${job.stage || '准备中'}` : '等待编译'));
    await Promise.all(windowsJobs.map(async job => {
      try { Object.assign(job, await request('/windows/jobs/' + job.id)); }
      catch (error) { if (error.message.includes('Job not found')) job.state = 'expired'; }
    }));
    saveWindows(); renderWindowsJobs();
  } catch { $('win-connection').textContent = '连接重试中'; }
  finally { windowsRefreshing = false; }
}
let winPage = 1;
async function refreshWindowsHistory() {
  try {
    const data = await request('/windows/history?page=' + winPage);
    $('win-history-summary').textContent = `累计 ${data.total} 次 · 成功 ${data.completed} 次 · 浏览器约 ${data.browsers} 个`;
    const daily = $('win-daily'); daily.replaceChildren();
    for (const day of data.daily) { const span = document.createElement('span'); span.textContent = `${day.date}：提交 ${day.submissions} / 成功 ${day.completed} / 浏览器 ${day.browsers}`; daily.append(span); }
    const list = $('win-history'); list.replaceChildren();
    if (!data.items.length) empty(list, '暂无构建记录');
    for (const entry of data.items) item(list, entry.name, `${new Date(entry.submittedAt).toLocaleString('zh-CN')} · ${{ queued: '排队中', running: '编译中', ready: '成功', failed: '失败', interrupted: '服务重启中断' }[entry.state] || '未知'}`);
    $('win-page').textContent = `${data.page} / ${Math.max(1, data.pages)} 页`;
    $('win-prev').disabled = data.page <= 1; $('win-next').disabled = data.page >= data.pages;
  } catch (error) { $('win-history-summary').textContent = error.message; }
}
$('win-prev').onclick = () => { if (winPage > 1) { winPage--; refreshWindowsHistory(); } };
$('win-next').onclick = () => { winPage++; refreshWindowsHistory(); };
winForm.addEventListener('submit', async event => {
  event.preventDefault(); const button = $('win-submit'); button.disabled = true; $('win-message').textContent = '正在提交...';
  try {
    const values = new FormData(winForm);
    const payload = { name: values.get('name'), remoteConfigUrl: values.get('remoteConfigUrl'), fallbackApi: values.get('fallbackApi'), browserId };
    const icon = await windowsIcon();
    if (icon) payload.icon = icon.base64;
    if (values.get('coverMode') === 'url') { payload.coverUrl = values.get('coverUrl'); if (!payload.coverUrl) throw Error('请输入在线封面地址'); }
    for (const key of values.get('coverMode') === 'upload' ? ['cover'] : []) {
      const file = values.get(key); if (file && file.size) payload[key] = await base64(file);
    }
    const result = await request('/windows/build', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    windowsJobs.push({ id: result.id, name: payload.name, state: 'queued', position: result.position }); windowsJobs = windowsJobs.slice(-30);
    saveWindows(); renderWindowsJobs(); $('win-message').textContent = `已加入队列，第 ${result.position} 位`;
    winPage = 1; refreshWindows(); refreshWindowsHistory();
  } catch (error) { $('win-message').textContent = error.message; }
  finally { button.disabled = false; }
});

async function refreshAndroid() {
  try {
    const [state, mine] = await Promise.all([request('/android/api/state'), request('/android/api/mine')]);
    $('android-total').textContent = `累计提交 ${state.total}`;
    $('android-running').textContent = state.active ? `正在构建：${state.active.name} · ${state.active.stage}` : '当前空闲';
    const queue = $('android-queue'); queue.replaceChildren();
    if (!state.queue.length) empty(queue, '目前无需排队');
    else state.queue.forEach(job => item(queue, job.name, `排队第 ${job.position} 位`));
    const list = $('android-jobs'); list.replaceChildren();
    if (!mine.length) empty(list, '当前浏览器还没有提交任务');
    for (const job of mine) {
      const ready = job.state === 'ready' && job.expiresAt > Date.now();
      const detail = ready ? `下载剩余 ${Math.ceil((job.expiresAt - Date.now()) / 60000)} 分钟` : job.state === 'queued' ? `排队第 ${job.position} 位` : job.state === 'running' ? job.stage : job.state === 'failed' ? job.error : '文件已过期';
      item(list, job.name, detail, ready ? [['下载 APK', '/android/api/download/' + job.id]] : []);
    }
  } catch (error) { $('android-message').textContent = error.message; }
}
$('android-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = $('android-submit'); button.disabled = true; $('android-message').textContent = '正在提交...';
  try {
    const icon = await androidIcon();
    if (!icon) throw Error('请先选择图标图片');
    await request('/android/api/build', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: $('android-name').value, url: $('android-url').value, icon: icon.base64 }) });
    $('android-message').textContent = '已加入 Android 队列'; refreshAndroid();
  } catch (error) { $('android-message').textContent = error.message; }
  finally { button.disabled = false; }
});
renderWindowsJobs(); refreshWindows(); refreshWindowsHistory(); refreshAndroid();
setInterval(refreshWindows, 3000); setInterval(refreshWindowsHistory, 10000); setInterval(renderWindowsJobs, 1000); setInterval(refreshAndroid, 4000);
