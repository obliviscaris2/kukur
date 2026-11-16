/**
 * Hand-painted facade atlas (drawn on a canvas at startup — edit the painters to restyle windows & shops).
 * Layout: 4 columns x 3 rows, each cell = one bay of one floor (2.6 m x 2.9 m).
 *   row 0: upper floors — tiki-jhyal lattice | sanjhya triple window | painted shutters | modern grilled window
 *   row 1: upper floors — balcony door      | Rana-era arched window | corn & chilli window | lodge window + sign
 *   row 2: ground floors — kirana shop      | carved door + marigolds | rolling shutter     | momo & tea stall
 * A second canvas (glow) marks which pixels light up at night.
 */
import * as THREE from 'three';
import { ART } from '../config/index.js';

export const ATLAS = { cellW: 256, cellH: 288, cols: 4, rows: 3 };
const INK = ART.facade.ink;
let TIMBER=null;

function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function box(c,x,y,w,h,fill,r=2,lw=1) {
  r=Math.min(r,2.5);c.save();rr(c,x,y,w,h,r);
  c.shadowColor='rgba(8,15,18,.6)';c.shadowBlur=3;c.shadowOffsetY=2;
  c.fillStyle=fill;c.fill();c.shadowBlur=0;c.shadowOffsetY=0;c.clip();
  if(TIMBER&&typeof fill==='string'&&/^#[0-9a-f]{6}$/i.test(fill)){
    const n=parseInt(fill.slice(1),16),red=n>>16,green=(n>>8)&255,blue=n&255;
    if(red>green*1.15&&green>blue*1.1){c.globalAlpha=.52;c.globalCompositeOperation='soft-light';c.drawImage(TIMBER,x,y,w,h);c.globalAlpha=1;c.globalCompositeOperation='source-over';}
  }
  const light=c.createLinearGradient(x,y,x+w*.25,y+h);light.addColorStop(0,'rgba(242,217,170,.17)');light.addColorStop(.18,'rgba(0,0,0,0)');light.addColorStop(1,'rgba(6,13,16,.28)');
  c.fillStyle=light;c.fillRect(x,y,w,h);c.restore();
  c.strokeStyle='rgba(226,201,159,.32)';c.lineWidth=.8;c.beginPath();c.moveTo(x+2,y+1);c.lineTo(x+w-2,y+1);c.stroke();
  if(lw){rr(c,x,y,w,h,r);c.lineWidth=Math.min(lw*ART.facade.stroke,1.2);c.strokeStyle=INK;c.stroke();}
}
function circ(c, x, y, r, fill, lw = 0) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = fill; c.fill(); if (lw) { c.lineWidth = lw*ART.facade.stroke; c.strokeStyle = INK; c.stroke(); } }
function flowers(c, x, y, w) {
  box(c, x, y, w, 18, '#7a4420', 5, 4);
  const cols = ['#d59650', '#bb6b73', '#ffd23f', '#ff6f3c', '#ffffff'];
  for (let i = 0; i < w / 14; i++) {
    const fx = x + 8 + i * 14 + Math.sin(i * 7) * 3, fy = y - 4 + Math.cos(i * 3) * 4;
    circ(c, fx, fy + 4, 7, '#3f9d4a'); circ(c, fx, fy - 3, 6, cols[i % cols.length], 3);
  }
}
function lintel(c, cx, y, w) {
  box(c, cx - w / 2 - 34, y, w + 68, 20, '#6b3a1c', 6, 5);
  box(c, cx - w / 2 - 42, y - 6, 22, 30, '#4a2812', 6, 4); box(c, cx + w / 2 + 20, y - 6, 22, 30, '#4a2812', 6, 4);
  for (let i = 0; i < (w + 40) / 13; i++) box(c, cx - w / 2 - 18 + i * 13, y - 16, 9, 12, '#8a4f24', 3, 2.5);
}
function lattice(c, x, y, w, h) {
  c.save(); rr(c, x, y, w, h, 4); c.clip(); c.fillStyle = '#24130a'; c.fillRect(x, y, w, h);
  c.strokeStyle = '#c47b35'; c.lineWidth = 4;
  for (let k = -h; k < w + h; k += 16) { c.beginPath(); c.moveTo(x + k, y); c.lineTo(x + k + h, y + h); c.stroke(); c.beginPath(); c.moveTo(x + k, y + h); c.lineTo(x + k + h, y); c.stroke(); }
  c.fillStyle = '#f2b64e';
  for (let i = 8; i < w; i += 16) for (let j = 8; j < h; j += 16) { c.beginPath(); c.arc(x + i, y + j, 2.2, 0, 7); c.fill(); }
  c.restore();
}
const NEON = ART.lanterns.signs;
let GLOW = null, neonI = 0;          // glow canvas while painting: R = warm window light, G = neon (sign glows in its own colour)
function sign(c, x, y, w, h, bg, fg, text, sub) {
  box(c, x, y, w, h, bg, 8, 5);
  // neon tube just inside the board edge (Thamel at night)
  const neon = NEON[neonI++ % NEON.length];
  rr(c, x + 6, y + 5, w - 12, h - 10, 6); c.lineWidth = 3; c.strokeStyle = neon; c.stroke();
  if (GLOW) { GLOW.fillStyle = 'rgb(0,150,0)'; rr(GLOW, x, y, w, h, 8); GLOW.fill(); GLOW.lineWidth = 5; GLOW.strokeStyle = 'rgb(0,255,0)'; rr(GLOW, x + 6, y + 5, w - 12, h - 10, 6); GLOW.stroke(); }
  c.fillStyle = fg; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.font = `800 ${Math.round(h * (sub ? 0.5 : 0.62))}px Mukta, "Noto Sans Devanagari", sans-serif`;
  c.fillText(text, x + w / 2, y + h * (sub ? 0.38 : 0.52));
  if (sub) { c.font = `700 ${Math.round(h * 0.26)}px Mukta, sans-serif`; c.fillText(sub, x + w / 2, y + h * 0.78); }
}
function awning(c, x, y, w, a, b) {
  const n = 7, sw = w / n;
  for (let i = 0; i < n; i++) { c.fillStyle = i % 2 ? b : a; c.fillRect(x + i * sw, y, sw + 1, 34); }
  for (let i = 0; i < n; i++) { c.beginPath(); c.arc(x + i * sw + sw / 2, y + 34, sw / 2, 0, Math.PI); c.fillStyle = i % 2 ? b : a; c.fill(); c.lineWidth = 3; c.strokeStyle = INK; c.stroke(); }
  c.lineWidth = 4; c.strokeStyle = INK; c.strokeRect(x, y, w, 34);
}
function goods(c, x, y, w, h) {
  c.fillStyle = '#3a2416'; c.fillRect(x, y, w, h);
  const cols = ['#b65748', '#f4a261', '#39766d', '#e9c46a', '#746782', '#ae6a7c', '#5b826d', '#f8f9fa', '#277da1'];
  for (let s = 0; s < 3; s++) {
    const sy = y + 18 + (s * (h - 20)) / 3;
    c.fillStyle = '#7a4a2a'; c.fillRect(x + 4, sy + 34, w - 8, 6);
    let gx = x + 8;
    while (gx < x + w - 16) { const gw = 10 + ((gx * 7 + s * 13) % 14), gh = 16 + ((gx * 3 + s) % 16); box(c, gx, sy + 34 - gh, gw, gh, cols[(gx + s * 5) % cols.length], 3, 2); gx += gw + 3; }
  }
}
const glass = (c, x, y, w, h) => { const g = c.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, '#667d7c'); g.addColorStop(1, '#142b32'); return g; };

const PAINTERS = [
  // ---- row 0
  (c, g) => { const cx = 128, x = 52, y = 70, w = 152, h = 116;
    lintel(c, cx, y - 30, w); box(c, x - 12, y - 12, w + 24, h + 24, '#6b3a1c', 8, 6); lattice(c, x, y, w, h);
    c.lineWidth = 5; c.strokeStyle = INK; rr(c, x, y, w, h, 4); c.stroke(); flowers(c, x - 16, y + h + 16, w + 32);
    g.fillStyle = '#fff'; g.fillRect(x + 4, y + 4, w - 8, h - 8); },
  (c, g) => { const cx = 128; box(c, 30, 196, 196, 16, '#6b3a1c', 5, 4);
    for (const [x, w, y, h] of [[96, 64, 74, 120], [40, 44, 104, 90], [172, 44, 104, 90]]) {
      box(c, x - 8, y - 8, w + 16, h + 16, '#6b3a1c', 6, 5); box(c, x, y, w, h, '#2a160c', 4, 4);
      c.strokeStyle = '#a8642e'; c.lineWidth = 4; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(x + (i * w) / 4, y + 2); c.lineTo(x + (i * w) / 4, y + h - 2); c.stroke(); }
      g.fillStyle = '#fff'; g.fillRect(x + 3, y + 3, w - 6, h - 6); }
    c.beginPath(); c.arc(cx, 66, 46, Math.PI, 0); c.closePath(); c.fillStyle = '#d62828'; c.fill(); c.lineWidth = 5; c.strokeStyle = INK; c.stroke();
    c.beginPath(); c.arc(cx, 66, 30, Math.PI, 0); c.closePath(); c.fillStyle = '#f2b64e'; c.fill(); c.stroke(); circ(c, cx, 52, 8, '#d62828', 3); lintel(c, cx, 70, 150); },
  (c, g) => { const x = 88, y = 74, w = 80, h = 112;
    box(c, x - 10, y - 10, w + 20, h + 20, '#f5efe4', 6, 5); box(c, x, y, w, h, '#2a160c', 3, 4);
    c.fillStyle = '#ae6a7c'; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 30, y + 40, x + 6, y + h); c.lineTo(x, y + h); c.fill();
    g.fillStyle = '#fff'; g.fillRect(x + 4, y + 4, w - 8, h - 8);
    for (const s of [-1, 1]) { const sx = s < 0 ? x - 58 : x + w + 8; box(c, sx, y - 4, 50, h + 8, '#39766d', 5, 5);
      c.strokeStyle = '#1d6f66'; c.lineWidth = 3; for (let j = y + 10; j < y + h; j += 12) { c.beginPath(); c.moveTo(sx + 6, j); c.lineTo(sx + 44, j); c.stroke(); } }
    box(c, x - 18, y + h + 12, w + 36, 12, '#f5efe4', 4, 4); box(c, x + 22, y + h - 6, 36, 20, '#c8553d', 5, 4);
    circ(c, x + 32, y + h - 12, 9, '#3f9d4a', 3); circ(c, x + 46, y + h - 16, 10, '#5cb85c', 3); circ(c, x + 40, y + h - 24, 6, '#bb6b73', 3); },
  (c, g) => { const x = 58, y = 70, w = 140, h = 124;
    box(c, x - 8, y - 8, w + 16, h + 16, '#f5efe4', 6, 5); box(c, x, y, w, h, glass(c, x, y, w, h), 3, 4);
    c.fillStyle = 'rgba(200,218,207,0.12)'; c.beginPath(); c.moveTo(x + 20, y + h); c.lineTo(x + 60, y); c.lineTo(x + 80, y); c.lineTo(x + 40, y + h); c.fill();
    g.fillStyle = '#888'; g.fillRect(x + 4, y + 4, w - 8, h - 8);
    c.strokeStyle = INK; c.lineWidth = 4;
    for (let i = 1; i < 6; i++) { c.beginPath(); c.moveTo(x + (i * w) / 6, y); c.lineTo(x + (i * w) / 6, y + h); c.stroke(); }
    for (let j = 1; j < 4; j++) { c.beginPath(); c.moveTo(x, y + (j * h) / 4); c.lineTo(x + w, y + (j * h) / 4); c.stroke(); }
    box(c, x - 26, y - 34, w + 52, 18, '#d8d2c4', 4, 5); },
  // ---- row 1
  (c, g) => { const x = 82, y = 40, w = 92, h = 190; // balcony door with railing
    box(c, x - 10, y - 10, w + 20, h + 10, '#f5efe4', 6, 5); box(c, x, y, w, h, glass(c, x, y, w, h), 3, 4);
    c.fillStyle = '#c59b50'; c.fillRect(x + 4, y + 4, 26, h - 8); c.fillStyle = '#e9b800'; c.fillRect(x + 4, y + 4, 26, 10);
    g.fillStyle = '#fff'; g.fillRect(x + 4, y + 4, w - 8, h - 8);
    box(c, 30, y + h - 6, 196, 14, '#d8d2c4', 4, 5);
    c.strokeStyle = '#1d3557'; c.lineWidth = 5; c.beginPath(); c.moveTo(34, y + h - 52); c.lineTo(222, y + h - 52); c.stroke();
    for (let i = 0; i < 12; i++) { c.beginPath(); c.moveTo(38 + i * 16, y + h - 52); c.lineTo(38 + i * 16, y + h - 6); c.stroke(); }
    for (const px of [44, 196]) { box(c, px - 12, y + h - 30, 26, 24, '#c8553d', 5, 4); circ(c, px, y + h - 38, 12, '#3f9d4a', 3); circ(c, px + 4, y + h - 46, 6, '#bb6b73', 2); } },
  (c, g) => { const x = 84, y = 66, w = 88, h = 140; // Rana-era arched window
    c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(x - 18, y + h + 16); c.lineTo(x - 18, y + 30); c.arc(x + w / 2, y + 30, w / 2 + 18, Math.PI, 0); c.lineTo(x + w + 18, y + h + 16); c.closePath(); c.fill(); c.lineWidth = 5; c.strokeStyle = INK; c.stroke();
    c.fillStyle = '#2a160c'; c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + 30); c.arc(x + w / 2, y + 30, w / 2, Math.PI, 0); c.lineTo(x + w, y + h); c.closePath(); c.fill(); c.stroke();
    g.fillStyle = '#fff'; g.fillRect(x + 6, y + 30, w - 12, h - 34);
    for (const s of [0, 1]) { box(c, x + 6 + s * (w / 2 - 6), y + 34, w / 2 - 6, h - 40, '#3f9d4a', 4, 4); c.strokeStyle = '#2b7a3a'; c.lineWidth = 3; for (let j = y + 44; j < y + h - 8; j += 10) { c.beginPath(); c.moveTo(x + 10 + s * (w / 2 - 6), j); c.lineTo(x + w / 2 - 4 + s * (w / 2 - 6), j); c.stroke(); } }
    circ(c, x + w / 2, y + 4, 9, '#c59b50', 3); box(c, x - 26, y + h + 14, w + 52, 14, '#ffffff', 4, 4); },
  (c, g) => { const x = 74, y = 76, w = 108, h = 112; // window with corn & chillies hung to dry
    box(c, x - 10, y - 10, w + 20, h + 20, '#6b3a1c', 6, 5); box(c, x, y, w, h, '#2a160c', 3, 4);
    g.fillStyle = '#fff'; g.fillRect(x + 4, y + 4, w - 8, h - 8);
    c.strokeStyle = '#7a4a2a'; c.lineWidth = 4; c.beginPath(); c.moveTo(x - 30, y - 22); c.lineTo(x + w + 30, y - 22); c.stroke();
    for (let i = 0; i < 9; i++) { const cx = x - 20 + i * 18;
      if (i % 2) { for (let j = 0; j < 6; j++) circ(c, cx + Math.sin(j) * 2, y - 14 + j * 12, 5, '#b65748', 2); }
      else { rr(c, cx - 7, y - 18, 14, 54, 7); c.fillStyle = '#c59b50'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = INK; c.stroke(); } }
    box(c, x - 16, y + h + 12, w + 32, 12, '#6b3a1c', 4, 4); },
  (c, g) => { const x = 46, y = 80, w = 120, h = 108; // lodge window + hanging sign
    box(c, x - 8, y - 8, w + 16, h + 16, '#f5efe4', 6, 5); box(c, x, y, w, h, glass(c, x, y, w, h), 3, 4);
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(x + 14, y + 6, 14, h - 12); g.fillStyle = '#aaa'; g.fillRect(x + 4, y + 4, w - 8, h - 8);
    c.strokeStyle = INK; c.lineWidth = 4; c.beginPath(); c.moveTo(x + w / 2, y); c.lineTo(x + w / 2, y + h); c.stroke();
    box(c, 186, 50, 54, 170, '#b65748', 8, 5); c.save(); c.translate(213, 135); c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '800 30px Mukta, sans-serif'; for (const [i, ch] of [...'LODGE'].entries()) c.fillText(ch, 0, -64 + i * 32); c.restore(); },
  // ---- row 2 (ground floors)
  (c, g) => { sign(c, 26, 18, 204, 46, '#c59b50', '#c0392b', 'किराना पसल', 'KIRANA'); goods(c, 20, 112, 216, 140); awning(c, 14, 74, 228, '#b65748', '#fff4e6');
    box(c, 20, 236, 216, 46, '#7a4420', 5, 5); for (let i = 0; i < 6; i++) box(c, 30 + i * 34, 220, 26, 18, ['#c59b50', '#b65748', '#39766d'][i % 3], 4, 3);
    g.fillStyle = '#fff'; g.fillRect(24, 116, 208, 110); },
  (c, g) => { const x = 70, y = 96, w = 116, h = 186;
    box(c, x - 14, y - 14, w + 28, h + 14, '#6b3a1c', 8, 6); box(c, x, y, w / 2, h, '#8a4f24', 4, 4); box(c, x + w / 2, y, w / 2, h, '#8a4f24', 4, 4);
    for (const dx of [0, w / 2]) for (let j = 0; j < 3; j++) box(c, x + dx + 10, y + 14 + j * 58, w / 2 - 20, 44, '#a8642e', 6, 3);
    circ(c, x + w / 2 - 10, y + 100, 5, '#f2b64e', 2); circ(c, x + w / 2 + 10, y + 100, 5, '#f2b64e', 2); lintel(c, x + w / 2, y - 34, w);
    for (let i = 0; i < 13; i++) { const t = i / 12; circ(c, x - 8 + t * (w + 16), y - 6 + Math.sin(t * Math.PI) * 26, 7, i % 2 ? '#d59650' : '#ffb703', 2.5); }
    circ(c, x + w / 2, y - 66, 9, '#d62828'); },
  (c, g) => { sign(c, 22, 22, 212, 44, '#446984', '#fff', 'मोबाइल · रिचार्ज'); box(c, 22, 80, 212, 30, '#cfd6dc', 8, 5); box(c, 28, 108, 200, 176, '#3fb8af', 2, 5);
    c.strokeStyle = '#1d7f78'; c.lineWidth = 4; for (let j = 116; j < 284; j += 11) { c.beginPath(); c.moveTo(30, j); c.lineTo(226, j); c.stroke(); } box(c, 118, 264, 20, 16, '#f2b64e', 3, 3); },
  (c, g) => { sign(c, 26, 16, 204, 48, '#2a9d4b', '#fff', 'मःम · चिया', 'MOMO · TEA'); c.fillStyle = '#2b1810'; c.fillRect(22, 112, 212, 170); awning(c, 14, 72, 228, '#2a9d4b', '#c59b50');
    box(c, 22, 226, 212, 56, '#7a4420', 5, 5); for (let i = 0; i < 4; i++) box(c, 42, 188 - i * 14, 52, 16, '#cfd6dc', 5, 3);
    c.fillStyle = 'rgba(255,255,255,0.6)'; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(60 + i * 6, 120 - i * 10, 9 + i * 2, 0, 7); c.fill(); }
    box(c, 140, 176, 34, 40, '#e9c46a', 6, 4); for (let i = 0; i < 5; i++) box(c, 112 + i * 22, 208, 14, 18, 'rgba(255,240,200,0.9)', 3, 2);
    g.fillStyle = '#fff'; g.fillRect(26, 116, 204, 100); },
];

/** Paint the atlas. Returns { map, glow } textures. */
export async function buildFacadeAtlas(surfaces) {
  TIMBER=surfaces?.wood.image||null;
  try { await document.fonts.load('800 40px Mukta'); } catch {}
  const { cellW, cellH, cols, rows } = ATLAS, W = cellW * cols, H = cellH * rows;
  const cv = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const gv = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const c = cv.getContext('2d'), g = gv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  PAINTERS.forEach((paint, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    for (const ctx of [c, g]) { ctx.save(); ctx.translate(col * cellW, row * cellH); ctx.beginPath(); ctx.rect(0, 0, cellW, cellH); ctx.clip(); }
    GLOW = g; paint(c, g); GLOW = null;
    c.restore(); g.restore();
  });
  // Sun-faded paint and very fine static grain, baked once into the existing atlas (no extra texture/pass).
  const image=c.getImageData(0,0,W,H),d=image.data,F=ART.facade,stone=[190,179,158];
  for(let i=0;i<d.length;i+=4){
    if(!d[i+3])continue;
    const l=d[i]*.2126+d[i+1]*.7152+d[i+2]*.0722;
    const n=Math.sin(i*.1271+17.17)*43758.5453,grain=((n-Math.floor(n))*2-1)*F.grain;
    for(let k=0;k<3;k++)d[i+k]=(l+(d[i+k]-l)*F.saturation)*(1-F.weathering)+stone[k]*F.weathering+grain;
  }
  c.putImageData(image,0,0);
  const tex = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4; t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  };
  return { map: tex(cv, true), glow: tex(gv, false) };
}

/** Tiling wall pattern: R = brick courses (Newari dachi apa), G = plaster mottling. */
export function wallPattern() {
  const S = 256, cv = Object.assign(document.createElement('canvas'), { width: S, height: S }), c = cv.getContext('2d');
  c.fillStyle = 'rgb(255,255,0)'; c.fillRect(0, 0, S, S);
  const rows = 16, bh = S / rows;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * 16;
    for (let x = -32; x < S + 32; x += 32) { const v = 200 + ((x * 13 + r * 7) % 55); c.fillStyle = `rgb(${v},255,0)`; c.fillRect(x + off + 2, r * bh + 2, 28, bh - 3); }
    c.fillStyle = 'rgb(150,255,0)'; c.fillRect(0, r * bh, S, 2);
  }
  c.globalCompositeOperation = 'multiply';
  for (let i = 0; i < 70; i++) { const v = 215 + Math.random() * 40; c.fillStyle = `rgb(255,${v | 0},255)`; c.beginPath(); c.ellipse(Math.random() * S, Math.random() * S, 8 + Math.random() * 30, 6 + Math.random() * 20, Math.random() * 3, 0, 7); c.fill(); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
