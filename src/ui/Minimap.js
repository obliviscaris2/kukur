/**
 * Rotating minimap composed from the per-tile bitmaps the tile worker paints (so it covers the whole valley
 * without one giant image). North marker, pup arrow, landmark dots.
 */
export class Minimap {
  constructor(canvas, streamer) {
    this.c = canvas.getContext('2d'); this.streamer = streamer; this.size = canvas.width; this._t = 0;
    this.zoom = 1.6; // pixels per tile-bitmap pixel
  }
  update(dt, pup, cam) {
    this._t -= dt; if (this._t > 0) return; this._t = 0.08;
    const c = this.c, W = this.size, tile = this.streamer.size, px = 128 / tile; // bitmap px per metre
    c.save(); c.clearRect(0, 0, W, W);
    c.beginPath(); c.arc(W / 2, W / 2, W / 2 - 3, 0, 7); c.clip();
    c.fillStyle = '#e9dcc4'; c.fillRect(0, 0, W, W);
    c.translate(W / 2, W / 2); c.rotate(cam.yaw - Math.PI); c.scale(this.zoom, this.zoom);
    c.imageSmoothingEnabled = true;
    for (const t of this.streamer.ready()) {
      const ox = (t.tx * tile - pup.pos.x) * px, oz = (t.tz * tile - pup.pos.z) * px;
      if (Math.abs(ox) > 400 || Math.abs(oz) > 400) continue;
      if (t.data.minimap) c.drawImage(t.data.minimap, ox, oz, 128 + 0.5, 128 + 0.5);
    }
    c.restore();
    c.save(); c.translate(W / 2, W / 2); c.rotate(cam.yaw - pup.heading);
    c.fillStyle = '#f3d29b'; c.strokeStyle = '#183c40'; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(0, -11); c.lineTo(8, 8); c.lineTo(0, 4); c.lineTo(-8, 8); c.closePath(); c.fill(); c.stroke(); c.restore();
    const a = -(cam.yaw - Math.PI), nx = W / 2 + Math.sin(a) * (W / 2 - 14), ny = W / 2 - Math.cos(a) * (W / 2 - 14);
    c.fillStyle = '#e8d7b4'; c.font = '600 14px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('N', nx, ny);
    c.lineWidth = 1.5; c.strokeStyle = '#c0a573'; c.beginPath(); c.arc(W / 2, W / 2, W / 2 - 3, 0, 7); c.stroke();
  }
}
