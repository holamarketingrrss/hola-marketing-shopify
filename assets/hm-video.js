/*
 * Lazy, device-aware looping videos for the Hola Marketing home.
 *
 * Markup: <video data-hm-video data-src="…1080p.mp4" [data-src-hq="…original.mp4"] [data-src-mobile="…720p.mp4"]
 *                poster="…" muted loop playsinline preload="none">
 *
 * - The source is only attached when the video is about to enter the viewport, so the page
 *   doesn't download every video up front.
 * - Source tiers, best first:  data-src-hq   → large desktop screens with a mouse (≥1200px) get the
 *                                              original upload (full quality);
 *                              data-src-mobile → phones (≤900px), when provided;
 *                              data-src      → everything else (Shopify's 1080p transcode).
 *   If a tier fails to play (e.g. the device can't decode a 4K original) the next one is used.
 * - Videos pause when they leave the viewport, so iOS never has several decoders running at once.
 * - Playback is (re)tried once the data has loaded, because iOS ignores play() on an empty video.
 */
(function () {
  var MOBILE_QUERY = '(max-width: 900px)';
  var HQ_QUERY = '(min-width: 1200px) and (hover: hover) and (pointer: fine)';
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function matches(query) {
    return !!(window.matchMedia && window.matchMedia(query).matches);
  }

  function buildSources(video) {
    var sources = [];
    function add(url) { if (url && sources.indexOf(url) === -1) sources.push(url); }

    if (matches(HQ_QUERY)) add(video.getAttribute('data-src-hq'));
    if (matches(MOBILE_QUERY)) add(video.getAttribute('data-src-mobile'));
    add(video.getAttribute('data-src'));
    add(video.getAttribute('data-src-mobile'));
    return sources;
  }

  function tryPlay(video) {
    if (reduceMotion || !video.hmVisible) return;
    var promise = video.play();
    if (promise && promise.catch) promise.catch(function () {});
  }

  function attach(video) {
    if (video.getAttribute('data-hm-loaded')) return;
    video.setAttribute('data-hm-loaded', '1');

    video.hmSources = buildSources(video);
    video.hmSourceIndex = 0;

    video.addEventListener('loadeddata', function () { tryPlay(video); });
    video.addEventListener('canplay', function () { tryPlay(video); });
    video.addEventListener('error', function () {
      // This tier can't be played here: fall back to the next, lighter one.
      if (video.hmSourceIndex + 1 < video.hmSources.length) {
        video.hmSourceIndex += 1;
        video.src = video.hmSources[video.hmSourceIndex];
        video.load();
      }
    });

    video.src = video.hmSources[0];
    video.load();
  }

  function setVisible(video, visible) {
    video.hmVisible = visible;
    if (visible) {
      attach(video);
      tryPlay(video);
    } else if (video.getAttribute('data-hm-loaded')) {
      video.pause();
    }
  }

  function init() {
    var videos = document.querySelectorAll('video[data-hm-video]');
    if (!videos.length) return;

    Array.prototype.forEach.call(videos, function (video) {
      video.muted = true;
    });

    if (!('IntersectionObserver' in window)) {
      Array.prototype.forEach.call(videos, function (video) { setVisible(video, true); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        setVisible(entry.target, entry.isIntersecting);
      });
    }, { rootMargin: '250px 0px' });

    Array.prototype.forEach.call(videos, function (video) {
      observer.observe(video);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
