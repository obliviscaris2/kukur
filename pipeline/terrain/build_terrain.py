#!/usr/bin/env python3
"""
Valley elevation for KUKUR.

Downloads public "Terrarium" DEM tiles (AWS Open Data / Mapzen, mostly SRTM 30 m, no API key), resamples them onto a
regular grid over the map bounds, smooths away the bumps of buildings and trees, and writes:

  assets/map/terrain.bin    Uint16 little-endian, decimetres above the lowest grid point, row-major (rows go +Z = south)
  assets/map/terrain.json   { x0, z0, cell, w, h, scale, zero, minM, maxM }
                            scale = metres per unit (0.1); zero = units at the map origin (Basantapur), so that the game's
                            height 0 sits at the origin and the Bagmati gorge is below it.

The game samples it bilinearly in src/world/terrain.js (worker-safe); WORLD.terrain.exaggerate scales relief.
Needs only Python 3 + Pillow. Tiles are cached in pipeline/.cache/dem/.
Run:  python3 pipeline/terrain/build_terrain.py
"""
import io, json, math, os, struct, sys, urllib.request
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MAP = os.path.join(ROOT, 'assets', 'map')
CACHE = os.path.join(ROOT, 'pipeline', '.cache', 'dem')
URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
ZOOM = 13          # ≈17 m per pixel at Kathmandu's latitude
CELL = 24.0        # grid spacing in metres
PAD = 320.0        # grid margin around the map bounds
SIGMA = 2.6        # smoothing (cells, ≈60 m): removes building/tree noise from the radar DEM, keeps terraces and river cuts

manifest = json.load(open(os.path.join(MAP, 'manifest.json')))
LAT0, LON0 = manifest['origin']
KX, KZ = 111320.0 * math.cos(math.radians(LAT0)), 110574.0
x0b, z0b, x1b, z1b = manifest['bounds']
x0, z0 = x0b - PAD, z0b - PAD
W, H = int(math.ceil((x1b + PAD - x0) / CELL)) + 1, int(math.ceil((z1b + PAD - z0) / CELL)) + 1


def latlon(x, z):
    return LAT0 - z / KZ, LON0 + x / KX


def world_px(lat, lon):
    n = 2 ** ZOOM
    px = (lon + 180.0) / 360.0 * n * 256
    lr = math.radians(lat)
    py = (1.0 - math.log(math.tan(lr) + 1.0 / math.cos(lr)) / math.pi) / 2.0 * n * 256
    return px, py


tiles = {}


def tile(tx, ty):
    key = (tx, ty)
    if key in tiles:
        return tiles[key]
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f'{ZOOM}_{tx}_{ty}.png')
    if not os.path.exists(path):
        url = URL.format(z=ZOOM, x=tx, y=ty)
        print('  fetching', url, file=sys.stderr)
        req = urllib.request.Request(url, headers={'User-Agent': 'kukur-terrain-pipeline'})
        with urllib.request.urlopen(req, timeout=60) as r, open(path, 'wb') as f:
            f.write(r.read())
    im = Image.open(path).convert('RGB')
    tiles[key] = [r * 256 + g + b / 256 - 32768 for r, g, b in im.getdata()]
    return tiles[key]


def elev(px, py):
    px -= 0.5; py -= 0.5
    ix, iy = int(math.floor(px)), int(math.floor(py))
    fx, fy = px - ix, py - iy

    def at(x, y):
        t = tile(x // 256, y // 256)
        return t[(y % 256) * 256 + (x % 256)]
    a, b, c, d = at(ix, iy), at(ix + 1, iy), at(ix, iy + 1), at(ix + 1, iy + 1)
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def blur(g):
    r = int(math.ceil(SIGMA * 3))
    k = [math.exp(-(i * i) / (2 * SIGMA * SIGMA)) for i in range(-r, r + 1)]
    s = sum(k); k = [v / s for v in k]
    tmp = [0.0] * (W * H)
    for j in range(H):
        row = g[j * W:(j + 1) * W]
        for i in range(W):
            acc = 0.0
            for t, kv in enumerate(k):
                acc += row[min(W - 1, max(0, i + t - r))] * kv
            tmp[j * W + i] = acc
    out = [0.0] * (W * H)
    for i in range(W):
        col = tmp[i::W]
        for j in range(H):
            acc = 0.0
            for t, kv in enumerate(k):
                acc += col[min(H - 1, max(0, j + t - r))] * kv
            out[j * W + i] = acc
    return out


def main():
    print(f'terrain grid {W} x {H} @ {CELL} m', file=sys.stderr)
    g = [0.0] * (W * H)
    for j in range(H):
        for i in range(W):
            lat, lon = latlon(x0 + i * CELL, z0 + j * CELL)
            g[j * W + i] = elev(*world_px(lat, lon))
    print('  smoothing…', file=sys.stderr)
    g = blur(g)
    lo, hi = min(g), max(g)
    oi, oj = (0 - x0) / CELL, (0 - z0) / CELL
    ii, jj = int(oi), int(oj)
    zero = g[jj * W + ii]
    data = struct.pack(f'<{W * H}H', *[max(0, min(65535, round((v - lo) * 10))) for v in g])
    open(os.path.join(MAP, 'terrain.bin'), 'wb').write(data)
    meta = {'x0': x0, 'z0': z0, 'cell': CELL, 'w': W, 'h': H, 'scale': 0.1, 'zero': round((zero - lo) * 10),
            'minM': round(lo, 1), 'maxM': round(hi, 1), 'source': 'Terrarium DEM (SRTM et al.) via AWS Open Data'}
    json.dump(meta, open(os.path.join(MAP, 'terrain.json'), 'w'), indent=1)
    print(f'wrote terrain.bin ({len(data) // 1024} KB): {lo:.0f}–{hi:.0f} m a.s.l., origin at {zero:.0f} m', file=sys.stderr)


if __name__ == '__main__':
    main()
