/**
 * Tiny vector glyphs for the compass and the valley map (drawn with Canvas2D so they stay crisp at any size).
 * drawIcon(ctx, name, x, y, size, color)
 */
const PATHS = {
  temple(c, s) { // three-tier pagoda
    for (let i = 0; i < 3; i++) { const w = s * (0.95 - i * 0.25), y = s * (0.35 - i * 0.32); c.moveTo(-w / 2, y); c.lineTo(0, y - s * 0.28); c.lineTo(w / 2, y); c.closePath(); }
    c.rect(-s * 0.18, s * 0.35, s * 0.36, s * 0.2);
  },
  stupa(c, s) { c.moveTo(-s * 0.5, s * 0.45); c.quadraticCurveTo(0, -s * 0.25, s * 0.5, s * 0.45); c.closePath(); c.rect(-s * 0.1, -s * 0.5, s * 0.2, s * 0.45); },
  tower(c, s) { c.moveTo(-s * 0.18, s * 0.5); c.lineTo(-s * 0.1, -s * 0.35); c.lineTo(0, -s * 0.55); c.lineTo(s * 0.1, -s * 0.35); c.lineTo(s * 0.18, s * 0.5); c.closePath(); },
  tole(c, s) { c.moveTo(-s * 0.42, 0); c.lineTo(0, -s * 0.45); c.lineTo(s * 0.42, 0); c.closePath(); c.rect(-s * 0.32, 0, s * 0.64, s * 0.45); },
  park(c, s) { c.arc(0, -s * 0.12, s * 0.36, 0, Math.PI * 2); c.rect(-s * 0.07, s * 0.15, s * 0.14, s * 0.35); },
  water(c, s) { c.moveTo(0, -s * 0.5); c.quadraticCurveTo(s * 0.45, s * 0.05, 0, s * 0.45); c.quadraticCurveTo(-s * 0.45, s * 0.05, 0, -s * 0.5); },
  palace(c, s) { c.rect(-s * 0.5, -s * 0.05, s, s * 0.5); c.moveTo(-s * 0.5, -s * 0.05); c.lineTo(0, -s * 0.45); c.lineTo(s * 0.5, -s * 0.05); },
  plane(c, s) { c.moveTo(0, -s * 0.5); c.lineTo(s * 0.08, -s * 0.1); c.lineTo(s * 0.5, s * 0.1); c.lineTo(s * 0.08, s * 0.08); c.lineTo(s * 0.06, s * 0.35); c.lineTo(s * 0.2, s * 0.48); c.lineTo(-s * 0.2, s * 0.48); c.lineTo(-s * 0.06, s * 0.35); c.lineTo(-s * 0.08, s * 0.08); c.lineTo(-s * 0.5, s * 0.1); c.lineTo(-s * 0.08, -s * 0.1); c.closePath(); },
  paw(c, s) {
    c.ellipse(0, s * 0.18, s * 0.26, s * 0.22, 0, 0, Math.PI * 2);
    for (const [x, y] of [[-0.3, -0.12], [-0.11, -0.32], [0.11, -0.32], [0.3, -0.12]]) { c.moveTo(x * s + s * 0.1, y * s); c.ellipse(x * s, y * s, s * 0.1, s * 0.13, 0, 0, Math.PI * 2); }
  },
  pin(c, s) { c.moveTo(0, s * 0.5); c.bezierCurveTo(-s * 0.55, -s * 0.05, -s * 0.38, -s * 0.5, 0, -s * 0.5); c.bezierCurveTo(s * 0.38, -s * 0.5, s * 0.55, -s * 0.05, 0, s * 0.5); c.moveTo(s * 0.13, -s * 0.18); c.arc(0, -s * 0.18, s * 0.13, 0, Math.PI * 2); },
  vet(c, s) { c.rect(-s * 0.14, -s * 0.45, s * 0.28, s * 0.9); c.rect(-s * 0.45, -s * 0.14, s * 0.9, s * 0.28); },
  mission(c, s) { c.moveTo(0, -s * 0.5); c.lineTo(s * 0.4, 0); c.lineTo(0, s * 0.5); c.lineTo(-s * 0.4, 0); c.closePath(); },
  landmark(c, s) { c.moveTo(0, -s * 0.5); c.lineTo(s * 0.4, s * 0.45); c.lineTo(-s * 0.4, s * 0.45); c.closePath(); },
};

/** Icon for a temple model name from the map data. */
export function iconForModel(model) {
  if (/stupa/.test(model)) return 'stupa';
  if (model === 'tower') return 'tower';
  return 'temple';
}

export function drawIcon(c, name, x, y, size, color = '#f2c35b', outline = 'rgba(20,12,30,0.85)') {
  c.save(); c.translate(x, y); c.beginPath();
  (PATHS[name] || PATHS.landmark)(c, size);
  c.lineJoin = 'round'; c.lineWidth = Math.max(2, size * 0.16); c.strokeStyle = outline; c.stroke();
  c.fillStyle = color; c.fill();
  c.restore();
}
