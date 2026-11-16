"""Blender: build the cartoon pup (Khairey) — anatomy from metaballs, remeshed, rigged, coat-painted, IK-animated.

Run:   npm run assets:pup (builds local village, Bhote and Spitz-type dogs)
Out:   assets/models/{pup,bhote,spitz}.glb; --variant selects the silhouette
Axes:  Blender: dog faces -Y, Z up, feet on Z=0.  (Godot: faces +Z after glTF import.)
"""
import bpy, bmesh, math, os, sys
from mathutils import Vector, Quaternion, Matrix, Euler

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
VARIANT = next((a.split('=',1)[1] for a in sys.argv if a.startswith('--variant=')), 'village')
PROFILE = {'village': (1.0,1.0,1.0,1.0), 'bhote': (1.16,1.04,1.02,1.12), 'spitz': (.95,.92,.96,.98)}[VARIANT]
OUT_GLB = os.path.join(ROOT, 'assets', 'models', {'village':'pup','bhote':'bhote','spitz':'spitz'}[VARIANT]+'.glb')
PREVIEW = '--preview' in sys.argv
FPS = 30

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = FPS
V = Vector

# ------------------------------------------------------------------ skeleton (rest pose)
J = {  # lean, four-legged local dog; -Y forward, toes on the ground
    'root': (0,.13,.30), 'spine1': (0,.05,.305), 'spine2': (0,-.06,.31), 'chest': (0,-.17,.31),
    'neck0': (0,-.18,.32), 'neck1': (0,-.255,.36), 'head': (0,-.30,.385), 'snout': (0,-.43,.365),
    'jaw0': (0,-.335,.355), 'jaw1': (0,-.413,.348),
    'tail0': (0,.19,.31), 'tail1': (0,.25,.34), 'tail2': (0,.30,.40), 'tail3': (0,.29,.45), 'tail4': (0,.245,.46), 'tail5': (0,.21,.44),
}
for side, sx in (('L',1),('R',-1)):
    J.update({
        f'shoulder.{side}': (.052*sx,-.17,.27), f'elbow.{side}': (.055*sx,-.125,.165), f'wrist.{side}': (.053*sx,-.18,.05), f'ftoe.{side}': (.053*sx,-.215,.023),
        f'hip.{side}': (.052*sx,.145,.27), f'knee.{side}': (.06*sx,.085,.17), f'hock.{side}': (.053*sx,.20,.07), f'htoe.{side}': (.053*sx,.18,.023),
        f'ear0.{side}': (.048*sx,-.285,.438), f'ear1.{side}': ((.085 if VARIANT=='bhote' else .067)*sx,-.28,.43 if VARIANT=='bhote' else .492),
    })
def shape(p):
    x,y,z=p; head=max(0,min(1,(-y-.22)/.12)); w,l,h,hs=PROFILE
    return V((x*w*(1+(hs-1)*head),y*l,z*h))
J = {k: shape(v) for k, v in J.items()}

# ------------------------------------------------------------------ body from metaballs
mb = bpy.data.metaballs.new('DogMB')
mb.resolution = 0.008; mb.render_resolution = 0.008; mb.threshold = 0.6
mbo = bpy.data.objects.new('DogMB', mb); sc.collection.objects.link(mbo)

K = 0.67  # visible surface of an isolated element sits at ~0.67 x radius (threshold .6, stiffness 2)
def ell(c, a, b, cc, rot=(0, 0, 0), stiff=2.0):
    """Ellipsoid with visible semi-axes (a, b, cc)."""
    m = max(a, b, cc)
    e = mb.elements.new(); e.type = 'ELLIPSOID'; e.co = shape(c); e.radius = m / K
    e.size_x, e.size_y, e.size_z = a * PROFILE[0] / m, b * PROFILE[1] / m, cc * PROFILE[2] / m; e.rotation = Euler(rot).to_quaternion(); e.stiffness = stiff
    return e

def cap(a, b, r, stiff=2.0):
    a, b = V(a), V(b); d = b - a
    e = mb.elements.new(); e.type = 'CAPSULE'; e.co = (a + b) / 2; e.radius = r / K; e.stiffness = stiff
    e.size_x = d.length / 2
    e.rotation = V((1, 0, 0)).rotation_difference(d.normalized())
    return e

# A longer back, tucked waist, tapered muzzle and smaller eyes read as a local dog.
ell((0,-.035,.282),.067,.18,.069)
ell((0,-.165,.29),.072,.078,.084)
ell((0,.135,.29),.069,.076,.074)
cap(shape((0,-.17,.31)),shape((0,-.255,.36)),.043)
ell((0,-.30,.39),.065,.069,.06)
for sx in (1,-1): ell((.032*sx,-.34,.366),.03,.038,.027)
cap(shape((0,-.34,.373)),shape((0,-.412,.365)),.026)
ell((0,-.389,.348),.023,.04,.014)
for sx in (1,-1):
    if VARIANT=='bhote':
        ell((.065*sx,-.285,.438),.027,.018,.04,rot=(0,.65*sx,0))
    else:
        ell((.048*sx,-.285,.445),.023,.015,.034,rot=(0,-.2*sx,0))
        ell((.063*sx,-.28,.475),.014,.010,.023,rot=(0,-.22*sx,0))
if VARIANT!='village':
    ell((0,-.175,.30),.077,.095,.092) # modest neck ruff, not a spherical body
    ell((0,-.245,.345),.065,.065,.068)
for side in ('L','R'):
    cap(J[f'shoulder.{side}'],J[f'elbow.{side}'],.024*PROFILE[0])
    cap(J[f'elbow.{side}'],J[f'wrist.{side}'],.017*PROFILE[0])
    cap(J[f'wrist.{side}'],J[f'ftoe.{side}'],.016*PROFILE[0])
    sx=1 if side=='L' else -1
    ell((.053*sx,-.216,.021),.024,.032,.019)
    cap(J[f'hip.{side}'],J[f'knee.{side}'],.036*PROFILE[0])
    cap(J[f'knee.{side}'],J[f'hock.{side}'],.019*PROFILE[0])
    cap(J[f'hock.{side}'],J[f'htoe.{side}'],.016*PROFILE[0])
    ell((.053*sx,.175,.021),.023,.03,.019)
chain=['tail0','tail1','tail2','tail3','tail4','tail5']
for i in range(5): cap(J[chain[i]],J[chain[i+1]],(.019 if VARIANT=='village' else .027)-i*.0017,stiff=2.2)

# convert -> mesh, remesh, smooth, decimate
bpy.context.view_layer.objects.active = mbo; mbo.select_set(True)
bpy.ops.object.convert(target='MESH')
body = bpy.context.active_object; body.name = 'Dog'
body.data.remesh_voxel_size = 0.0045
bpy.ops.object.voxel_remesh()
sm = body.modifiers.new('smooth', 'CORRECTIVE_SMOOTH'); sm.iterations = 6; sm.smooth_type = 'LENGTH_WEIGHTED'; sm.use_only_smooth = True
bpy.ops.object.modifier_apply(modifier='smooth')
dec = body.modifiers.new('dec', 'DECIMATE'); dec.ratio = 1.0
nf = len(body.data.polygons); dec.ratio = min(1.0, 4800 / max(nf, 1))
bpy.ops.object.modifier_apply(modifier='dec')
body.data.validate(clean_customdata=False); body.data.update()
bpy.ops.object.shade_smooth()
bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.01, scale_to_bounds=False)
bpy.ops.object.mode_set(mode='OBJECT')
print('DOG FACES', len(body.data.polygons))

# ------------------------------------------------------------------ coat colours (vertex colours)
def smooth01(a, b, x):
    t = max(0.0, min(1.0, (x - a) / (b - a))); return t * t * (3 - 2 * t)
ORANGE = V((0.78, 0.55, 0.32)); CREAM = V((0.96, 0.90, 0.80)); BROWN = V((0.42, 0.25, 0.13)); TAN = ORANGE
ca = body.data.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
for v in body.data.vertices:
    p = v.co; n = v.normal
    c = ORANGE.copy()
    c = c.lerp(BROWN, smooth01(0.31, 0.34, p.z) * smooth01(0.3, 0.9, n.z) * smooth01(-0.12, -0.05, p.y) * 0.45)   # darker back
    under = smooth01(0.15, 0.85, -n.z) * smooth01(-0.2, 0.05, p.y) * (1-smooth01(.035,.12,p.y))
    chest = smooth01(0.035, 0.0, abs(p.x)) * smooth01(-0.06, -0.14, p.y) * smooth01(0.36, 0.2, p.z)
    c = c.lerp(CREAM, min(1.0, under + chest * 1.4))
    c = c.lerp(CREAM, smooth01(0.075, 0.04, p.z))                                   # socks
    muzzle = smooth01(-0.25, -0.29, p.y) * smooth01(0.4, 0.37, p.z)
    c = c.lerp(CREAM, muzzle)                                                        # cream muzzle
    blaze = smooth01(0.02, 0.0, abs(p.x)) * smooth01(-0.25, -0.27, p.y) * smooth01(0.38, 0.44, p.z) * 0.9
    c = c.lerp(CREAM, blaze)                                                         # forehead blaze
    for sx in (1, -1):                                                               # tan "eyebrow" dots
        d = (V((p.x, p.y, p.z)) - V((0.035 * sx, -0.262, 0.452))).length
        c = c.lerp(CREAM, smooth01(0.016, 0.008, d))
    c = c.lerp(BROWN, smooth01(0.47, 0.5, p.z) * smooth01(0.075, 0.1, abs(p.x)))    # ear tips
    c = c.lerp(CREAM, smooth01(0.44, 0.46, p.z) * smooth01(0.1, 0.13, p.y))         # tail tip
    ca.data[v.index].color = (c.x ** 2.2, c.y ** 2.2, c.z ** 2.2, 1.0)

def material(name, col, rough, spec=0.5, use_vcol=False):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = rough
    if use_vcol:
        a = m.node_tree.nodes.new('ShaderNodeVertexColor'); a.layer_name = 'Col'
        m.node_tree.links.new(a.outputs['Color'], b.inputs['Base Color'])
    else:
        b.inputs['Base Color'].default_value = (*col, 1)
    return m
body.data.materials.append(material('Coat', None, 0.85, use_vcol=True))

# eyes, nose, mouth parts
def add_sphere(name, loc, r, scale, m, segs=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=segs // 2, radius=r, location=loc)
    o = bpy.context.active_object; o.name = name; o.location = shape(loc); o.scale = (scale[0]*PROFILE[0],scale[1]*PROFILE[1],scale[2]*PROFILE[2])
    bpy.ops.object.transform_apply(scale=True); bpy.ops.object.shade_smooth(); o.data.materials.append(m); return o
EYE = material('Eye', (0.06, 0.035, 0.015), 0.05)
NOSE = material('Nose', (0.03, 0.025, 0.025), 0.35)
MOUTH = material('Mouth', (0.35, 0.08, 0.1), 0.5)
parts = []
SPARK = material('Sparkle', (1, 1, 1), 0.2)
TONGUE = material('Tongue', (0.95, 0.38, 0.45), 0.4)
for sx in (1, -1):
    parts.append(add_sphere('Eye', (0.038 * sx, -0.352, 0.404), 0.012, (1, 0.85, 1.1), EYE))
    parts.append(add_sphere('Spark', (0.041 * sx, -0.364, 0.409), 0.0022, (1, 0.5, 1), SPARK, segs=8))
    parts.append(add_sphere('Spark2', (0.035 * sx, -0.364, 0.400), 0.0010, (1, 0.5, 1), SPARK, segs=8))
parts.append(add_sphere('Nose', (0, -0.438, 0.367), 0.014, (1.3, 0.9, 0.85), NOSE))
jaw = add_sphere('Jaw', (0, -0.387, 0.348), 0.017, (0.9, 2.0, 0.4), MOUTH)
jaw_cov = add_sphere('JawFur', (0, -0.385, 0.343), 0.019, (0.95, 1.9, 0.45), body.data.materials[0])
tongue = add_sphere('Tongue', (0, -0.416, 0.338), 0.010, (1.0, 1.4, 0.35), TONGUE)
jc = jaw_cov.data.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
for v in jaw_cov.data.vertices: jc.data[v.index].color = (CREAM.x ** 2.2, CREAM.y ** 2.2, CREAM.z ** 2.2, 1)

# ------------------------------------------------------------------ armature
arm_data = bpy.data.armatures.new('DogRig'); rig = bpy.data.objects.new('DogRig', arm_data)
sc.collection.objects.link(rig); bpy.context.view_layer.objects.active = rig; rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
eb = arm_data.edit_bones
def bone(name, a, b, parent=None, connect=False, roll=0.0):
    x = eb.new(name); x.head = J[a] if isinstance(a, str) else V(a); x.tail = J[b] if isinstance(b, str) else V(b)
    x.roll = roll
    if parent: x.parent = eb[parent]; x.use_connect = connect
    return x
bone('root', 'root', V(J['root']) + V((0, -0.1, 0)))
bone('spine1', 'root', 'spine1', 'root')
bone('spine2', 'spine1', 'spine2', 'spine1', True)
bone('chest', 'spine2', 'chest', 'spine2', True)
bone('neck', 'neck0', 'neck1', 'chest')
bone('head', 'neck1', 'head', 'neck', True)
bone('snout', 'head', 'snout', 'head', True)
bone('jaw', 'jaw0', 'jaw1', 'head')
bone('tail0', 'tail0', 'tail1', 'root')
for i in range(1, 5): bone(f'tail{i}', f'tail{i}', f'tail{i + 1}', f'tail{i - 1}', True)
for s in ('L', 'R'):
    bone(f'upperarm.{s}', f'shoulder.{s}', f'elbow.{s}', 'chest')
    bone(f'forearm.{s}', f'elbow.{s}', f'wrist.{s}', f'upperarm.{s}', True)
    bone(f'fpaw.{s}', f'wrist.{s}', f'ftoe.{s}', f'forearm.{s}', True)
    bone(f'thigh.{s}', f'hip.{s}', f'knee.{s}', 'root')
    bone(f'shin.{s}', f'knee.{s}', f'hock.{s}', f'thigh.{s}', True)
    bone(f'hpaw.{s}', f'hock.{s}', f'htoe.{s}', f'shin.{s}', True)
    bone(f'ear.{s}', f'ear0.{s}', f'ear1.{s}', 'head')
    # IK helpers (not deforming)
    t = bone(f'IK_f.{s}', f'wrist.{s}', V(J[f'wrist.{s}']) + V((0, -0.06, 0)))
    t = bone(f'IK_h.{s}', f'hock.{s}', V(J[f'hock.{s}']) + V((0, -0.06, 0)))
    bone(f'pole_f.{s}', V(J[f'elbow.{s}']) + V((0, 0.4, 0)), V(J[f'elbow.{s}']) + V((0, 0.45, 0)))
    bone(f'pole_h.{s}', V(J[f'knee.{s}']) + V((0, -0.4, 0)), V(J[f'knee.{s}']) + V((0, -0.45, 0)))
for b in eb:
    if b.name.startswith(('IK_', 'pole_')): b.use_deform = False
bpy.ops.object.mode_set(mode='OBJECT')

# parent mesh with automatic weights; small parts rigidly to bones
bpy.ops.object.select_all(action='DESELECT')
body.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
# Upper-muzzle fur follows the same rigid head as the nose, rather than the nearby panting jaw.
head_group = body.vertex_groups.get('head')
for vertex in body.data.vertices:
    p = vertex.co
    blend = smooth01(0.35, 0.38, -p.y / PROFILE[1]) * smooth01(0.345, 0.36, p.z / PROFILE[2])
    if blend <= 0:
        continue
    existing = next((g.weight for g in vertex.groups if g.group == head_group.index), 0)
    for assignment in list(vertex.groups):
        if assignment.group != head_group.index:
            body.vertex_groups[assignment.group].add([vertex.index], assignment.weight * (1 - blend), 'REPLACE')
    head_group.add([vertex.index], existing * (1 - blend) + blend, 'REPLACE')
def rigid(o, bname):
    o.parent = rig
    vg = o.vertex_groups.new(name=bname); vg.add([v.index for v in o.data.vertices], 1.0, 'REPLACE')
    md = o.modifiers.new('arm', 'ARMATURE'); md.object = rig
for p in parts: rigid(p, 'head')
rigid(jaw, 'jaw'); rigid(jaw_cov, 'jaw'); rigid(tongue, 'jaw')

# Merge all small parts into ONE mesh with vertex colours (1 draw call instead of 8 in the game)
PART_COL = {'Eye': (0.06, 0.035, 0.015), 'Sparkle': (1, 1, 1), 'Nose': (0.03, 0.025, 0.025), 'Mouth': (0.55, 0.12, 0.16), 'Tongue': (0.95, 0.38, 0.45)}
small = parts + [jaw, jaw_cov, tongue]
for o in small:
    if 'Col' not in o.data.color_attributes: o.data.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    col = o.data.color_attributes['Col']
    mname = o.data.materials[0].name
    # Explicit eye/sparkle membership survives joining. A face bounding box also caught nose vertices.
    blink_mask = o.data.attributes.new(name='_blink', type='FLOAT', domain='POINT')
    for value in blink_mask.data:
        value.value = 1.0 if mname in ('Eye', 'Sparkle') else 0.0
    c = PART_COL.get(mname)
    if c:
        for v in o.data.vertices: col.data[v.index].color = (c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2, 1)
    o.data.materials.clear()
PARTS_MAT = material('Parts', None, 0.4, use_vcol=True)
bpy.ops.object.select_all(action='DESELECT')
for o in small: o.select_set(True)
bpy.context.view_layer.objects.active = small[0]
bpy.ops.object.join()
merged = bpy.context.active_object; merged.name = 'Parts'; merged.data.materials.append(PARTS_MAT)

# IK constraints (legs plant on the ground during gait baking)
pb = rig.pose.bones
for s in ('L', 'R'):
    for leg, tip, ik, pole in (('f', f'fpaw.{s}', f'IK_f.{s}', f'pole_f.{s}'), ('h', f'hpaw.{s}', f'IK_h.{s}', f'pole_h.{s}')):
        mid = f'forearm.{s}' if leg == 'f' else f'shin.{s}'
        c = pb[mid].constraints.new('IK'); c.target = rig; c.subtarget = ik; c.chain_count = 2
        c.use_stretch = False; pb[mid].ik_stretch = 0.0
        c.pole_target = rig; c.pole_subtarget = pole; c.pole_angle = math.radians(90 if leg=='f' else -90)
        c2 = pb[tip].constraints.new('COPY_LOCATION'); c2.target = rig; c2.subtarget = ik; c2.head_tail = 0.0
        c2.enabled = False  # foot orientation is keyed directly
for b in pb: b.rotation_mode = 'XYZ'

# ------------------------------------------------------------------ animation helpers
def rest_world(name): return rig.data.bones[name].head_local.copy()
REST = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in rig.data.bones}

def new_action(name, frames):
    act = bpy.data.actions.new(name)
    rig.animation_data_create(); rig.animation_data.action = act
    sc.frame_start, sc.frame_end = 0, frames
    for b in pb:
        b.location = (0, 0, 0); b.rotation_euler = (0, 0, 0); b.scale=(1,1,1)
        for channel in ('location','rotation_euler','scale'): b.keyframe_insert(channel,frame=0)
    return act

SPINE = {'root', 'spine1', 'spine2', 'chest', 'neck', 'head', 'snout'}
def key(bname, frame, loc=None, rot=None):
    """rot is (pitch, yaw, roll) in body terms; spine/head/tail bones point along their Y axis so yaw is Z."""
    b = pb[bname]
    if rot is not None and (bname in SPINE or bname.startswith('tail')): rot = (rot[0], rot[2], rot[1])
    if loc is not None: b.location = loc; b.keyframe_insert('location', frame=frame)
    if rot is not None: b.rotation_euler = rot; b.keyframe_insert('rotation_euler', frame=frame)

def ik_target(bname, frame, world_pos):
    """Key an IK bone so its head sits at world_pos (armature space). Bones have no parent -> loc in bone-local axes."""
    side=bname[-1]
    if bname.startswith('IK_f.'): world_pos=world_pos+J[f'wrist.{side}']-J[f'ftoe.{side}']
    elif bname.startswith('IK_h.'): world_pos=world_pos+J[f'hock.{side}']-J[f'htoe.{side}']
    b = rig.data.bones[bname]
    delta = world_pos - b.head_local
    local = b.matrix_local.to_3x3().inverted() @ delta
    pb[bname].location = local; pb[bname].keyframe_insert('location', frame=frame)

def foot_path(phase, stance, stride, lift):
    """phase 0..1. stance part: foot moves back on the ground; swing: lifts and swings forward."""
    stride *= stance
    if phase < stance:
        t = phase / stance
        return V((0, -stride / 2 + stride * t, 0))         # -Y is forward: foot drifts backward (+Y)
    t = (phase - stance) / (1 - stance)
    y = stride / 2 - stride * (0.5 - 0.5 * math.cos(math.pi * t))
    z = lift * math.sin(math.pi * t) ** 1.2
    return V((0, y, z))

def gait(name, frames, stride, offsets, stance, lift, bob, spine_flex=0.0, head_bob=0.04, tail_wag=0.25, wag_speed=2, body_pitch=0.0, hip_roll=0.04, spine_yaw=0.03, ears_back=0.0, tail_lift=0.0):
    act = new_action(name, frames)
    for f in range(frames + 1):
        ph = f / frames
        for s in ('L', 'R'):
            for leg in ('f', 'h'):
                off = offsets[leg + s]
                p = (ph + off) % 1.0
                fp = foot_path(p, stance, stride, lift * (1.0 if leg == 'f' else 0.9))
                toe = J[('ftoe.' if leg == 'f' else 'htoe.') + s]
                ik_target(f'IK_{leg}.{s}', f, toe + fp)
        # body bob (twice per cycle), sway, spine flex for gallop
        b = -.012 + math.cos(ph * 4 * math.pi) * bob
        key('root', f, loc=(0, 0, 0), rot=(math.sin(ph * 2 * math.pi) * body_pitch, 0, math.sin(ph * 2 * math.pi) * hip_roll))
        pb['root'].location = V((math.sin(ph * 2 * math.pi) * 0.006, 0, b)); pb['root'].keyframe_insert('location', frame=f)
        fl = math.sin(ph * 2 * math.pi) * spine_flex
        key('spine1', f, rot=(fl, math.sin(ph * 2 * math.pi + 1) * spine_yaw, 0))
        key('spine2', f, rot=(fl * 0.8, 0, 0))
        key('chest', f, rot=(-fl * 0.6, -math.sin(ph * 2 * math.pi + 1) * spine_yaw * 0.7, -math.sin(ph * 2 * math.pi) * hip_roll * 0.6))
        key('neck', f, rot=(math.cos(ph * 4 * math.pi + 0.6) * head_bob, 0, 0))
        key('head', f, rot=(-math.cos(ph * 4 * math.pi + 0.6) * head_bob * 0.7, math.sin(ph * 2 * math.pi) * 0.03, 0))
        for i in range(5):
            key(f'tail{i}', f, rot=(tail_lift if i == 0 else 0, math.sin(ph * 2 * math.pi * wag_speed - i * 0.6) * tail_wag * (0.4 + i * 0.25), 0))
        for s in ('L', 'R'):
            key(f'ear.{s}', f, rot=(ears_back + math.sin(ph * 4 * math.pi - 1.0) * 0.12, 0, 0))
            for leg in ('f', 'h'):
                # paws flex during swing
                off = offsets[leg + s]; p = (ph + off) % 1.0
                swing = 0 if p < stance else math.sin(math.pi * (p - stance) / (1 - stance))
                key(('fpaw.' if leg == 'f' else 'hpaw.') + s, f, rot=(swing * (0.9 if leg == 'f' else -0.6), 0, 0))
    return act

def pose_action(name, frames, fn):
    act = new_action(name, frames)
    for f in range(frames + 1):
        ph = f / frames
        for s in ('L', 'R'):  # feet planted at rest unless fn moves them
            ik_target(f'IK_f.{s}', f, J[f'ftoe.{s}']); ik_target(f'IK_h.{s}', f, J[f'htoe.{s}'])
        fn(f, ph)
    return act

ACTIONS = []
ACTIONS.append(gait('Walk', 18, 0.43, {'hL': 0.0, 'fL': 0.25, 'hR': 0.5, 'fR': 0.75}, 0.6, 0.05, 0.008, head_bob=0.06, tail_wag=0.45, wag_speed=3, hip_roll=0.07, spine_yaw=0.07))
ACTIONS.append(gait('Trot', 12, 0.64, {'hL': 0.0, 'fR': 0.0, 'hR': 0.5, 'fL': 0.5}, 0.45, 0.07, 0.018, head_bob=0.05, tail_wag=0.4, wag_speed=2, hip_roll=0.04, spine_yaw=0.03, ears_back=-0.1))
ACTIONS.append(gait('Gallop', 10, 1.12, {'hL': 0.0, 'hR': 0.08, 'fR': 0.45, 'fL': 0.55}, 0.34, 0.095, 0.025, spine_flex=0.13, head_bob=0.045, tail_wag=0.12, wag_speed=1, body_pitch=0.07, hip_roll=0.02, spine_yaw=0.0, ears_back=-0.35, tail_lift=-0.3))
def sniffwalk_post(act):
    for f in range(0, 19):
        ph = f / 18
        key('neck', f, rot=(0.8 + math.sin(ph * 6 * math.pi) * 0.04, 0, math.sin(ph * 2 * math.pi) * 0.14))
        key('head', f, rot=(0.3 + math.sin(ph * 12 * math.pi) * 0.05, math.sin(ph * 2 * math.pi) * 0.18, 0))
a = gait('SniffWalk', 18, 0.3, {'hL': 0.0, 'fL': 0.25, 'hR': 0.5, 'fR': 0.75}, 0.7, 0.035, 0.004, head_bob=0.0, tail_wag=0.3, wag_speed=3)
sniffwalk_post(a); ACTIONS.append(a)

def idle(f, ph):
    br = math.sin(ph * 2 * math.pi * 2) * 0.004
    pb['root'].location = V((0, 0, br)); pb['root'].keyframe_insert('location', frame=f)
    key('chest', f, rot=(math.sin(ph * 4 * math.pi) * 0.01, 0, 0))
    look = math.sin(ph * 2 * math.pi) * 0.35 * (1 if ph < 0.5 else 0.6)
    key('neck', f, rot=(-0.05, look * 0.5, 0)); key('head', f, rot=(0.05, look * 0.5, math.sin(ph * 2 * math.pi) * 0.06))
    for i in range(5): key(f'tail{i}', f, rot=(0, math.sin(ph * 2 * math.pi * 9 - i * 0.6) * 0.32 * (0.4 + i * 0.2), 0))
    for s in ('L', 'R'):
        tw = 0.25 if (s == 'L' and 0.3 < ph < 0.36) or (s == 'R' and 0.7 < ph < 0.74) else 0.0
        key(f'ear.{s}', f, rot=(tw, 0, 0))
    key('jaw', f, rot=(0.12 + math.sin(ph * 2 * math.pi * 6) * 0.04, 0, 0))  # panting
ACTIONS.append(pose_action('Idle', 90, idle))

def sniff_idle(f, ph):
    key('neck', f, rot=(0.9, math.sin(ph * 2 * math.pi) * 0.25, 0)); key('head', f, rot=(0.35 + math.sin(ph * 2 * math.pi * 8) * 0.05, math.sin(ph * 2 * math.pi) * 0.2, 0))
    key('chest', f, rot=(-0.08, 0, 0)); key('root', f, rot=(-0.04, 0, 0))
    for i in range(5): key(f'tail{i}', f, rot=(0, math.sin(ph * 2 * math.pi * 2 - i * 0.6) * 0.1, 0))
ACTIONS.append(pose_action('SniffIdle', 60, sniff_idle))

def bark(f, ph):
    k = math.sin(min(1, ph * 3) * math.pi) if ph < 0.34 else (math.sin(min(1, (ph - 0.4) * 3) * math.pi) if 0.4 < ph < 0.74 else 0)
    key('neck', f, rot=(-0.15 * k, 0, 0)); key('head', f, rot=(-0.25 * k, 0, 0)); key('jaw', f, rot=(0.55 * k, 0, 0))
    key('chest', f, rot=(0.06 * k, 0, 0))
    for s in ('L', 'R'): key(f'ear.{s}', f, rot=(-0.3 * k, 0, 0))
ACTIONS.append(pose_action('Bark', 18, bark))

def jump(f, ph):  # airborne pose: front legs tucked, hind stretched
    for s in ('L', 'R'):
        ik_target(f'IK_f.{s}', f, J[f'ftoe.{s}'] + V((0, -0.01, 0.08)))
        ik_target(f'IK_h.{s}', f, J[f'htoe.{s}'] + V((0, 0.07, 0.035)))
    key('root', f, rot=(0.12, 0, 0)); key('neck', f, rot=(-0.15, 0, 0))
    for i in range(5): key(f'tail{i}', f, rot=(0.15, 0, 0))
ACTIONS.append(pose_action('Jump', 10, jump))

def sit(f, ph):
    pb['root'].location = V((0, 0.0, -0.09)); pb['root'].keyframe_insert('location', frame=f)
    key('root', f, rot=(0.6, 0, 0)); key('spine1', f, rot=(0.08, 0, 0)); key('neck', f, rot=(-0.2, 0, 0)); key('head', f, rot=(0.3, math.sin(ph * 2 * math.pi) * 0.2, 0))
    for s in ('L', 'R'):
        ik_target(f'IK_h.{s}', f, J[f'htoe.{s}'] + V((0, -0.1, 0)))
    for i in range(5): key(f'tail{i}', f, rot=(-0.3, math.sin(ph * 2 * math.pi * 2 - i) * 0.15, 0))
ACTIONS.append(pose_action('Sit', 60, sit))

def lie(f, ph):
    br = math.sin(ph * 2 * math.pi * 3) * 0.004
    pb['root'].location = V((0, 0, -0.17 + br)); pb['root'].keyframe_insert('location', frame=f)
    key('root', f, rot=(-0.05, 0, 0.0)); key('neck', f, rot=(0.55, 0.15, 0)); key('head', f, rot=(0.35, 0.2, 0.15))
    for s in ('L', 'R'):
        sx = 1 if s == 'L' else -1
        ik_target(f'IK_f.{s}', f, J[f'ftoe.{s}'] + V((0.01 * sx, -0.13, 0.0)))
        ik_target(f'IK_h.{s}', f, J[f'htoe.{s}'] + V((0.07 * sx, -0.13, 0.0)))
    for i in range(5): key(f'tail{i}', f, rot=(-0.2, 0.3, 0))
ACTIONS.append(pose_action('Lie', 90, lie))

def playbow(f, ph):
    k = math.sin(min(1.0, ph * 2.5) * math.pi / 2) if ph < 0.75 else math.cos((ph - 0.75) / 0.25 * math.pi / 2)
    pb['root'].location = V((0, 0, -0.03 * k)); pb['root'].keyframe_insert('location', frame=f)
    key('root', f, rot=(-0.45 * k, 0, 0)); key('chest', f, rot=(-0.2 * k, 0, 0)); key('neck', f, rot=(-0.5 * k, 0, 0)); key('head', f, rot=(-0.2 * k, 0, math.sin(ph * 2 * math.pi * 2) * 0.15 * k))
    for s in ('L', 'R'):
        ik_target(f'IK_f.{s}', f, J[f'ftoe.{s}'] + V((0, -0.07 * k, 0)))
    for i in range(5): key(f'tail{i}', f, rot=(-0.2 * k, math.sin(ph * 2 * math.pi * 10 - i * 0.6) * 0.4, 0))
    key('jaw', f, rot=(0.2 * k, 0, 0))
ACTIONS.append(pose_action('PlayBow', 36, playbow))

def shake(f, ph):  # wet-dog shake, travelling from head to tail
    env = math.sin(ph * math.pi)
    for i, b in enumerate(['head', 'neck', 'chest', 'spine2', 'spine1', 'root']):
        key(b, f, rot=(0, math.sin(ph * 2 * math.pi * 7 - i * 0.5) * 0.35 * env, math.sin(ph * 2 * math.pi * 7 - i * 0.5) * 0.25 * env))
    for s in ('L', 'R'): key(f'ear.{s}', f, rot=(math.sin(ph * 2 * math.pi * 7) * 0.8 * env, 0, 0))
    for i in range(5): key(f'tail{i}', f, rot=(0, math.sin(ph * 2 * math.pi * 7 - i) * 0.5 * env, 0))
ACTIONS.append(pose_action('Shake', 30, shake))

def sit_base(f):
    pb['root'].location = V((0, 0.0, -0.09)); pb['root'].keyframe_insert('location', frame=f)
    key('root', f, rot=(0.6, 0, 0)); key('spine1', f, rot=(0.08, 0, 0))
    for s in ('L', 'R'): ik_target(f'IK_h.{s}', f, J[f'htoe.{s}'] + V((0, -0.1, 0)))

def scratch(f, ph):  # sits and scratches an ear with a hind paw
    sit_base(f)
    k = math.sin(min(1.0, ph * 4) * math.pi / 2) * (1 - max(0.0, (ph - 0.85) / 0.15))
    s8 = math.sin(ph * 2 * math.pi * 9)
    ik_target('IK_h.L', f, J['htoe.L'].lerp(J['ear0.L'] + V((0.05, 0.04, -0.12)), k * 0.75) + V((0, s8 * 0.02 * k, s8 * 0.02 * k)))
    key('neck', f, rot=(0.25 * k, 0.25 * k, -0.35 * k)); key('head', f, rot=(0.1 * k, 0.15 * k, -0.4 * k))
    key('jaw', f, rot=(0.12 * k, 0, 0)); key('ear.L', f, rot=(s8 * 0.3 * k, 0, 0))
    for i in range(5): key(f'tail{i}', f, rot=(-0.3, 0, 0))
ACTIONS.append(pose_action('Scratch', 48, scratch))

def stretch(f, ph):  # front stretch, then a back stretch with a big yawn
    a = math.sin(min(1.0, ph * 2.2) * math.pi) if ph < 0.45 else 0
    b = math.sin(min(1.0, max(0.0, ph - 0.45) * 2.2) * math.pi)
    pb['root'].location = V((0, -0.02 * b, -0.025 * a)); pb['root'].keyframe_insert('location', frame=f)
    key('root', f, rot=(-0.4 * a + 0.15 * b, 0, 0)); key('chest', f, rot=(-0.2 * a, 0, 0))
    key('neck', f, rot=(-0.45 * a - 0.5 * b, 0, 0)); key('head', f, rot=(-0.2 * a - 0.3 * b, 0, 0)); key('jaw', f, rot=(0.6 * b, 0, 0))
    for s in ('L', 'R'):
        ik_target(f'IK_f.{s}', f, J[f'ftoe.{s}'] + V((0, -0.08 * a, 0)))
        ik_target(f'IK_h.{s}', f, J[f'htoe.{s}'] + V((0, 0.07 * b, 0)))
        key(f'ear.{s}', f, rot=(-0.3 * b, 0, 0))
    for i in range(5): key(f'tail{i}', f, rot=(0.2 * b, math.sin(ph * 2 * math.pi * 3 - i) * 0.2, 0))
ACTIONS.append(pose_action('Stretch', 60, stretch))

def howl(f, ph):  # sits and howls at the moon
    sit_base(f)
    k = math.sin(min(1.0, ph * 3) * math.pi / 2) * (1 - max(0.0, (ph - 0.8) / 0.2))
    key('neck', f, rot=(-0.6 * k, 0, 0)); key('head', f, rot=(-0.7 * k, 0, 0)); key('jaw', f, rot=(0.35 * k + math.sin(ph * 40) * 0.03 * k, 0, 0))
    for s in ('L', 'R'): key(f'ear.{s}', f, rot=(-0.4 * k, 0, 0))
    for i in range(5): key(f'tail{i}', f, rot=(-0.3, 0, 0))
ACTIONS.append(pose_action('Howl', 72, howl))

def wiggle(f, ph):  # excited butt-wiggle: the whole back end wags with the tail
    w = math.sin(ph * 2 * math.pi * 6)
    key('root', f, rot=(0.05, w * 0.22, w * 0.06)); key('spine1', f, rot=(0, -w * 0.12, 0)); key('chest', f, rot=(0, -w * 0.06, 0))
    key('head', f, rot=(-0.1, w * 0.08, 0)); key('jaw', f, rot=(0.25, 0, 0))
    for s in ('L', 'R'): key(f'ear.{s}', f, rot=(w * 0.2, 0, 0))
    for i in range(5): key(f'tail{i}', f, rot=(-0.1 if i == 0 else 0, math.sin(ph * 2 * math.pi * 6 - i * 0.7) * 0.6, 0))
ACTIONS.append(pose_action('Wiggle', 40, wiggle))

# ------------------------------------------------------------------ bake IK -> FK and export
bpy.ops.object.select_all(action='DESELECT'); rig.select_set(True); bpy.context.view_layer.objects.active = rig
baked = []
for act in ACTIONS:
    rig.animation_data.action = act
    n = int(act.frame_range[1])
    bpy.ops.object.mode_set(mode='POSE')
    bpy.ops.pose.select_all(action='SELECT')
    bpy.ops.nla.bake(frame_start=0, frame_end=n, only_selected=False, visual_keying=True, clear_constraints=False, use_current_action=False, bake_types={'POSE'})
    nb = rig.animation_data.action; nb.name = act.name + '_b'
    bpy.ops.object.mode_set(mode='OBJECT')
    baked.append((act.name, nb))
for b in pb:
    for c in list(b.constraints): b.constraints.remove(c)
for name, act in baked:
    bpy.data.actions.remove(bpy.data.actions[name])
    act.name = name
    # drop IK/pole helper curves
    try:
        fcs = act.fcurves
    except AttributeError:
        fcs = None
    if fcs is not None:
        for fc in list(fcs):
            if 'IK_' in fc.data_path or 'pole_' in fc.data_path: fcs.remove(fc)
    trk = rig.animation_data.nla_tracks.new(); trk.name = name
    st = trk.strips.new(name, 0, act); trk.mute = True
rig.animation_data.action = None

# remove helper bones
bpy.ops.object.mode_set(mode='EDIT')
for b in list(arm_data.edit_bones):
    if b.name.startswith(('IK_', 'pole_')): arm_data.edit_bones.remove(b)
bpy.ops.object.mode_set(mode='OBJECT')

if PREVIEW:  # PREVIEW_ACTS="Sit:30,Bark:6" renders a contact sheet into pipeline/.cache/previews/pup_sheet.png
    import numpy as np
    shots = [x.split(':') for x in os.environ.get('PREVIEW_ACTS', 'Idle:10').split(',')]
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam')); sc.collection.objects.link(cam); sc.camera = cam
    cam.location = (0.95, -0.95, 0.5); cam.data.lens = 45
    cam.rotation_euler = (V((0, -0.05, 0.22)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sun = bpy.data.objects.new('Sun', bpy.data.lights.new('Sun', 'SUN')); sun.data.energy = 4; sun.rotation_euler = (0.8, 0.2, 0.9); sc.collection.objects.link(sun)
    w = bpy.data.worlds.new('W'); sc.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs[0].default_value = (0.6, 0.65, 0.7, 1)
    bpy.ops.mesh.primitive_plane_add(size=6); fl = bpy.context.active_object; fl.data.materials.append(material('Floor', (0.4, 0.35, 0.3), 0.9))
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 16; sc.render.resolution_x = 420; sc.render.resolution_y = 320
    tiles = []
    for act, fr in shots:
        rig.animation_data.action = bpy.data.actions[act]; sc.frame_set(int(fr))
        path = os.path.join(ROOT, 'pipeline', '.cache', 'previews', f'_{act}.png'); sc.render.filepath = path; bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(path); tiles.append(np.array(im.pixels[:]).reshape(im.size[1], im.size[0], 4)); os.remove(path)
    row = np.concatenate(tiles, 1)
    out = bpy.data.images.new('sheet', row.shape[1], row.shape[0]); out.pixels.foreach_set(row.astype('float32').ravel())
    out.filepath_raw = os.path.join(ROOT, 'pipeline', '.cache', 'previews', 'pup_sheet.png'); out.file_format = 'PNG'; out.save()
    for o in (fl, cam, sun): bpy.data.objects.remove(o)
    rig.animation_data.action = None

os.makedirs(os.path.dirname(OUT_GLB), exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB', use_selection=True, export_animations=True,
                          export_animation_mode='NLA_TRACKS', export_skins=True, export_vertex_color='ACTIVE', export_attributes=True, export_apply=False)
print('DOG EXPORTED', OUT_GLB, [a for a, _ in baked])
