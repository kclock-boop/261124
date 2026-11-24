import { currentOccurrence, localDay, read, readDesk, todayTasks } from "/desk-data.js";

const screens = {
  home: ["업무 홈"],
  desk: ["업무 데스크", "/modules/desk.html"],
  safety: ["현장 안전점검", "/modules/safety.html"],
  documents: ["품의서 작성", "/documents"],
  studio: ["이모티콘 제작기", "/modules/moyang.html"]
};
const $ = id => document.getElementById(id);
const frames = new Map();

function refreshSummary() {
  const date = new Date();
  const data = readDesk();
  const repeating = data.rules.filter(rule => {
    const occurrence = currentOccurrence(rule, date);
    return occurrence && rule.doneOn !== occurrence;
  });
  $("task-count").textContent = todayTasks(data, date).filter(task => !task.done).length + repeating.length;
  const safety = read("safety-note-v1", []);
  const documents = read("document-workspace:documents:v1", []);
  $("safety-count").textContent = Array.isArray(safety)
    ? safety.filter(row => ["open", "progress"].includes(row?.status)).length : 0;
  $("document-count").textContent = Array.isArray(documents) ? documents.length : 0;
  $("today").dateTime = localDay(date);
  $("today").textContent = new Intl.DateTimeFormat("ko-KR", { dateStyle: "full" }).format(date);
}

function navigate() {
  const target = location.hash.slice(1);
  const key = Object.hasOwn(screens, target) ? target : "home";
  const [label, route] = screens[key];
  $("screen-name").textContent = label;
  $("home").hidden = Boolean(route);
  $("tools").hidden = !route;
  for (const item of document.querySelectorAll("[data-screen]")) {
    if (item.dataset.screen === key) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  }
  if (route && !frames.has(key)) {
    const frame = document.createElement("iframe");
    frame.src = route;
    frame.title = label;
    frame.allow = "clipboard-write 'self'";
    $("tools").append(frame);
    frames.set(key, frame);
  }
  for (const [id, frame] of frames) frame.hidden = id !== key;
  refreshSummary();
}

const notified = new Set(read("taehwa:desk:alerts", []));
let notificationQueue = [];

function showReminder() {
  if (!$("reminder").hidden || !notificationQueue.length) return;
  const event = notificationQueue.shift();
  $("reminder-title").textContent = event.title;
  $("reminder-detail").textContent = (event.time || "오늘 일정") + (event.body ? " · " + event.body : "");
  $("reminder").hidden = false;
  if (document.hidden && window.Notification?.permission === "granted") {
    new Notification(event.title, { body: $("reminder-detail").textContent, icon: "/icon-192.png" });
  }
}

function checkReminders() {
  const now = new Date();
  const today = localDay(now);
  const current = new Set(read("taehwa:desk:alerts", []));
  for (const task of readDesk().tasks) {
    if (task.done || task.start !== today) continue;
    const key = today + "/" + task.id;
    const due = new Date(task.start + "T" + (task.time || "07:30"));
    const lead = task.time ? 300000 : 0;
    if (notified.has(key) || current.has(key) || now < due - lead || now > +due + 60000) continue;
    notified.add(key);
    current.add(key);
    notificationQueue.push(task);
  }
  try { localStorage.setItem("taehwa:desk:alerts", JSON.stringify([...current].filter(key => key.startsWith(today)))); }
  catch {}
  showReminder();
}

$("dismiss-reminder").addEventListener("click", () => {
  $("reminder").hidden = true;
  showReminder();
});
window.addEventListener("hashchange", navigate);
window.addEventListener("storage", refreshSummary);
document.addEventListener("visibilitychange", checkReminders);
setInterval(() => { refreshSummary(); checkReminders(); }, 15000);
navigate();
checkReminders();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
