export function deadlineSummary(date: string, today: string, completed: boolean, language: string) {
  const day = (value: string) => Date.parse(`${value}T00:00:00Z`);
  const days = Math.round((day(date) - day(today)) / 86400000);
  const en = language === "en";
  const count = new Intl.NumberFormat(language, { style: "unit", unit: "day", unitDisplay: "short" }).format(Math.abs(days));
  return {
    days,
    tone: completed ? "complete" : days < 0 ? "overdue" : days <= 3 ? "soon" : "scheduled",
    label: completed ? (en ? "Completed" : "Завершён") : days === 0 ? (en ? "Due today" : "Срок сегодня") : days < 0 ? (en ? `${count} overdue` : `Просрочен: ${count}`) : (en ? `${count} left` : `Осталось ${count}`),
  };
}
