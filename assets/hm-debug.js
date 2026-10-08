/*
 * On-device video diagnostic. Only loaded when the URL has ?hmdebug=1 (see snippets/scripts.liquid).
 * Shows an on-screen panel with what this phone/browser does with the hero video, so a screenshot
 * is enough to tell why a video does or doesn't play. It changes nothing on the page.
 */
(function () {
  var started = Date.now();
  var lines = [];
  var panel, body, verdictEl;

  function t() { return ((Date.now() - started) / 1000).toFixed(1) + 's'; }

  function log(text) {
    lines.push(t() + '  ' + text);
    if (body) { body.textContent = lines.join('\n'); body.scrollTop = body.scrollHeight; }
  }

  function buildPanel() {
    panel = document.createElement('div');
    panel.style.cssText =
      'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;max-height:55vh;display:flex;flex-direction:column;' +
      'background:rgba(0,0,0,.92);color:#fff;font:11px/1.45 ui-monospace,Menlo,monospace;';

    verdictEl = document.createElement('div');
    verdictEl.style.cssText = 'padding:8px 10px;font-weight:700;background:#ff5000;color:#000;font-size:12px;';
    verdictEl.textContent = 'Diagnóstico de video — midiendo…';

    body = document.createElement('pre');
    body.style.cssText = 'margin:0;padding:8px 10px;overflow:auto;white-space:pre-wrap;word-break:break-word;flex:1;';

    var close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Cerrar';
    close.style.cssText = 'padding:8px;border:0;border-top:1px solid #444;background:#222;color:#fff;font:inherit;';
    close.addEventListener('click', function () { panel.parentNode.removeChild(panel); });

    panel.appendChild(verdictEl);
    panel.appendChild(body);
    panel.appendChild(close);
    document.body.appendChild(panel);
  }

  function describeError(video) {
    var e = video.error;
    return e ? 'code ' + e.code + (e.message ? ' (' + e.message + ')' : '') : 'ninguno';
  }

  function snapshot(video, label) {
    log(label + ': paused=' + video.paused + ' readyState=' + video.readyState + ' networkState=' + video.networkState +
        ' currentTime=' + video.currentTime.toFixed(2) + ' ' + video.videoWidth + 'x' + video.videoHeight + ' error=' + describeError(video));
  }

  function run() {
    buildPanel();

    var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var conn = navigator.connection || {};
    log('Navegador: ' + navigator.userAgent);
    log('Pantalla: ' + window.innerWidth + 'x' + window.innerHeight + ' @' + (window.devicePixelRatio || 1) + 'x');
    log('Reducir movimiento (prefers-reduced-motion): ' + reduceMotion);
    log('Ahorro de datos / conexión: saveData=' + conn.saveData + ' tipo=' + conn.effectiveType);
    log('Pestaña visible: ' + !document.hidden);

    var hero = document.getElementById('hm-hero-v2-video') || document.querySelector('video');
    if (!hero) { log('No encontré ningún <video> en esta página.'); verdictEl.textContent = 'No hay video en esta página'; return; }

    log('Video: ' + (hero.currentSrc || hero.getAttribute('src') || hero.getAttribute('data-src') || '(sin src todavía)').slice(-60));
    log('Atributos: autoplay=' + hero.hasAttribute('autoplay') + ' muted=' + hero.muted + ' loop=' + hero.loop + ' playsinline=' + hero.hasAttribute('playsinline') + ' preload=' + hero.preload);
    snapshot(hero, 'Estado inicial');

    ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'playing', 'pause', 'waiting', 'stalled', 'suspend', 'abort', 'emptied', 'error']
      .forEach(function (name) {
        hero.addEventListener(name, function () {
          log('evento "' + name + '" (currentTime=' + hero.currentTime.toFixed(2) + (name === 'error' ? ', error=' + describeError(hero) : '') + ')');
        });
      });

    // Independent test: can THIS device autoplay a muted inline video at all?
    var test = document.createElement('video');
    test.muted = true; test.defaultMuted = true; test.loop = true; test.playsInline = true;
    test.setAttribute('playsinline', ''); test.setAttribute('webkit-playsinline', '');
    test.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:.02;pointer-events:none;';
    test.src = hero.currentSrc || hero.getAttribute('src') || hero.getAttribute('data-src') || '';
    var autoplayResult = 'sin probar';
    if (test.src) {
      document.body.appendChild(test);
      var promise = test.play();
      if (promise && promise.then) {
        promise.then(function () { autoplayResult = 'PERMITIDO'; log('Prueba de autoplay (video aparte): permitido'); })
               .catch(function (err) { autoplayResult = 'BLOQUEADO ' + (err && err.name); log('Prueba de autoplay (video aparte): BLOQUEADO — ' + (err && err.name) + ': ' + (err && err.message)); });
      }
    }

    // Watch the real hero for ~8 seconds.
    var firstTime = null, advanced = false, checks = 0;
    var timer = setInterval(function () {
      checks += 1;
      if (firstTime === null) firstTime = hero.currentTime;
      if (hero.currentTime - firstTime > 0.5) advanced = true;
      if (checks % 4 === 0) snapshot(hero, 'Seguimiento');
      if (checks >= 16) {
        clearInterval(timer);
        if (test.parentNode) test.parentNode.removeChild(test);
        var verdict;
        if (advanced) verdict = 'OK: el video del hero SE REPRODUCE en este dispositivo';
        else if (reduceMotion) verdict = 'NO se reproduce: este teléfono tiene "Reducir movimiento" activado (Ajustes → Accesibilidad → Movimiento)';
        else if (/NotAllowedError/.test(autoplayResult)) verdict = 'NO se reproduce: iOS bloquea el autoplay (típico del Modo de bajo consumo — batería amarilla — o del Modo de datos bajos)';
        else if (hero.error) verdict = 'NO se reproduce: el archivo dio error (' + describeError(hero) + ')';
        else verdict = 'NO avanzó: el video no está corriendo (mirá los eventos de abajo)';
        verdictEl.textContent = verdict;
        log('RESULTADO: ' + verdict);
      }
    }, 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
