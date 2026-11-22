import test from 'node:test';
import assert from 'node:assert/strict';
import { deadlineSummary } from './deadline.ts';

test('deadline countdown uses calendar days across DST, months, leap days and years', () => {
  for (const [today,date,days] of [['2026-03-27','2026-03-30',3],['2028-02-28','2028-03-01',2],['2026-12-31','2027-01-01',1],['2026-11-13','2026-11-16',3]]) {
    assert.equal(deadlineSummary(date,today,false,'en').days,days);
  }
  assert.equal(deadlineSummary('2026-11-16','2026-11-13',false,'en').tone,'soon');
  assert.equal(deadlineSummary('2026-11-17','2026-11-13',false,'ru').tone,'scheduled');
  assert.equal(deadlineSummary('2026-11-13','2026-11-13',false,'ru').label,'Срок сегодня');
  assert.equal(deadlineSummary('2026-11-12','2026-11-13',false,'en').tone,'overdue');
  assert.equal(deadlineSummary('2026-11-12','2026-11-13',true,'ru').label,'Завершён');
});
