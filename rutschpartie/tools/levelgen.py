"""Level generator + solver for the sliding puzzle "Rutschpartie".

Tiles: '#' rock, '.' ice, 'S' start, 'G' goal, '*' crystal, 'o' snow (stops you),
'x' hole (fall), '~' thin ice (breaks after you leave it), '>' '<' '^' 'v' arrows (redirect).
Outside the grid counts as rock. Win: at rest on G with every crystal collected.
"""
import json
import random
import sys
from collections import deque

DIRS = [(0, -1), (1, 0), (0, 1), (-1, 0)]  # U R D L
DNAME = 'URDL'
ARROW = {'^': (0, -1), '>': (1, 0), 'v': (0, 1), '<': (-1, 0)}


class Level:
    def __init__(self, rows):
        self.rows = rows
        self.H = len(rows)
        self.W = len(rows[0])
        self.gems, self.thins = {}, {}
        for y, row in enumerate(rows):
            assert len(row) == self.W, rows
            for x, c in enumerate(row):
                if c == 'S':
                    self.start = (x, y)
                elif c == 'G':
                    self.goal = (x, y)
                elif c == '*':
                    self.gems[(x, y)] = len(self.gems)
                elif c == '~':
                    self.thins[(x, y)] = len(self.thins)
        self.all = (1 << len(self.gems)) - 1

    def tile(self, x, y):
        if x < 0 or y < 0 or x >= self.W or y >= self.H:
            return '#'
        return self.rows[y][x]

    def slide(self, pos, gm, bm, d):
        """Returns None (no movement), 'fall', 'loop' or (pos, gm, bm, events)."""
        x, y = pos
        dx, dy = d
        moved = False
        seen = set()
        ev = set()
        while True:
            nx, ny = x + dx, y + dy
            t = self.tile(nx, ny)
            if t == '#':
                break
            if (x, y) in self.thins:
                bm |= 1 << self.thins[(x, y)]
            x, y = nx, ny
            moved = True
            if t == 'x':
                return 'fall'
            if t == '~':
                if (bm >> self.thins[(x, y)]) & 1:
                    return 'fall'
                ev.add('thin')
            if t == '*':
                gm |= 1 << self.gems[(x, y)]
            if t in ARROW:
                dx, dy = ARROW[t]
                ev.add('arrow')
            if t == 'o':
                ev.add('snow')
                break
            key = (x, y, dx, dy)
            if key in seen:
                return 'loop'
            seen.add(key)
        if not moved:
            return None
        return (x, y), gm, bm, ev

    def solve(self, limit=200000):
        s0 = (self.start, 0, 0)
        prev = {s0: None}
        q = deque([s0])
        loops = False
        while q:
            s = q.popleft()
            pos, gm, bm = s
            if pos == self.goal and gm == self.all:
                path = []
                while prev[s] is not None:
                    s, d, ev = prev[s]
                    path.append((d, ev))
                path.reverse()
                return {'len': len(path), 'path': path, 'states': len(prev), 'loops': loops}
            for di, d in enumerate(DIRS):
                r = self.slide(pos, gm, bm, d)
                if r is None or r == 'fall':
                    continue
                if r == 'loop':
                    loops = True
                    continue
                np_, ngm, nbm, ev = r
                ns = (np_, ngm, nbm)
                if ns not in prev:
                    prev[ns] = (s, DNAME[di], ev)
                    q.append(ns)
            if len(prev) > limit:
                return None
        return {'len': None, 'states': len(prev), 'loops': loops}


def make(rng, W, H, rock, gems=0, snow=0, holes=0, arrows=0, thin=0):
    g = [['.'] * W for _ in range(H)]
    cells = [(x, y) for y in range(H) for x in range(W)]
    rng.shuffle(cells)
    it = iter(cells)

    def put(c, n):
        for _ in range(n):
            x, y = next(it)
            g[y][x] = c

    put('S', 1)
    put('G', 1)
    put('*', gems)
    put('o', snow)
    put('x', holes)
    put('~', thin)
    for _ in range(arrows):
        x, y = next(it)
        g[y][x] = rng.choice('<>^v')
    put('#', int(round(rock * W * H)))
    return [''.join(r) for r in g]


def needs(sol, req):
    used = set()
    for _, ev in sol['path']:
        used |= ev
    return req <= used


SPECS = [
    # (count, W, H, rock, extras, (minLen, maxLen), required events)
    (2, 6, 6, 0.16, {}, (3, 4), set()),
    (2, 7, 7, 0.16, {}, (5, 6), set()),
    (3, 7, 8, 0.15, {'gems': 1}, (5, 7), set()),
    (3, 7, 8, 0.15, {'gems': 2}, (7, 9), set()),
    (3, 8, 9, 0.12, {'snow': 3, 'gems': 1}, (7, 9), {'snow'}),
    (3, 8, 9, 0.12, {'snow': 4, 'gems': 2}, (9, 11), {'snow'}),
    (3, 8, 9, 0.11, {'holes': 5, 'gems': 1}, (8, 10), set()),
    (3, 8, 10, 0.11, {'holes': 6, 'gems': 2, 'snow': 2}, (10, 12), set()),
    (3, 8, 10, 0.1, {'arrows': 3, 'holes': 3, 'gems': 1}, (8, 11), {'arrow'}),
    (3, 8, 10, 0.1, {'arrows': 4, 'holes': 4, 'gems': 2}, (10, 13), {'arrow'}),
    (3, 9, 10, 0.1, {'thin': 6, 'gems': 2, 'holes': 2}, (10, 13), {'thin'}),
    (3, 9, 11, 0.1, {'thin': 8, 'gems': 3, 'arrows': 2, 'snow': 2, 'holes': 2}, (12, 16), {'thin'}),
]


def main(seed):
    rng = random.Random(seed)
    out = []
    for count, W, H, rock, extras, (lo, hi), req in SPECS:
        found = []
        tries = 0
        while len(found) < count * 4 and tries < 60000:
            tries += 1
            rows = make(rng, W, H, rock, **extras)
            L = Level(rows)
            sol = L.solve()
            if not sol or sol['len'] is None or sol['loops']:
                continue
            if not (lo <= sol['len'] <= hi):
                continue
            if not needs(sol, req):
                continue
            found.append((sol['len'], sol['states'], rows, ''.join(d for d, _ in sol['path'])))
        # prefer more states explored (less linear) for the same length
        found.sort(key=lambda f: (-f[0], -f[1]))
        out.append({'spec': [W, H, extras, lo, hi], 'tries': tries, 'levels': found[: count * 4]})
    json.dump(out, sys.stdout, indent=1)


if __name__ == '__main__':
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 1)
