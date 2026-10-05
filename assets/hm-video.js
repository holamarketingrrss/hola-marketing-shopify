/*
 * Lazy, device-aware looping videos for the Hola Marketing home.
 *
 * Markup: <video data-hm-video data-src="…1080p.mp4" data-src-mobile="…720p.mp4" poster="…" muted loop playsinline preload="none">
 *
 * - The source is only attached when the video is about to enter the viewport, so the page
 *   doesn't download every video up front.
 * - Phones (≤900px) get the lighter data-src-mobile file when one is provided.
 * - Videos pause when they leave the viewport, so iOS never has several decoders running at once.
 * - Playback is (re)tried once the data has loaded, because iOS ignores play() on an empty video.
 */
(function () {
  var MOBILE_QUERY = '(max-width: 900px)';
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function pickSource(video) {
    var mobile = window.matchMedia && window.matchMedia(MOBILE_QUERY).matches;
    return (mobile && video.getAttribute('data-src-mobile')) || video.getAttribute('data-src');
  }

  function tryPlay(video) {
    if (reduceMotion || !video.hmVisible) return;
    var promise = video.play();
    if (promise && promise.catch) promise.catch(function () {});
  }

  function attach(video) {
    if (video.getAttribute('data-hm-loaded')) return;
    video.setAttribute('data-hm-loaded', '1');
    video.addEventListener('loadeddata', function () { tryPlay(video); });
    video.addEventListener('canplay', function () { tryPlay(video); });
    video.src = pickSource(video);
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
