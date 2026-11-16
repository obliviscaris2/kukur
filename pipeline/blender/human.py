"""Blender: a slender storybook Kathmandu local with restrained proportions, rigging and animation.

Run:  npm run assets:people        (blender -b --factory-startup --python pipeline/blender/human.py -- [--preview])
Out:  assets/models/person.glb      (+ pipeline/.cache/previews/person_sheet.png with --preview)

ONE skinned mesh holds the body AND every optional clothing/hair part, so each NPC is a single draw call.
Vertex colour encodes what each vertex is:
  R = region / 13   0 skin 1 top 2 bottom 3 shoes 4 hat 5 hair 6 eye 7 sparkle 8 blush 9 accent 10 mouth 11 drape 12 wood 13 gold
  G = part / 15     0 always · 1 Hair_short 2 Hair_bun 3 Hair_braid 4 Hat_dhaka 5 Hat_cap 6 Hat_shawl 7 Tunic 8 Patuka
                    9 Vest 10 Sari 11 Pallu 12 Skirt 13 Tie 14 Stick
The game (entities/npc/Person.js) colours regions per outfit and builds an index buffer with only the parts that
NPC wears. Separate meshes (own materials): Umbrella, Doko.
Clips: Idle, Walk (bouncy), Wave, Pet, Shoo, Umbrella (right arm only), Sit.
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'models', 'person.glb')
PREVIEW = '--preview' in sys.argv
V = Vector
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene; sc.render.fps = 30
REG = {k: i / 13 for i, k in enumerate(['skin', 'top', 'bottom', 'shoes', 'hat', 'hair', 'eye', 'sparkle', 'blush', 'accent', 'mouth', 'drape', 'wood', 'gold'])}
PART = {k: i / 15 for i, k in enumerate(['base', 'Hair_short', 'Hair_bun', 'Hair_braid', 'Hat_dhaka', 'Hat_cap', 'Hat_shawl', 'Tunic', 'Patuka', 'Vest', 'Sari', 'Pallu', 'Skirt', 'Tie', 'Stick'])}

# ---------------------------------------------------------------- skeleton joints (Z up, face towards -Y), ~1.42 m
J = {'hips': (0, 0, 0.56), 'spine': (0, 0, 0.66), 'chest': (0, 0, 0.8), 'neck': (0, 0, 0.92), 'head': (0, 0, 0.98), 'top': (0, 0, 1.42)}
for s, sx in (('L', 1), ('R', -1)):
    J.update({f'shoulder.{s}': (0.145 * sx, 0, 0.885), f'elbow.{s}': (0.2 * sx, 0.01, 0.72), f'wrist.{s}': (0.22 * sx, -0.01, 0.575), f'hand.{s}': (0.225 * sx, -0.02, 0.53),
              f'hip.{s}': (0.072 * sx, 0, 0.54), f'knee.{s}': (0.078 * sx, -0.012, 0.3), f'ankle.{s}': (0.08 * sx, 0, 0.075), f'toe.{s}': (0.08 * sx, -0.1, 0.025)})
J = {k: V(v) for k, v in J.items()}

# ---------------------------------------------------------------- soft body from metaballs
mb = bpy.data.metaballs.new('Body'); mb.resolution = mb.render_resolution = 0.011; mb.threshold = 0.6
mbo = bpy.data.objects.new('Body', mb); sc.collection.objects.link(mbo)
K = 0.67
def ell(c, a, b, cc, stiff=2.0):
    m = max(a, b, cc); e = mb.elements.new(); e.type = 'ELLIPSOID'; e.co = V(c); e.radius = m / K; e.size_x, e.size_y, e.size_z = a / m, b / m, cc / m; e.stiffness = stiff
def cap(a, b, r, stiff=2.0):
    a, b = V(a), V(b); d = b - a; e = mb.elements.new(); e.type = 'CAPSULE'; e.co = (a + b) / 2; e.radius = r / K; e.size_x = d.length / 2; e.stiffness = stiff
    e.rotation = V((1, 0, 0)).rotation_difference(d.normalized())
ell((0, 0, 0.75), 0.145, 0.112, 0.16)        # soft chest
ell((0, 0.005, 0.6), 0.14, 0.108, 0.1)        # tummy & hips
ell((0, 0, 1.19), 0.19, 0.178, 0.2)          # big round head
ell((0, -0.012, 1.08), 0.145, 0.13, 0.09)     # cheeks / jaw (rounder face)
ell((0, -0.178, 1.135), 0.02, 0.018, 0.018)   # button nose
for sx in (1, -1): ell((0.188 * sx, 0, 1.17), 0.028, 0.02, 0.042)  # ears
cap((0, 0, 0.88), (0, 0, 0.98), 0.045)        # neck
for s in ('L', 'R'):
    cap(J[f'shoulder.{s}'], J[f'elbow.{s}'], 0.042); cap(J[f'elbow.{s}'], J[f'wrist.{s}'], 0.036); ell(J[f'hand.{s}'], 0.042, 0.038, 0.048)
    cap(J[f'hip.{s}'], J[f'knee.{s}'], 0.058); cap(J[f'knee.{s}'], J[f'ankle.{s}'], 0.046)
    ell((J[f'ankle.{s}'] + J[f'toe.{s}']) / 2 + V((0, 0, -0.008)), 0.048, 0.085, 0.036)
bpy.context.view_layer.objects.active = mbo; mbo.select_set(True)
bpy.ops.object.convert(target='MESH'); body = bpy.context.active_object; body.name = 'Person'
body.data.remesh_voxel_size = 0.011; bpy.ops.object.voxel_remesh()
sm = body.modifiers.new('s', 'CORRECTIVE_SMOOTH'); sm.iterations = 6; bpy.ops.object.modifier_apply(modifier='s')
dec = body.modifiers.new('d', 'DECIMATE'); dec.ratio = min(1.0, 1500 / len(body.data.polygons)); bpy.ops.object.modifier_apply(modifier='d')
bpy.ops.object.shade_smooth()

def body_region(p):
    if p.z > 0.9: return 'skin'                                  # head & neck
    if abs(p.x) > 0.163 and p.z < 0.71: return 'skin'            # forearms & hands (short sleeves end above the elbow)
    if p.z > 0.52: return 'top'
    if p.z < 0.1: return 'shoes'
    return 'bottom'
def paint(o, region, part='base', fn=None):
    c = o.data.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT') if 'Col' not in o.data.color_attributes else o.data.color_attributes['Col']
    for v in o.data.vertices:
        r = REG[fn(v.co) if fn else region]; c.data[v.index].color = (r, PART[part], 0, 1)
paint(body, None, fn=body_region)

def mat(name, col):
    m = bpy.data.materials.new(name); m.use_nodes = True; m.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (*col, 1); return m
BODY = mat('Body', (1, 1, 1)); UMB = mat('Umbrella', (0.9, 0.2, 0.25)); WOOD = mat('Doko', (0.62, 0.45, 0.22))
body.data.materials.append(BODY)

def add(prim, loc, scale=(1, 1, 1), rot=(0, 0, 0), **kw):
    getattr(bpy.ops.mesh, prim)(location=loc, rotation=rot, **kw)
    o = bpy.context.active_object; o.scale = scale; bpy.ops.object.transform_apply(scale=True, rotation=True); bpy.ops.object.shade_smooth(); return o
def part(name, region, partname, prim, loc, scale=(1, 1, 1), rot=(0, 0, 0), m=None, **kw):
    o = add(prim, loc, scale, rot, **kw); o.name = name
    if m is not None: o.data.materials.append(m)
    else: o.data.materials.append(BODY); paint(o, region, partname)
    return o
def cut(o, test):
    """delete vertices of o where test(co) is true (for open vests, half-torus smiles)"""
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if test(v.co)], context='VERTS'); bm.to_mesh(o.data); bm.free()
def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]; bpy.ops.object.join(); o = bpy.context.active_object; o.name = name; return o

# ---------------------------------------------------------------- face (always on, rigid to head)
face = []
for sx in (1, -1):
    face.append(part('Eye', 'eye', 'base', 'primitive_uv_sphere_add', (0.07 * sx, -0.163, 1.185), (0.78, 0.42, 1.12), radius=0.027, segments=14, ring_count=8))
    face.append(part('Spark', 'sparkle', 'base', 'primitive_uv_sphere_add', (0.082 * sx, -0.183, 1.207), radius=0.0045, segments=8, ring_count=5))
    face.append(part('Spark2', 'sparkle', 'base', 'primitive_uv_sphere_add', (0.06 * sx, -0.18, 1.163), radius=0.002, segments=6, ring_count=4))
    face.append(part('Blush', 'blush', 'base', 'primitive_uv_sphere_add', (0.118 * sx, -0.146, 1.112), (1.25, 0.32, 0.72), radius=0.008, segments=10, ring_count=6))
    face.append(part('Brow', 'hair', 'base', 'primitive_uv_sphere_add', (0.072 * sx, -0.166, 1.262), (1.55, 0.4, 0.38), radius=0.024, segments=8, ring_count=5, rot=(0, -0.15 * sx, 0)))
mouth = part('Mouth', 'mouth', 'base', 'primitive_torus_add', (0, -0.172, 1.092), (1.0, 0.55, 1.0), rot=(math.pi / 2, 0, 0), major_radius=0.024, minor_radius=0.0065, major_segments=14, minor_segments=5)
cut(mouth, lambda co: co.z > 1.092)    # keep the lower half: a smile
face.append(mouth)

# ---------------------------------------------------------------- hair & hats (rigid to head)
H = {}
hs = part('Hair_short', 'hair', 'Hair_short', 'primitive_uv_sphere_add', (0, 0.035, 1.255), (1.05, 1.0, 0.82), radius=0.2, segments=12, ring_count=7)
tuft = part('Tuft', 'hair', 'Hair_short', 'primitive_uv_sphere_add', (0.05, -0.135, 1.335), (1.4, 0.7, 0.55), radius=0.06, segments=10, ring_count=6, rot=(0.3, 0, -0.3))
H['Hair_short'] = join([hs, tuft], 'Hair_short')
bun_cap = part('Hair_bun', 'hair', 'Hair_bun', 'primitive_uv_sphere_add', (0, 0.035, 1.255), (1.06, 1.02, 0.84), radius=0.2, segments=12, ring_count=7)
bun = part('Bun', 'hair', 'Hair_bun', 'primitive_uv_sphere_add', (0, 0.15, 1.33), radius=0.075, segments=12, ring_count=7)
flower = part('Flower', 'accent', 'Hair_bun', 'primitive_uv_sphere_add', (0.07, 0.12, 1.37), (1, 0.6, 1), radius=0.035, segments=8, ring_count=5)
H['Hair_bun'] = join([bun_cap, bun, flower], 'Hair_bun')
br_cap = part('Hair_braid', 'hair', 'Hair_braid', 'primitive_uv_sphere_add', (0, 0.035, 1.255), (1.06, 1.02, 0.84), radius=0.2, segments=12, ring_count=7)
braid = [br_cap] + [part('Braid', 'hair', 'Hair_braid', 'primitive_uv_sphere_add', (0, 0.17 + i * 0.01, 1.13 - i * 0.075), (1, 0.9, 1.15), radius=0.042 - i * 0.004, segments=10, ring_count=6) for i in range(4)]
braid.append(part('Ribbon', 'accent', 'Hair_braid', 'primitive_uv_sphere_add', (0, 0.205, 0.83), (1.6, 0.6, 0.8), radius=0.03, segments=8, ring_count=5))
H['Hair_braid'] = join(braid, 'Hair_braid')
H['Hat_dhaka'] = part('Hat_dhaka', 'hat', 'Hat_dhaka', 'primitive_cylinder_add', (0, 0.025, 1.39), (1.0, 1.12, 1), rot=(0.2, 0, 0), radius=0.155, depth=0.13, vertices=16)
capo = part('Hat_cap', 'hat', 'Hat_cap', 'primitive_uv_sphere_add', (0, 0.02, 1.3), (1.07, 1.07, 0.75), radius=0.2, segments=16, ring_count=8)
cut(capo, lambda co: co.z < 1.27)
brim = part('Brim', 'hat', 'Hat_cap', 'primitive_cylinder_add', (0, -0.16, 1.28), (0.75, 0.9, 1), rot=(0.12, 0, 0), radius=0.13, depth=0.012, vertices=14)
H['Hat_cap'] = join([capo, brim], 'Hat_cap')
shawl = part('Hat_shawl', 'hat', 'Hat_shawl', 'primitive_uv_sphere_add', (0, 0.06, 1.17), (1.08, 0.98, 1.08), radius=0.215, segments=12, ring_count=8)
cut(shawl, lambda co: co.y < -0.08 and co.z < 1.31 and co.z > 1.0)   # opening for the face
H['Hat_shawl'] = shawl

# ---------------------------------------------------------------- clothes
C = {}
C['Tunic'] = part('Tunic', 'top', 'Tunic', 'primitive_cone_add', (0, 0.005, 0.46), radius1=0.205, radius2=0.15, depth=0.28, vertices=18)
C['Patuka'] = part('Patuka', 'accent', 'Patuka', 'primitive_torus_add', (0, 0.005, 0.6), (1, 0.8, 1.4), major_radius=0.142, minor_radius=0.026, major_segments=18, minor_segments=6)
vest = part('Vest', 'drape', 'Vest', 'primitive_uv_sphere_add', (0, 0, 0.75), (1.0, 0.82, 1.12), radius=0.157, segments=12, ring_count=8)
cut(vest, lambda co: co.z > 0.87 or co.z < 0.6 or (co.y < -0.05 and abs(co.x) < 0.035))
C['Vest'] = vest
C['Sari'] = part('Sari', 'drape', 'Sari', 'primitive_cone_add', (0, 0.005, 0.31), radius1=0.21, radius2=0.15, depth=0.56, vertices=18)
pallu = part('Pallu', 'drape', 'Pallu', 'primitive_uv_sphere_add', (0, 0, 0.745), (1.04, 0.86, 1.16), radius=0.158, segments=16, ring_count=10)
cut(pallu, lambda co: abs(co.x * 0.85 - (co.z - 0.74)) > 0.07 or co.z > 0.9)   # a diagonal sash over the left shoulder
C['Pallu'] = pallu
C['Skirt'] = part('Skirt', 'bottom', 'Skirt', 'primitive_cone_add', (0, 0.005, 0.44), radius1=0.2, radius2=0.145, depth=0.2, vertices=16)
C['Tie'] = part('Tie', 'accent', 'Tie', 'primitive_cube_add', (0, -0.134, 0.775), (0.026, 0.012, 0.085), rot=(-0.12, 0, 0), size=1)
C['Stick'] = part('Stick', 'wood', 'Stick', 'primitive_cylinder_add', (0.225, -0.03, 0.27), radius=0.013, depth=0.56, vertices=6)

umbrella = add('primitive_uv_sphere_add', (0.24, -0.04, 1.6), (1, 1, 0.42), radius=0.48, segments=16, ring_count=6); umbrella.name = 'Umbrella'; umbrella.data.materials.append(UMB)
cut(umbrella, lambda co: co.z < 1.6)
ustick = add('primitive_cylinder_add', (0.24, -0.04, 1.08), radius=0.01, depth=1.0, vertices=6); ustick.data.materials.append(WOOD)
umbrella = join([umbrella, ustick], 'Umbrella')
doko = add('primitive_cone_add', (0, 0.19, 0.78), radius1=0.12, radius2=0.19, depth=0.4, vertices=12); doko.name = 'Doko'; doko.data.materials.append(WOOD)

# Soft cloth folds follow the garment surface before rigging; no extra meshes or per-frame simulation.
for name in ('Tunic', 'Sari', 'Skirt', 'Pallu'):
    garment = C[name]
    for vertex in garment.data.vertices:
        angle = math.atan2(vertex.co.y, vertex.co.x)
        wave = math.sin(angle * 11 + vertex.co.z * 3) * 0.004
        vertex.co.x += math.cos(angle) * wave
        vertex.co.y += math.sin(angle) * wave
    garment.data.update()

# ---------------------------------------------------------------- proportions (transform the source geometry and joints together)
def proportion(p):
    p = V(p)
    t = max(0.0, min(1.0, (p.z - 0.88) / 0.15)); t = t * t * (3 - 2 * t)
    width = 1.08 * (1 - t) + 0.68 * t
    return V((p.x * width, p.y * width, p.z * 1.45 if p.z <= 0.93 else 0.93 * 1.45 + (p.z - 0.93) * 0.68))
for o in [body] + face + list(H.values()) + list(C.values()) + [umbrella, doko]:
    transform = o.matrix_world.copy(); inverse = transform.inverted()
    for v in o.data.vertices: v.co = inverse @ proportion(transform @ v.co)
    o.data.update()
J = {name: proportion(p) for name, p in J.items()}

# ---------------------------------------------------------------- armature
arm = bpy.data.armatures.new('Rig'); rig = bpy.data.objects.new('PersonRig', arm); sc.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='EDIT')
eb = arm.edit_bones
def bone(n, a, b, parent=None, conn=False):
    x = eb.new(n); x.head = J[a]; x.tail = J[b]
    if parent: x.parent = eb[parent]; x.use_connect = conn
bone('hips', 'hips', 'spine'); bone('spine', 'spine', 'chest', 'hips', True); bone('chest', 'chest', 'neck', 'spine', True)
bone('neck', 'neck', 'head', 'chest', True); bone('head', 'head', 'top', 'neck', True)
for s in ('L', 'R'):
    bone(f'upperarm.{s}', f'shoulder.{s}', f'elbow.{s}', 'chest'); bone(f'forearm.{s}', f'elbow.{s}', f'wrist.{s}', f'upperarm.{s}', True)
    bone(f'hand.{s}', f'wrist.{s}', f'hand.{s}', f'forearm.{s}', True)
    bone(f'thigh.{s}', f'hip.{s}', f'knee.{s}', 'hips'); bone(f'shin.{s}', f'knee.{s}', f'ankle.{s}', f'thigh.{s}', True)
    bone(f'foot.{s}', f'ankle.{s}', f'toe.{s}', f'shin.{s}', True)
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.object.select_all(action='DESELECT'); body.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
def rigid(o, bn):
    o.parent = rig; vg = o.vertex_groups.new(name=bn); vg.add([v.index for v in o.data.vertices], 1.0, 'REPLACE')
    md = o.modifiers.new('arm', 'ARMATURE'); md.object = rig
for o in face + list(H.values()): rigid(o, 'head')
for k in ('Tunic', 'Patuka', 'Sari', 'Skirt'): rigid(C[k], 'hips')
for k in ('Vest', 'Pallu', 'Tie'): rigid(C[k], 'chest')
rigid(C['Stick'], 'hand.L'); rigid(umbrella, 'hand.R'); rigid(doko, 'chest')
pb = rig.pose.bones
for b in pb: b.rotation_mode = 'XYZ'

# ---------------------------------------------------------------- animation (bouncy, storybook)
def new_action(name):
    a = bpy.data.actions.new(name); rig.animation_data_create(); rig.animation_data.action = a
    for b in pb: b.location = (0, 0, 0); b.rotation_euler = (0, 0, 0)
    return a
def key(b, f, rot=None, loc=None):
    if rot is not None: pb[b].rotation_euler = rot; pb[b].keyframe_insert('rotation_euler', frame=f)
    if loc is not None: pb[b].location = loc; pb[b].keyframe_insert('location', frame=f)
def clip(name, frames, fn):
    a = new_action(name)
    for f in range(frames + 1): fn(f, f / frames)
    return a
TAU = 2 * math.pi
def walk(f, ph):
    s = math.sin(ph * TAU)
    for side, sg in (('L', 1), ('R', -1)):
        k = s * sg
        key(f'thigh.{side}', f, rot=(0.42 * k, 0, 0))
        key(f'shin.{side}', f, rot=(-max(0.0, -math.cos(ph * TAU + (0 if sg > 0 else math.pi))) * 0.65, 0, 0))
        key(f'foot.{side}', f, rot=(0.25 * max(0.0, k), 0, 0))
        key(f'upperarm.{side}', f, rot=(-0.3 * k, 0, 0.06 * sg)); key(f'forearm.{side}', f, rot=(-0.25 - 0.1 * max(0.0, -k), 0, 0))
    bounce = abs(math.cos(ph * TAU))
    key('hips', f, loc=(0, 0.012 * bounce - 0.004, 0), rot=(0, s * 0.04, s * 0.025)); key('chest', f, rot=(0.025, -s * 0.05, -s * 0.025))
    key('head', f, rot=(-0.04 * bounce, s * 0.05, s * 0.05))
def idle(f, ph):
    b = math.sin(ph * TAU * 2)
    key('hips', f, loc=(0, 0.003 * b, 0)); key('chest', f, rot=(0.015 * b, 0, 0)); key('head', f, rot=(0.02 * math.sin(ph * TAU * 3), math.sin(ph * TAU) * 0.14, math.sin(ph * TAU) * 0.035))
    for side, sg in (('L', 1), ('R', -1)): key(f'upperarm.{side}', f, rot=(0, 0, 0.14 * sg + 0.02 * b * sg)); key(f'forearm.{side}', f, rot=(-0.2, 0, 0))
def wave(f, ph):
    idle(f, ph); key('upperarm.R', f, rot=(-0.2, 0, -2.5)); key('forearm.R', f, rot=(0, 0, math.sin(ph * TAU * 4) * 0.55)); key('head', f, rot=(0.12, 0.1, 0.12))
    key('hips', f, loc=(0, 0.02 * abs(math.sin(ph * TAU * 2)), 0))
def pet(f, ph):  # crouch and pat the pup
    k = math.sin(min(1.0, ph * 3) * math.pi / 2) * (1 - max(0.0, (ph - 0.8) / 0.2))
    key('hips', f, loc=(0, -0.22 * k, 0)); key('chest', f, rot=(0.55 * k, 0, 0)); key('head', f, rot=(0.25 * k, 0, 0.1 * math.sin(ph * TAU * 2) * k))
    for side in ('L', 'R'): key(f'thigh.{side}', f, rot=(1.3 * k, 0, 0)); key(f'shin.{side}', f, rot=(-1.8 * k, 0, 0)); key(f'foot.{side}', f, rot=(0.45 * k, 0, 0))
    key('upperarm.R', f, rot=(-(0.95 + math.sin(ph * TAU * 5) * 0.18) * k, 0, 0)); key('forearm.R', f, rot=(-0.3 * k, 0, 0))
    key('upperarm.L', f, rot=(0, 0, 0.3 * k))
def shoo(f, ph):
    idle(f, ph); key('chest', f, rot=(0.15, 0, 0)); key('upperarm.R', f, rot=(-(1.1 + math.sin(ph * TAU * 3) * 0.5), 0, 0)); key('forearm.R', f, rot=(-0.4, 0, 0))
    key('head', f, rot=(0.1, 0, -0.1))
def umbrella_pose(f, ph):
    key('upperarm.R', f, rot=(-0.9, 0, -0.3)); key('forearm.R', f, rot=(-1.25, 0, 0)); key('hand.R', f, rot=(0.6, 0, 0))
def sit(f, ph):
    key('hips', f, loc=(0, -0.06, 0))
    for side, sg in (('L', 1), ('R', -1)):
        swing = math.sin(ph * TAU * 2 + (0 if sg > 0 else math.pi)) * 0.18      # little dangling feet
        key(f'thigh.{side}', f, rot=(1.5, 0, 0.12 * sg)); key(f'shin.{side}', f, rot=(-1.45 + swing, 0, 0))
        key(f'upperarm.{side}', f, rot=(-0.35, 0, 0.15 * sg)); key(f'forearm.{side}', f, rot=(-0.7, 0, 0))
    key('head', f, rot=(0, math.sin(ph * TAU) * 0.3, 0)); key('chest', f, rot=(-0.05, 0, 0))
ACTS = [clip('Walk', 28, walk), clip('Idle', 120, idle), clip('Wave', 40, wave), clip('Pet', 90, pet), clip('Shoo', 30, shoo), clip('Umbrella', 10, umbrella_pose), clip('Sit', 90, sit)]
for a in ACTS:
    t = rig.animation_data.nla_tracks.new(); t.name = a.name; t.strips.new(a.name, 0, a); t.mute = True
rig.animation_data.action = None

# ---------------------------------------------------------------- preview sheet (five outfits, before parts are merged)
if PREVIEW:
    import numpy as np
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.location = (1.7, -2.4, 1.05); cam.data.lens = 50; cam.rotation_euler = (V((0, 0, 0.68)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); sun.data.energy = 4; sun.rotation_euler = (0.8, 0.2, 0.9); sc.collection.objects.link(sun)
    w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.62, 0.66, 0.7, 1)
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 12; sc.render.resolution_x = 300; sc.render.resolution_y = 380
    nt = BODY.node_tree; vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'; sep = nt.nodes.new('ShaderNodeSeparateColor')
    ramp = nt.nodes.new('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'CONSTANT'
    cols = ['#e0ac80', '#f3ede0', '#3d405b', '#3a2a20', '#b23a48', '#2b1d14', '#120a06', '#ffffff', '#ff8fa3', '#e9c46a', '#a4161a', '#2a9d8f', '#7a5230', '#ffc23d']
    def rgb(h): return tuple(int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)) + (1,)
    els = ramp.color_ramp.elements
    els[0].position, els[0].color = 0.0, rgb(cols[0]); els[1].position, els[1].color = 0.5 / 13, rgb(cols[1])
    for i in range(2, 14): e = els.new((i - 0.5) / 13); e.color = rgb(cols[i])
    nt.links.new(vc.outputs['Color'], sep.inputs['Color']); nt.links.new(sep.outputs['Red'], ramp.inputs['Fac']); nt.links.new(ramp.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
    allp = {**H, **C}
    looks = [('Hair_short', 'Hat_dhaka', 'Tunic', 'Patuka', 'Vest'), ('Hair_bun', 'Sari', 'Pallu'), ('Hair_braid', 'Tie', 'Skirt'), ('Hair_short', 'Hat_cap'), ('Hat_shawl', 'Tunic', 'Stick')]
    tiles = []
    for (name, fr), look in zip((('Walk', 6), ('Idle', 30), ('Walk', 20), ('Wave', 12), ('Sit', 20)), looks):
        for k, o in allp.items(): o.hide_render = k not in look
        umbrella.hide_render = doko.hide_render = True
        rig.animation_data.action = bpy.data.actions[name]; sc.frame_set(fr)
        p = os.path.join(ROOT, 'pipeline', '.cache', 'previews', f'_{name}.png'); sc.render.filepath = p; bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(p); tiles.append(np.array(im.pixels[:]).reshape(im.size[1], im.size[0], 4)); os.remove(p)
    row = np.concatenate(tiles, 1); out = bpy.data.images.new('s', row.shape[1], row.shape[0]); out.pixels.foreach_set(row.astype('float32').ravel())
    out.filepath_raw = os.path.join(ROOT, 'pipeline', '.cache', 'previews', 'person_sheet.png'); out.file_format = 'PNG'; out.save()
    for o in (cam, sun): bpy.data.objects.remove(o)
    for o in allp.values(): o.hide_render = False
    umbrella.hide_render = doko.hide_render = False
    nt.links.remove(nt.nodes['Principled BSDF'].inputs['Base Color'].links[0])
    rig.animation_data.action = None

# ---------------------------------------------------------------- merge everything that uses the Body material into ONE mesh
merged = [body] + face + list(H.values()) + list(C.values())
for o in merged[1:]:
    for md in list(o.modifiers): o.modifiers.remove(md)
body = join(merged, 'Person')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', use_selection=True, export_animations=True, export_animation_mode='NLA_TRACKS', export_skins=True, export_vertex_color='ACTIVE')
print('PERSON EXPORTED', [a.name for a in ACTS], len(body.data.polygons))
