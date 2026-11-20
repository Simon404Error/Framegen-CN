// What differs from site to site: which players keep their own controls above our canvas, which pages are feeds,
// which need a CSS nudge, and which <video> on a page is the one to work on.

// Sites whose own DOM controls are known to render above the overlay: no second control bar there. Everywhere else
// (jut.su-style players put their bar below the canvas) ours are the only usable controls.
export const SITE_CONTROLS_OK = /(^|\.)(youtube\.com|youtu\.be|vimeo\.com|twitch\.tv)$/.test(location.hostname);

// Vertical feeds: every scroll is an SPA navigation to the next clip, and the enable carries over to it.
// douyin.com is the Chinese TikTok (same infinite vertical feed).
export const inFeed = () => /youtube\.com\/shorts|tiktok\.com|douyin\.com/.test(location.href);

export function keepTwitchControlsAboveOverlay() {
  if (!/(^|\.)twitch\.tv$/.test(location.hostname)) return;
  if (document.getElementById('fc-twitch-controls')) return;
  const css = document.createElement('style');
  css.id = 'fc-twitch-controls';
  // Theater and fullscreen rebuild the player and these layers fall under the canvas. z-index alone puts them back;
  // position:relative would too, but pins the bar to the top of the player.
  css.textContent = `.video-player__overlay { z-index: 3 !important; }
.video-player__overlay [data-a-target="player-controls"],
.video-player__overlay .player-controls,
.video-player__overlay .top-bar { z-index: 100 !important; }`;
  (document.head || document.documentElement).appendChild(css);
}

// Ranked by visible area in the viewport, not raw size: virtualized feeds (TikTok) keep several same-sized players
// mounted and rotate them through the viewport, and an off-screen one must never win. Playing beats paused.
export function visibleArea(v) {
  const r = v.getBoundingClientRect();
  return Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0))
    * Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0));
}

// Whether that player still owns a meaningful part of the viewport. A vertical feed leaves the previous clip mounted
// just above (or below) the visible one; generating for it means the canvas and the in-player rail follow it out.
export function onScreen(video, minFraction = 0.25) {
  if (!video?.isConnected) return false;
  const r = video.getBoundingClientRect();
  const box = r.width * r.height;
  if (box <= 0) return false;
  return visibleArea(video) / box >= minFraction;
}

export function biggestVideo() {
  let best = null, score = 0;
  for (const v of document.querySelectorAll('video')) {
    if (v.readyState < 2) continue;
    const s = visibleArea(v) * (v.paused ? 0.5 : 1);
    if (s > score) { score = s; best = v; }
  }
  return best;
}
