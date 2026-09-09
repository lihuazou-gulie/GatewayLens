import test from "node:test";
import assert from "node:assert/strict";
import { localHour, skyAtHour } from "../src/ui/sky/day-cycle.js";

test("sky follows local wall time, including minutes and seconds", () => {
  assert.equal(localHour(new Date(2026, 8, 9, 21, 30, 15)), 21.5 + 15 / 3600);
});

test("day and night show the corresponding celestial body and window light", () => {
  const noon = skyAtHour(12),
    midnight = skyAtHour(0);
  assert.equal(noon.phase, "day");
  assert.equal(noon.sun.opacity, 1);
  assert.equal(noon.moon.opacity, 0);
  assert.equal(noon.stars, 0);
  assert.equal(noon.windowLight, 0);
  assert.equal(midnight.phase, "night");
  assert.equal(midnight.sun.opacity, 0);
  assert.equal(midnight.moon.opacity, 1);
  assert.equal(midnight.stars, 1);
  assert.equal(midnight.windowLight, 1);
  const rise = skyAtHour(6),
    set = skyAtHour(18);
  assert.ok(rise.sun.x < noon.sun.x && noon.sun.x < set.sun.x);
  assert.ok(noon.sun.y < rise.sun.y && noon.sun.y < set.sun.y);
});

test("the moon and colors cross midnight continuously and repeat every day", () => {
  const before = skyAtHour(24 - 1 / 3600),
    after = skyAtHour(1 / 3600);
  assert.ok(Math.abs(before.moon.x - after.moon.x) < 0.01);
  assert.ok(Math.abs(before.moon.y - after.moon.y) < 0.01);
  assert.deepEqual(before.colors, after.colors);
  assert.deepEqual(skyAtHour(-6), skyAtHour(18));
  assert.deepEqual(skyAtHour(47), skyAtHour(23));
});

test("every minute has bounded visibility and celestial positions", () => {
  for (let minute = 0; minute < 1440; minute++) {
    const state = skyAtHour(minute / 60);
    for (const value of [
      state.daylight,
      state.stars,
      state.windowLight,
      state.sun.opacity,
      state.moon.opacity,
    ]) {
      assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
    }
    for (const body of [state.sun, state.moon]) {
      assert.ok(body.x >= 6 && body.x <= 94);
      assert.ok(body.y >= 22 && body.y <= 70);
    }
  }
  assert.throws(() => skyAtHour(NaN), TypeError);
});
