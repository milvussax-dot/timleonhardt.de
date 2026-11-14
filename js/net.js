// Online-Räume über PeerJS (WebRTC, Peer-to-Peer). Der Ersteller ist Host und verwaltet den Raum.
const PREFIX = 'gipfelrausch-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PLAYERS = 8;

function makeCode() {
  let s = '';
  for (let i = 0; i < 5; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}
const clean = (s) => String(s || '').replace(/[<>]/g, '').slice(0, 16) || 'Gast';

export const ONLINE_MODES = [
  { id: 'zeit', name: 'Rennen' },
  { id: 'slalom', name: 'Slalom' },
  { id: 'freestyle', name: 'Freestyle' },
  { id: 'lawine', name: 'Lawinen-Flucht' },
];

export function higherIsBetter(mode) { return mode === 'freestyle' || mode === 'lawine'; }

export class Net {
  constructor() {
    this.peer = null;
    this.isHost = false;
    this.code = null;
    this.myId = null;
    this.players = new Map(); // nur Host
    this.playerList = []; // alle
    this.conns = new Map();
    this.hostConn = null;
    this.settings = { mode: 'zeit', trackId: 'edelweiss', weather: 'abend', seed: 1 };
    this.phase = 'lobby';
    this.results = new Map();
    this.raceId = 0;
    this.handlers = {};
    this.closed = false;
  }

  on(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); }
  off(type) { delete this.handlers[type]; }
  emit(type, data) { (this.handlers[type] || []).forEach((f) => { try { f(data); } catch (e) { console.error(e); } }); }

  static available() { return typeof window.Peer === 'function'; }

  // ---------- Host ----------
  host(profile) {
    return new Promise((resolve, reject) => {
      if (!Net.available()) return reject(new Error('Online-Modul konnte nicht geladen werden. Bist du mit dem Internet verbunden?'));
      let tries = 0;
      const attempt = () => {
        const code = makeCode();
        const peer = new window.Peer(PREFIX + code, { debug: 0 });
        let opened = false;
        const to = setTimeout(() => { if (!opened) { peer.destroy(); reject(new Error('Keine Verbindung zum Vermittlungsserver.')); } }, 12000);
        peer.on('open', () => {
          opened = true;
          clearTimeout(to);
          this.peer = peer;
          this.code = code;
          this.isHost = true;
          this.myId = 'host';
          this.players.set('host', { id: 'host', name: clean(profile.name), jacket: profile.jacket, helmet: profile.helmet, isHost: true, st: null, inRace: false });
          peer.on('connection', (c) => this._onConn(c));
          this._broadcastRoom();
          resolve(code);
        });
        peer.on('error', (e) => {
          if (!opened && e.type === 'unavailable-id' && tries++ < 4) { clearTimeout(to); peer.destroy(); attempt(); return; }
          if (!opened) { clearTimeout(to); reject(new Error(errText(e))); return; }
          this.emit('toast', errText(e));
        });
        peer.on('disconnected', () => { if (!this.closed) { try { peer.reconnect(); } catch (e) { /* egal */ } } });
      };
      attempt();
    });
  }

  _onConn(conn) {
    conn.on('data', (m) => this._hostRecv(conn, m));
    conn.on('close', () => this._dropPlayer(conn.peer));
    conn.on('error', () => this._dropPlayer(conn.peer));
  }

  _dropPlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.players.delete(id);
    this.conns.delete(id);
    this.emit('toast', `${p.name} hat den Raum verlassen`);
    this._broadcastRoom();
    this._checkAllDone();
  }

  _hostRecv(conn, m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'hello') {
      if (this.players.size >= MAX_PLAYERS) { conn.send({ t: 'full' }); setTimeout(() => conn.close(), 400); return; }
      this.conns.set(conn.peer, conn);
      const p = { id: conn.peer, name: clean(m.name), jacket: m.jacket, helmet: m.helmet, isHost: false, st: null, inRace: false };
      this.players.set(conn.peer, p);
      conn.send({ t: 'welcome', id: conn.peer, code: this.code });
      this.emit('toast', `${p.name} ist beigetreten`);
      this._broadcastRoom();
      return;
    }
    const p = this.players.get(conn.peer);
    if (!p) return;
    if (m.t === 'st') p.st = m.d;
    else if (m.t === 'fin') this._recordResult(conn.peer, m.v, !!m.dnf);
  }

  _roomMsg() {
    return {
      t: 'room', code: this.code, phase: this.phase, settings: { ...this.settings },
      players: [...this.players.values()].map((p) => ({ id: p.id, name: p.name, jacket: p.jacket, helmet: p.helmet, isHost: p.isHost, inRace: p.inRace })),
    };
  }

  _sendAll(m) { for (const c of this.conns.values()) if (c.open) { try { c.send(m); } catch (e) { /* egal */ } } }

  _broadcastRoom() {
    const m = this._roomMsg();
    this.playerList = m.players;
    this._sendAll(m);
    this.emit('room', m);
  }

  setSettings(s) {
    if (!this.isHost) return;
    Object.assign(this.settings, s);
    this._broadcastRoom();
  }

  startRace() {
    if (!this.isHost) return;
    this.phase = 'race';
    this.raceId++;
    this.settings.seed = (Math.random() * 1e9) | 0;
    this.results.clear();
    for (const p of this.players.values()) { p.inRace = true; p.st = null; }
    const m = { t: 'start', raceId: this.raceId, settings: { ...this.settings }, players: this._roomMsg().players };
    this.playerList = m.players;
    this._sendAll(m);
    this._broadcastRoom();
    this.emit('start', m);
    clearInterval(this._stTimer);
    this._stTimer = setInterval(() => this._broadcastStates(), 66);
    clearTimeout(this._finTimer);
    this._firstFin = false;
  }

  _broadcastStates() {
    const l = [];
    for (const p of this.players.values()) if (p.st && p.inRace) l.push([p.id, ...p.st]);
    const m = { t: 'sts', l };
    this._sendAll(m);
    this.emit('sts', m);
  }

  _recordResult(id, v, dnf) {
    if (this.phase !== 'race' || this.results.has(id)) return;
    this.results.set(id, { v, dnf });
    if (!this._firstFin) {
      this._firstFin = true;
      this._finTimer = setTimeout(() => this._finalize(), 75000);
    }
    this._broadcastResults(false);
    this._checkAllDone();
  }

  _resultsMsg(final) {
    const hib = higherIsBetter(this.settings.mode);
    const list = [...this.players.values()].filter((p) => p.inRace).map((p) => {
      const r = this.results.get(p.id);
      return { id: p.id, name: p.name, jacket: p.jacket, v: r ? r.v : null, dnf: r ? r.dnf : final, pending: !r && !final };
    });
    list.sort((a, b) => {
      const ra = a.v == null || (a.dnf && !hib) ? 1 : 0, rb = b.v == null || (b.dnf && !hib) ? 1 : 0;
      if (ra !== rb) return ra - rb;
      if (a.v == null || b.v == null) return 0;
      return hib ? b.v - a.v : a.v - b.v;
    });
    return { t: 'results', final, mode: this.settings.mode, list };
  }

  _broadcastResults(final) {
    const m = this._resultsMsg(final);
    this._sendAll(m);
    this.emit('results', m);
  }

  _checkAllDone() {
    if (this.phase !== 'race') return;
    const racing = [...this.players.values()].filter((p) => p.inRace);
    if (racing.length && racing.every((p) => this.results.has(p.id))) this._finalize();
  }

  _finalize() {
    if (this.phase !== 'race') return;
    this.phase = 'results';
    clearInterval(this._stTimer);
    clearTimeout(this._finTimer);
    this._broadcastResults(true);
    this._broadcastRoom();
  }

  backToLobby() {
    if (!this.isHost) return;
    this.phase = 'lobby';
    for (const p of this.players.values()) p.inRace = false;
    clearInterval(this._stTimer);
    this._sendAll({ t: 'lobby' });
    this._broadcastRoom();
    this.emit('lobby');
  }

  // ---------- Client ----------
  join(code, profile) {
    code = String(code || '').trim().toUpperCase();
    return new Promise((resolve, reject) => {
      if (!Net.available()) return reject(new Error('Online-Modul konnte nicht geladen werden. Bist du mit dem Internet verbunden?'));
      if (!/^[A-Z0-9]{5}$/.test(code)) return reject(new Error('Der Raumcode hat 5 Zeichen.'));
      const peer = new window.Peer({ debug: 0 });
      this.peer = peer;
      let done = false;
      const fail = (msg) => { if (done) return; done = true; clearTimeout(to); try { peer.destroy(); } catch (e) { /* egal */ } reject(new Error(msg)); };
      const to = setTimeout(() => fail('Zeitüberschreitung: Raum nicht erreichbar.'), 15000);
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true });
        this.hostConn = conn;
        conn.on('open', () => conn.send({ t: 'hello', name: profile.name, jacket: profile.jacket, helmet: profile.helmet }));
        conn.on('data', (m) => {
          if (m && m.t === 'welcome') { done = true; clearTimeout(to); this.myId = m.id; this.code = m.code; resolve(m.code); return; }
          if (m && m.t === 'full') { fail('Der Raum ist voll (max. 8).'); return; }
          this._clientRecv(m);
        });
        conn.on('close', () => { if (done && !this.closed) this.emit('closed', 'Verbindung zum Host verloren.'); });
      });
      peer.on('error', (e) => {
        if (!done) fail(e.type === 'peer-unavailable' ? 'Raum nicht gefunden. Code richtig?' : errText(e));
        else this.emit('toast', errText(e));
      });
    });
  }

  _clientRecv(m) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'room':
        this.settings = m.settings; this.phase = m.phase; this.playerList = m.players; this.code = m.code;
        this.emit('room', m);
        break;
      case 'start':
        this.settings = m.settings; this.phase = 'race'; this.playerList = m.players;
        this.emit('start', m);
        break;
      case 'sts': this.emit('sts', m); break;
      case 'results': this.emit('results', m); break;
      case 'lobby': this.phase = 'lobby'; this.emit('lobby'); break;
      default: break;
    }
  }

  // ---------- beide ----------
  sendState(d) {
    if (this.isHost) { const p = this.players.get('host'); if (p) p.st = d; }
    else if (this.hostConn && this.hostConn.open) { try { this.hostConn.send({ t: 'st', d }); } catch (e) { /* egal */ } }
  }

  sendFinish(v, dnf = false) {
    if (this.isHost) this._recordResult('host', v, dnf);
    else if (this.hostConn && this.hostConn.open) this.hostConn.send({ t: 'fin', v, dnf });
  }

  inviteLink() {
    const u = new URL(location.href);
    u.search = '';
    u.hash = '';
    u.searchParams.set('room', this.code);
    return u.toString();
  }

  leave() {
    this.closed = true;
    clearInterval(this._stTimer);
    clearTimeout(this._finTimer);
    try { if (this.peer) this.peer.destroy(); } catch (e) { /* egal */ }
    this.handlers = {};
  }
}

function errText(e) {
  const t = e && e.type;
  if (t === 'network' || t === 'server-error' || t === 'socket-error') return 'Netzwerkfehler – Verbindung zum Vermittlungsserver fehlgeschlagen.';
  if (t === 'browser-incompatible') return 'Dein Browser unterstützt kein WebRTC.';
  if (t === 'peer-unavailable') return 'Spieler nicht erreichbar.';
  return (e && e.message) || 'Unbekannter Verbindungsfehler.';
}
