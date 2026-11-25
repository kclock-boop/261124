const $ = id => document.getElementById(id);
const pageSize = 100;
const dateFormat = new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" });
const number = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 1 });
let files = [];
let page = 0;

function sizeText(bytes) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  const unit = bytes > 0 ? Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1) : 0;
  return number.format(bytes / 1024 ** unit) + " " + units[unit];
}

function render() {
  const query = $("folder-search").value.trim().toLocaleLowerCase("ko-KR");
  const mode = $("folder-sort").value;
  const visible = files.filter(file => file.path.toLocaleLowerCase("ko-KR").includes(query));
  visible.sort((a, b) => {
    if (mode === "recent" && b.date !== a.date) return b.date - a.date;
    if (mode === "size" && b.size !== a.size) return b.size - a.size;
    return a.path.localeCompare(b.path, "ko-KR", { numeric: true });
  });
  const pages = Math.max(1, Math.ceil(visible.length / pageSize));
  page = Math.min(page, pages - 1);
  const rows = visible.slice(page * pageSize, (page + 1) * pageSize).map(file => {
    const row = document.createElement("tr");
    for (const value of [file.path, sizeText(file.size), file.date ? dateFormat.format(file.date) : "—"]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    return row;
  });
  $("folder-rows").replaceChildren(...rows);
  $("folder-table").hidden = !rows.length;
  $("folder-pages").hidden = pages <= 1;
  $("folder-prev").disabled = page === 0;
  $("folder-next").disabled = page >= pages - 1;
  $("folder-page").textContent = (page + 1) + " / " + pages;
  $("folder-summary").textContent = files.length
    ? "파일 " + number.format(files.length) + "개 · " + sizeText(files.reduce((total, file) => total + file.size, 0)) +
      (query ? " · 검색 결과 " + number.format(visible.length) + "개" : "")
    : "표시할 파일이 없습니다.";
}

$("folder-picker").addEventListener("change", event => {
  files = Array.from(event.currentTarget.files, file => ({
    path: file.webkitRelativePath || file.name,
    size: file.size,
    date: file.lastModified
  }));
  $("folder-controls").hidden = !files.length;
  $("folder-search").value = "";
  page = 0;
  render();
});
$("folder-search").addEventListener("input", () => { page = 0; render(); });
$("folder-sort").addEventListener("change", () => { page = 0; render(); });
$("folder-prev").addEventListener("click", () => { page--; render(); });
$("folder-next").addEventListener("click", () => { page++; render(); });
