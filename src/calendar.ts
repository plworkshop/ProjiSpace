export const calendarDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(2000, 0, 1, 12);
  date.setFullYear(year, month - 1, day);
  return date;
};
export const calendarKey = (date: Date) =>
  `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function monthDays(month: string) {
  const last = calendarDate(`${month}-01`);
  last.setMonth(last.getMonth() + 1, 0);
  return Array.from(
    { length: last.getDate() },
    (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
  );
}
export const mondayFirst = (language: string) =>
  !["en", "ja", "ko", "he"].includes(language);
export function shiftMonth(month: string, offset: number) {
  const next = calendarDate(`${month}-01`);
  next.setMonth(next.getMonth() + offset);
  return next.getFullYear() >= 1 && next.getFullYear() <= 9999
    ? calendarKey(next).slice(0, 7)
    : month;
}
export function calendarGrid(month: string, mondayFirst: boolean) {
  const first = calendarDate(`${month}-01`);
  const offset = (first.getDay() + (mondayFirst ? 6 : 0)) % 7;
  first.setDate(1 - offset);
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(first);
    day.setDate(day.getDate() + index);
    return calendarKey(day);
  });
}
