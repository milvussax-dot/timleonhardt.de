/* Gemeinsame Online-Bestenliste für alle Spiele auf timleonhardt.de.
   Braucht lb-config.js davor. Stellt window.TLBoard bereit:
     TLBoard.configured                 true, wenn URL und Key eingetragen sind
     TLBoard.getName() / setName(n)     Spielername, gilt für alle Spiele
     TLBoard.board(board, limit)        → Promise { top: [{name, score, tiebreak, me}], me: {…, rank} | null, total, higherBetter }
     TLBoard.submit(board, name, score, tiebreak)  → Promise
   Fehler kommen als Error mit .code: 'not_configured', 'rejected' (Wert oder Name ungültig) oder 'network'. */
(function () {
  'use strict';
  var CFG = window.TL_LEADERBOARD || {};
  var API = String(CFG.url || '').trim().replace(/\/+$/, '');
  var KEY = String(CFG.key || '').trim();
  var configured = /^https:\/\/[^/]+/.test(API) && KEY.length > 20;

  function sget(k, d) { try { var s = localStorage.getItem(k); return s == null ? d : JSON.parse(s); } catch (e) { return d; } }
  function sset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }

  function cleanName(s) {
    return String(s || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 16);
  }

  var pid = null;
  var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  function playerId() {
    if (pid) return pid;
    var id = sget('tl.player', '');
    if (typeof id !== 'string' || !UUID.test(id)) {
      // ältere Umlauf-ID übernehmen, damit vorhandene Einträge dem Gerät zugeordnet bleiben
      var legacy = sget('umlauf.player', '');
      if (typeof legacy === 'string' && UUID.test(legacy)) id = legacy;
      else if (window.crypto && crypto.randomUUID) id = crypto.randomUUID();
      else {
        var b = crypto.getRandomValues(new Uint8Array(16));
        b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
        var h = Array.prototype.map.call(b, function (x) { return (x + 256).toString(16).slice(1); }).join('');
        id = h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
      }
      sset('tl.player', id);
    }
    pid = id;
    return id;
  }

  function getName() {
    var n = cleanName(sget('tl.name', ''));
    if (!n) n = cleanName(sget('umlauf.nick', ''));
    return n;
  }
  function setName(n) { n = cleanName(n); if (n) sset('tl.name', n); return n; }

  function fail(code, msg) { var e = new Error(msg || code); e.code = code; return e; }

  function rpc(fn, body) {
    if (!configured) return Promise.reject(fail('not_configured'));
    var headers = { 'Content-Type': 'application/json', apikey: KEY };
    if (KEY.indexOf('eyJ') === 0) headers.Authorization = 'Bearer ' + KEY;   // alter "anon"-Key
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 10000);
    return fetch(API + '/rest/v1/rpc/' + fn, { method: 'POST', headers: headers, body: JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
      .then(function (res) {
        if (res.status >= 400 && res.status < 500) throw fail('rejected', 'HTTP ' + res.status);
        if (!res.ok) throw fail('network', 'HTTP ' + res.status);
        return res.text();
      }, function () { throw fail('network'); })
      .then(function (text) { return text ? JSON.parse(text) : null; })
      .finally(function () { clearTimeout(timer); });
  }

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  window.TLBoard = {
    configured: configured,
    playerId: playerId,
    cleanName: cleanName,
    getName: getName,
    setName: setName,
    board: function (board, limit) {
      return rpc('lb_board', { p_board: board, p_player: playerId(), p_limit: limit || 10 }).then(function (d) {
        d = d || {};
        var top = Array.isArray(d.top) ? d.top : [];
        return {
          higherBetter: d.higher_better !== false,
          total: num(d.total),
          top: top.map(function (r) { return { name: cleanName(r && r.name) || 'Anonym', score: num(r && r.score), tiebreak: num(r && r.tiebreak), me: !!(r && r.me) }; }),
          me: d.me ? { name: cleanName(d.me.name), score: num(d.me.score), tiebreak: num(d.me.tiebreak), rank: Math.max(1, Math.floor(num(d.me.rank)) || 1) } : null,
        };
      });
    },
    submit: function (board, name, score, tiebreak) {
      var n = setName(name);
      if (!n) return Promise.reject(fail('rejected', 'name'));
      return rpc('lb_submit', { p_board: board, p_player: playerId(), p_name: n, p_score: score, p_tiebreak: tiebreak || 0 });
    },
  };
})();
