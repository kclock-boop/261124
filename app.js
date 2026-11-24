const $ = id => document.getElementById(id);
const publishedPreview = document.body.hasAttribute("data-pages-preview");
const defaultTemplate = {
  id: "approval",
  name: "품의서",
  fields: [
    { id: "purpose", label: "품의 목적", guidance: "품의를 올리는 배경과 해결하려는 문제를 간결하게 적습니다.", hint: "품의를 올리는 목적을 적어 주세요." },
    { id: "details", label: "품의 내용", guidance: "요청 사항과 주요 실행 내용, 입력에 있는 경우 비용과 일정을 정리합니다.", hint: "요청 사항과 주요 내용을 적어 주세요." },
    { id: "specs", label: "구매사양", guidance: "품목명, 규격, 수량, 단가 등 확인된 구매 조건을 정리합니다.", hint: "품목, 규격, 수량 등 구매 조건을 적어 주세요." }
  ]
};
const keys = {
  templates: "document-workspace:templates:v1",
  documents: "document-workspace:documents:v1",
  draft: "document-workspace:draft:v1"
};
const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" });
let storageAvailable = true;
let templates = readStorage(keys.templates, [defaultTemplate]);
let documents = readStorage(keys.documents, []);
let draft = readStorage(keys.draft, newDraft(templates[0] ?? defaultTemplate));
let page = "write";
let generating = false;
let confirming = false;
let draftChangedInAnotherWindow = false;
let toastTimer;
let editingTemplateId = null;

function readStorage(key, fallback) {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) ?? fallback : fallback;
  } catch {
    storageAvailable = false;
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    storageAvailable = true;
    return true;
  } catch {
    storageAvailable = false;
    return false;
  } finally {
    renderStorage();
  }
}

function snapshot({ template, title, reason, values }) {
  return { template, title, reason, values: [...values] };
}

function newDraft(template) {
  return { template, title: "", reason: "", values: template.fields.map(() => ""), savedId: null };
}

function newId() {
  return crypto.randomUUID();
}

function persistDraft() {
  return writeStorage(keys.draft, draft);
}

function renderStorage() {
  $("storage-alert").hidden = storageAvailable;
  $("draft-state").classList.toggle("error", !storageAvailable);
  $("draft-state").lastElementChild.textContent = storageAvailable ? "변경 사항 자동 저장" : "자동 저장 실패";
}

function node(tag, className, label) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (label !== undefined) element.textContent = label;
  return element;
}

function icon(name) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  const use = document.createElementNS(ns, "use");
  svg.setAttribute("class", "icon");
  svg.setAttribute("aria-hidden", "true");
  use.setAttribute("href", "#i-" + name);
  svg.append(use);
  return svg;
}

function action(label, callback, { glyph, css = "", title } = {}) {
  const button = node("button", "button compact " + css);
  button.type = "button";
  if (glyph) button.append(icon(glyph));
  if (label) button.append(label);
  if (title) button.setAttribute("aria-label", title);
  button.addEventListener("click", callback);
  return button;
}

function headingIcon(glyph) {
  const element = node("span", "heading-icon");
  element.append(icon(glyph));
  return element;
}

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 3200);
}

function message(text, error = false) {
  const output = $("generation-message");
  output.textContent = text;
  output.hidden = !text;
  output.classList.toggle("error", error);
}

function showPage(nextPage) {
  page = nextPage;
  for (const button of document.querySelectorAll(".nav-button")) {
    const active = button.dataset.page === page;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
    $("page-" + button.dataset.page).hidden = !active;
  }
  if (page === "templates") renderTemplates();
  if (page === "saved") renderDocuments();
}

function renderTemplateOptions() {
  const select = $("template");
  const current = templates.find(template => template.id === draft.template.id);
  const usesSnapshot = JSON.stringify(current) !== JSON.stringify(draft.template);
  select.replaceChildren(...templates.map(template => new Option(template.name, template.id)));
  if (usesSnapshot) select.prepend(new Option(draft.template.name + " (작성 당시 양식)", "snapshot"));
  select.value = usesSnapshot ? "snapshot" : draft.template.id;
}

function renderEditor() {
  renderTemplateOptions();
  $("subject").value = draft.title;
  $("reason").value = draft.reason;
  $("paper-name").textContent = draft.template.name;

  const sections = draft.template.fields.map((field, index) => {
    const section = node("section", "paper-section");
    const label = node("label", "", field.label);
    const input = node("textarea", "document-value");
    input.id = "document-field-" + index;
    label.htmlFor = input.id;
    input.placeholder = field.hint || "이 항목의 내용을 적어 주세요.";
    input.rows = 2;
    input.maxLength = 6000;
    input.value = draft.values[index] || "";
    input.addEventListener("input", () => {
      draft.values[index] = input.value;
      persistDraft();
      renderControls();
    });
    section.append(label, input);
    return section;
  });
  $("paper-fields").replaceChildren(...sections);
  renderControls();
}

function renderControls() {
  const title = draft.title.trim();
  $("paper-subject").textContent = title || "제목을 입력해 주세요.";
  $("paper-subject").classList.toggle("muted", !title);
  $("reason-count").textContent = draft.reason.length.toLocaleString("ko-KR") + " / 2,000";
  $("sample").hidden = draft.template.id !== defaultTemplate.id;

  const hasBody = draft.values.some(value => value.trim());
  for (const id of ["save-document", "copy", "print"]) $(id).disabled = generating || !title;
  for (const id of ["new-document", "saved-new-document", "template", "subject", "reason", "sample"]) {
    $(id).disabled = generating;
  }
  $("generate").disabled = generating || publishedPreview;
  for (const input of $("paper-fields").querySelectorAll("textarea")) input.disabled = generating;
  $("generate").setAttribute("aria-busy", String(generating));
  $("generate").lastElementChild.textContent = generating ? "초안 작성 중…" : hasBody ? "AI 초안 다시 작성" : "AI 초안 작성";
  $("save-document").lastElementChild.textContent = draft.savedId ? "변경 사항 저장" : "문서 저장";
}

function confirmAction(text, proceedLabel) {
  const dialog = $("confirm-dialog");
  if (dialog.open) return Promise.resolve(false);
  $("confirm-message").textContent = text;
  $("confirm-proceed").textContent = proceedLabel;
  dialog.returnValue = "";
  confirming = true;
  return new Promise(resolve => {
    dialog.addEventListener("close", () => {
      confirming = false;
      if (draftChangedInAnotherWindow) {
        refreshSharedDraft();
        showToast("다른 창에서 작업 문서가 바뀌었습니다. 작업을 다시 선택해 주세요.");
        resolve(false);
      } else {
        resolve(dialog.returnValue === "proceed");
      }
    }, { once: true });
    dialog.showModal();
  });
}

function canReplaceDraft() {
  if (generating) {
    showToast("AI 초안 작성이 끝난 후 다시 시도해 주세요.");
    return false;
  }
  const saved = documents.find(doc => doc.id === draft.savedId);
  const hasChanges = saved
    ? JSON.stringify(saved.draft) !== JSON.stringify(snapshot(draft))
    : draft.title.trim() || draft.reason.trim() || draft.values.some(value => value.trim());
  return !hasChanges || confirmAction("현재 문서에 저장하지 않은 변경 사항이 있습니다. 다른 문서로 바꾸시겠어요?", "문서 전환");
}

function replaceDraft(nextDraft) {
  draft = nextDraft;
  persistDraft();
  message("");
  showPage("write");
  renderEditor();
  $("subject").focus();
}

async function startNew() {
  if (!await canReplaceDraft()) return;
  const template = templates.find(item => item.id === draft.template.id) ?? templates[0];
  replaceDraft(newDraft(template));
}

async function selectTemplate(template) {
  if (generating) {
    showToast("AI 초안 작성이 끝난 후 다시 시도해 주세요.");
    return false;
  }
  if (JSON.stringify(template) === JSON.stringify(draft.template)) return true;
  const fields = template.fields.map(field => draft.template.fields.findIndex(previous => previous.id === field.id));
  const discardsContents = draft.values.some((value, index) => value.trim() && !fields.includes(index));
  if (discardsContents && !await confirmAction("양식을 바꾸면 새 양식에 없는 항목의 본문이 지워집니다. 바꾸시겠어요?", "양식 변경")) return false;
  draft.values = fields.map(index => draft.values[index] || "");
  draft.template = template;
  persistDraft();
  message("");
  renderEditor();
  return true;
}

async function generateDraft(event) {
  event.preventDefault();
  if (generating || publishedPreview) return;
  const title = draft.title.trim();
  const reason = draft.reason.trim();
  if (!title || !reason) {
    message("문서 제목과 사유를 입력해 주세요.", true);
    $(title ? "reason" : "subject").focus();
    return;
  }
  if (draft.values.some(value => value.trim()) &&
      !await confirmAction("AI 초안을 다시 작성하면 현재 본문이 바뀝니다. 계속하시겠어요?", "다시 작성")) return;
  generating = true;
  message("");
  renderControls();
  try {
    const { name, fields } = draft.template;
    const template = { name, fields: fields.map(({ label, guidance }) => ({ label, guidance })) };
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, reason, template })
    });
    const result = await response.json();
    if (draftChangedInAnotherWindow) return;
    if (!response.ok) {
      message(result.error || "초안 작성에 실패했습니다. 다시 시도해 주세요.", true);
      return;
    }
    if (!Array.isArray(result.sections) || result.sections.length !== draft.template.fields.length ||
      result.sections.some(value => typeof value !== "string" || !value.trim() || value.length > 6000)) {
      message("초안의 항목을 확인할 수 없습니다. 다시 시도해 주세요.", true);
      return;
    }
    draft.values = result.sections;
    persistDraft();
    message("초안을 작성했습니다. 미리보기에서 내용을 확인하고 수정할 수 있습니다.");
    renderEditor();
  } catch {
    message("로컬 서버에 연결할 수 없습니다. Start-Web.cmd 또는 Start-App.cmd로 다시 실행해 주세요.", true);
  } finally {
    generating = false;
    if (draftChangedInAnotherWindow) {
      refreshSharedDraft();
      message("다른 창에서 작업 문서가 바뀌어 새 초안을 적용하지 않았습니다.");
    }
    renderControls();
  }
}

function saveDocument() {
  if (generating || !draft.title.trim()) return;
  const currentDocuments = readStorage(keys.documents, documents);
  const documentId = draft.savedId ?? newId();
  const record = { id: documentId, updatedAt: new Date().toISOString(), draft: snapshot(draft) };
  const nextDocuments = [record, ...currentDocuments.filter(doc => doc.id !== documentId)];
  if (!writeStorage(keys.documents, nextDocuments)) {
    showToast("문서를 저장할 수 없습니다.");
    return;
  }
  documents = nextDocuments;
  draft.savedId = documentId;
  persistDraft();
  renderControls();
  showToast("문서를 이 브라우저에 저장했습니다.");
}

function renderDocuments() {
  if (!documents.length) {
    const empty = node("div", "empty-state");
    empty.append(
      headingIcon("folder"),
      node("strong", "", "저장한 문서가 없습니다"),
      node("p", "", "작성 화면에서 문서를 저장하면 여기에 표시됩니다."),
      action("문서 작성", () => showPage("write"), { glyph: "pen" })
    );
    $("document-list").replaceChildren(empty);
    return;
  }
  const rows = documents.map(record => {
    const row = node("article", "document-row");
    const info = node("div", "row-detail");
    info.append(
      node("h2", "", record.draft.title.trim()),
      node("p", "", record.draft.template.name + " · " + dateFormat.format(new Date(record.updatedAt)))
    );
    const buttons = node("div", "row-buttons");
    buttons.append(
      action("열기", async () => {
        if (record.id === draft.savedId) showPage("write");
        else if (await canReplaceDraft()) replaceDraft({ ...structuredClone(record.draft), savedId: record.id });
      }),
      action("", () => deleteDocument(record), { glyph: "trash", css: "danger", title: record.draft.title.trim() + " 삭제" })
    );
    row.append(headingIcon("file"), info, buttons);
    return row;
  });
  $("document-list").replaceChildren(...rows);
}

async function deleteDocument(record) {
  if (!await confirmAction("‘" + record.draft.title.trim() + "’ 문서를 삭제하시겠어요?", "문서 삭제")) return;
  const next = readStorage(keys.documents, documents).filter(doc => doc.id !== record.id);
  if (!writeStorage(keys.documents, next)) return;
  documents = next;
  if (draft.savedId === record.id) {
    draft.savedId = null;
    persistDraft();
    renderControls();
  }
  renderDocuments();
  showToast("저장한 문서를 삭제했습니다.");
}

function renderTemplates() {
  const cards = templates.map(template => {
    const card = node("article", "panel template-card");
    const heading = node("div", "card-heading");
    heading.append(headingIcon("layout"), node("h2", "", template.name));
    const list = node("ul");
    list.append(...template.fields.map(field => node("li", "", field.label)));
    const buttons = node("div", "card-actions");
    buttons.append(
      action("사용", async () => {
        if (await selectTemplate(template)) showPage("write");
      }, { css: "primary" }),
      action("편집", () => openTemplateEditor(template))
    );
    if (template.id !== defaultTemplate.id) {
      buttons.append(action("", () => deleteTemplate(template), {
        glyph: "trash", css: "danger", title: template.name + " 삭제"
      }));
    }
    card.append(heading, list, buttons);
    return card;
  });
  $("template-list").replaceChildren(...cards);
}

async function deleteTemplate(template) {
  if (!await confirmAction("‘" + template.name + "’ 양식을 삭제하시겠어요?", "양식 삭제")) return;
  const next = readStorage(keys.templates, templates).filter(item => item.id !== template.id);
  if (!writeStorage(keys.templates, next)) return;
  templates = next;
  renderTemplateOptions();
  renderTemplates();
  showToast("양식을 삭제했습니다.");
}

function templateError(text) {
  $("template-error").textContent = text;
  $("template-error").hidden = !text;
  $("template-error").classList.toggle("error", Boolean(text));
}

function updateFieldButtons() {
  const rows = $("template-fields").children;
  $("add-field").disabled = rows.length >= 12;
  for (const row of rows) row.querySelector("button").disabled = rows.length <= 1;
}

function appendTemplateField(field = { id: newId(), label: "", guidance: "" }) {
  const row = node("div", "field-editor");
  row.dataset.id = field.id;
  if (field.hint) row.dataset.hint = field.hint;
  const removeButton = action("", () => {
    const sibling = row.nextElementSibling || row.previousElementSibling;
    row.remove();
    updateFieldButtons();
    sibling.querySelector("input").focus();
  }, { glyph: "x", title: "항목 삭제" });
  const fieldForm = node("div", "form-field");
  const fieldHeader = node("div", "field-heading");
  const name = node("input");
  name.id = "field-label-" + field.id;
  name.placeholder = "예: 회의 안건";
  name.value = field.label;
  name.required = true;
  name.maxLength = 50;
  const label = node("label", "", "항목 이름");
  label.htmlFor = name.id;
  fieldHeader.append(label, removeButton);
  fieldForm.append(fieldHeader, name);

  const guidanceForm = node("div", "form-field");
  const guidance = node("textarea", "guidance-input");
  guidance.id = "field-guidance-" + field.id;
  guidance.placeholder = "예: 논의할 주제와 결정이 필요한 사항을 정리합니다.";
  guidance.value = field.guidance;
  guidance.maxLength = 220;
  guidance.rows = 2;
  const guidanceLabel = node("label", "", "AI 작성 기준 (선택)");
  guidanceLabel.htmlFor = guidance.id;
  guidanceForm.append(guidanceLabel, guidance);
  row.append(fieldForm, guidanceForm);
  $("template-fields").append(row);
  updateFieldButtons();
  return name;
}

function openTemplateEditor(template) {
  editingTemplateId = template?.id ?? null;
  $("template-dialog-heading").textContent = template ? "양식 편집" : "새 양식";
  $("template-name").value = template?.name ?? "";
  $("template-fields").replaceChildren();
  templateError("");
  if (template) template.fields.forEach(field => appendTemplateField(field));
  else appendTemplateField();
  $("template-dialog").showModal();
  $("template-name").focus();
}

function saveTemplate(event) {
  event.preventDefault();
  const name = $("template-name").value.trim();
  const fields = [...$("template-fields").children].map(row => ({
    id: row.dataset.id,
    label: row.querySelector("input").value.trim(),
    guidance: row.querySelector("textarea").value.trim(),
    ...row.dataset.hint && { hint: row.dataset.hint }
  }));
  if (!name || fields.some(field => !field.label)) {
    templateError("양식 이름과 모든 항목 이름을 입력해 주세요.");
    return;
  }
  if (new Set(fields.map(field => field.label.toLowerCase())).size !== fields.length) {
    templateError("항목 이름은 서로 다르게 입력해 주세요.");
    return;
  }
  const currentTemplates = readStorage(keys.templates, templates);
  if (currentTemplates.some(template => template.id !== editingTemplateId && template.name.toLowerCase() === name.toLowerCase())) {
    templateError("같은 이름의 양식이 이미 있습니다.");
    return;
  }
  const nextTemplate = { id: editingTemplateId ?? newId(), name, fields };
  const existing = currentTemplates.some(template => template.id === nextTemplate.id);
  const nextTemplates = existing
    ? currentTemplates.map(template => template.id === nextTemplate.id ? nextTemplate : template)
    : [...currentTemplates, nextTemplate];
  if (!writeStorage(keys.templates, nextTemplates)) {
    templateError("양식을 저장할 수 없습니다. 브라우저 저장소를 확인해 주세요.");
    return;
  }
  templates = nextTemplates;
  if (draft.template.id === nextTemplate.id && !draft.savedId && !generating && !draft.values.some(value => value.trim())) {
    draft.template = nextTemplate;
    draft.values = fields.map(() => "");
    persistDraft();
    renderEditor();
  } else {
    renderTemplateOptions();
  }
  $("template-dialog").close();
  renderTemplates();
  showToast("양식을 이 브라우저에 저장했습니다.");
}

async function useSample() {
  if ((draft.title.trim() || draft.reason.trim()) &&
      !await confirmAction("제목과 사유 입력란을 예시로 바꾸시겠어요?", "예시 입력")) return;
  draft.title = "품질검사용 디지털 캘리퍼스 구매 품의";
  draft.reason = "기존 캘리퍼스 고장으로 제품 치수 검사에 사용할 장비를 구매하고자 합니다. 측정 범위 0~150 mm, 분해능 0.01 mm인 디지털 캘리퍼스 2개가 필요하고 예산은 20만 원입니다.";
  persistDraft();
  message("");
  renderEditor();
  $("reason").focus();
}

async function copyDocument() {
  const sections = draft.template.fields.map((field, index) => field.label + "\n" + draft.values[index].trim());
  const text = [draft.template.name, "제목: " + draft.title.trim(), ...sections].join("\n\n");
  try {
    await navigator.clipboard.writeText(text);
    showToast("문서를 클립보드에 복사했습니다.");
  } catch {
    showToast("복사 권한을 확인해 주세요.");
  }
}

function preparePrint() {
  const sections = draft.template.fields.map((field, index) => {
    const section = node("section");
    section.append(node("h2", "", field.label), node("p", "", draft.values[index].trim()));
    return section;
  });
  $("print-document").replaceChildren(
    node("h1", "", draft.template.name),
    node("p", "print-subject", "제목: " + draft.title.trim()),
    ...sections
  );
}

function refreshSharedDraft() {
  if (generating || confirming) {
    draftChangedInAnotherWindow = true;
    return;
  }
  draftChangedInAnotherWindow = false;
  draft = readStorage(keys.draft, newDraft(templates[0] ?? defaultTemplate));
  message("");
  renderEditor();
}

for (const button of document.querySelectorAll(".nav-button")) {
  button.addEventListener("click", () => showPage(button.dataset.page));
}
$("compose").addEventListener("submit", generateDraft);
for (const [id, property] of [["subject", "title"], ["reason", "reason"]]) {
  $(id).addEventListener("input", event => {
    draft[property] = event.target.value;
    persistDraft();
    message("");
    renderControls();
  });
}
$("template").addEventListener("change", async event => {
  const template = templates.find(item => item.id === event.target.value);
  if (template && !await selectTemplate(template)) renderTemplateOptions();
});
$("new-document").addEventListener("click", startNew);
$("saved-new-document").addEventListener("click", startNew);
$("sample").addEventListener("click", useSample);
$("save-document").addEventListener("click", saveDocument);
$("copy").addEventListener("click", copyDocument);
$("print").addEventListener("click", () => window.print());
window.addEventListener("beforeprint", preparePrint);
$("new-template").addEventListener("click", () => openTemplateEditor());
$("close-dialog").addEventListener("click", () => $("template-dialog").close());
$("cancel-template").addEventListener("click", () => $("template-dialog").close());
$("add-field").addEventListener("click", () => appendTemplateField().focus());
$("template-editor").addEventListener("submit", saveTemplate);

window.addEventListener("storage", event => {
  if (event.key === keys.templates || event.key === null) {
    templates = readStorage(keys.templates, [defaultTemplate]);
    renderTemplateOptions();
    if (page === "templates") renderTemplates();
  }
  if (event.key === keys.documents || event.key === null) {
    documents = readStorage(keys.documents, []);
    if (page === "saved") renderDocuments();
  }
  if (event.key === keys.draft || event.key === null) refreshSharedDraft();
});

renderEditor();
renderStorage();

let installPrompt;
window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
  $("install-app").hidden = false;
});
$("install-app").addEventListener("click", async () => {
  if (!installPrompt) return;
  const prompt = installPrompt;
  installPrompt = undefined;
  $("install-app").hidden = true;
  try {
    await prompt.prompt();
  } catch {
    showToast("Edge의 앱 메뉴에서 설치를 다시 시도해 주세요.");
  }
});
window.addEventListener("appinstalled", () => {
  installPrompt = undefined;
  $("install-app").hidden = true;
});
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/261124/sw.js").catch(error => console.warn("Offline app setup failed", error));
}
