export class ProbeScheduler {
  constructor(task, { intervalMs = 5000, onError = () => {} } = {}) {
    Object.assign(this, { task, intervalMs, onError });
    this.timer = null;
  }
  start() {
    if (this.timer) return;
    const tick = () => Promise.resolve().then(this.task).catch(this.onError);
    this.timer = setInterval(() => {
      void tick();
    }, this.intervalMs);
    this.timer.unref?.();
    void tick();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
