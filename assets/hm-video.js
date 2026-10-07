/*
 * Lazy, device-aware looping videos for the Hola Marketing home.
 *
 * Markup: <video data-hm-video data-src="…1080p.mp4" [data-src-hq="…original.mp4"] [data-src-mobile="…720p.mp4"]
 *                poster="…" muted loop playsinline preload="none">
 *
 * - A video's source is attached only when it is about to enter the viewport, and DETACHED again a few
 *   seconds after it leaves it. Only the videos on screen hold a decoder, so the page never keeps several
 *   big (4K) videos in memory at once — that is what made playback stutter.
 * - Source tiers, best first:
 *     data-src-hq     → only screens that really need it (≥2400 device pixels wide, with a mouse): the original upload;
 *     data-src-mobile → only for visitors with data saver on or a slow (2G/3G) connection, when provided;
 *     data-src        → everything else (Shopify's 1080p transcode).
 *   If a tier can't be played (or keeps stalling) the next, lighter one is used.
 * - A watchdog restarts any visible video whose clock stops moving.
 * - Playback is (re)tried once data has loaded, because iOS ignores play() on an empty video.
 */
(function () {
  var HQ_MIN_DEVICE_WIDTH = 2400;
  var UNLOAD_DELAY_MS = 3000;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function matches(query) {
    return !!(window.matchMedia && window.matchMedia(query).matches);
  }

  function wantsHighQuality() {
    var deviceWidth = window.innerWidth * (window.devicePixelRatio || 1);
    return deviceWidth >= HQ_MIN_DEVICE_WIDTH && matches('(hover: hover) and (pointer: fine)');
  }

  function isLiteConnection() {
    var connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (!connection) return false;
    return !!connection.saveData || /(^|-)2g$|^3g$/.test(connection.effectiveType || '');
  }

  function buildSources(video) {
    var sources = [];
    function add(url) { if (url && sources.indexOf(url) === -1) sources.push(url); }

    if (wantsHighQuality()) add(video.getAttribute('data-src-hq'));
    // The light (720p) file is only for visitors who asked for less data or are on a slow
    // connection; phones on a normal connection get the same 1080p as everyone else.
    if (isLiteConnection()) add(video.getAttribute('data-src-mobile'));
    add(video.getAttribute('data-src'));
    add(video.getAttribute('data-src-mobile'));
    return sources;
  }

  function tryPlay(video) {
    if (reduceMotion || !video.hmVisible || !video.getAttribute('src')) return;
    var promise = video.play();
    if (promise && promise.catch) promise.catch(function () {});
  }

  // Listeners are added once per element, however many times it is attached/detached.
  function wire(video) {
    if (video.hmWired) return;
    video.hmWired = true;

    video.addEventListener('loadeddata', function () { tryPlay(video); });
    video.addEventListener('canplay', function () { tryPlay(video); });

    // If something other than this script pauses a video that should be playing, start it again.
    video.addEventListener('pause', function () {
      if (video.hmVisible && !video.ended && !document.hidden && video.getAttribute('src')) {
        setTimeout(function () { if (video.paused) tryPlay(video); }, 60);
      }
    });

    video.addEventListener('error', function () {
      if (!video.getAttribute('src')) return; // we detached it on purpose
      // This tier can't be played here: fall back to the next, lighter one.
      if (video.hmSourceIndex + 1 < video.hmSources.length) {
        video.hmSourceIndex += 1;
        video.hmMinTier = video.hmSourceIndex;
        video.src = video.hmSources[video.hmSourceIndex];
        video.load();
      }
    });

    if (video.parentNode) {
      video.parentNode.addEventListener('pointerenter', function () { if (video.paused) tryPlay(video); });
    }
  }

  function attach(video) {
    wire(video);
    if (video.getAttribute('data-hm-loaded')) return;
    video.setAttribute('data-hm-loaded', '1');

    video.hmSources = buildSources(video);
    // Stay on a lighter tier if this video already had to step down earlier.
    video.hmSourceIndex = Math.min(video.hmMinTier || 0, video.hmSources.length - 1);
    video.src = video.hmSources[video.hmSourceIndex];
    video.load();
  }

  function detach(video) {
    if (!video.getAttribute('data-hm-loaded')) return;
    video.pause();
    video.removeAttribute('src');
    video.load(); // releases the decoder and the buffered data
    video.removeAttribute('data-hm-loaded');
  }

  function setVisible(video, visible) {
    video.hmVisible = visible;
    clearTimeout(video.hmUnloadTimer);

    if (visible) {
      attach(video);
      tryPlay(video);
    } else if (video.getAttribute('data-hm-loaded')) {
      video.pause();
      video.hmUnloadTimer = setTimeout(function () {
        if (!video.hmVisible) detach(video);
      }, UNLOAD_DELAY_MS);
    }
  }

  // Stall watchdog: a visible video that is supposed to be playing but whose clock stops moving
  // (decoder hiccup, buffer underrun) is nudged back into motion. If it keeps stalling it steps
  // down to the next, lighter source tier.
  function recover(video) {
    video.hmStalls = (video.hmStalls || 0) + 1;
    video.setAttribute('data-hm-stalls', video.hmStalls);
    var resumeAt = video.currentTime;

    if (video.hmStalls >= 2 && video.hmSourceIndex + 1 < video.hmSources.length) {
      video.hmSourceIndex += 1;
      video.hmMinTier = video.hmSourceIndex;
      video.hmStalls = 0;
      video.addEventListener('loadedmetadata', function restore() {
        video.removeEventListener('loadedmetadata', restore);
        try { video.currentTime = resumeAt; } catch (err) {}
        tryPlay(video);
      });
      video.src = video.hmSources[video.hmSourceIndex];
      video.load();
      return;
    }

    try { video.currentTime = resumeAt + 0.05; } catch (err) {}
    tryPlay(video);
  }

  function startWatchdog(videos) {
    setInterval(function () {
      if (document.hidden || reduceMotion) return;

      Array.prototype.forEach.call(videos, function (video) {
        if (!video.hmVisible || !video.getAttribute('data-hm-loaded') || !video.getAttribute('src')) {
          video.hmLastTime = -1;
          video.hmStuck = 0;
          return;
        }

        if (video.paused) {
          video.hmStuck = 0;
          tryPlay(video);
          return;
        }

        var moved = Math.abs(video.currentTime - (video.hmLastTime === undefined ? -1 : video.hmLastTime)) > 0.01;
        video.hmStuck = moved ? 0 : (video.hmStuck || 0) + 1;
        video.hmLastTime = video.currentTime;

        if (video.hmStuck >= 2 && video.readyState >= 1) {
          video.hmStuck = 0;
          recover(video);
        }
      });
    }, 1000);
  }

  function init() {
    var videos = document.querySelectorAll('video[data-hm-video]');
    if (!videos.length) return;

    startWatchdog(videos);

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
