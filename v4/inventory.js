import { columns, parseInventoryCsv, reconcile, sampleInventory, statuses, suggestCause, traceMovements, validDate } from "./inventory-data.js";

const $ = id => document.getElementById(id);
const cacheKey = "taehwa:inventory:v3";
const kg = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 3 });
const pickers = [...document.querySelectorAll("[data-item-picker]")];
const pages = [...document.querySelectorAll("[data-panel]")];
const menu = [...document.querySelectorAll("[data-view]")];
const pageSize = 50;
let bundle = loadBundle();
let state;
let rows;
let byKey;
let selectedKey;
let comparisonPage = 0;

function loadBundle() {
  try {
    const saved = JSON.parse(localStorage.getItem(cacheKey));
    if (saved && ["sample", "loaded"].includes(saved.active) && saved[saved.active]) return saved;
  } catch {}
  return { active: "sample", sample: sampleInventory(), loaded: null };
}

function save(mode, data = bundle[mode]) {
  const next = { ...bundle, active: mode, [mode]: data };
  localStorage.setItem(cacheKey, JSON.stringify(next));
  bundle = next;
  renderAll();
}

function node(tag, text = "", className = "") {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function action(label, listener) {
  const button = node("button", label);
  button.type = "button";
  button.addEventListener("click", listener);
  return button;
}

function switchView(view, focus = true) {
  for (const page of pages) page.hidden = page.dataset.panel !== view;
  for (const button of menu) {
    if (button.dataset.view === view) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  if (focus) $(view + "-heading").focus({ preventScroll: true });
}

function number(value) { return value === null ? "—" : kg.format(value); }
function signed(value) { return value > 0 ? "+" + number(value) : number(value); }
function needsReview(row) { return row.delta !== 0 && row.review?.status !== statuses[2]; }
function rowStatus(row) {
  if (row.delta === 0) return "일치";
  if (row.review?.status === statuses[2]) return statuses[2];
  if (row.erp === null) return "ERP 자료 없음";
  if (row.actual === null) return "실사 자료 없음";
  if (row.review?.status === statuses[1]) return statuses[1];
  return Math.abs(row.delta) >= 100 ? "우선 확인" : "확인 필요";
}

function pendingRows() {
  return rows.filter(needsReview).sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0));
}

function renderOverview() {
  const pending = pendingRows();
  const matched = rows.filter(row => row.delta === 0).length;
  const discrepancies = rows.filter(row => row.delta !== 0).length;
  const metrics = [
    ["대조 대상", kg.format(rows.length) + "건"],
    ["미조치", kg.format(pending.length) + "건"],
    ["일치율", kg.format(rows.length ? matched / rows.length * 100 : 0) + "%"],
    ["조치 완료", kg.format(discrepancies - pending.length) + "건"]
  ];
  $("metrics").replaceChildren(...metrics.map(([label, value]) => {
    const card = node("div");
    card.append(node("dt", label), node("dd", value));
    return card;
  }));
  const buttons = pending.slice(0, 5).map(row => {
    const button = action("", () => openItem(row, "trace"));
    button.append(node("span", row.name === "—" ? row.item + " / " + row.coil : row.name + " · " + row.coil),
      node("strong", row.delta === null ? rowStatus(row) : signed(row.delta) + " kg"));
    return button;
  });
  $("priority-items").replaceChildren(...(buttons.length ? buttons : [node("p", "현재 확인할 코일이 없습니다.", "muted")]));
  const first = pending[0];
  const insight = $("overview-insight");
  if (!first) {
    insight.replaceChildren(node("h3", "우선 검토"), node("p", "대조와 조치가 마무리되었습니다."));
    return;
  }
  const [heading, explanation] = suggestCause(state, first);
  insight.replaceChildren(node("h3", heading), node("p", first.item + " / " + first.coil),
    node("p", explanation), action("원인 후보 열기", () => openItem(first, "causes")));
}

function keyCell(row) {
  const cell = node("td", row.item);
  cell.append(node("small", row.coil));
  return cell;
}

function emptyTable(body, count, message) {
  const row = node("tr");
  const cell = node("td", message, "muted");
  cell.colSpan = count;
  row.append(cell);
  body.replaceChildren(row);
}

function renderComparison() {
  const query = $("comparison-query").value.trim().normalize("NFKC").toUpperCase();
  const filter = $("comparison-filter").value;
  const visible = rows.filter(row => {
    const match = [row.item, row.coil, row.name].some(value => value.toUpperCase().includes(query));
    if (!match) return false;
    if (filter === "differences") return row.delta !== 0;
    if (filter === "open") return needsReview(row);
    if (filter === "matched") return row.delta === 0;
    return true;
  });
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  comparisonPage = Math.min(comparisonPage, pageCount - 1);
  $("comparison-count").textContent = visible.length + "건 · " + (comparisonPage + 1) + "/261124/v4/" + pageCount + "쪽";
  $("comparison-prev").disabled = comparisonPage === 0;
  $("comparison-next").disabled = comparisonPage >= pageCount - 1;
  const body = $("comparison-rows");
  if (!visible.length) {
    emptyTable(body, 7, "조건에 맞는 코일이 없습니다.");
    return;
  }
  body.replaceChildren(...visible.slice(comparisonPage * pageSize, (comparisonPage + 1) * pageSize).map(row => {
    const tr = node("tr");
    const investigate = node("td");
    investigate.append(action("이력 보기", () => openItem(row, "trace")));
    const status = rowStatus(row);
    tr.append(keyCell(row), node("td", row.name), node("td", number(row.erp), "number"),
      node("td", number(row.actual), "number"), node("td", signed(row.delta), row.delta < 0 ? "number negative" : "number"),
      node("td", status, row.delta === null ? "status missing" : status === statuses[2] || row.delta === 0 ? "status done" : "status"),
      investigate);
    return tr;
  }));
}

function openItem(row, view) {
  selectedKey = row.key;
  renderSelected();
  switchView(view);
}

function renderSelected() {
  const row = byKey.get(selectedKey);
  if (!row) return;
  for (const picker of pickers) picker.value = selectedKey;
  const history = traceMovements(state, row);
  const traceBody = $("trace-rows");
  if (!history.length) emptyTable(traceBody, 5, "선택한 코일에 기준일 이전 수불 기록이 없습니다.");
  else traceBody.replaceChildren(...history.slice(0, 200).map(entry => {
    const tr = node("tr");
    tr.append(node("td", entry.date), node("td", entry.kind), node("td", signed(entry.delta), "number"),
      node("td", entry.ref || "—"), node("td", entry.note || "—"));
    return tr;
  }));
  $("trace-summary").textContent = history.length > 200
    ? "수불 " + history.length + "건 중 최근 200건을 표시합니다."
    : "기준일 이전 수불 " + history.length + "건";
  const [heading, explanation] = suggestCause(state, row);
  $("cause-result").replaceChildren(node("h3", heading), node("p", explanation));
  $("review-context").textContent = "ERP " + number(row.erp) + " kg · 실사 " + number(row.actual) + " kg · 차이 " + signed(row.delta) + " kg";
  $("review-status").value = row.review?.status ?? statuses[0];
  $("review-person").value = row.review?.person ?? "";
  $("review-note").value = row.review?.note ?? "";
  feedback("review-feedback", "");
}

function renderReport() {
  const discrepancies = rows.filter(row => row.delta !== 0);
  $("report-summary").textContent = (state.mode === "sample" ? "시연용 가상 데이터" : "등록 자료") + " · 기준일 " + state.date +
    " · 대조 " + rows.length + "건 · 차이 또는 자료 누락 " + discrepancies.length + "건 · 미조치 " + discrepancies.filter(needsReview).length + "건";
  const body = $("report-rows");
  if (!discrepancies.length) {
    emptyTable(body, 6, "차이 또는 자료 누락 건이 없습니다.");
    return;
  }
  body.replaceChildren(...discrepancies.map(row => {
    const tr = node("tr");
    tr.append(keyCell(row), node("td", row.name), node("td", signed(row.delta), "number"),
      node("td", row.review?.status ?? rowStatus(row)), node("td", row.review?.person || "—"), node("td", row.review?.note || "—"));
    return tr;
  }));
}

function renderAll() {
  state = bundle[bundle.active];
  rows = reconcile(state);
  byKey = new Map(rows.map(row => [row.key, row]));
  if (!byKey.has(selectedKey)) selectedKey = pendingRows()[0]?.key ?? rows[0]?.key;
  const sample = state.mode === "sample";
  $("dataset-mode").textContent = sample ? "시연용 가상 데이터" : "등록 자료";
  $("reference-date").textContent = "기준일 " + state.date;
  $("dataset-note").textContent = sample
    ? "화면의 품목·수량·수불은 시연용 가상 데이터입니다. 자료 등록에서 보유한 CSV를 불러올 수 있습니다."
    : "브라우저에 등록한 자료를 대조하고 있습니다. 차이는 실사 재고에서 ERP 재고를 뺀 값입니다.";
  $("saved-mode").hidden = !bundle.loaded;
  $("import-date").value = state.date;
  for (const picker of pickers) {
    picker.replaceChildren(...rows.map(row => new Option(row.item + " / " + row.coil, row.key)));
  }
  renderOverview();
  renderComparison();
  renderSelected();
  renderReport();
}

function feedback(id, message, error = false) {
  const element = $(id);
  element.textContent = message;
  element.classList.toggle("error", error);
}

async function inputRecords(type) {
  const file = $(type + "-file").files[0];
  if (!file && type === "movements") return [];
  if (!file || file.size > 1024 * 1024) throw new Error("필수 CSV 파일을 선택해 주세요. 파일당 1MB까지 가능합니다.");
  const bytes = await file.arrayBuffer();
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { text = new TextDecoder("euc-kr", { fatal: true }).decode(bytes); }
  return parseInventoryCsv(text, type);
}

function downloadTemplate(type) {
  const examples = {
    erp: ["SAMPLE-SS", "DEMO-014", "스테인리스 코일", 1000],
    actual: ["SAMPLE-SS", "DEMO-014", 850],
    movements: ["2026-10-28", "SAMPLE-SS", "DEMO-014", "생산투입", -150, "DEMO-WO-17", "샘플 기록"]
  };
  const uri = URL.createObjectURL(new Blob(["\uFEFF" + columns[type].join(",") + "\r\n" + examples[type].join(",") + "\r\n"], { type: "text/csv;charset=utf-8" }));
  const anchor = node("a");
  anchor.href = uri;
  anchor.download = type + "-양식.csv";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(uri), 1000);
}

for (const button of menu) button.addEventListener("click", () => switchView(button.dataset.view));
for (const button of document.querySelectorAll("[data-open]")) button.addEventListener("click", () => switchView(button.dataset.open));
for (const button of document.querySelectorAll("[data-template]")) button.addEventListener("click", () => downloadTemplate(button.dataset.template));
for (const picker of pickers) picker.addEventListener("change", () => {
  selectedKey = picker.value;
  renderSelected();
});
for (const id of ["comparison-query", "comparison-filter"]) $(id).addEventListener("input", () => {
  comparisonPage = 0;
  renderComparison();
});
$("comparison-prev").addEventListener("click", () => { comparisonPage--; renderComparison(); });
$("comparison-next").addEventListener("click", () => { comparisonPage++; renderComparison(); });
$("print-report").addEventListener("click", () => window.print());
for (const [id, mode] of [["sample-mode", "sample"], ["saved-mode", "loaded"]]) {
  $(id).addEventListener("click", () => {
    try {
      save(mode);
      switchView("overview");
    } catch { feedback("import-feedback", "브라우저 저장 공간을 확인해 주세요.", true); }
  });
}

$("import-form").addEventListener("submit", async event => {
  event.preventDefault();
  const button = $("import-submit");
  const date = $("import-date").value;
  button.disabled = true;
  feedback("import-feedback", "CSV를 확인하고 있습니다.");
  try {
    if (!validDate(date)) throw new Error("기준일을 확인해 주세요.");
    const [erp, actual, movements] = await Promise.all(["erp", "actual", "movements"].map(inputRecords));
    const rowsBefore = bundle.loaded?.reviews ?? Object.create(null);
    const next = { mode: "loaded", date, erp, actual, movements, reviews: rowsBefore };
    const current = reconcile(next);
    next.reviews = Object.fromEntries(current.filter(row => row.review).map(row => [row.reviewKey, row.review]));
    save("loaded", next);
    event.target.reset();
    $("import-date").value = date;
    feedback("import-feedback", "자료를 등록했습니다.");
    switchView("overview");
  } catch (error) {
    feedback("import-feedback", error.name === "QuotaExceededError" ? "저장 공간이 부족합니다. 파일 크기를 줄여 다시 등록해 주세요." : error.message, true);
  } finally { button.disabled = false; }
});

$("review-form").addEventListener("submit", event => {
  event.preventDefault();
  const row = byKey.get(selectedKey);
  if (!row) return;
  const update = { status: $("review-status").value, person: $("review-person").value.trim(), note: $("review-note").value.trim() };
  try {
    save(bundle.active, { ...state, reviews: { ...state.reviews, [row.reviewKey]: update } });
    feedback("review-feedback", "조치를 저장했습니다.");
  } catch {
    feedback("review-feedback", "조치를 저장하지 못했습니다. 브라우저 저장 공간을 확인해 주세요.", true);
  }
});

renderAll();
