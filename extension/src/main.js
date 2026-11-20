// The content script's module: settings, the player and the in-page UI wired together, the popup protocol, page
// navigation and the hover behaviour. content.js imports this once per frame.
import { createSettings } from './settings.js';
import { log } from './log.js';
import { Player } from './player.js';
import { Overlay } from './overlay.js';
import { Notices } from './ui/notices.js';
import { Subtitles } from './ui/subtitles.js';
import { ControlBar, CompareSplit } from './ui/bar.js';
import { Controls, pointInsideRect } from './ui/controls.js';
import { svgIcon } from './ui/icons.js';
import { SITE_CONTROLS_OK, inFeed, keepTwitchControlsAboveOverlay, biggestVideo, onScreen } from './sites.js';
import { installBenchBridge, benchToken } from './bench.js';

export const VERSION = chrome.runtime.getManifest().version;

export function boot() {
  const bench = benchToken();
  const settings = createSettings({ live: !bench, log });
  const overlay = new Overlay({ log });
  const notices = new Notices();
  const subtitles = new Subtitles();
  let controls = null;
  let bar = null;
  let split = null;
  let toggling = false;
  let hoverVideo = null, hoverScanAt = -1e9, mouseMoveAt = -1e9, preloadFailedAt = -1e9;

  const activeVideo = () => (player.isRunning() ? player.video : hoverVideo);

  const player = new Player({
    settings, overlay, subtitles, notices, benchMode: !!bench,
    hooks: {
      version: VERSION,
      splitX: () => (split ? split.x : 0.5),
      candidateVideo: () => hoverVideo || biggestVideo(),
      onStateChange: running => controls?.setActive(running),
      onPreparing: on => controls?.setPreparing(on),
      onStatus: () => { if (controls?.isPanelOpen()) controls.updateStatus(); },
      onVideoGone: () => { if (inFeed()) reattach(); },
      onUiTick: (now, rect) => uiTick(now, rect),
    },
  });

  // ---------- the UI tick (15 Hz from the player's display loop) ----------
  function uiTick(now, rect) {
    const cfg = settings.cfg;
    const video = player.video;
    if (!controls) return;
    if (cfg.hoverReveal && cfg.showBar !== false && (video.controls || !SITE_CONTROLS_OK)) {
      bar.layout(rect, now < controls.revealUntil, now);
    } else {
      bar.hide();
    }
    bar.update();
    notices.layout(rect, { hud: cfg.debug || cfg.showFps, watermark: cfg.showWatermark });
    notices.warn(player.warningText(player.report()), now, rect, cfg.showWarnings);
    // place() is the one call that both positions and re-reveals the rail, so it must not be gated on isVisible():
    // a feed that briefly shrinks the video rect hides the rail, and a gated call could then never bring it back
    // (a vertical feed scrolls with the mouse still, so no mousemove follows to do it either).
    controls.place(rect, video);
    split.layout(rect, cfg.compare);
  }

  // ---------- the in-page UI ----------
  function injectUI() {
    if (controls) return;
    keepTwitchControlsAboveOverlay();
    controls = new Controls({
      version: VERSION, settings, log,
      host: {
        onToggle: () => toggle(),
        onOpenAdvanced: () => openAdvancedSettings(),
        activeVideo,
        hdrSupported: () => player.sys.hdrOk,
        statusLines: () => player.statusLines(),
      },
    });
    controls.inject();
    bar = new ControlBar({ video: () => player.video, log,
      onReveal: ms => controls.revealFor(ms),
      onFlash: symbol => { if (player.video) notices.flash(symbol, player.video.getBoundingClientRect()); } });
    bar.ensure();
    split = new CompareSplit({ video: () => player.video });
    overlay.onClick = () => { if (player.video?.controls) bar.togglePlay(); };
    overlay.onDblClick = () => { if (player.video?.controls) bar.toggleFullscreen(); };
    notices.mount(document.body);
    settings.onProfilesChange(store => controls.loadProfiles(store).catch(e => log('profile sync', e)));
  }

  async function openAdvancedSettings() {
    // after the extension was updated or reloaded, the script already in a page has lost it: nothing it asks for can
    // be answered until the page is loaded again, so say that instead of doing nothing
    if (!chrome.runtime?.id) { controls?.setAdvancedLabel('页面已过期：Framegen 已更新，请刷新页面'); return; }
    try {
      const response = await chrome.runtime.sendMessage({ type: 'fcOpenOptions' });
      if (!response?.ok) throw new Error(response?.error || '无法打开设置');
    } catch (messageError) {
      try { await chrome.runtime.openOptionsPage(); }
      catch (directError) {
        log('open settings', directError || messageError);
        controls?.setAdvancedLabel(chrome.runtime?.id ? '请从工具栏图标打开设置' : '页面已过期：Framegen 已更新，请刷新页面');
      }
    }
  }

  async function toggle() {
    if (toggling) return;
    if (!controls) injectUI();
    toggling = true;
    try {
      if (player.isRunning()) { player.stop(); if (inFeed()) feedStoppedByUser = true; return; }
      feedStoppedByUser = false;
      const video = biggestVideo();
      if (!video) { notices.showCritical('Framegen：未找到视频'); return; }
      try { await player.start(video); }
      catch (e) { player.preparing(false); notices.showCritical('Framegen 错误：' + (e?.message || e)); if (!player.blocked) log(e); }
    } finally { toggling = false; }
  }

  // Fullscreen renders in the browser's top layer: anything not inside the fullscreen element is invisible there.
  // The whole UI moves in and back out, from the site's own fullscreen button too.
  function reparentUI() {
    const host = document.fullscreenElement || document.body;
    if (host.tagName === 'VIDEO') return;
    controls?.mount(host);
    notices.mount(host);
    bar?.mount(host);
    split?.mount(host);
  }

  document.addEventListener('fullscreenchange', () => {
    reparentUI();
    controls?.resetGeometry();
    controls?.setPanelOpen(false);
    controls?.setVisible(false);
    hoverScanAt = 0;
    player.onFullscreenChange();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const v = activeVideo();
      if (v && controls && performance.now() < controls.revealUntil) controls.place(v.getBoundingClientRect(), v);
    }));
  });

  // ---------- hover: the controls appear, the backend preloads ----------
  document.addEventListener('mousemove', (e) => {
    const now = performance.now();
    // gaming mice fire at up to 1000 Hz and the rect read below forces layout
    if (now - mouseMoveAt < 33) return;
    mouseMoveAt = now;
    if (!player.isRunning() && now - hoverScanAt > 300) { hoverScanAt = now; hoverVideo = biggestVideo(); }
    const v = activeVideo();
    if (!v || !controls) return;
    const r = (player.isRunning() && player.lastRect && now - player.nextUiAt < 250) ? player.lastRect : v.getBoundingClientRect();
    const insideVideo = pointInsideRect(e.clientX, e.clientY, r);
    const insideControls = controls.pointInsideControls(e.clientX, e.clientY, r);
    if (insideVideo || insideControls) {
      controls.revealFor(2000);
      controls.place(r, v);
      // hovering a video signals intent: the weights and the kernels load now, so the click lands instantly
      if (insideVideo && !player.backend && !player.backendLoading && !player.blocked && now - preloadFailedAt > 5000) {
        player.preload().catch(err => { preloadFailedAt = performance.now(); if (!player.blocked) log('preload', err); });
      }
    } else {
      controls.limitReveal(250);
    }
  }, { passive: true });

  // ---------- navigation ----------
  let reattachSeq = 0;
  function reattach() {
    const seq = ++reattachSeq, t0 = performance.now();
    const tick = async () => {
      if (seq !== reattachSeq || player.isRunning() || !inFeed()) return;
      if (performance.now() - t0 > 12000) return;
      const v = biggestVideo();
      if (!v || !v.videoWidth || toggling) { setTimeout(tick, 150); return; }
      toggling = true;
      try { await player.start(v); }
      catch (e) { player.preparing(false); log('feed reattach', e); }
      finally { toggling = false; }
    };
    setTimeout(tick, 120);
  }

  let pageHref = location.href;
  // The recommend feed of douyin.com swaps its video element and resets the player on paths where neither the URL
  // changes nor a teardown event reaches us, so the enable silently dies. The watchdog re-arms it; a manual stop on
  // the current clip is respected until the clip changes (URL change or video swap).
  let feedWatchdogVideo = null;
  let feedStoppedByUser = false;
  setInterval(() => {
    if (location.href !== pageHref) {
      pageHref = location.href;
      feedStoppedByUser = false;
      if (player.isRunning()) {
        player.stop();
        if (inFeed()) reattach();
      }
    }
    if (inFeed()) {
      const v = biggestVideo();
      // A video element that left the DOM (or the stream the canvas rides on) means the clip changed: re-arm.
      if (feedWatchdogVideo !== v) { feedWatchdogVideo = v; feedStoppedByUser = false; }
      // A vertical feed keeps the old clip's <video> in the DOM when the next one is scrolled in, so the player stays
      // "running" on a video that is now off-screen: no teardown, no isRunning() flip, and the rail trails the old
      // element upward. The clip changed whenever the element on screen is not the one being generated.
      const stale = player.isRunning() && v && player.video !== v;
      // While the next clip's decoder has produced nothing yet, biggestVideo() is null: drop the off-screen stream so
      // the rail and the canvas stop following the clip above (the branch below re-arms once a video is ready).
      if (!stale && player.isRunning() && player.video && !onScreen(player.video)) player.stop();
      if ((!player.isRunning() || stale) && !toggling && !feedStoppedByUser && v?.videoWidth) {
        // show the rail right away: schedulePlacement() refuses to run while hidden, so the only way back from
        // setVisible(false) is a direct place() — which ends in setVisible(true)
        controls?.revealFor(2500);
        controls?.place(v.getBoundingClientRect(), v);
        if (stale) player.stop();
        toggling = true;
        player.start(v)
          .then(() => { if (player.isRunning()) controls?.place(v.getBoundingClientRect(), v); })
          .catch(e => { player.preparing(false); log('feed watchdog', e); })
          .finally(() => { toggling = false; });
      }
    }
    if (!controls) return;
    if (controls.isPanelOpen()) {
      controls.revealFor(2000);
      controls.schedulePlacement();
      return;
    }
    // In a vertical feed the clip is scrolled with the mouse held still, so no mousemove arrives to keep the reveal
    // alive and the rail used to be hidden two seconds after the swap — with nothing left to bring it back. While
    // generation runs there, keep the rail revealed and repositioned from this poll instead.
    if (inFeed() && player.isRunning()) {
      controls.revealFor(1000);
      controls.place(player.lastRect || player.video?.getBoundingClientRect(), player.video);
      return;
    }
    if (controls.isVisible()) controls.schedulePlacement();
    if (performance.now() > controls.revealUntil) {
      controls.blurFocus();
      controls.setPanelOpen(false);
      controls.setVisible(false);
    }
  }, 300);

  document.addEventListener('scroll', () => {
    if (!controls?.isVisible()) return;
    const v = activeVideo();
    if (v) controls.place(v.getBoundingClientRect(), v);
  }, { passive: true, capture: true });
  window.addEventListener('resize', () => controls?.schedulePlacement(), { passive: true });
  window.visualViewport?.addEventListener('resize', () => controls?.schedulePlacement(), { passive: true });

  // ---------- settings ----------
  settings.onChange(({ changed }) => {
    controls?.syncPanel();
    player.applySettings(changed);
  });

  // ---------- the toolbar popup ----------
  // With all_frames every frame gets the message; the running frame answers at once, a frame with a video after
  // 120 ms, video-less frames after 250 ms: the first response wins, so the most relevant frame speaks for the tab.
  try {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type === 'fcStatus') {
        const v = player.video || biggestVideo();
        const respond = async () => {
          await player.probeAdapter();
          try { sendResponse({ version: VERSION, hasVideo: !!v, ...player.status() }); } catch { /* popup closed */ }
        };
        if (player.isRunning()) respond();
        else setTimeout(respond, v ? 120 : 250);
        return true;
      }
      if (msg?.type === 'fcToggle') {
        const v = player.video || biggestVideo();
        if (!player.isRunning() && !v) return undefined;
        toggle().then(() => { try { sendResponse({ running: player.isRunning() }); } catch { /* popup closed */ } });
        return true;
      }
      return undefined;
    });
  } catch { /* messaging unavailable in some frames */ }

  // ---------- boot ----------
  const observer = new MutationObserver(() => mount());
  const mount = () => {
    if (controls) { observer.disconnect(); return; }
    if (document.querySelector('video')) { injectUI(); observer.disconnect(); }
  };
  mount();
  if (!controls) observer.observe(document.documentElement, { childList: true, subtree: true });
  if (bench) installBenchBridge({ token: bench, settings, player, version: VERSION, start: toggle, biggestVideo });
  window.__framegenDiagnostics = () => player.status();
  window.addEventListener('pagehide', () => { if (player.isRunning()) player.stop(); });
}

export { svgIcon };
