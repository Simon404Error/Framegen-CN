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

// One storage key holds the hostnames the viewer chose to have Framegen start on: turning the rail on remembers the
// site, turning it off forgets it. A page load reads it before deciding anything, so a site visited later starts on
// its own and a site turned off stays off — across videos, tabs and browser restarts.
const AUTO_HOSTS_KEY = 'fcAutoHosts';
const AUTO_HOSTS_MAX = 200;

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

  // ---------- per-site auto-start ----------
  const siteHost = () => (location.hostname || '').toLowerCase().replace(/^www\./, '');
  let autoHosts = [];
  // Read from storage before any watchdog decides anything: "listed" is the viewer's standing choice for this site.
  let autoEnabled = false;
  // The viewer's intent for the clips of a vertical feed, kept across them (declared here because the storage
  // callbacks below can touch it before the feed watchdog is set up).
  let feedWanted = false;

  function applyAutoHosts(list) {
    autoHosts = list;
    const listed = !!siteHost() && list.includes(siteHost());
    if (listed) autoEnabled = true;
    else if (autoEnabled) {
      // Forgotten while this tab stayed open: stop here too, not only on the next load.
      autoEnabled = false;
      feedWanted = false;
      if (player.isRunning()) player.stop();
    }
  }

  function rememberAutoHost(enabled) {
    const host = siteHost();
    if (!host) return;
    const next = autoHosts.filter(item => item !== host);
    if (enabled) next.push(host);
    autoHosts = next.slice(-AUTO_HOSTS_MAX);
    try { chrome.storage.local.set({ [AUTO_HOSTS_KEY]: autoHosts }); } catch { /* storage unavailable */ }
  }

  function loadAutoHosts() {
    if (bench) return; // benchmark runs leave the viewer's stored choices alone
    try {
      chrome.storage.local.get(AUTO_HOSTS_KEY, snapshot => {
        try { applyAutoHosts(Array.isArray(snapshot?.[AUTO_HOSTS_KEY]) ? snapshot[AUTO_HOSTS_KEY] : []); }
        catch (e) { log('auto hosts', e); }
      });
    } catch { /* storage unavailable in this frame */ }
  }

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
      if (player.isRunning()) {
        player.stop();
        // The viewer turned it off: remember that for this whole site and for the following clips of this page.
        if (inFeed()) feedWanted = false;
        autoEnabled = false;
        rememberAutoHost(false);
        return;
      }
      // Turning it on by hand makes this site start on its own from now on (and the following clips of this page).
      autoEnabled = true;
      rememberAutoHost(true);
      if (inFeed()) feedWanted = true;
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
    // Carrying the enable over to the next clip is only a continuation of what the viewer asked for; with the intent
    // off (a fresh page, or the rail turned off by hand) nothing re-arms on its own.
    if (!feedWanted) return;
    const seq = ++reattachSeq, t0 = performance.now();
    const tick = async () => {
      if (seq !== reattachSeq || player.isRunning() || !inFeed() || !feedWanted) return;
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
  let feedWatchdogVideo = null;
  setInterval(() => {
    if (location.href !== pageHref) {
      // SPA navigation to another page: the old stream is dead. The intent survives it (it is per site visit, not
      // per clip), but the stream does not.
      pageHref = location.href;
      if (player.isRunning()) {
        player.stop();
        if (inFeed()) reattach();
      }
    }
    // A plain page load: no feed, nothing in the DOM yet knows it should start. Listed sites start on their own the
    // moment a decoded video is in view — that is the whole of the opt-in, and it costs one start per page.
    if (autoEnabled && !inFeed() && !player.isRunning() && !toggling) {
      const v = biggestVideo();
      if (v?.videoWidth) {
        controls?.revealFor(2500);
        controls?.place(v.getBoundingClientRect(), v);
        toggling = true;
        player.start(v)
          .then(() => { if (player.isRunning()) controls?.place(v.getBoundingClientRect(), v); })
          .catch(e => { player.preparing(false); log('auto start', e); })
          .finally(() => { toggling = false; });
      }
    }
    if (inFeed()) {
      const v = biggestVideo();
      if (feedWatchdogVideo !== v) feedWatchdogVideo = v;
      // In a feed the intent for this site also becomes the intent for its clips: a listed site needs no click.
      if (autoEnabled && !feedWanted) feedWanted = true;
      // A vertical feed keeps the old clip's <video> in the DOM when the next one is scrolled in, so the player stays
      // "running" on a video that is now off-screen: no teardown, no isRunning() flip, and the rail trails the old
      // element upward. The clip changed whenever the element on screen is not the one being generated.
      const stale = player.isRunning() && v && player.video !== v;
      // While the next clip's decoder has produced nothing yet, biggestVideo() is null: drop the off-screen stream so
      // the rail and the canvas stop following the clip above (the branch below re-arms once a video is ready).
      if (!stale && player.isRunning() && player.video && !onScreen(player.video)) player.stop();
      if (feedWanted && (!player.isRunning() || stale) && !toggling && v?.videoWidth) {
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
  loadAutoHosts();
  // Another tab (or the popup) changing the list applies here too, without a reload.
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !Object.hasOwn(changes, AUTO_HOSTS_KEY)) return;
      applyAutoHosts(Array.isArray(changes[AUTO_HOSTS_KEY].newValue) ? changes[AUTO_HOSTS_KEY].newValue : []);
    });
  } catch { /* storage unavailable in this frame */ }
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
