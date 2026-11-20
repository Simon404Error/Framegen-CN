// Framegen toolbar popup: read-only status for the active tab. The controls live in the player.
const $ = (id) => document.getElementById(id);

let tabId = null;

async function askStatus() {
  if (tabId == null) return null;
  try {
    return await chrome.tabs.sendMessage(tabId, { type: 'fcStatus' });
  } catch { return null; }
}

function render(s) {
  const dot = $('dot'), state = $('state'), stat = $('stat'), sys = $('sys');
  if (!s) {
    dot.classList.remove('on');
    state.textContent = '关闭';
    state.className = '';
    stat.textContent = '';
    sys.textContent = '';
    return;
  }
  $('ver').textContent = 'v' + s.version;
  dot.classList.toggle('on', s.running);
  state.textContent = s.running ? '运行中' : '关闭';
  state.className = s.running ? 'on' : '';
  stat.textContent = s.running
    ? `输出     ${s.fps} fps · ×${s.factor}\n`
      + `帧率模式 ${s.rateState}\n`
      + `渲染     ${s.midMs} ms @ ${s.res}p · 丢帧 ${s.drops}\n`
      + `引擎     ${s.engine || '-'}`
    : (s.blocked || '');
  sys.textContent = `GPU：${s.gpu || '-'}${s.f16 ? '' : ' · 不支持半精度浮点'}`
    + (s.integrated ? '\n正在使用核显。请在 Windows 设置 → 屏幕 → 显示卡中把浏览器指派给独显。' : '');
  sys.className = s.integrated ? 'warn' : '';
}

const showTab = (help) => {
  $('status').style.display = help ? 'none' : 'block';
  $('help').style.display = help ? 'block' : 'none';
  $('tabStatus').classList.toggle('act', !help);
  $('tabHelp').classList.toggle('act', help);
};
$('tabStatus').onclick = () => showTab(false);
$('tabHelp').onclick = () => showTab(true);
$('fullSettings').onclick = async () => {
  try {
    await chrome.runtime.openOptionsPage();
    window.close();
  } catch { /* leave the popup open if the browser rejects the request */ }
};

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab ? tab.id : null;
  const first = await askStatus();
  render(first);
  if (first && first.integrated) showTab(true);
  setInterval(async () => render(await askStatus()), 1000);
})();
