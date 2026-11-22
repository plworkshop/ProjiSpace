import test from "node:test";
import assert from "node:assert/strict";
import {
  calendarGrid,
  monthDays,
  shiftMonth,
  mondayFirst,
} from "./calendar.ts";
test("calendar month lengths, leap years and year boundaries stay date-only", () => {
  assert.equal(monthDays("2028-02").length, 29);
  assert.equal(monthDays("2100-02").length, 28);
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("0001-01", -1), "0001-01");
  assert.equal(shiftMonth("9999-12", 1), "9999-12");
});
test("date picker lays out six weeks with the locale week start and adjacent months", () => {
  const ru = calendarGrid("2026-10", true);
  const en = calendarGrid("2026-10", false);
  assert.equal(ru.length, 42);
  assert.equal(ru[0], "2026-09-28");
  assert.equal(en[0], "2026-09-27");
  assert.equal(ru[41], "2026-11-08");
  assert.equal(
    calendarGrid("2028-02", true).filter((day) => day.startsWith("2028-02"))
      .length,
    29,
  );
});
test("timeline and date picker share the week start for every interface language", () => {
  for (const language of ["ru", "de", "es", "fr", "pt", "uk", "zh"])
    assert.equal(mondayFirst(language), true);
  for (const language of ["en", "ja", "ko", "he"])
    assert.equal(mondayFirst(language), false);
});
