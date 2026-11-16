#!/usr/bin/env python3
"""
Kathmandu valley OSM extract  ->  streamable map tiles for the game.

    npm run data:map            (uses Blender's Python + pyosmium, see docs/PIPELINE.md)

Input : pipeline/.cache/nepal-latest.osm.pbf   (Geofabrik extract, (c) OpenStreetMap contributors, ODbL)
Output: assets/map/manifest.json          tile index, origin, start locations, per-tile ground hints
        assets/map/overview.json          simplified major roads / rivers / parks / places for the big map
        assets/map/gazetteer.json         names for wayfinding: toles, popular streets, named parks/squares, landmarks
        assets/map/tiles/<tx>_<tz>.json   one file per 256 m tile

The slow part (parsing the .pbf, ~11 min) is cached in pipeline/.cache/parsed-*.pkl and reused until the
extract, the bbox or the Collector code changes — so tweaking tile/gazetteer output re-runs in seconds.

Coordinates: local metres, +X east, +Z south, origin = Basantapur (Kathmandu Durbar Square).
Inside a tile, coordinates are integer decimetres relative to the tile's north-west corner.
"""
import json, math, os, re, sys, time, hashlib, pickle, inspect
from collections import defaultdict
import osmium

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
PBF = os.path.join(ROOT, 'pipeline', '.cache', 'nepal-latest.osm.pbf')
OUT = os.path.join(ROOT, 'assets', 'map')

# Kathmandu + Lalitpur + Bhaktapur (with Kirtipur, Thimi, Boudha, Swayambhu)
S, W, N, E = 27.632, 85.262, 27.762, 85.446
LAT0, LON0 = 27.7043, 85.3073
KX, KZ = 111320.0 * math.cos(math.radians(LAT0)), 110574.0
TILE = 256.0

def proj(lat, lon): return ((lon - LON0) * KX, -(lat - LAT0) * KZ)
def inside_bbox(lat, lon): return S <= lat <= N and W <= lon <= E
def tkey(x, z): return (int(math.floor(x / TILE)), int(math.floor(z / TILE)))
def num(v):
    if not v: return None
    m = re.search(r'[\d.]+', v.replace(',', '.'))
    try: return float(m.group(0)) if m else None
    except ValueError: return None
def h01(s, salt=''): return int(hashlib.md5((str(s) + salt).encode()).hexdigest()[:8], 16) / 0xFFFFFFFF
def area2(p):
    a = 0.0
    for i in range(len(p)):
        x1, z1 = p[i]; x2, z2 = p[(i + 1) % len(p)]; a += x1 * z2 - x2 * z1
    return a / 2

# heritage cores get brick paving and Newari-style houses
CORES = {'kathmandu': proj(27.7043, 85.3073) + (900,), 'patan': proj(27.6727, 85.3253) + (750,),
         'bhaktapur': proj(27.6722, 85.4280) + (850,), 'kirtipur': proj(27.6786, 85.2775) + (380,), 'thimi': proj(27.6808, 85.3870) + (350,)}
def core_weight(x, z):
    w = 0.0
    for cx, cz, r in CORES.values(): w = max(w, 1 - min(1, math.hypot(x - cx, z - cz) / r))
    return w

LANDMARK_RULES = [  # (regex on name, model)
    (r'^kasthamandap', 'kasthamandap'), (r'maju dega', 'maju_dega'), (r'^taleju', 'taleju'), (r'trailokya', 'trailokya'),
    (r'nyatapola', 'nyatapola'), (r'krishna mandir|krishna temple', 'shikhara'), (r'maha ?bou?d+ha', 'shikhara'),
    (r'^(b[ao]u?d+h?a ?nath|boudha stupa|bouddha stupa)', 'stupa_boudha'), (r'^swayambh', 'stupa_boudha'), (r'kathesimbhu', 'stupa_kathesimbhu'), (r'stupa|chaitya|chorten', 'stupa_small'),
    (r'bhimsen|bhairab|bhairav|vishwanath|jagan ?nath|gopinath|kageshwor|narayan|jaisi deval|char narayan|hari shankar|degutale|taleju bell', 'pagoda3'),
    (r'^pashupati(nath)?( temple| mandir)?$', 'pashupati_gold'), (r'pashupati', 'pagoda3'), (r'mahadev|ganesh|shiva|vishnu|mandir|temple|dyochhen', 'pagoda2'),
]
BARRIER_KIND = ['wall', 'fence', 'city_wall', 'retaining_wall']
RANA = re.compile(r'singha durbar|gaddi baithak|kaiser mahal|keshar mahal|sheetal niwas|shital niwas|baber mahal|babar mahal|bagh durbar|lal durbar|thapathali|harihar bhawan|hari bhawan|narayanhiti|seto durbar|bahadur bhawan|rana palace|garden of dreams|swapna bagaicha|\bmahal\b', re.I)
CSS_COLOURS = {'white': 0xf7f4ec, 'red': 0xc0392b, 'brown': 0x7a4a2a, 'grey': 0x9a9a9a, 'gray': 0x9a9a9a, 'green': 0x3f8f46, 'blue': 0x2a5bd7, 'yellow': 0xf2c94c, 'orange': 0xe67e22, 'black': 0x2b2b2b, 'beige': 0xe8d9b5, 'pink': 0xf4a6c1, 'maroon': 0x7f1d1d, 'silver': 0xc0c0c0, 'cream': 0xf3ead8}
def colour_int(v):
    v = (v or '').strip().lower()
    if v.startswith('#') and len(v) in (4, 7):
        v = v if len(v) == 7 else '#' + ''.join(ch * 2 for ch in v[1:])
        try: return int(v[1:], 16)
        except ValueError: return -1
    return CSS_COLOURS.get(v, -1)
CIVIC = {'school', 'college', 'university', 'hospital', 'government', 'public', 'civic', 'stadium', 'train_station', 'transportation'}
PLACE_KINDS = ['city', 'town', 'suburb', 'quarter', 'neighbourhood', 'village', 'hamlet']
HOUSE_LIKE = re.compile(r'kumari|gaddi baithak|palace|durbar|museum|bahal|baha|vihar|monastery|gompa', re.I)
# names that contain a temple word but are businesses/offices/etc. ("Hotel Pashupati", "Kasthamandap Bank")
NOT_LANDMARK = re.compile(r'hotel|school|bank|ltd|pvt|clearing|hostel|office|ward|samiti|trust|music|airline|car ?wash|furniture|grill|udhyog|pustak|'
                          r'bhandar|plaza|vision|niwa|pharmacy|cafe|\binn\b|restaurant|construction|house|building|kendra|yoga|crematorium|dharmasala|'
                          r'\bpaa?ti\b|sattal|galli|marga|shop|store|cent(er|re)|college|campus|hospital|clinic|guest|lodge|apartment|complex|mall|'
                          r'pasal|club|academy|institute|boys|girls|bhajan|electric|sudhar|bihar|\bbal mandir', re.I)
ROAD_W = {'motorway': 14, 'trunk': 13, 'trunk_link': 8, 'primary': 11, 'primary_link': 7, 'secondary': 9, 'secondary_link': 7, 'tertiary': 7,
          'tertiary_link': 6, 'residential': 5, 'unclassified': 5, 'living_street': 4.5, 'service': 3.8, 'pedestrian': 5, 'footway': 2.4,
          'path': 1.8, 'steps': 2.4, 'track': 3, 'cycleway': 2, 'road': 5}
ROAD_KIND = list(ROAD_W.keys())
MAJOR = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary'}
WATERWAY_W = {'river': 16, 'stream': 3, 'canal': 4, 'drain': 1.5, 'ditch': 1.2}
# ground area themes (index used by the shader): keep in sync with src/config/ground.js
AREA_KIND = ['park', 'grass', 'forest', 'farmland', 'water', 'plaza', 'sand', 'pitch', 'cemetery', 'scrub', 'parking', 'garden', 'orchard', 'wetland']
def area_kind(t):
    lu, le, na, am = t.get('landuse'), t.get('leisure'), t.get('natural'), t.get('amenity')
    if na == 'water' or 'water' in t or lu in ('reservoir', 'basin') or t.get('waterway') == 'riverbank': return 'water'
    if le in ('park', 'common', 'dog_park', 'recreation_ground'): return 'park'
    if le in ('garden',): return 'garden'
    if le in ('pitch', 'stadium', 'sports_centre', 'track', 'playground', 'golf_course'): return 'pitch'
    if lu in ('forest',) or na in ('wood',): return 'forest'
    if lu in ('farmland', 'farmyard', 'greenhouse_horticulture', 'allotments'): return 'farmland'
    if lu in ('orchard', 'vineyard', 'plant_nursery'): return 'orchard'
    if lu in ('grass', 'meadow', 'village_green', 'recreation_ground') or na in ('grassland',): return 'grass'
    if na in ('scrub', 'heath') or lu in ('brownfield', 'greenfield'): return 'scrub'
    if na in ('sand', 'beach', 'bare_rock', 'shingle') or lu in ('construction', 'quarry', 'landfill'): return 'sand'
    if lu == 'cemetery' or am == 'grave_yard': return 'cemetery'
    if na == 'wetland': return 'wetland'
    if am == 'parking': return 'parking'
    if t.get('place') == 'square' or t.get('highway') == 'pedestrian' or 'area:highway' in t: return 'plaza'
    return None

class Collector(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.buildings, self.areas, self.roads, self.waters, self.pois, self.places, self.trees = [], [], [], [], [], [], []
        self.barriers, self.statues = [], []
    def node(self, n):
        if not n.location.valid() or not inside_bbox(n.location.lat, n.location.lon): return
        t = n.tags
        x, z = proj(n.location.lat, n.location.lon)
        if t.get('natural') == 'tree': self.trees.append((x, z)); return
        if t.get('man_made') == 'column' or t.get('historic') in ('memorial', 'monument') or t.get('tourism') == 'artwork' or t.get('memorial') in ('statue', 'bust'):
            self.statues.append((x, z, 2 if t.get('man_made') == 'column' or 'pillar' in (t.get('name') or '').lower() else 1 if t.get('tourism') == 'artwork' or t.get('memorial') == 'statue' else 0, t.get('name:en') or t.get('name') or ''))
        name = t.get('name:en') or t.get('name')
        if not name: return
        if t.get('place') in PLACE_KINDS:
            self.places.append((name, x, z, t.get('place'), t.get('name:ne') or ''))
        elif t.get('amenity') == 'place_of_worship' or t.get('historic') or t.get('tourism') in ('attraction', 'museum', 'viewpoint'):
            self.pois.append((name, x, z, t.get('religion') or t.get('historic') or t.get('tourism') or ''))
    def way(self, w):
        t = w.tags
        hw, ww = t.get('highway'), t.get('waterway')
        if t.get('barrier') in BARRIER_KIND and not hw:
            try: pts = [(nd.location.lat, nd.location.lon) for nd in w.nodes]
            except osmium.InvalidLocationError: return
            if any(inside_bbox(a, b) for a, b in pts): self.barriers.append(([proj(a, b) for a, b in pts], BARRIER_KIND.index(t.get('barrier'))))
            return
        if not hw and ww not in WATERWAY_W: return
        if t.get('area') == 'yes': return
        try: pts = [(nd.location.lat, nd.location.lon) for nd in w.nodes]
        except osmium.InvalidLocationError: return
        if not any(inside_bbox(a, b) for a, b in pts): return
        p = [proj(a, b) for a, b in pts]
        if hw in ROAD_W:
            if t.get('footway') == 'sidewalk' or t.get('access') == 'private' and hw == 'service': return
            surf = t.get('surface', '')
            paved_brick = surf in ('paving_stones', 'bricks', 'sett', 'cobblestone', 'unhewn_cobblestone')
            unpaved = surf in ('unpaved', 'dirt', 'ground', 'gravel', 'earth', 'mud', 'sand', 'grass', 'compacted', 'fine_gravel')
            mat = 2 if unpaved or hw in ('track', 'path') else (1 if paved_brick or hw in ('footway', 'pedestrian', 'steps', 'living_street') else 0)
            self.roads.append((p, hw, num(t.get('width')) or ROAD_W[hw], mat, t.get('name:en') or t.get('name') or '', 1 if t.get('bridge') == 'yes' else 0,
                               int(num(t.get('lanes')) or 0), 1 if t.get('oneway') in ('yes', '1') else 0, t.get('name:ne') or ''))
        elif ww in WATERWAY_W and t.get('tunnel') != 'culvert':
            self.waters.append((p, num(t.get('width')) or WATERWAY_W[ww], ww))
    def area(self, a):
        t = a.tags
        isb = 'building' in t and t.get('building') not in ('roof', 'construction', 'no')
        kind = None if isb else area_kind(t)
        if not isb and not kind: return
        for ring in a.outer_rings():
            try: pts = [(n.lat, n.lon) for n in ring]
            except osmium.InvalidLocationError: continue
            if len(pts) < 4 or not inside_bbox(*pts[0]): continue
            p = [proj(la, lo) for la, lo in pts[:-1]]
            if abs(area2(p)) < (3 if isb else 20): continue
            if area2(p) < 0: p = p[::-1]
            if isb:
                self.buildings.append((p, {'lv': num(t.get('building:levels')), 'h': num(t.get('height')), 'b': t.get('building'),
                                           'name': t.get('name:en') or t.get('name') or '', 'rel': t.get('religion'), 'amen': t.get('amenity'),
                                           'shop': 1 if t.get('shop') else 0, 'id': a.orig_id(),
                                           'rc': t.get('roof:colour') or '', 'bc': t.get('building:colour') or '', 'rs': t.get('roof:shape') or ''}))
            else:
                self.areas.append((p, kind, t.get('name:en') or t.get('name') or '', t.get('name:ne') or ''))
            break

def clip_rect(poly, x0, z0, x1, z1):
    """Sutherland-Hodgman clip of a (possibly concave) polygon against an axis-aligned rectangle."""
    def clip(pts, inside, inter):
        out = []
        for i in range(len(pts)):
            a, b = pts[i - 1], pts[i]
            ia, ib = inside(a), inside(b)
            if ib:
                if not ia: out.append(inter(a, b))
                out.append(b)
            elif ia: out.append(inter(a, b))
        return out
    def ix(xv):
        return lambda a, b: (xv, a[1] + (b[1] - a[1]) * (xv - a[0]) / ((b[0] - a[0]) or 1e-9))
    def iz(zv):
        return lambda a, b: (a[0] + (b[0] - a[0]) * (zv - a[1]) / ((b[1] - a[1]) or 1e-9), zv)
    p = poly
    for ins, inter in ((lambda q: q[0] >= x0, ix(x0)), (lambda q: q[0] <= x1, ix(x1)), (lambda q: q[1] >= z0, iz(z0)), (lambda q: q[1] <= z1, iz(z1))):
        p = clip(p, ins, inter)
        if len(p) < 3: return []
    return p

def simplify(pts, tol):
    if len(pts) < 3: return pts
    def dp(a, b):
        (x1, z1), (x2, z2) = pts[a], pts[b]; dx, dz = x2 - x1, z2 - z1; L = math.hypot(dx, dz) or 1e-9
        best, bi = 0, -1
        for i in range(a + 1, b):
            d = abs(dz * (pts[i][0] - x1) - dx * (pts[i][1] - z1)) / L
            if d > best: best, bi = d, i
        if best > tol: return dp(a, bi)[:-1] + dp(bi, b)
        return [pts[a], pts[b]]
    return dp(0, len(pts) - 1)

STREET_RANK = {'motorway': 0, 'trunk': 0, 'primary': 1, 'secondary': 2, 'tertiary': 3}
STREET_KINDS = set(STREET_RANK) | {'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'residential', 'unclassified', 'living_street', 'pedestrian'}

def plen(p): return sum(math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]) for i in range(1, len(p)))

def signposts(roads, spacing=170):
    """Junctions where named roads meet (at least one of them a main road) -> [(x, z, [(heading, road name), ...])]."""
    at = defaultdict(list)
    for ri, (p, hw, w, mat, name, *_r) in enumerate(roads):
        if hw not in STREET_KINDS: continue
        for i, q in enumerate(p): at[(round(q[0], 1), round(q[1], 1))].append((ri, i))
    cands = []
    for key, refs in at.items():
        if len(refs) < 2: continue
        names = {roads[ri][4] for ri, _ in refs if roads[ri][4]}
        ranks = [STREET_RANK.get(roads[ri][1], 5) for ri, _ in refs]
        if len(names) < 2 or min(ranks) > 3: continue
        arms = []
        for ri, i in refs:
            p, name = roads[ri][0], roads[ri][4]
            for d in (-1, 1):
                j, dist = i, 0.0
                while 0 <= j + d < len(p) and dist < 14: dist += math.hypot(p[j + d][0] - p[j][0], p[j + d][1] - p[j][1]); j += d
                if j == i: continue
                ang = math.atan2(p[j][0] - key[0], p[j][1] - key[1])
                if any(abs((ang - a + math.pi) % (2 * math.pi) - math.pi) < 0.45 for a, _ in arms): continue
                arms.append((ang, name))
        if len(arms) >= 3: cands.append((min(ranks), -len(names), key, arms))
    cands.sort(key=lambda c: (c[0], c[1]))
    out = []
    for rank, _, (x, z), arms in cands:
        if any(math.hypot(x - ox, z - oz) < spacing for ox, oz, _ in out): continue
        out.append((x, z, arms))
    return out

def write_gazetteer(c, landmarks):
    """Names for wayfinding (HUD place line, compass, big map, signposts). No shops/businesses, only public geography."""
    by_name = defaultdict(lambda: {'rank': 9, 'len': 0.0, 'ne': '', 'parts': []})
    for p, hw, w, mat, name, bridge, lanes, oneway, ne in c.roads:
        if not name or hw not in STREET_KINDS or NOT_LANDMARK.search(name): continue
        s = by_name[name]; s['rank'] = min(s['rank'], STREET_RANK.get(hw, 4)); s['len'] += plen(p); s['ne'] = s['ne'] or ne
        s['parts'].append([round(v, 1) for q in simplify(p, 2.5) for v in q])
    streets = [[n, s['ne'], s['rank'], s['parts']] for n, s in by_name.items() if s['rank'] <= 3 or s['len'] >= 220]
    areas = []
    for p, kind, name, ne in c.areas:
        if name and kind in ('park', 'garden', 'plaza', 'water', 'pitch', 'forest', 'cemetery') and abs(area2(p)) > 300 and not NOT_LANDMARK.search(name):
            areas.append([name, ne, AREA_KIND.index(kind), [round(v, 1) for q in simplify(p, 2) + [p[0]] for v in q]])
    gz = {
        'toles': [[n, ne, round(x), round(z), PLACE_KINDS.index(k)] for n, x, z, k, ne in c.places],
        'streets': streets, 'areas': areas,
        'landmarks': [[n, round(x), round(z), m, round(sz, 1)] for n, x, z, m, sz in landmarks],
    }
    json.dump(gz, open(os.path.join(OUT, 'gazetteer.json'), 'w', encoding='utf-8'), separators=(',', ':'), ensure_ascii=False)
    print(f"gazetteer: {len(gz['toles'])} toles, {len(streets)} streets, {len(areas)} named areas, {os.path.getsize(os.path.join(OUT, 'gazetteer.json')) / 1e6:.2f} MB")

def main():
    if not os.path.exists(PBF): sys.exit(f'missing {PBF} — download https://download.geofabrik.de/asia/nepal-latest.osm.pbf')
    t0 = time.time()
    st = os.stat(PBF)
    sig = hashlib.md5(f'{st.st_size}:{st.st_mtime}:{S},{W},{N},{E}:{LAT0},{LON0}'.encode() + inspect.getsource(Collector).encode()
                      + inspect.getsource(area_kind).encode() + repr(sorted(ROAD_W.items())).encode()).hexdigest()[:12]
    cache = os.path.join(ROOT, 'pipeline', '.cache', f'parsed-{sig}.pkl')
    if os.path.exists(cache) and '--reparse' not in sys.argv:
        c = Collector()
        with open(cache, 'rb') as fh: c.__dict__.update(pickle.load(fh))
        print(f'using cached parse {os.path.basename(cache)}')
    else:
        c = Collector()
        c.apply_file(PBF, locations=True, idx='flex_mem')
        keep = {k: getattr(c, k) for k in ('buildings', 'areas', 'roads', 'waters', 'pois', 'places', 'trees', 'barriers', 'statues')}
        for f in os.listdir(os.path.dirname(cache)):
            if f.startswith('parsed-') and f.endswith('.pkl'): os.remove(os.path.join(os.path.dirname(cache), f))
        with open(cache, 'wb') as fh: pickle.dump(keep, fh, protocol=pickle.HIGHEST_PROTOCOL)
    print(f'parsed in {time.time() - t0:.0f}s: {len(c.buildings)} buildings, {len(c.roads)} roads, {len(c.areas)} areas, {len(c.waters)} waterways, '
          f'{len(c.pois)} pois, {len(c.places)} places, {len(c.trees)} trees')

    tiles = defaultdict(lambda: {'b': [], 'r': [], 'a': [], 'w': [], 'p': [], 'l': [], 't': [], 's': [], 'f': [], 'm': [], 'names': []})
    def name_idx(tile, name):
        if not name: return -1
        if name not in tile['names']: tile['names'].append(name)
        return tile['names'].index(name)
    def local(tk, pts):
        ox, oz = tk[0] * TILE, tk[1] * TILE
        out = []
        for x, z in pts: out += [round((x - ox) * 10), round((z - oz) * 10)]
        return out

    landmarks = []
    cover = defaultdict(float)
    for p, m in c.buildings:
        cx = sum(q[0] for q in p) / len(p); cz = sum(q[1] for q in p) / len(p)
        tk = tkey(cx, cz); tile = tiles[tk]
        name = m['name']; model = None
        if name and (HOUSE_LIKE.search(name) or NOT_LANDMARK.search(name)): name_ok = False
        else: name_ok = True
        if name and name_ok:
            for rx, mid in LANDMARK_RULES:
                if re.search(rx, name, re.I): model = mid; break
        if not model and name_ok and m['b'] in ('temple', 'shrine') and abs(area2(p)) > 6: model = 'pagoda2' if abs(area2(p)) > 30 else 'pagoda1'
        if model and m['b'] in ('yes', 'temple', 'shrine', 'religious', None) or model in ('stupa_boudha', 'kasthamandap', 'nyatapola', 'shikhara'):
            # oriented footprint size for the model
            best = None
            for i in range(len(p)):
                a, b = p[i], p[(i + 1) % len(p)]; ex, ez = b[0] - a[0], b[1] - a[1]; L = math.hypot(ex, ez)
                if L < 0.05: continue
                ex /= L; ez /= L
                us = [q[0] * ex + q[1] * ez for q in p]; vs = [-q[0] * ez + q[1] * ex for q in p]
                A = (max(us) - min(us)) * (max(vs) - min(vs))
                if best is None or A < best[0]:
                    cu, cv = (max(us) + min(us)) / 2, (max(vs) + min(vs)) / 2
                    best = (A, min(max(us) - min(us), max(vs) - min(vs)), cu * ex - cv * ez, cu * ez + cv * ex, math.atan2(ez, ex))
            if best and best[1] > 1.2:
                _, size, lx, lz, ang = best
                ltk = tkey(lx, lz)
                lt = tiles[ltk]
                lt['l'].append([round((lx - ltk[0] * TILE) * 10), round((lz - ltk[1] * TILE) * 10), round(size * 10), round((ang % (math.pi / 2)) * 1000), model, name_idx(lt, name)])
                landmarks.append((name or model, lx, lz, model, size))
                continue
        lv = m['lv'] or (round(m['h'] / 2.9) if m['h'] and m['h'] > 3 else None)
        cw = core_weight(cx, cz)
        A = abs(area2(p))
        if not lv:
            r = h01(m['id'], 'lv')
            base = 2 + int(r * 3) if cw > 0.2 else 2 + int(r * 4)
            if A < 25: base = min(base, 2)
            if A > 400: base += 1
            if m['b'] in ('hotel', 'apartments', 'commercial', 'office'): base += 2
            if m['b'] in ('house', 'hut', 'shed', 'garage', 'kiosk'): base = min(base, 2)
            lv = base
        lv = int(max(1, min(lv, 14)))
        newari = h01(m['id'], 'st') < (0.15 + 0.6 * cw)
        flags = (1 if newari else 0) | (2 if (m['shop'] or h01(m['id'], 'sh') < (0.35 + 0.35 * cw)) else 0)
        if newari and lv <= 5 and A < 260 and h01(m['id'], 'rf') < 0.6: flags |= 4
        elif not newari and lv <= 2 and A < 120 and h01(m['id'], 'tn') < 0.45: flags |= 4    # tin-roof houses at the edges
        if m['b'] in CIVIC: flags |= 8
        if name and RANA.search(name): flags = (flags | 16 | 8) & ~1 & ~4    # Rana-era neoclassical palace: white, columns, no tiles
        public = name and not NOT_LANDMARK.search(name) and (HOUSE_LIKE.search(name) or m['b'] in CIVIC or m['amen'] in CIVIC)
        tile['b'].append([local(tk, p), lv, flags, round(h01(m['id'], 'tint') * 1000), name_idx(tile, name) if public else -1, colour_int(m['rc']), colour_int(m['bc'])])
        cover[tk] += A

    for p, hw, w, mat, name, bridge, lanes, oneway, ne in c.roads:
        # split into per-tile runs by segment midpoint
        run, rtk = [p[0]], None
        for i in range(1, len(p)):
            mx, mz = (p[i - 1][0] + p[i][0]) / 2, (p[i - 1][1] + p[i][1]) / 2
            k = tkey(mx, mz)
            if rtk is not None and k != rtk:
                tl = tiles[rtk]; tl['r'].append([local(rtk, run), ROAD_KIND.index(hw), round(w * 10), mat, name_idx(tl, name), bridge, lanes, oneway])
                run = [p[i - 1]]
            rtk = k; run.append(p[i])
        if rtk is not None and len(run) > 1:
            tl = tiles[rtk]; tl['r'].append([local(rtk, run), ROAD_KIND.index(hw), round(w * 10), mat, name_idx(tl, name), bridge, lanes, oneway])

    for p, w, kind in c.waters:
        run, rtk = [p[0]], None
        for i in range(1, len(p)):
            k = tkey((p[i - 1][0] + p[i][0]) / 2, (p[i - 1][1] + p[i][1]) / 2)
            if rtk is not None and k != rtk:
                tiles[rtk]['w'].append([local(rtk, run), round(w * 10)]); run = [p[i - 1]]
            rtk = k; run.append(p[i])
        if rtk is not None and len(run) > 1: tiles[rtk]['w'].append([local(rtk, run), round(w * 10)])

    for p, kind, name, ne in c.areas:
        xs = [q[0] for q in p]; zs = [q[1] for q in p]
        for tx in range(int(math.floor(min(xs) / TILE)), int(math.floor(max(xs) / TILE)) + 1):
            for tz in range(int(math.floor(min(zs) / TILE)), int(math.floor(max(zs) / TILE)) + 1):
                q = clip_rect(p, tx * TILE, tz * TILE, (tx + 1) * TILE, (tz + 1) * TILE)
                if len(q) >= 3 and abs(area2(q)) > 4:
                    tl = tiles[(tx, tz)]; tl['a'].append([local((tx, tz), q), AREA_KIND.index(kind), name_idx(tl, name)])

    for name, x, z, kind in c.pois:
        tk = tkey(x, z); tl = tiles[tk]; tl['p'].append([round((x - tk[0] * TILE) * 10), round((z - tk[1] * TILE) * 10), name_idx(tl, name)])
        if re.search(r'stupa|chaitya', name, re.I) and not any(math.hypot(x - l[1], z - l[2]) < 15 for l in landmarks):
            tl['l'].append([round((x - tk[0] * TILE) * 10), round((z - tk[1] * TILE) * 10), 60, 0, 'stupa_small', name_idx(tl, name)])
    for p, kind in c.barriers:   # compound walls & fences, split per tile like roads
        run, rtk = [p[0]], None
        for i in range(1, len(p)):
            k = tkey((p[i - 1][0] + p[i][0]) / 2, (p[i - 1][1] + p[i][1]) / 2)
            if rtk is not None and k != rtk: tiles[rtk]['f'].append([local(rtk, run), kind]); run = [p[i - 1]]
            rtk = k; run.append(p[i])
        if rtk is not None and len(run) > 1: tiles[rtk]['f'].append([local(rtk, run), kind])
    for x, z, kind, name in c.statues:
        tk = tkey(x, z); tl = tiles[tk]; tl['m'].append([round((x - tk[0] * TILE) * 10), round((z - tk[1] * TILE) * 10), kind, name_idx(tl, name)])
    for x, z in c.trees:
        tk = tkey(x, z); tiles[tk]['t'] += [round((x - tk[0] * TILE) * 10), round((z - tk[1] * TILE) * 10)]

    for x, z, arms in signposts(c.roads):
        tk = tkey(x, z); tl = tiles[tk]
        rec = [round((x - tk[0] * TILE) * 10), round((z - tk[1] * TILE) * 10)]
        for ang, name in arms: rec += [round(ang * 1000), name_idx(tl, name)]
        tl['s'].append(rec)
    write_gazetteer(c, landmarks)

    os.makedirs(os.path.join(OUT, 'tiles'), exist_ok=True)
    for f in os.listdir(os.path.join(OUT, 'tiles')): os.remove(os.path.join(OUT, 'tiles', f))
    index = {}
    total = 0
    for (tx, tz), tl in tiles.items():
        if not (tl['b'] or tl['r'] or tl['a'] or tl['w']): continue
        cx, cz = (tx + 0.5) * TILE, (tz + 0.5) * TILE
        dens = min(1.0, cover[(tx, tz)] / (TILE * TILE) * 2.2)
        tl['g'] = [round(dens, 2), round(core_weight(cx, cz), 2)]
        s = json.dumps(tl, separators=(',', ':'))
        with open(os.path.join(OUT, 'tiles', f'{tx}_{tz}.json'), 'w') as fh: fh.write(s)
        index[f'{tx}_{tz}'] = [len(tl['b']), round(dens, 2)]
        total += len(s)

    def P(lat, lon): x, z = proj(lat, lon); return [round(x, 1), round(z, 1)]
    manifest = {
        'version': 2, 'origin': [LAT0, LON0], 'tileSize': TILE, 'bbox': [S, W, N, E], 'attribution': '© OpenStreetMap contributors (ODbL)',
        'bounds': [round(proj(N, W)[0]), round(proj(N, W)[1]), round(proj(S, E)[0]), round(proj(S, E)[1])],
        'cores': {k: [round(v[0], 1), round(v[1], 1), v[2]] for k, v in CORES.items()},
        'starts': {
            'Basantapur, Kathmandu': P(27.70398, 85.30755), 'Patan Durbar Square, Lalitpur': P(27.67348, 85.32504),
            'Bhaktapur Durbar Square': P(27.67203, 85.42816), 'Boudhanath': P(27.72070, 85.36190), 'Thamel': P(27.71530, 85.31160),
        },
        'tiles': index,
    }
    json.dump(manifest, open(os.path.join(OUT, 'manifest.json'), 'w'), separators=(',', ':'))
    ov = {'roads': [], 'rivers': [], 'areas': [], 'places': [], 'landmarks': []}
    for p, hw, w, mat, name, bridge, *_ in c.roads:
        if hw in MAJOR: ov['roads'].append([MAJOR_I := ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'].index(hw), [round(v) for q in simplify(p, 6) for v in q]])
    for p, w, kind in c.waters:
        if kind == 'river': ov['rivers'].append([round(v) for q in simplify(p, 8) for v in q])
    for p, kind, name, ne in c.areas:
        if kind in ('park', 'forest', 'water', 'farmland', 'pitch', 'garden') and abs(area2(p)) > 4000:
            ov['areas'].append([AREA_KIND.index(kind), [round(v) for q in simplify(p, 6) + [p[0]] for v in q]])
    for name, x, z, kind, ne in c.places:
        if kind in ('city', 'town', 'suburb', 'quarter', 'village'): ov['places'].append([name, round(x), round(z), kind])
    for name, x, z, model, size in landmarks:
        if size > 6 or model not in ('pagoda1', 'pagoda2', 'stupa_small'): ov['landmarks'].append([name, round(x), round(z), model])
    json.dump(ov, open(os.path.join(OUT, 'overview.json'), 'w'), separators=(',', ':'))
    print(f'{len(index)} tiles, {total / 1e6:.1f} MB tile data, {len(landmarks)} landmarks, overview {os.path.getsize(os.path.join(OUT, "overview.json")) / 1e6:.1f} MB, total {time.time() - t0:.0f}s')

if __name__ == '__main__':
    main()
