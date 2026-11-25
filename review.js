const criteria = [
  ["format", "제출 요건", "제출 형식, 필수 항목과 분량을 확인했습니다."],
  ["problem", "과제 배경", "기존 업무의 문제와 개선 목표를 설명했습니다."],
  ["process", "자동화 과정", "사용한 도구, 적용 과정과 결과 확인 방법을 적었습니다."],
  ["comparison", "개선 전후", "자동화 전후의 흐름이나 사례를 비교했습니다."],
  ["evidence", "성과 근거", "시간 절감 등 제시한 효과의 측정 기준과 근거를 확인했습니다."],
  ["privacy", "공개 범위", "제출용 파일의 개인정보와 사내 민감정보를 검토했습니다."]
];
const key = "taehwa:v2:competition-review";
const $ = id => document.getElementById(id);
let saved = {};
try { saved = JSON.parse(localStorage.getItem(key)) ?? {}; } catch {}
const boxes = new Map();
$("review-title").value = saved.title || "";
$("review-notes").value = saved.notes || "";

for (const [id, title, detail] of criteria) {
  const item = document.createElement("li");
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = saved.checked?.includes(id) || false;
  const words = document.createElement("span");
  const heading = document.createElement("strong");
  const description = document.createElement("small");
  heading.textContent = title;
  description.textContent = detail;
  words.append(heading, description);
  label.append(input, words);
  item.append(label);
  $("criteria").append(item);
  boxes.set(id, input);
}

function update(save) {
  const checked = [...boxes].filter(([, box]) => box.checked).map(([id]) => id);
  $("review-progress").value = checked.length;
  $("progress-label").textContent = checked.length + " / " + criteria.length + "개 확인";
  if (!save) return;
  try {
    localStorage.setItem(key, JSON.stringify({ checked, title: $("review-title").value, notes: $("review-notes").value }));
    $("review-message").textContent = "";
  } catch {
    $("review-message").textContent = "브라우저 저장 공간을 확인해 주세요.";
  }
}

function report() {
  const lines = criteria.map(([id, title]) => (boxes.get(id).checked ? "확인" : "미확인") + " · " + title);
  return ["AI 경진대회 자료 사전검토", "과제명: " + ($("review-title").value.trim() || "미입력"),
    ...lines, "", "보완 메모", $("review-notes").value.trim()].join("\n");
}

$("criteria").addEventListener("change", () => update(true));
for (const id of ["review-title", "review-notes"]) $(id).addEventListener("input", () => update(true));
$("copy-review").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(report());
    $("review-message").textContent = "검토 결과를 복사했습니다.";
  } catch {
    $("review-message").textContent = "복사 권한을 확인하거나 텍스트 저장을 이용해 주세요.";
  }
});
$("download-review").addEventListener("click", () => {
  const anchor = document.createElement("a");
  const url = URL.createObjectURL(new Blob([report()], { type: "text/plain;charset=utf-8" }));
  anchor.href = url;
  anchor.download = "AI-경진대회-사전검토.txt";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
update(false);
