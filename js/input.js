// Tastatur + Touch. Tasten, die beim Absprung/Landen gehalten werden, sind gesperrt bis zum Loslassen
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];
const UPK = ['KeyW', 'ArrowUp'];
const DOWNK = ['KeyS', 'ArrowDown'];
const TRICK_L = ['KeyQ', 'TouchTrickL'];
const TRICK_R = ['KeyE', 'TouchTrickR'];
const BOOST = ['ShiftLeft', 'ShiftRight', 'KeyB', 'TouchBoost'];
const BLOCK = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

export class Input {
  constructor() {
    this.down = new Set();
    this.locked = new Set();
    this.edges = new Set();
    this.enabled = true;
    this.inp = { steer: 0, tuck: false, brake: false, jump: false, flip: 0, spin: 0, grab: 0, trickL: false, trickR: false, boost: false };
    addEventListener('keydown', (e) => {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (BLOCK.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.down.add(e.code);
      this.edges.add(e.code);
    });
    addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.locked.delete(e.code);
    });
    addEventListener('blur', () => { this.down.clear(); this.locked.clear(); });
  }

  press(code) { if (!this.down.has(code)) this.edges.add(code); this.down.add(code); }
  release(code) { this.down.delete(code); this.locked.delete(code); }

  held(codes) {
    for (const c of codes) if (this.down.has(c) && !this.locked.has(c)) return true;
    return false;
  }
  edge(code) {
    if (this.edges.has(code)) { this.edges.delete(code); return true; }
    return false;
  }
  clearEdges() { this.edges.clear(); }
  lockAll() { for (const c of this.down) this.locked.add(c); }

  read(st) {
    const inp = this.inp;
    const L = this.held(LEFT), R = this.held(RIGHT), U = this.held(UPK), D = this.held(DOWNK);
    inp.steer = (R ? 1 : 0) - (L ? 1 : 0);
    inp.jump = this.edge('Space') || this.edge('TouchJump');
    const eL = this.edge('KeyQ') || this.edge('TouchTrickL');
    const eR = this.edge('KeyE') || this.edge('TouchTrickR');
    inp.boost = this.held(BOOST);
    if (st.grounded) {
      inp.tuck = U; inp.brake = D; inp.flip = 0; inp.spin = 0; inp.grab = 0;
      inp.trickL = eL; inp.trickR = eR;
    } else {
      inp.trickL = false; inp.trickR = false;
      inp.grab = this.held(TRICK_L) ? 1 : this.held(TRICK_R) ? 2 : 0;
      inp.tuck = false; inp.brake = false;
      inp.flip = Math.max(-1, Math.min(1, (D ? 1 : 0) - (U ? 1 : 0)));
      inp.spin = inp.steer;
    }
    return inp;
  }

  // Touch-Buttons
  bindTouch(root) {
    root.querySelectorAll('[data-key]').forEach((el) => {
      const code = el.dataset.key;
      const on = (e) => { e.preventDefault(); el.classList.add('on'); this.press(code); };
      const off = (e) => { e.preventDefault(); el.classList.remove('on'); this.release(code); };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      el.addEventListener('pointerleave', off);
    });
  }
}
