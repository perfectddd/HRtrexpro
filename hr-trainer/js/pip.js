import { ZONE_COLORS } from './zones.js';
import { fmtTime } from './ui/dom.js';

// Layout units are 320×180; the canvas is drawn at 2× so the PiP window stays sharp.
const W = 320, H = 180, SCALE = 2;
const DOT = { connected: '#34d399', reconnecting: '#fbbf24', disconnected: '#fb7185' };

// Floating mini view: draws state onto a canvas, streams it into a <video>,
// and shows that video in the OS Picture-in-Picture window.
export class PipView {
  static isSupported() {
    return !!(document.pictureInPictureEnabled && HTMLCanvasElement.prototype.captureStream);
  }

  constructor() {
    this.canvas = Object.assign(document.createElement('canvas'), { width: W * SCALE, height: H * SCALE });
    this.video = Object.assign(document.createElement('video'), { muted: true, playsInline: true });
    Object.assign(this.video.style, { position: 'fixed', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none', left: '0', top: '0' });
    this.view = null;
    this.isOpen = false;
    this._lastDraw = 0;
    this.video.addEventListener('leavepictureinpicture', () => { this.isOpen = false; });
  }

  async open() {
    if (!this.video.isConnected) document.body.append(this.video);
    if (!this.video.srcObject) this.video.srcObject = this.canvas.captureStream(10);
    this._draw();
    await this.video.play();
    await this.video.requestPictureInPicture();
    this.isOpen = true;
  }

  async close() {
    if (document.pictureInPictureElement === this.video) await document.exitPictureInPicture().catch(() => {});
    this.isOpen = false;
  }

  render(view) {
    this.view = view;
    const now = performance.now();
    if (this.isOpen && now - this._lastDraw >= 90) {
      this._lastDraw = now;
      this._draw();
    }
  }

  _draw() {
    const v = this.view ?? { bpm: null, zone: 0, stepName: '', stepRemainingSec: null, totalElapsedSec: 0, connection: 'disconnected' };
    const c = this.canvas.getContext('2d');
    const bg = v.zoneColor ?? ZONE_COLORS[v.zone] ?? ZONE_COLORS[0];
    const fg = v.textColor ?? '#ffffff';
    const font = (w, px) => `${w} ${px}px system-ui, -apple-system, "Segoe UI", "Noto Sans Thai", sans-serif`;
    c.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    c.fillStyle = bg;
    c.fillRect(0, 0, W, H);
    c.fillStyle = fg;
    c.strokeStyle = fg;
    c.textBaseline = 'alphabetic';

    // Top row: watch clock (left), connection dot (right).
    if (v.watchClock) {
      c.lineWidth = 1.6;
      c.beginPath(); c.arc(21, 22, 7, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(21, 18); c.lineTo(21, 22); c.lineTo(24, 24); c.stroke();
      c.textAlign = 'left';
      c.font = font(500, 16);
      c.fillText(v.watchClock, 34, 28);
    }
    c.fillStyle = DOT[v.connection] ?? DOT.disconnected;
    c.beginPath(); c.arc(W - 20, 22, 6, 0, Math.PI * 2); c.fill();
    c.strokeStyle = fg; c.lineWidth = 2;
    c.beginPath(); c.arc(W - 20, 22, 6, 0, Math.PI * 2); c.stroke();
    c.fillStyle = fg;

    // Bottom-left: heart rate.
    c.textAlign = 'left';
    c.font = font(300, 76);
    c.globalAlpha = v.holding ? 0.5 : 1;
    c.fillText(v.bpm == null ? '--' : String(v.bpm), 14, 118);
    c.globalAlpha = 1;
    c.font = font(600, 15);
    c.fillText(v.zoneTh || 'bpm', 18, 144);
    if (v.zoneEn) {
      c.font = font(400, 13);
      c.fillText(v.zoneEn, 18, 162);
    }

    // Bottom-right: step, step time, total.
    c.textAlign = 'right';
    c.font = font(500, 15);
    c.fillText(String(v.stepLabel ?? v.stepName ?? '').slice(0, 16), W - 16, 92);
    c.font = font(400, 38);
    c.fillText(fmtTime(v.stepRemainingSec), W - 16, 132);
    c.font = font(400, 15);
    c.fillText(`รวม ${fmtTime(v.totalElapsedSec)}`, W - 16, 158);
  }
}
