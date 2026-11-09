// "Start from the watch": the T-Rex Pro reports every physical button press the same
// way (device event 0x04) and has no workout-start event, so the app is armed first and
// the next button press — the watch's start press — starts the app's timer.
export class WatchStartTrigger {
  constructor() {
    this._armed = false;
  }

  get armed() {
    return this._armed;
  }

  arm() {
    this._armed = true;
  }

  disarm() {
    this._armed = false;
  }

  // Returns true exactly once per arm().
  onButton() {
    if (!this._armed) return false;
    this._armed = false;
    return true;
  }
}
