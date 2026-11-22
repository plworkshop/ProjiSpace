import test from "node:test";
import assert from "node:assert/strict";
import {
  clampScroll,
  dragScroll,
  wheelDistance,
  stepScroll,
} from "./calendarScroll.ts";
test("wheel units map to horizontal pixels and stay inside the scrollable month", () => {
  assert.equal(wheelDistance(120, 0, 600), 120);
  assert.equal(wheelDistance(-3, 1, 600), -120);
  assert.equal(wheelDistance(1, 2, 600), 600);
  assert.equal(clampScroll(-80, 850), 0);
  assert.equal(clampScroll(1200, 850), 850);
  assert.equal(clampScroll(80, 0), 0);
});
test("wheel easing is time-based and reverses without overshooting", () => {
  const at60 = Array.from({ length: 12 }).reduce(
    (value) => stepScroll(value, 800, 16),
    0,
  );
  const at120 = Array.from({ length: 24 }).reduce(
    (value) => stepScroll(value, 800, 8),
    0,
  );
  assert.ok(Math.abs(at60 - at120) < 0.001);
  const reversed = stepScroll(at60, 0, 16);
  assert.ok(reversed > 0 && reversed < at60);
  assert.equal(stepScroll(799.9, 800, 16), 800);
});
test("grabbing the ruler preserves position; only relative movement changes it", () => {
  assert.equal(dragScroll(320, 0, 2.4, 850), 320);
  assert.equal(dragScroll(320, 25, 2.4, 850), 380);
  assert.equal(dragScroll(320, -25, 2.4, 850), 260);
  assert.equal(dragScroll(320, -200, 2.4, 850), 0);
  assert.equal(dragScroll(320, 500, 2.4, 850), 850);
});
