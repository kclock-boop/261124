export const deskKey = "taehwa:desk:v1";
export const emptyDesk = { tasks: [], rules: [], memos: [], snippets: [], weekend: false };

export function localDay(date = new Date()) {
  const pad = number => String(number).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

function workday(date) {
  return date.getDay() !== 0 && date.getDay() !== 6;
}

function monthlyDate(year, month, day) {
  const last = new Date(year, month + 1, 0);
  if (day > last.getDate()) {
    while (!workday(last)) last.setDate(last.getDate() - 1);
    return last;
  }
  const date = new Date(year, month, day);
  while (!workday(date)) date.setDate(date.getDate() + 1);
  return date;
}

export function currentOccurrence(rule, date = new Date()) {
  if (!workday(date)) return null;
  const today = localDay(date);
  const candidate = new Date(date);
  if (rule.repeat === "weekly") {
    const delta = (candidate.getDay() - Number(rule.value) + 7) % 7;
    candidate.setDate(candidate.getDate() - delta);
  }
  let day = localDay(candidate);
  if (rule.repeat === "monthly") {
    day = "";
    for (let offset = 0; offset <= 2; offset++) {
      const month = new Date(date.getFullYear(), date.getMonth() - offset, 1);
      const possible = localDay(monthlyDate(month.getFullYear(), month.getMonth(), Number(rule.value)));
      if (possible <= today) { day = possible; break; }
    }
  }
  return day && day >= rule.created ? day : null;
}

export function todayTasks(data, date = new Date()) {
  const day = localDay(date);
  return data.tasks.filter(task => task.start
    ? task.start <= day && (task.end || task.start) >= day
    : task.done ? task.completedOn === day : task.created <= day && (task.created === day || data.weekend || workday(date)));
}

export function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}

export function readDesk() {
  return { ...emptyDesk, ...read(deskKey, {}) };
}
