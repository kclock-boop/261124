import { currentOccurrence, localDay, read, readDesk, todayTasks } from "/261124/v4/desk-data.js";

const screens = {
  inventory: ["코일·원자재 재고 대조", "/261124/v4/modules/inventory-participant-v4.html", "inventory-csv", "CSV 재고 대조 열기"],
  "inventory-csv": ["CSV 재고 대조", "/261124/v4/modules/inventory.html"],
  home: ["시작 화면"],
  programs: ["업무 홈"],
  folder: ["공유폴더 대시보드", "/261124/v4/modules/folder.html"],
  desk: ["업무 데스크", "/261124/v4/modules/desk-participant-v3.html", "desk-local"],
  safety: ["현장안전포털", "/261124/v4/modules/safety-participant-v4.html", "safety-local"],
  "desk-local": ["내 업무 데스크", "/261124/v4/modules/desk.html"],
  "safety-local": ["내 현장점검 기록", "/261124/v4/modules/safety.html"],
  documents: ["품의서 작성", "/261124/v4/documents.html"],
  studio: ["이모티콘 제작기", "/261124/v4/modules/moyang.html"]
};
const $ = id => document.getElementById(id);
const frames = new Map();
const participantCards = [...$("participant-list").querySelectorAll("[data-screen]:not([data-v3-tool][hidden])")];
const supportCards = [...$("tool-grid").querySelectorAll("[data-screen]")];
const toolCards = [...participantCards, ...supportCards];
const intro = $("home");
const programs = $("programs");
const jump = $("quick-jump");
const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" });

for (const card of toolCards) {
  const key = card.dataset.screen;
  jump.add(new Option(card.querySelector("strong").textContent, key));
}
if (screens["inventory-csv"]) jump.add(new Option(screens["inventory-csv"][0], "inventory-csv"));

function filterTools() {
  const query = $("tool-query").value.trim().normalize("NFKC").toLocaleLowerCase("ko-KR");
  const compact = value => value.replace(/\s+/g, "");
  const matches = toolCards.filter(card => {
    const keywords = (card.textContent + " " + card.dataset.search).normalize("NFKC").toLocaleLowerCase("ko-KR");
    const match = !query || compact(keywords).includes(compact(query)) ||
      query.split(/\s+/).every(word => keywords.includes(word));
    card.hidden = !match;
    return match;
  });
  programs.classList.toggle("is-searching", Boolean(query));
  $("tools-guide").hidden = participantCards.every(card => card.hidden);
  $("support-tools").hidden = supportCards.every(card => card.hidden);
  $("search-message").hidden = !query;
  $("search-message").textContent = query ? "검색 결과 " + matches.length + "개" : "";
  $("no-tools").hidden = matches.length !== 0;
  return matches;
}

function clearSearch() {
  $("tool-query").value = "";
  filterTools();
}

function renderRecentDocuments(records) {
  const latest = records
    .filter(record => typeof record?.draft?.title === "string" && record.draft.title.trim())
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, 4);
  const items = latest.map(record => {
    const row = document.createElement("li");
    const title = document.createElement("strong");
    title.textContent = record.draft.title;
    row.append(title);
    const date = new Date(record.updatedAt);
    if (Number.isFinite(+date)) {
      const time = document.createElement("time");
      time.dateTime = date.toISOString();
      time.textContent = dateFormat.format(date);
      row.append(time);
    }
    return row;
  });
  $("recent-documents").replaceChildren(...items);
  $("recent-documents").hidden = items.length === 0;
  $("recent-empty").hidden = items.length > 0;
}

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
  renderRecentDocuments(Array.isArray(documents) ? documents : []);
  $("today").dateTime = localDay(date);
  $("today").textContent = new Intl.DateTimeFormat("ko-KR", { dateStyle: "full" }).format(date);
}

function navigate(event) {
  const target = location.hash.slice(1);
  const section = target === "tools-guide" ? "programs" : target;
  const key = Object.hasOwn(screens, section) ? section : "home";
  const [label, route, localScreen, localLabel = "내 기존 기록 열기"] = screens[key];
  $("screen-name").textContent = label;
  intro.hidden = Boolean(route);
  syncIntroPlayback();
  programs.hidden = Boolean(route);
  $("screen-bar").hidden = !route;
  $("tools").hidden = !route;
  jump.value = key;
  for (const item of toolCards) {
    if (item.dataset.screen === key) item.setAttribute("aria-current", "page");
    else item.removeAttribute("aria-current");
  }
  if (route && !frames.has(key)) {
    const panel = document.createElement("div");
    const frame = document.createElement("iframe");
    frame.src = route;
    frame.title = label;
    if (localScreen) {
      panel.className = "source-panel";
      const toolbar = document.createElement("div");
      toolbar.className = "source-toolbar";
      const caption = document.createElement("span");
      caption.textContent = "참여생 원본";
      const original = document.createElement("a");
      original.href = route;
      original.target = "_blank";
      original.rel = "noopener noreferrer";
      original.textContent = "원본 새 창에서 열기";
      const local = document.createElement("a");
      local.href = "#" + localScreen;
      local.textContent = localLabel;
      toolbar.append(caption, original, local);
      panel.append(toolbar);
      frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-forms allow-downloads allow-modals");
      frame.referrerPolicy = "no-referrer";
    } else {
      frame.allow = "clipboard-write 'self'";
    }
    panel.append(frame);
    $("tools").append(panel);
    frames.set(key, panel);
  }
  for (const [id, frame] of frames) frame.hidden = id !== key;
  if (key === "programs") {
    requestAnimationFrame(() => {
      if (document.activeElement !== $("tool-query")) programs.focus({ preventScroll: true });
      programs.scrollIntoView({ block: "start" });
    });
  } else if (event && route) {
    window.scrollTo(0, 0);
    $("screen-name").focus({ preventScroll: true });
  } else if (event && key === "home") {
    window.scrollTo(0, 0);
  }
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
    new Notification(event.title, { body: $("reminder-detail").textContent, icon: "/261124/v4/icon-192.png" });
  }
}

function checkReminders() {
  const now = new Date();
  const today = localDay(now);
  const current = new Set(read("taehwa:desk:alerts", []));
  for (const task of readDesk().tasks) {
    if (task.done || task.start !== today) continue;
    const key = today + "/261124/v4/" + task.id;
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
$("tool-query").addEventListener("input", () => {
  if (programs.hidden && $("tool-query").value.trim()) location.hash = "programs";
  filterTools();
});
$("tool-search").addEventListener("submit", event => {
  event.preventDefault();
  const matches = filterTools();
  if ($("tool-query").value.trim() && matches.length === 1) {
    location.hash = matches[0].hash;
  } else {
    if (programs.hidden) location.hash = "programs";
    else programs.scrollIntoView({ block: "start" });
  }
});
jump.addEventListener("change", () => {
  if (jump.value === "home" || jump.value === "programs") clearSearch();
  location.hash = jump.value;
});
for (const homeLink of document.querySelectorAll('a[href="#programs"]')) homeLink.addEventListener("click", clearSearch);
const motionButton = $("motion-toggle");
const introVideo = $("intro-video");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
let motionPaused = reduceMotion.matches;

function syncIntroPlayback() {
  if (intro.hidden || motionPaused) {
    introVideo.pause();
    return;
  }
  if (!introVideo.hasAttribute("src")) introVideo.src = introVideo.dataset.src;
  introVideo.play().catch(() => {});
}

function updateMotionButton() {
  motionButton.textContent = introVideo.paused ? "영상 재생" : "영상 멈추기";
}

introVideo.addEventListener("play", () => {
  motionButton.hidden = false;
  updateMotionButton();
});
introVideo.addEventListener("pause", updateMotionButton);
introVideo.addEventListener("error", () => {
  motionButton.hidden = true;
  introVideo.removeAttribute("src");
  introVideo.load();
});
motionButton.addEventListener("click", () => {
  motionPaused = !introVideo.paused;
  syncIntroPlayback();
});
reduceMotion.addEventListener("change", event => {
  motionPaused = event.matches;
  syncIntroPlayback();
});
motionButton.hidden = false;
let installPrompt;
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
  $("install-platform").hidden = false;
});
$("install-platform").addEventListener("click", async () => {
  const prompt = installPrompt;
  installPrompt = undefined;
  $("install-platform").hidden = true;
  if (prompt) await prompt.prompt();
});
window.addEventListener("storage", refreshSummary);
document.addEventListener("visibilitychange", checkReminders);
setInterval(() => { refreshSummary(); checkReminders(); }, 15000);
navigate();
checkReminders();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/261124/v4/sw.js").catch(() => {});
