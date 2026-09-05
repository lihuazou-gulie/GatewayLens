export class Poller {
  constructor({ intervalMs, tick }) {
    this.intervalMs = intervalMs;
    this.tick = tick;
    this.timer = null;
    this.running = false;
    this.inFlight = null;
  }

  start() {
    this.stop();
    this.running = true;
    void this.run();
  }

  stop() {
    this.running = false;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
  }

  trigger() {
    if (!this.running) this.running = true;
    return this.run();
  }

  async run() {
    if (this.inFlight) return this.inFlight;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    this.inFlight = Promise.resolve()
      .then(() => this.tick())
      .finally(() => {
        this.inFlight = null;
        if (this.running) this.timer = window.setTimeout(() => void this.run(), this.intervalMs);
      });
    return this.inFlight;
  }
}
