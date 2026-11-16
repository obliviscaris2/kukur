/**
 * World materials (created once, shared by every map tile). Each is a toon material with a custom
 * fragment snippet. Colours come from config/palette.js and config/ground.js.
 */
import * as THREE from 'three';
import { loadSurfaces, SURFACE_NORMAL } from './surfaceLibrary.js';
import { toon, U } from './toon.js';
import { buildFacadeAtlas, wallPattern } from './facadeAtlas.js';
import { PALETTE, AREA_KINDS, AREA_STYLE, ART, MYTHIC } from '../config/index.js';

const vec3 = (hex) => { const c = new THREE.Color(hex); return `vec3(${c.r.toFixed(3)}, ${c.g.toFixed(3)}, ${c.b.toFixed(3)})`; };
const constArray = (name, list) => `const vec3 ${name}[${list.length}] = vec3[${list.length}](${list.map(vec3).join(', ')});`;
const NOISE = /* glsl */ `
float gh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float gn(vec2 p) { return tNoise(p); }
vec3 meadowPaint(vec2 p){
  vec2 q=mat2(.8,-.6,.6,.8)*p+vec2(17.3,9.1);
  return mix(texture2D(uMoss,p/${MYTHIC.surface.moss.toFixed(2)}).rgb,texture2D(uMoss,q/${(MYTHIC.surface.moss*1.37).toFixed(2)}).rgb,smoothstep(.22,.78,gn(p*.17))*.6);
}
// irregular hand-laid paving: rows of slightly different height, stones of random length, each row offset.
// Returns the distance (m) to the nearest joint; id = a random value per stone. No visible repeat, unlike a square grid.
float pave(vec2 p, float rowH, float len, out float id) {
  float row = floor(p.y / rowH), fy = fract(p.y / rowH);
  float L = len * (0.7 + 0.6 * gh(vec2(row, 7.1)));
  float sx = p.x / L + gh(vec2(row, 3.3)) * 9.0, cx = floor(sx), fx = fract(sx);
  fx = clamp((fx - 0.5) * (1.0 + 0.5 * (gh(vec2(cx, row)) - 0.5)) + 0.5, 0.0, 1.0);   // uneven stone widths
  id = gh(vec2(cx * 1.31, row * 0.77));
  return min(min(fx, 1.0 - fx) * L, min(fy, 1.0 - fy) * rowH);
}
// joints that thin out and vanish with distance (no moire, no grid at range)
float joint(float d, vec2 p, float w) { float fw = fwidth(p.x) + fwidth(p.y); return mix(smoothstep(0.0, w + fw, d), 1.0, smoothstep(0.03, 0.12, fw)); }`;

export async function createWorldMaterials() {
  const surfaces = await loadSurfaces();
  for (const [key,texture] of Object.entries(surfaces)) U['u'+key[0].toUpperCase()+key.slice(1)].value=texture;
  const atlas = await buildFacadeAtlas(surfaces);
  const pattern = wallPattern();

  // ------------------------------------------------------------------ building walls
  const walls = toon('#ffffff', {
    rim: 0.25, key: 'walls', params: { side: THREE.FrontSide },
    uniforms: { atlasMap: { value: atlas.map }, glowMap: { value: atlas.glow }, patternMap: { value: pattern } },
    vertexHead: 'attribute vec2 wall; attribute vec3 paint; attribute vec4 info; varying vec2 vBay; varying vec2 vWall; varying vec3 vPaint; varying vec4 vInfo;',
    vertexMain: 'vBay = uv; vWall = wall; vPaint = paint; vInfo = info;',
    fragHead: `uniform sampler2D atlasMap, glowMap, patternMap; varying vec2 vBay; varying vec2 vWall; varying vec3 vPaint; varying vec4 vInfo; float surfaceHeight=0.0; float vGlow = 0.0; float vNeon = 0.0; vec3 vSign = vec3(0.0);
      ${NOISE} ${constArray('BANDS', PALETTE.shopBands)}`,
    fragMap: /* glsl */ `
      float seed = vInfo.x, shop = vInfo.y, floors = vInfo.z, style = vInfo.w;
      vec4 pat = texture2D(patternMap, vWall / 2.2);
      vec3 brickPaint=texture2D(uBrick,vWall/${MYTHIC.surface.brick.toFixed(2)}).rgb;
      float rana = step(1.5, style);            // Rana-era neoclassical palace (white, pilasters, arched windows)
      vec3 wallc = vPaint * (style < 0.5 ? mix(0.78, 1.04, pat.r) : mix(0.9, 1.03, pat.g));
      if (rana > 0.5) { float px = fract(vBay.x); wallc *= 1.0 + 0.08 * (smoothstep(0.16, 0.1, px) + smoothstep(0.84, 0.9, px)) - 0.16 * (smoothstep(0.17, 0.165, px) * smoothstep(0.155, 0.16, px) + smoothstep(0.83, 0.835, px) * smoothstep(0.845, 0.84, px)); }
      wallc=mix(wallc,mix(brickPaint,vPaint,.32),1.0-step(.5,style));
      vec3 plaster=texture2D(uPlaster,vWall/3.4).rgb;
      wallc=mix(wallc,vPaint*(.78+.6*dot(plaster,vec3(.2126,.7152,.0722))),step(.5,style)*.8);
      wallc*=.94+.12*gn(vWall*.65+seed*17.0);
      float fl = vBay.y;
      if (style > 0.5 && rana < 0.5 && fl < 1.0 && floors > 0.5) wallc = mix(wallc, BANDS[int(seed * 4.99)], 0.85 * step(gh(vec2(seed * 7.0, 3.0)), 0.6));
      wallc *= mix(0.84, 1.0, smoothstep(0.0, 1.2, vWall.y));
      wallc *= 1.0 - 0.04 * smoothstep(0.6, 0.9, gn(vec2(vWall.x * 0.9, vWall.y * 0.12) + seed * 9.0));
      float band = (fl > 0.95 && fl < floors + 0.05) ? 1.0 - step(0.05, fract(fl)) * step(fract(fl), 0.96) : 0.0;
      wallc = mix(wallc, style < 0.5 ? vec3(0.33, 0.17, 0.08) : vec3(0.48, 0.44, 0.34), band * 0.5);
      vec4 win = vec4(0.0);
      if (floors > 0.5 && fl >= 0.0 && fl < floors) {
        float fi = floor(fl), bi = floor(vBay.x);
        float r = gh(vec2(bi + seed * 31.0, fi * 1.7 + seed * 13.0)), rf = gh(vec2(seed * 17.0, fi * 3.1));
        float c;
        if (fi < 0.5) c = shop > 0.5 ? (r < 0.35 ? 8.0 : (r < 0.62 ? 11.0 : 10.0)) : (r < 0.6 ? 9.0 : 10.0);
        if (rana > 0.5) c = fi < 0.5 ? (r < 0.5 ? 9.0 : 5.0) : 5.0;
        else if (fi < 0.5) {}
        else if (style < 0.5) c = rf < 0.38 ? 0.0 : (rf < 0.7 ? 1.0 : (rf < 0.86 ? 2.0 : 6.0));
        else c = rf < 0.45 ? 3.0 : (rf < 0.62 ? 4.0 : (rf < 0.76 ? 2.0 : (rf < 0.88 ? 5.0 : (shop > 0.5 ? 7.0 : 3.0))));
        if (r > 0.93 && fi > 0.5) c = -1.0;     // a blank bay now and then
        if (c >= 0.0) {
          vec2 f = fract(vBay);
          vec2 cell = vec2(mod(c, 4.0), floor(c / 4.0));
          vec2 auv = vec2((cell.x + f.x) / 4.0, 1.0 - (cell.y + 1.0 - f.y) / 3.0);
          vec2 gx = dFdx(vBay) / vec2(4.0, 3.0), gy = dFdy(vBay) / vec2(4.0, 3.0);
          win = textureGrad(atlasMap, auv, gx, gy);
          vec4 gl = uNight>.01?textureGrad(glowMap, auv, gx, gy):vec4(0.0);
          vGlow = gl.r * step(0.42, gh(vec2(bi * 3.7 + seed, fi + seed * 5.0)));
          vNeon = gl.g * step(0.2, gh(vec2(bi * 1.3 + seed, fi * 7.0))) * (0.85 + 0.15 * sin(uTime * 3.0 + seed * 20.0 + bi));   // most shop signs glow, with a gentle flicker
          vSign = win.rgb;
        }
      }
      diffuseColor.rgb = mix(wallc, win.rgb, win.a);
      surfaceHeight=mix(dot(brickPaint,vec3(.2126,.7152,.0722))*.6,pat.g*.3,step(.5,style))*(1.0-win.a);`,
    normalMap: SURFACE_NORMAL,
    fragEmissive: `totalEmissiveRadiance += vec3(1.0, 0.68, 0.32) * vGlow * uNight * ${ART.emissive.windows.toFixed(3)} + (vSign * ${ART.emissive.signs.toFixed(3)} + ${ART.emissive.signFloor.toFixed(3)}) * vNeon * uNight;`,
  });

  // ------------------------------------------------------------------ roofs, balconies, trims (vertex colours)
  const detail = toon('#ffffff', { rim: 0.2, key: 'detail', params: { vertexColors: true },
    vertexHead:'attribute float surface; varying float vSurface; varying vec3 vMaterialP;',
    vertexMain:'vSurface=surface;vMaterialP=(modelMatrix*vec4(transformed,1.0)).xyz;',
    fragHead:'varying float vSurface;varying vec3 vMaterialP;float surfaceHeight=0.0;',
    fragMap:`vec3 axis=abs(inverseTransformDirection(normalize(vNormal),viewMatrix));
      vec2 st=axis.y>.55?vMaterialP.xz:(axis.x>axis.z?vMaterialP.zy:vMaterialP.xy);
      vec3 paint=vSurface>1.5?texture2D(uRoof,st/${MYTHIC.surface.roof.toFixed(2)}).rgb:
        (vSurface>.5?texture2D(uWood,st/${MYTHIC.surface.wood.toFixed(2)}).rgb:texture2D(uCobble,st/${MYTHIC.surface.cobble.toFixed(2)}).rgb);
      surfaceHeight=dot(paint,vec3(.2126,.7152,.0722));
      diffuseColor.rgb*=.75+surfaceHeight*.8;`,
    normalMap:SURFACE_NORMAL,
  });

  // ------------------------------------------------------------------ roads
  const roads = toon('#ffffff', {
    rim: 0, key: 'roads', params: { vertexColors: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 },   // overlays drape on the terrain: a depth bias stops z-fighting
    vertexHead: 'attribute vec3 roadw; varying vec2 vRuv; varying vec3 vRw;', vertexMain: 'vRuv = uv; vRw = roadw;',
    normalMap: SURFACE_NORMAL,
    fragHead: 'float surfaceHeight=0.0; varying vec2 vRuv; varying vec3 vRw;' + NOISE,
    fragMap: /* glsl */ `
      float across = vRuv.x, w = vRw.x, cls = floor(vRw.y / 4.0 + 0.01), kind = vRw.y - cls * 4.0;
      float oneway = mod(vRw.z, 2.0), lanes = floor(vRw.z / 2.0 + 0.01);
      float edge = min(across, 1.0 - across) * w, mid = abs(across - 0.5) * w, along = vRuv.y;
      float asphalt = step(kind, 0.5);
      // main roads (secondary+): footpaths, black & yellow kerbs, double yellow centre line, lane dashes — Kathmandu style
      float main = step(1.5, cls) * asphalt * step(7.0, w);
      float foot = main * (1.0 - step(1.5, edge));
      float kerbBand = main * step(1.5, edge) * (1.0 - step(1.85, edge));
      float kerbYellow = step(0.5, fract(along / 1.2));
      float centre = (1.0 - oneway) * step(1.5, cls) * asphalt * (1.0 - smoothstep(0.05, 0.1, abs(mid - 0.16)));
      float nl = max(2.0, lanes > 0.5 ? lanes : (w > 12.0 ? 4.0 : 2.0));
      float laneX = fract(across * nl); float laneLine = main * step(3.5, nl) * step(0.5, fract(along / 6.0)) * (1.0 - smoothstep(0.06, 0.1, min(laneX, 1.0 - laneX) * w / nl)) * step(0.2, abs(across - 0.5));
      float dash = step(0.5, fract(along / 5.0)) * (1.0 - smoothstep(0.07, 0.12, mid)) * step(6.0, w) * asphalt * (1.0 - step(1.5, cls)) * (1.0 - oneway);
      float kerb = (1.0 - smoothstep(0.18, 0.3, edge)) * step(4.5, w) * asphalt * (1.0 - main);
      if (foot > 0.5) { vec2 fp2 = vec2(along, edge); float id; float j = joint(pave(fp2, 0.5, 0.7, id), fp2, 0.03);
        diffuseColor.rgb = mix(vec3(0.72, 0.68, 0.64), vec3(0.84, 0.8, 0.73), id) * mix(0.74, 1.0, j) * (0.92 + 0.1 * gn(fp2 * 0.3)); }
      if (kerbBand > 0.5) diffuseColor.rgb = mix(vec3(0.1, 0.09, 0.1), vec3(1.0, 0.8, 0.12), kerbYellow);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.78, 0.15), centre * 0.95 * (1.0 - foot));
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.93, 0.86), laneLine * 0.85);
      diffuseColor.rgb *= 0.92 + 0.12 * gn(vec2(vRuv.y * 0.4, across * 3.0));
      if (kind > 0.5 && kind < 1.5) { vec2 q = vec2(across * w, vRuv.y) * 3.0; vec2 f = fract(q + vec2(step(1.0, mod(floor(q.y), 2.0)) * 0.5, 0.0));
        diffuseColor.rgb *= mix(0.78, 1.0, smoothstep(0.0, 0.08, f.x) * smoothstep(0.0, 0.1, f.y)); }
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.96, 0.92, 0.8), dash * 0.9);
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.15 + 0.015, kerb);
      vec3 paving=(kind>.5?texture2D(uBrick,vec2(across*w,along)/2.4).rgb:texture2D(uStone,vec2(across*w,along)/3.2).rgb);
      // Preserve road markings; wear breaks up the flat road bed between them.
      float markings=max(max(centre,laneLine),max(dash,kerbBand));
      diffuseColor.rgb=mix(diffuseColor.rgb*(.86+dot(paving,vec3(.2126,.7152,.0722))*.32),diffuseColor.rgb,markings);
      surfaceHeight=dot(paving,vec3(.2126,.7152,.0722))*.5;
      if(kind>.5&&cls<.5){
        vec2 gp=vCloudP;
        vec3 laid=kind<1.5?texture2D(uBrick,gp/${MYTHIC.surface.brick.toFixed(2)}).rgb:texture2D(uEarth,gp/${MYTHIC.surface.earth.toFixed(2)}).rgb;
        vec3 cobble=texture2D(uCobble,gp/${MYTHIC.surface.cobble.toFixed(2)}).rgb;
        float repair=smoothstep(.56,.78,gn(gp*.3+41.0));
        laid=kind<1.5?mix(laid,vec3(.36,.28,.20),.22):laid;
        diffuseColor.rgb=mix(laid,cobble,repair*(kind<1.5?.5:.22));
        float erosion=1.0-smoothstep(.03,.48,edge+(gn(gp*1.4)-.5)*.26);
        vec3 verge=mix(texture2D(uEarth,gp/${MYTHIC.surface.earth.toFixed(2)}).rgb,meadowPaint(gp)*.7,.25);
        diffuseColor.rgb=mix(diffuseColor.rgb,verge,erosion*.8);
        surfaceHeight=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));
      }`,
  });

  // ------------------------------------------------------------------ base street ground (per tile, blended by density/heritage)
  const ground = toon('#ffffff', {
    rim: 0, key: 'ground',
    vertexHead: 'attribute vec2 gnd; varying vec2 vGnd; varying vec3 vWp; varying float vUp;',
    vertexMain: 'vGnd = gnd; vWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vUp = normalize(mat3(modelMatrix) * objectNormal).y;',
    normalMap: SURFACE_NORMAL,
    fragHead: `float surfaceHeight=0.0; varying vec2 vGnd; varying vec3 vWp; varying float vUp; ${NOISE}`,
    fragMap: /* glsl */ `
      vec2 p=vWp.xz;float dens=vGnd.x,core=vGnd.y;
      float macro=gn(p*.045),wear=gn(p*.22+7.0);
      vec3 stone=mix(vec3(.40,.43,.41),texture2D(uStone,p/${MYTHIC.surface.stone.toFixed(2)}).rgb,.6);
      vec3 brick=texture2D(uBrick,p.yx/${MYTHIC.surface.brick.toFixed(2)}).rgb;
      vec3 moss=meadowPaint(p);
      vec3 soil=texture2D(uEarth,p/${MYTHIC.surface.earth.toFixed(2)}).rgb;
      vec3 grass=mix(vec3(.17,.30,.15),moss,.48)*(.88+.24*macro);
      vec3 earth=mix(grass,soil,smoothstep(.38,.66,macro)*.8);
      vec3 cobble=texture2D(uCobble,p/${MYTHIC.surface.cobble.toFixed(2)}).rgb;
      vec3 urban=mix(mix(stone,cobble,.55),brick,smoothstep(.25,.5,core)*.55);
      vec3 col=mix(earth,urban,smoothstep(.14,.38,dens+(macro-.5)*.12));
      col*=.94+.12*wear;
      surfaceHeight=dot(col,vec3(.2126,.7152,.0722));
      diffuseColor.rgb=col;
`,
  });

  // ------------------------------------------------------------------ land-use areas (parks, forest, paddy, plazas...)
  const kinds = AREA_KINDS.map((k) => AREA_STYLE[k]);
  const areas = toon('#ffffff', {
    rim: 0, key: 'areas', params: { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 },
    vertexHead: 'attribute float kind; varying float vKind; varying vec3 vWp;',
    vertexMain: 'vKind = kind; vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    normalMap: SURFACE_NORMAL,
    fragHead: `float surfaceHeight=0.0; varying float vKind; varying vec3 vWp; ${NOISE}
      ${constArray('KA', kinds.map((k) => k.a))} ${constArray('KB', kinds.map((k) => k.b))}
      const float KP[${kinds.length}] = float[${kinds.length}](${kinds.map((k) => k.pattern.toFixed(1)).join(', ')});
      const float KF[${kinds.length}] = float[${kinds.length}](${kinds.map((k) => (k.flowers || 0).toFixed(3)).join(', ')});`,
    fragMap: /* glsl */ `
      int k=int(vKind+.5); vec2 p=vWp.xz;float pt=KP[k];
      float n=gn(p*.12),n2=gn(p*.48);
      vec3 paint=meadowPaint(p);
      vec3 stone=mix(vec3(.40,.43,.41),texture2D(uStone,p/${MYTHIC.surface.stone.toFixed(2)}).rgb,.6);
      vec3 tint=mix(KA[k],KB[k],n);
      vec3 soil=texture2D(uEarth,p/${MYTHIC.surface.earth.toFixed(2)}).rgb;
      vec3 cobble=texture2D(uCobble,p/${MYTHIC.surface.cobble.toFixed(2)}).rgb;
      vec3 grass=mix(tint*1.3,paint,.36);
      float clearing=smoothstep(.48,.72,gn(p*.055+23.0));
      vec3 col=mix(grass,soil,clearing*(pt>.5&&pt<1.5?.7:.33));
      if(pt>1.5&&pt<2.5)col*=.86+.14*sin(p.x*3.0);
      else if(pt>2.5&&pt<3.5)col=mix(tint,stone,.3);
      else if(pt>3.5&&pt<4.5)col=mix(stone,cobble,.7);
      else if(pt>4.5&&pt<5.5)col=mix(stone,soil,.65)*vec3(1.12,1.0,.85);
      else if(pt>5.5)col=mix(tint,stone,.35);
      col*=.94+.12*n2;
      surfaceHeight=dot(col,vec3(.2126,.7152,.0722));
      diffuseColor.rgb=col;
`,
  });

  // ------------------------------------------------------------------ water (ponds, rivers)
  const water = toon(PALETTE.water, {
    rim: 0.6, key: 'water', wet: false, params: { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 },
    vertexHead: 'varying vec3 vWp;', vertexMain: 'vWp = (modelMatrix * vec4(transformed, 1.0)).xyz;',
    fragHead: 'varying vec3 vWp; float vGlint = 0.0; vec3 vShine = vec3(0.0);' + NOISE,
    fragMap: /* glsl */ `
      vec2 p = vWp.xz;
      // two wave layers drifting in different directions (rivers seem to flow), plus fine ripples
      float w1 = gn(p * 0.35 + vec2(uTime * 0.32, uTime * 0.12)), w2 = gn(p * 0.9 - vec2(uTime * 0.18, -uTime * 0.27)), w3 = gn(p * 2.6 + uTime * 0.6);
      float w = w1 * 0.55 + w2 * 0.3 + w3 * 0.15;
      vec3 deep = diffuseColor.rgb * 0.62, shallow = diffuseColor.rgb * 1.18;
      diffuseColor.rgb = mix(deep, shallow, w);
      // sky sheen at grazing angles (fresnel) — the surface reads as water from any distance
      float fres = pow(1.0 - clamp(abs(normalize(vViewPosition).z), 0.0, 1.0), 3.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, mix(vec3(0.78, 0.9, 1.0), vec3(0.18, 0.2, 0.38), uNight), fres * 0.55);
      // foam-white crests
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), smoothstep(0.86, 0.97, w1 * 0.65 + w2 * 0.35) * 0.3);
      // rain: little rings popping all over the surface
      vec2 rc = floor(p * 1.6); vec2 rf = fract(p * 1.6) - 0.5; float rt = fract(uTime * 0.9 + gh(rc) * 7.0);
      float ring = smoothstep(0.05, 0.0, abs(length(rf + (vec2(gh(rc + 1.3), gh(rc + 2.7)) - 0.5) * 0.4) - rt * 0.45)) * (1.0 - rt) * step(0.55, gh(rc + 9.1));
      diffuseColor.rgb += ring * uWet * 0.35;
      // sun glints by day, the city's lights shimmering by night (these glow through the bloom)
      float sp = gn(p * 7.0 + vec2(uTime * 1.3, -uTime)) * gn(p * 5.3 - uTime * 0.8);
      vGlint = smoothstep(0.7, 0.85, sp) * (0.12 + fres * 1.1);
      vShine = mix(vec3(1.6, 1.5, 1.2) * (1.0 - uNight), mix(vec3(1.4, 0.7, 0.3), vec3(0.6, 0.4, 1.4), gh(floor(p * 0.5))) * uNight, uNight);`,
    fragEmissive: 'totalEmissiveRadiance += vShine * vGlint;',
  });

  return { walls, detail, roads, ground, areas, water };
}
