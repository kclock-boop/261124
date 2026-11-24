import { currentOccurrence, deskKey, localDay, readDesk, todayTasks } from "/desk-data.js";

const $ = id => document.getElementById(id);
const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
const formats = { tasks: "일정", rules: "반복 업무", memos: "메모", snippets: "문구" };
let data = readDesk();
let month = new Date();
let editor;
let dragStart;

function make(tag, text, css) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (css) node.className = css;
  return node;
}

function button(text, action) {
  const result = make("button", text);
  result.type = "button";
  result.addEventListener("click", action);
  return result;
}

function change(update) {
  const latest = readDesk();
  update(latest);
  try { localStorage.setItem(deskKey, JSON.stringify(latest)); }
  catch {
    $("message").textContent = "브라우저 저장 공간을 확인해 주세요.";
    if ($("editor").open) $("editor-error").textContent = $("message").textContent;
    return false;
  }
  data = latest;
  $("message").textContent = "";
  render();
  return true;
}

function editRow(key, item, update) {
  return change(next => {
    next[key] = next[key].map(row => row.id === item.id ? { ...row, ...update } : row);
  });
}

function remove(key, item) {
  if (confirm("‘" + item.title + "’ 항목을 삭제할까요?")) {
    change(next => { next[key] = next[key].filter(row => row.id !== item.id); });
  }
}

function list(id, items) {
  $(id).replaceChildren(...(items.length ? items : [make("li", "등록된 항목이 없습니다.", "quiet")]));
}

function actionsRow(title) {
  const item = make("li");
  const row = make("div", "", "row");
  row.append(make("span", title, "event-title"));
  item.append(row);
  return [item, row];
}

function checkbox(label, checked, toggle) {
  const wrap = make("label", "", "check");
  const box = make("input");
  box.type = "checkbox";
  box.checked = checked;
  box.addEventListener("change", () => toggle(box.checked));
  wrap.append(box, make("span", label, checked ? "done" : ""));
  return wrap;
}

function renderToday() {
  const day = localDay();
  $("weekend").checked = data.weekend;
  const tasks = todayTasks(data).map(task => {
    const [item, row] = actionsRow();
    row.firstChild.append(checkbox(task.title, task.done, checked => {
      editRow("tasks", task, { done: checked, completedOn: checked ? day : "" });
    }));
    if (task.start) row.append(button("편집", () => openEditor("tasks", task)));
    row.append(button("삭제", () => remove("tasks", task)));
    return item;
  });
  const rules = data.rules.map(rule => {
    const occurrence = currentOccurrence(rule);
    const [item, row] = actionsRow(occurrence ? "" : rule.title);
    if (occurrence) {
      row.firstChild.append(checkbox(rule.title, rule.doneOn === occurrence, checked => {
        editRow("rules", rule, { doneOn: checked ? occurrence : "" });
      }));
    }
    row.append(button("편집", () => openEditor("rules", rule)), button("삭제", () => remove("rules", rule)));
    const description = rule.repeat === "weekly" ? "매주 " + weekdays[rule.value] + "요일"
      : rule.repeat === "monthly" ? "매월 " + rule.value + "일" : "평일 매일";
    item.append(make("p", description + (occurrence && occurrence !== day && rule.doneOn !== occurrence ? " · 이월" : ""), "entry-meta"));
    return item;
  });
  list("tasks", tasks);
  list("rules", rules);
}

function renderCalendar() {
  const year = month.getFullYear(), index = month.getMonth();
  const first = new Date(year, index, 1);
  const last = new Date(year, index + 1, 0);
  const start = localDay(first), end = localDay(last);
  const events = data.tasks.filter(task => task.start && task.start <= end && (task.end || task.start) >= start)
    .sort((a, b) => (a.start + a.time).localeCompare(b.start + b.time));
  $("month-name").textContent = year + "년 " + (index + 1) + "월";
  const cells = weekdays.map(day => make("div", day, "weekday"));
  for (let blank = 0; blank < first.getDay(); blank++) cells.push(make("div"));
  for (let number = 1; number <= last.getDate(); number++) {
    const day = localDay(new Date(year, index, number));
    const cell = button(String(number), () => openEditor("tasks", null, { start: day, end: day }));
    cell.className = "day" + (day === localDay() ? " today" : "");
    cell.setAttribute("aria-label", day + " 일정 등록");
    cell.draggable = true;
    cell.addEventListener("dragstart", event => {
      dragStart = day;
      event.dataTransfer.setData("text/plain", day);
      event.dataTransfer.effectAllowed = "copy";
    });
    cell.addEventListener("dragend", () => { dragStart = null; });
    cell.addEventListener("dragover", event => {
      if (dragStart) { event.preventDefault(); cell.classList.add("over"); }
    });
    cell.addEventListener("dragleave", () => cell.classList.remove("over"));
    cell.addEventListener("drop", event => {
      if (!dragStart) return;
      event.preventDefault();
      cell.classList.remove("over");
      const [begin, finish] = [dragStart, day].sort();
      dragStart = null;
      openEditor("tasks", null, { start: begin, end: finish });
    });
    for (const event of events.filter(task => task.start <= day && (task.end || task.start) >= day)) {
      const label = make("span", (event.time ? event.time + " " : "") + event.title, "scheduled");
      label.title = event.title;
      cell.append(label);
    }
    cells.push(cell);
  }
  $("days").replaceChildren(...cells);
  list("events", events.map(event => {
    const [item, row] = actionsRow(event.title);
    row.append(button("편집", () => openEditor("tasks", event)), button("삭제", () => remove("tasks", event)));
    const dates = event.end && event.end !== event.start ? event.start + " ~ " + event.end : event.start;
    item.append(make("p", dates + (event.time ? " · " + event.time : ""), "entry-meta"));
    if (event.body) item.append(make("p", event.body, "entry-body"));
    return item;
  }));
}

function renderMemos() {
  const query = $("memo-search").value.trim().toLowerCase();
  const period = $("memo-month").value;
  const date = new Date();
  const current = localDay(date).slice(0, 7);
  const previous = localDay(new Date(date.getFullYear(), date.getMonth() - 1, 1)).slice(0, 7);
  const matches = data.memos.filter(memo => {
    const memoMonth = memo.created.slice(0, 7);
    if (period && memoMonth !== period) return false;
    if (query) return (memo.title + " " + memo.body).toLowerCase().includes(query);
    return period || memoMonth === current || (memo.done && memoMonth === previous && date.getDate() <= 7);
  });
  list("memo-list", matches.map(memo => {
    const [item, row] = actionsRow();
    const detail = make("details");
    detail.append(make("summary", memo.title), make("p", memo.body, "entry-body"));
    row.firstChild.append(detail);
    row.append(checkbox("확인", memo.done, checked => editRow("memos", memo, { done: checked })),
      button("편집", () => openEditor("memos", memo)), button("삭제", () => remove("memos", memo)));
    item.append(make("p", memo.created, "entry-meta"));
    return item;
  }));
}

function renderSnippets() {
  const query = $("snippet-search").value.trim().toLowerCase();
  list("snippet-list", data.snippets.filter(item => (item.title + " " + item.category).toLowerCase().includes(query)).map(snippet => {
    const [item, row] = actionsRow(snippet.title);
    row.append(button("복사", async () => {
      try {
        await navigator.clipboard.writeText(snippet.body);
        $("message").textContent = "문구를 복사했습니다.";
      } catch { $("message").textContent = "이 브라우저에서 복사 권한을 확인해 주세요."; }
    }), button("편집", () => openEditor("snippets", snippet)), button("삭제", () => remove("snippets", snippet)));
    if (snippet.category) item.append(make("p", snippet.category, "entry-meta"));
    item.append(make("p", snippet.body, "entry-body"));
    return item;
  }));
}

function render() {
  renderToday();
  renderCalendar();
  renderMemos();
  renderSnippets();
}

function field(name, label, value, { type = "text", required = false, choices } = {}) {
  const wrapper = make("label", label);
  const input = make(choices ? "select" : type === "long" ? "textarea" : "input");
  if (choices) input.append(...choices.map(([key, title]) => new Option(title, key)));
  else if (type !== "long") input.type = type;
  if (type === "text" || type === "long") input.maxLength = type === "long" ? 3500 : 120;
  input.name = name;
  input.value = value ?? "";
  input.required = required;
  wrapper.append(input);
  $("fields").append(wrapper);
  return input;
}

function openEditor(key, item, defaults = {}) {
  editor = { key, item };
  const value = item || defaults;
  $("editor-heading").textContent = formats[key] + (item ? " 편집" : " 등록");
  $("fields").replaceChildren();
  $("editor-error").textContent = "";
  field("title", "제목", value.title, { required: true });
  if (key === "tasks") {
    field("start", "시작일", value.start || localDay(), { type: "date", required: true });
    field("end", "종료일 (선택)", value.end, { type: "date" });
    field("time", "시간 (선택)", value.time, { type: "time" });
  }
  if (key === "rules") {
    const repeat = field("repeat", "반복 주기", value.repeat || "daily", { choices: [
      ["daily", "평일 매일"], ["weekly", "매주 지정 요일"], ["monthly", "매월 지정 날짜"]
    ] });
    const week = field("weekday", "요일", value.repeat === "weekly" ? value.value : "1", {
      choices: weekdays.slice(1, 6).map((name, index) => [index + 1, name + "요일"])
    });
    const day = field("monthday", "날짜", value.repeat === "monthly" ? value.value : "1", {
      choices: Array.from({ length: 31 }, (_, index) => [index + 1, (index + 1) + "일"])
    });
    const reveal = () => {
      week.parentElement.hidden = repeat.value !== "weekly";
      day.parentElement.hidden = repeat.value !== "monthly";
    };
    repeat.addEventListener("change", reveal);
    reveal();
  } else {
    if (key === "snippets") field("category", "분류", value.category);
    field("body", key === "snippets" ? "복사할 문구" : "메모", value.body, { type: "long", required: key === "snippets" });
  }
  $("editor").showModal();
}

$("edit-form").addEventListener("submit", event => {
  event.preventDefault();
  const { key, item } = editor;
  const fields = Object.fromEntries([...new FormData(event.currentTarget)].map(([name, content]) => [name, content.trim()]));
  if (!fields.title || (key === "snippets" && !fields.body) || (fields.end && fields.end < fields.start)) {
    $("editor-error").textContent = "제목, 본문 또는 종료일을 확인해 주세요.";
    return;
  }
  if (key === "rules") {
    fields.value = fields.repeat === "weekly" ? fields.weekday : fields.monthday;
    delete fields.weekday;
    delete fields.monthday;
    if (item && (item.repeat !== fields.repeat || item.value !== fields.value)) fields.doneOn = "";
  }
  const saved = item ? editRow(key, item, fields)
    : change(next => next[key].unshift({ id: crypto.randomUUID(), created: localDay(), ...fields }));
  if (saved) $("editor").close();
});

$("quick").addEventListener("submit", event => {
  event.preventDefault();
  const title = $("quick-title").value.trim();
  if (title && change(next => next.tasks.unshift({ id: crypto.randomUUID(), title, created: localDay(), done: false }))) event.currentTarget.reset();
});
$("weekend").addEventListener("change", event => change(next => { next.weekend = event.target.checked; }));
for (const [id, key] of [["new-event", "tasks"], ["new-rule", "rules"], ["new-memo", "memos"], ["new-snippet", "snippets"]]) {
  $(id).addEventListener("click", () => openEditor(key));
}
for (const id of ["close", "cancel"]) $(id).addEventListener("click", () => $("editor").close());
for (const [id, offset] of [["prev", -1], ["next", 1], ["current-month", 0]]) {
  $(id).addEventListener("click", () => {
    month = offset ? new Date(month.getFullYear(), month.getMonth() + offset, 1) : new Date();
    renderCalendar();
  });
}
for (const id of ["memo-search", "memo-month"]) $(id).addEventListener("input", renderMemos);
$("snippet-search").addEventListener("input", renderSnippets);
$("enable-notifications").addEventListener("click", async () => {
  try {
    const permission = await window.Notification?.requestPermission();
    $("message").textContent = permission === "granted" ? "플랫폼을 열어 둔 동안 일정 알림을 표시합니다." : "브라우저에서 알림 권한을 허용해 주세요.";
  } catch { $("message").textContent = "이 브라우저에서는 시스템 알림을 사용할 수 없습니다."; }
});
const views = [...document.querySelectorAll("[data-view]")];
function show(view) {
  for (const item of views) {
    const active = item.dataset.view === view;
    $(item.dataset.view).hidden = !active;
    if (active) item.setAttribute("aria-current", "true");
    else item.removeAttribute("aria-current");
  }
}
for (const item of views) item.addEventListener("click", () => show(item.dataset.view));
window.addEventListener("storage", event => {
  if (event.key === deskKey || event.key === null) { data = readDesk(); render(); }
});
show("today");
render();
