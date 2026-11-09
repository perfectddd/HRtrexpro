import { ZONE_COLORS } from './zones.js';
import { fmtTime } from './ui/dom.js';

const W = 320, H = 180;
const DOT = { connected: '#4caf50', reconnecting: '#ffc107', disconnected: '#f44336' };

// Floating mini view: draws state onto a canvas, streams it into a <video>,
// and shows that video in the OS Picture-in-Picture window.
export class PipView {
  static isSupported() {
    return !!(document.pictureInPictureEnabled && HTMLCanvasElement.prototype.captureStream);
  }

  constructor() {
    this.canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
    this.video = Object.assign(document.createElement('video'), { muted: true, playsInline: true });
    Object.assign(this.video.style, { position: 'fixed', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none', left: '0', top: '0' });
    this.view = null;
    this.isOpen = false;
    this._lastDraw = 0;
    this.video.addEventListener('leavepictureinpicture', () => { this.isOpen = false; });
  }

  async open() {
    if (!this.video.isConnected) document.body.append(this.video);
    if (!this.video.srcObject) this.video.srcObject = this.canvas.captureStream(4);
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
    if (this.isOpen && now - this._lastDraw >= 240) {
      this._lastDraw = now;
      this._draw();
    }
  }

  _draw() {
    const v = this.view ?? { bpm: null, zone: 0, stepName: '', stepRemainingSec: null, totalElapsedSec: 0, connection: 'disconnected' };
    const c = this.canvas.getContext('2d');
    c.fillStyle = ZONE_COLORS[v.zone] ?? ZONE_COLORS[0];
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#fff';
    c.textBaseline = 'alphabetic';
    c.textAlign = 'left';
    c.font = 'bold 96px system-ui, sans-serif';
    c.fillText(v.bpm == null ? '--' : String(v.bpm), 12, 120);
    c.font = '16px system-ui, sans-serif';
    c.fillText(v.zone ? `Z${v.zone}` : 'bpm', 16, 152);

    c.textAlign = 'right';
    c.font = 'bold 22px system-ui, sans-serif';
    c.fillText(String(v.stepName || '').slice(0, 14), W - 12, 56);
    c.font = 'bold 40px system-ui, sans-serif';
    c.fillText(fmtTime(v.stepRemainingSec), W - 12, 104);
    c.font = '20px system-ui, sans-serif';
    c.fillText(`รวม ${fmtTime(v.totalElapsedSec)}`, W - 12, 150);

    if (v.watchClock) {
      c.textAlign = 'left';
      c.font = 'bold 18px system-ui, sans-serif';
      c.fillStyle = '#fff';
      c.fillText(`⌚ ${v.watchClock}`, 12, 26);
    }

    c.fillStyle = DOT[v.connection] ?? DOT.disconnected;
    c.beginPath();
    c.arc(W - 16, 18, 7, 0, Math.PI * 2);
    c.fill();
  }
}
