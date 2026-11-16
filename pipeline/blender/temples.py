"""Blender: parametric Newari pagodas + stupas -> game/art/models/temples/*.glb

Run: blender -b --factory-startup --python pipeline/blender/temples.py -- [--preview]
Each model's footprint (plinth base) is 1.0 x 1.0 units, centred at the origin, facing -Y (Godot +Z).
Godot scales it to the real OSM footprint. Material names are replaced in Godot by PBR materials:
Brick, Stone, Wood, WoodRed, Roof, Gold, Plaster, Dark.
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector, Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'models', 'temples')
META = {}
os.makedirs(OUT, exist_ok=True)
PREVIEW = '--preview' in sys.argv
V = Vector

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    global MATS; MATS = {}

MATS = {}
def M(name, col, rough=0.8, metal=0.0):
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*col, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    MATS[name] = m; return m

def mats():
    return dict(brick=M('Brick', (0.45, 0.2, 0.12)), stone=M('Stone', (0.55, 0.52, 0.48)), wood=M('Wood', (0.12, 0.06, 0.03)),
                woodred=M('WoodRed', (0.35, 0.07, 0.04)), roof=M('Roof', (0.22, 0.12, 0.08)), gold=M('Gold', (0.9, 0.62, 0.2), 0.3, 1.0),
                plaster=M('Plaster', (0.92, 0.9, 0.86), 0.9), dark=M('Dark', (0.02, 0.015, 0.012), 0.9), flame=M('Flame', (1, 0.7, 0.2)),
                flags=[M('FlagB', (0.1, 0.3, 0.9)), M('FlagW', (0.95, 0.95, 0.95)), M('FlagR', (0.9, 0.1, 0.1)), M('FlagG', (0.1, 0.6, 0.2)), M('FlagY', (1, 0.8, 0.1))])

# ---------------------------------------------------------------- ornaments (bells, trims, guardians, lamps, prayer flags)
def eave_ornaments(mt, rh, z, per_side):
    """Golden trim along the eave and a row of little hanging bells with leaf-shaped clappers (pataka bells)."""
    for side in range(4):
        Rm = Matrix.Rotation(side * math.pi / 2, 4, 'Z')
        o = box(mt['gold'], rh * 2.02, 0.012, 0.012, 0, -rh * 1.0, z - 0.004); o.matrix_world = Rm @ o.matrix_world
        for i in range(per_side):
            x = -rh * 0.85 + (i + 0.5) * rh * 1.7 / per_side
            for o in (cyl(mt['gold'], 0.011, 0.024, x, -rh * 0.99, z - 0.036, verts=8, r2=0.003), box(mt['gold'], 0.012, 0.002, 0.018, x, -rh * 0.99, z - 0.05)):
                o.matrix_world = Rm @ o.matrix_world

def lion(mt, x, y, z, s, rz=0.0):
    """A chubby stone guardian lion (singha) on a pedestal, with a red mane."""
    parts = [box(mt['stone'], 0.6 * s, 0.6 * s, 0.35 * s, 0, 0, 0.175 * s),
             sphere(mt['stone'], 0.24 * s, 0, 0.04 * s, 0.55 * s, sz=0.9, segs=12),
             sphere(mt['woodred'], 0.22 * s, 0, -0.1 * s, 0.82 * s, sz=1.0, segs=12),
             sphere(mt['stone'], 0.17 * s, 0, -0.2 * s, 0.86 * s, segs=12),
             sphere(mt['dark'], 0.03 * s, -0.07 * s, -0.35 * s, 0.9 * s, segs=6), sphere(mt['dark'], 0.03 * s, 0.07 * s, -0.35 * s, 0.9 * s, segs=6),
             box(mt['stone'], 0.1 * s, 0.12 * s, 0.3 * s, -0.12 * s, -0.18 * s, 0.5 * s), box(mt['stone'], 0.1 * s, 0.12 * s, 0.3 * s, 0.12 * s, -0.18 * s, 0.5 * s)]
    for o in parts: o.matrix_world = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rz, 4, 'Z') @ o.matrix_world

def butter_lamps(mt, half, z, n):
    """Little brass lamps with flames along the front edge of a plinth."""
    for i in range(n):
        x = -half * 0.9 + (i + 0.5) * half * 1.8 / n
        cyl(mt['gold'], 0.008, 0.008, x, -half + 0.012, z, verts=8, r2=0.012)
        cyl(mt['flame'], 0.005, 0.016, x, -half + 0.012, z + 0.008, verts=6, r2=0.0005)

def prayer_flags(mt, top, anchors, per_line=18):
    """Strings of five-colour prayer flags from the spire down to the anchors."""
    for (ax, ay, az) in anchors:
        a, b = V(top), V((ax, ay, az)); d = b - a; L = d.length
        line = cyl(mt['dark'], 0.0018, L, 0, 0, 0, verts=4)
        line.matrix_world = Matrix.Translation(a + d / 2) @ V((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
        for i in range(1, per_line):
            t = i / per_line; p = a + d * t + V((0, 0, -0.03 * math.sin(t * math.pi)))   # slight sag
            yaw = math.atan2(d.y, d.x)
            o = box(mt['flags'][i % 5], 0.022, 0.002, 0.028, 0, 0, 0)
            o.matrix_world = Matrix.Translation(p + V((0, 0, -0.016))) @ Matrix.Rotation(yaw + math.pi / 2, 4, 'Z')

def box(m, sx, sy, sz, x, y, z, rz=0.0, bevel=0.0, rx=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(x, y, z), rotation=(rx, 0, rz))
    o = bpy.context.active_object; o.scale = (sx, sy, sz); bpy.ops.object.transform_apply(scale=True, rotation=False, location=False)
    o.data.materials.append(m)
    if not bevel and min(sx,sy,sz)>.008: bevel=min(.002,min(sx,sy,sz)*.12)
    if bevel:
        b = o.modifiers.new('b', 'BEVEL'); b.width = bevel; b.segments = 1; b.limit_method = 'ANGLE'; b.harden_normals = True
    return o

def cyl(m, r, h, x, y, z, verts=16, r2=None):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r if r2 is None else r2, depth=h, location=(x, y, z + h / 2))
    o = bpy.context.active_object; o.data.materials.append(m)
    for polygon in o.data.polygons: polygon.use_smooth = len(polygon.vertices)==4
    return o

def sphere(m, r, x, y, z, sz=1.0, segs=16, half=False):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=segs // 2, radius=r, location=(x, y, z))
    o = bpy.context.active_object; o.scale.z = sz; bpy.ops.object.transform_apply(scale=True)
    if half:
        bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < -1e-4], context='VERTS'); bm.to_mesh(o.data); bm.free()
    bpy.ops.object.shade_smooth(); o.data.materials.append(m); return o

def flared_roof(m, half, height, z, thick=0.06, flare=0.5, segs=10):
    """Square hip roof whose slopes curve upwards toward the eaves (Newari tiered roof)."""
    bm = bmesh.new()
    rings = []
    for i in range(segs + 1):
        t = i / segs                          # 0 eave .. 1 apex
        r = half * (1 - t)
        zz = z + height * (t ** 1.7) + flare * height * 0.15 * (1 - t) ** 3   # concave: flat eaves, steep top, tips turned up
        ring = [bm.verts.new((sx * r, sy * r, zz)) for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
        rings.append(ring)
    for i in range(segs):
        a, b = rings[i], rings[i + 1]
        for k in range(4):
            bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    me = bpy.data.meshes.new('roof'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('roof', me); bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o; o.select_set(True)
    sol = o.modifiers.new('s', 'SOLIDIFY'); sol.thickness = thick; sol.offset = -1
    bpy.ops.object.modifier_apply(modifier='s')
    bpy.ops.object.shade_smooth()
    o.data.materials.append(m)
    return o

def struts(m, wall_half, roof_half, z_top, n):
    """Carved diagonal roof struts (tunala) on all four sides."""
    for side in range(4):
        rot = Matrix.Rotation(side * math.pi / 2, 4, 'Z')
        for i in range(n):
            x = -wall_half + (i + 0.5) * 2 * wall_half / n
            reach = (roof_half - wall_half) * 0.8
            L = math.hypot(reach, reach * 1.1)
            o = box(m, 0.011, 0.011, L, 0, 0, 0)
            ang = math.atan2(reach, reach * 1.1)
            o.matrix_world = rot @ Matrix.Translation((x, -(wall_half + reach / 2), z_top - reach * 1.1 / 2 - 0.02)) @ Matrix.Rotation(-ang, 4, 'X')

def gajur(m, x, y, z, s):
    cyl(m, 0.06 * s, 0.05 * s, x, y, z, verts=12)
    sphere(m, 0.055 * s, x, y, z + 0.09 * s)
    cyl(m, 0.025 * s, 0.07 * s, x, y, z + 0.13 * s, verts=10, r2=0.04 * s)
    sphere(m, 0.04 * s, x, y, z + 0.24 * s)
    cyl(m, 0.025 * s, 0.14 * s, x, y, z + 0.27 * s, verts=10, r2=0.003 * s)

def pagoda(name, steps, roofs, core=0.36, step_h=0.035, gold=False, gold_top=False, plinth='brick', wall_h=0.2, upper_h=0.13, overhang=0.13, door_style=True, guardians=False):
    reset(); mt = mats()
    half = 0.5; inset = (half - core / 2 - 0.06) / max(steps, 1) if steps else 0
    META[name] = {'steps': steps, 'step_h': step_h, 'inset': inset, 'core': core, 'core_h': wall_h}
    z = 0.0
    for i in range(steps):
        hh = half - i * inset
        # Masonry ends below the stone tread. Coplanar tops caused the striped flicker at temple stairs.
        brick_h = step_h * 0.82
        box(mt[plinth], hh * 2, hh * 2, brick_h, 0, 0, z + brick_h / 2)
        box(mt['stone'], hh * 2 + 0.006, hh * 2 + 0.006, step_h * 0.18, 0, 0, z + step_h - step_h * 0.09)
        z += step_h
    if steps == 0:
        box(mt['stone'], 1, 1, 0.02, 0, 0, 0.01); z = 0.02
    # guardians up the front stairs (Nyatapola style) or a pair of lions at the bottom
    if steps >= 3:
        for i in range(steps):
            hh = half - i * inset
            box(mt['stone'], 0.16, inset + 0.002, step_h * (i + 1), 0, -hh + inset / 2, step_h * (i + 1) / 2)    # stair run
        if guardians:
            for i in range(steps):
                hh = half - i * inset
                for sx in (-1, 1): lion(mt, sx * 0.12, -hh + inset * 0.45, step_h * (i + 1), 0.05 + 0.006 * (steps - i))
        else:
            for sx in (-1, 1): lion(mt, sx * 0.14, -half + inset * 0.5, step_h, 0.07)
    if steps: butter_lamps(mt, half - (steps - 1) * inset, z, 7)
    # sanctum with triple doors on all four sides
    ch = core / 2
    box(mt['brick'], core, core, wall_h, 0, 0, z + wall_h / 2)
    for side in range(4):
        R = Matrix.Rotation(side * math.pi / 2, 4, 'Z')
        for k in (-1, 0, 1):
            dw = core * 0.2
            for o in (box(mt['wood'], dw, 0.012, wall_h * 0.62, k * core * 0.3, -ch - 0.004, z + wall_h * 0.34, bevel=0.002),
                      box(mt['dark'], dw * 0.7, 0.005, wall_h * 0.5, k * core * 0.3, -ch - 0.011, z + wall_h * 0.31),
                      box(mt['gold'] if gold else mt['woodred'], dw * 1.4, 0.016, wall_h * 0.1, k * core * 0.3, -ch - 0.006, z + wall_h * 0.71, bevel=0.002)):
                o.matrix_world = R @ o.matrix_world
        o = box(mt['wood'], core + 0.02, 0.02, wall_h * 0.08, 0, -ch - 0.006, z + wall_h * 0.92, bevel=0.002); o.matrix_world = R @ o.matrix_world
    z += wall_h
    wh = ch
    for t in range(roofs):
        rh = wh + overhang * (1 - t * 0.12)
        height = rh * 0.85
        top_tier = t == roofs - 1
        rm = mt['gold'] if (gold or (gold_top and top_tier)) else mt['roof']
        flared_roof(rm, rh, height, z - 0.01)
        box(mt['wood'], rh * 2 * 0.98, rh * 2 * 0.98, 0.012, 0, 0, z - 0.012)  # soffit
        eave_ornaments(mt, rh, z - 0.005, 4 if rh < 0.2 else 6)
        struts(mt['wood'], wh * 0.95, rh, z - 0.005, 3 if wh < 0.12 else 5)
        for c in range(4):  # corner bells
            a = math.pi / 4 + c * math.pi / 2
            cyl(mt['gold'], 0.012, 0.03, math.cos(a) * rh * 1.38, math.sin(a) * rh * 1.38, z - 0.03, verts=8, r2=0.002)
        if not top_tier:
            nwh = wh * 0.74
            box(mt['brick'], nwh * 2, nwh * 2, upper_h + height * 0.6, 0, 0, z + (upper_h + height * 0.6) / 2)
            for side in range(4):
                R = Matrix.Rotation(side * math.pi / 2, 4, 'Z')
                o = box(mt['wood'], nwh * 1.2, 0.012, upper_h * 0.45, 0, -nwh - 0.004, z + height * 0.6 + upper_h * 0.45, bevel=0.002)
                o.matrix_world = R @ o.matrix_world
            z += upper_h + height * 0.6; wh = nwh
        else:
            gajur(mt['gold'], 0, 0, z - 0.01 + height + 0.02, 1.0 + 0.6 * core)
            z += height
    export(name)

def kasthamandap():
    reset(); mt = mats()
    META['kasthamandap'] = {'steps': 2, 'step_h': 0.025, 'inset': 0.04, 'core': 0.16, 'core_h': 0.13, 'pillars': 0.36}
    for i, (hh, h) in enumerate(((0.5, 0.025), (0.46, 0.025))):
        box(mt['stone'], hh * 2, hh * 2, h, 0, 0, i * 0.025 + h / 2)
    z = 0.05; ph = 0.22
    for a in (-0.36, -0.12, 0.12, 0.36):
        for b in (-0.36, -0.12, 0.12, 0.36):
            cyl(mt['wood'], 0.012, ph, a, b, z, verts=8)
            box(mt['stone'], 0.03, 0.03, 0.015, a, b, z + 0.0075)
    box(mt['brick'], 0.16, 0.16, 0.13, 0, 0, z + 0.065)
    box(mt['wood'], 0.92, 0.92, 0.02, 0, 0, z + ph + 0.01)
    z += ph + 0.02
    for half, height, nwh, hgt in ((0.6, 0.26, 0.31, 0.15), (0.43, 0.22, 0.22, 0.12), (0.28, 0.2, 0, 0)):
        flared_roof(mt['roof'], half, height, z - 0.01)
        struts(mt['wood'], half - 0.12, half, z, 6)
        eave_ornaments(mt, half, z - 0.005, 7)
        if nwh:
            box(mt['brick'], nwh * 2, nwh * 2, hgt + height * 0.5, 0, 0, z + (hgt + height * 0.5) / 2)
            for side in range(4):
                R = Matrix.Rotation(side * math.pi / 2, 4, 'Z')
                o = box(mt['wood'], nwh * 1.5, 0.012, hgt * 0.5, 0, -nwh - 0.004, z + height * 0.5 + hgt * 0.5); o.matrix_world = R @ o.matrix_world
            z += hgt + height * 0.5
        else:
            gajur(mt['gold'], 0, 0, z + height, 1.4)
    export('kasthamandap')

def stupa(name, dome=0.3, steps=2):
    reset(); mt = mats()
    META[name] = {'steps': steps, 'step_h': 0.035, 'inset': 0.07, 'core': dome * 2, 'core_h': 1.0, 'round': True}
    z = 0.0
    for i in range(steps):
        hh = 0.5 - i * 0.07
        box(mt['plaster'], hh * 2, hh * 2, 0.035, 0, 0, z + 0.0175); z += 0.035
    for side in range(4):  # prayer wheel niches
        R = Matrix.Rotation(side * math.pi / 2, 4, 'Z')
        for k in range(-5, 6):
            o = cyl(mt['gold'], 0.012, 0.03, k * 0.07, -0.47, 0.0, verts=10); o.matrix_world = R @ o.matrix_world
    box(mt['plaster'], dome * 2.25, dome * 2.25, 0.03, 0, 0, z + 0.015); z += 0.03
    sphere(mt['plaster'], dome, 0, 0, z, sz=0.92, segs=32, half=True)
    z += dome * 0.92
    box(mt['plaster'], dome * 0.55, dome * 0.55, dome * 0.38, 0, 0, z + dome * 0.19)
    for side in range(4):  # the watchful eyes: dark marks on each harmika face
        R = Matrix.Rotation(side * math.pi / 2, 4, 'Z')
        for ex in (-0.06, 0.06):
            o = box(mt['dark'], dome * 0.12, 0.004, dome * 0.035, ex * dome * 2, -dome * 0.276, z + dome * 0.22); o.matrix_world = R @ o.matrix_world
    z += dome * 0.38
    box(mt['gold'], dome * 0.7, dome * 0.7, 0.012, 0, 0, z + 0.006); z += 0.012
    for i in range(13):
        r = dome * (0.24 - i * 0.012)
        cyl(mt['gold'], r, dome * 0.075, 0, 0, z, verts=20, r2=r * 0.92); z += dome * 0.08
    cyl(mt['gold'], dome * 0.22, dome * 0.06, 0, 0, z, verts=20, r2=0.01)
    gajur(mt['gold'], 0, 0, z + dome * 0.06, dome * 1.6)
    prayer_flags(mt, (0, 0, z - dome * 0.3), [(math.cos(a) * 0.5, math.sin(a) * 0.5, 0.05) for a in [k / 6 * math.pi * 2 + 0.4 for k in range(6)]], per_line=14)
    export(name)

def bell():
    reset(); mt = mats()
    META['bell'] = {'steps': 1, 'step_h': 0.08, 'inset': 0, 'core': 0.2, 'core_h': 1.0}
    box(mt['stone'], 1, 0.5, 0.08, 0, 0, 0.04)
    for s in (-1, 1): box(mt['brick'], 0.14, 0.14, 0.7, s * 0.36, 0, 0.43)
    box(mt['wood'], 0.95, 0.12, 0.06, 0, 0, 0.8)
    flared_roof(mt['roof'], 0.55, 0.18, 0.83)
    bpy.ops.mesh.primitive_cone_add(vertices=24, radius1=0.16, radius2=0.07, depth=0.26, location=(0, 0, 0.6))
    o = bpy.context.active_object; o.data.materials.append(mt['gold']); bpy.ops.object.shade_smooth()
    export('bell')

def export(name):
    for o in bpy.context.scene.objects:
        if o.type == 'MESH':
            for md in list(o.modifiers):
                bpy.context.view_layer.objects.active = o
                bpy.ops.object.modifier_apply(modifier=md.name)
    bpy.ops.object.select_all(action='SELECT')
    bpy.context.view_layer.objects.active = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
    bpy.ops.object.join()
    o = bpy.context.active_object; o.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if PREVIEW and name in ('maju_dega', 'kasthamandap', 'stupa_kathesimbhu'):
        preview(name)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB', export_apply=True, export_materials='EXPORT')
    print('TEMPLE', name, len(o.data.polygons))

def preview(name):
    sc = bpy.context.scene
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.location = (1.6, -2.0, 1.1); cam.data.lens = 40
    cam.rotation_euler = (V((0, 0, 0.45)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); sun.data.energy = 4; sun.rotation_euler = (0.9, 0.2, 0.7); sc.collection.objects.link(sun)
    w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.65, 0.7, 0.75, 1)
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 24; sc.render.resolution_x = 700; sc.render.resolution_y = 600
    sc.render.filepath = os.path.join(ROOT, 'pipeline', '.cache', 'previews', f'temple_{name}.png'); bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam); bpy.data.objects.remove(sun)
    bpy.ops.object.select_all(action='SELECT')

pagoda('pagoda1', 1, 1, core=0.5, step_h=0.08, wall_h=0.45, overhang=0.2)
pagoda('pagoda2', 3, 2, core=0.42, step_h=0.07, wall_h=0.35, upper_h=0.18, overhang=0.18)
pagoda('pagoda3', 5, 3, core=0.38, step_h=0.06, wall_h=0.3, upper_h=0.16, overhang=0.16)
pagoda('trailokya', 5, 3, core=0.36, step_h=0.055, wall_h=0.28, upper_h=0.15, overhang=0.15)
pagoda('maju_dega', 9, 3, core=0.34, step_h=0.032, wall_h=0.19, upper_h=0.12, overhang=0.13)
pagoda('taleju', 12, 3, core=0.3, step_h=0.028, wall_h=0.16, upper_h=0.11, overhang=0.12, gold_top=True, gold=False)
def shikhara(name='shikhara'):
    """Stone shikhara temple (Patan's Krishna Mandir): stepped base, pillared pavilions, curved tower, amalaka + gold finial."""
    reset(); mt = mats()
    META[name] = {'steps': 3, 'step_h': 0.03, 'inset': 0.04, 'core': 0.5, 'core_h': 1.0}
    z = 0.0
    for i in range(3):
        hh = 0.5 - i * 0.04; box(mt['stone'], hh * 2, hh * 2, 0.03, 0, 0, z + 0.015); z += 0.03
    body_h = 0.24
    box(mt['stone'], 0.62, 0.62, body_h, 0, 0, z + body_h / 2)
    for sx in (-1, 1):  # corner pavilions with little domes (chhatri)
        for sy in (-1, 1):
            for k in range(4):
                cyl(mt['stone'], 0.012, body_h * 0.75, sx * 0.29 + (k % 2) * 0.04 * -sx, sy * 0.29 + (k // 2) * 0.04 * -sy, z, verts=6)
            box(mt['stone'], 0.11, 0.11, 0.02, sx * 0.27, sy * 0.27, z + body_h * 0.78)
            sphere(mt['stone'], 0.05, sx * 0.27, sy * 0.27, z + body_h * 0.8, segs=10, half=True)
            gajur(mt['gold'], sx * 0.27, sy * 0.27, z + body_h * 0.8 + 0.045, 0.25)
    for side in range(4):
        R = Matrix.Rotation(side * math.pi / 2, 4, 'Z')
        o = box(mt['dark'], 0.12, 0.01, 0.14, 0, -0.311, z + 0.08); o.matrix_world = R @ o.matrix_world
    z += body_h
    # curvilinear tower: stacked frustum segments that swell then taper
    segs = 12
    for i in range(segs):
        t = i / segs
        r0 = 0.27 * (1 - t ** 1.6) + 0.04; r1 = 0.27 * (1 - ((i + 1) / segs) ** 1.6) + 0.04
        bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=r0 * 1.414, radius2=r1 * 1.414, depth=0.045, location=(0, 0, z + 0.0225), rotation=(0, 0, math.pi / 4))
        o = bpy.context.active_object; o.data.materials.append(mt['stone'])
        box(mt['stone'], r0 * 2.05, r0 * 2.05, 0.008, 0, 0, z + 0.004)
        z += 0.045
    cyl(mt['stone'], 0.07, 0.025, 0, 0, z, verts=16)
    sphere(mt['stone'], 0.08, 0, 0, z + 0.03, sz=0.4, segs=16)
    gajur(mt['gold'], 0, 0, z + 0.05, 0.6)
    export(name)

def stupa_big(name='stupa_boudha'):
    """Boudhanath / Swayambhu: mandala terraces, huge white dome with saffron arcs, harmika with eyes, 13 gold rings."""
    reset(); mt = mats()
    META[name] = {'steps': 3, 'step_h': 0.025, 'inset': 0.06, 'core': 0.6, 'core_h': 1.0, 'round': True}
    z = 0.0
    for i in range(3):
        hh = 0.5 - i * 0.06
        box(mt['plaster'], hh * 2, hh * 2, 0.025, 0, 0, z + 0.0125)
        for side in range(4):  # mandala niches on each terrace
            R = Matrix.Rotation(side * math.pi / 2, 4, 'Z')
            o = box(mt['plaster'], hh * 0.5, 0.06, 0.025, 0, -hh - 0.03, z + 0.0125); o.matrix_world = R @ o.matrix_world
        z += 0.025
    dome = 0.3
    for k in range(56):  # ring of prayer wheels around the base
        a = k / 56 * math.pi * 2
        cyl(mt['gold'] if k % 2 else mt['woodred'], 0.011, 0.03, math.cos(a) * dome * 1.12, math.sin(a) * dome * 1.12, z, verts=8)
    base_z = z
    sphere(mt['plaster'], dome, 0, 0, z, sz=0.62, segs=40, half=True)
    for k in range(16):  # saffron arcs splashed on the dome
        a = k / 16 * math.pi * 2
        o = sphere(mt['woodred'], 0.035, math.cos(a) * dome * 0.86, math.sin(a) * dome * 0.86, z + dome * 0.18, sz=0.5, segs=8)
    z += dome * 0.62
    box(mt['gold'], dome * 0.62, dome * 0.62, 0.02, 0, 0, z + 0.01); z += 0.02
    box(mt['plaster'], dome * 0.5, dome * 0.5, dome * 0.32, 0, 0, z + dome * 0.16)
    for side in range(4):
        R = Matrix.Rotation(side * math.pi / 2, 4, 'Z')
        for ex in (-0.05, 0.05):
            o = box(mt['dark'], dome * 0.1, 0.004, dome * 0.03, ex * dome * 2, -dome * 0.251, z + dome * 0.2); o.matrix_world = R @ o.matrix_world
        o = box(mt['woodred'], dome * 0.03, 0.004, dome * 0.07, 0, -dome * 0.251, z + dome * 0.12); o.matrix_world = R @ o.matrix_world
    z += dome * 0.32
    for i in range(13):
        r = dome * (0.2 - i * 0.011)
        cyl(mt['gold'], r, dome * 0.06, 0, 0, z, verts=4 if i < 13 else 16, r2=r * 0.93); z += dome * 0.065
    cyl(mt['gold'], dome * 0.2, dome * 0.05, 0, 0, z, verts=20, r2=0.01)
    gajur(mt['gold'], 0, 0, z + dome * 0.05, dome * 1.4)
    prayer_flags(mt, (0, 0, z - dome * 0.2), [(math.cos(a) * 0.47, math.sin(a) * 0.47, base_z + 0.01) for a in [k / 12 * math.pi * 2 + 0.13 for k in range(12)]], per_line=22)
    export(name)

kasthamandap()
pagoda('nyatapola', 5, 5, core=0.3, step_h=0.075, wall_h=0.18, upper_h=0.09, overhang=0.12, guardians=True)
pagoda('pashupati_gold', 2, 2, core=0.46, step_h=0.06, wall_h=0.32, upper_h=0.16, overhang=0.2, gold=True)   # Pashupatinath: two golden roofs
shikhara()
stupa_big()
stupa('stupa_kathesimbhu', 0.26, 2)
stupa('stupa_small', 0.3, 1)
bell()
import json
json.dump(META, open(os.path.join(OUT, 'meta.json'), 'w'), indent=1)
print('TEMPLES DONE')
