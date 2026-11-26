export const columns = {
  erp: ["품목코드", "코일번호", "자재명", "ERP재고(kg)"],
  actual: ["품목코드", "코일번호", "실사재고(kg)"],
  movements: ["일자", "품목코드", "코일번호", "구분", "변동량(kg)", "전표·작업번호", "메모"]
};

const sampleItems = [
  ["SAMPLE-SS", "DEMO-014", "스테인리스 코일", 1000, 850],
  ["SAMPLE-CR", "DEMO-021", "냉연강판 코일", 2400, 2360],
  ["SAMPLE-GI", "DEMO-033", "아연도금 코일", 780, 790],
  ["SAMPLE-AL", "DEMO-045", "알루미늄 코일", 1200, 1200],
  ["SAMPLE-EG", "DEMO-053", "전기아연도금 코일", 900, 900],
  ["SAMPLE-HR", "DEMO-067", "열연강판 코일", 650, null],
  ["SAMPLE-EX", "DEMO-076", "추가 실사 품목", null, 310],
  ["SAMPLE-CC", "DEMO-082", "도장강판 코일", 525, 525]
];

function rounded(kg) { return Math.round(kg * 1000) / 1000; }
export const itemKey = (item, coil) => JSON.stringify([item, coil]);
export const statuses = ["확인 대기", "조사 중", "조치 완료"];

export function sampleInventory() {
  return {
    mode: "sample", date: "2026-10-31",
    erp: sampleItems.filter(row => row[3] !== null).map(([item, coil, name, kg]) => ({ item, coil, name, kg })),
    actual: sampleItems.filter(row => row[4] !== null).map(([item, coil, , , kg]) => ({ item, coil, kg })),
    movements: [
      { date: "2026-10-28", item: "SAMPLE-SS", coil: "DEMO-014", kind: "생산투입", delta: -150, ref: "DEMO-WO-17", note: "작업 기록과 ERP 반영 시각 확인" },
      { date: "2026-10-25", item: "SAMPLE-SS", coil: "DEMO-014", kind: "입고", delta: 1000, ref: "DEMO-IN-02", note: "샘플 입고" },
      { date: "2026-10-30", item: "SAMPLE-CR", coil: "DEMO-021", kind: "생산투입", delta: -35, ref: "DEMO-WO-21", note: "공정 실적과 계량 기록 확인" },
      { date: "2026-10-31", item: "SAMPLE-GI", coil: "DEMO-033", kind: "반품", delta: 10, ref: "DEMO-RT-04", note: "반품 전표의 기준일 확인" }
    ],
    reviews: Object.create(null)
  };
}

function csvRecords(text) {
  const source = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let closed = false;
  const finishField = () => {
    row.push(field.trim());
    field = "";
    closed = false;
  };
  const finishRow = () => {
    finishField();
    if (row.some(Boolean)) rows.push(row);
    row = [];
  };
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char !== '"') field += char;
      else if (source[index + 1] === '"') {
        field += '"';
        index++;
      } else {
        quoted = false;
        closed = true;
      }
    } else if (char === ",") finishField();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index++;
      finishRow();
    } else if (char === '"' && !field && !closed) quoted = true;
    else if (closed && char === " ") continue;
    else if (char === '"' || closed) throw new Error("CSV의 따옴표 형식이 잘못되었습니다.");
    else field += char;
  }
  if (quoted) throw new Error("CSV의 닫는 따옴표가 빠졌습니다.");
  finishRow();
  return rows;
}

export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value;
}

function quantity(value, signed) {
  if (!/^[+-]?\d+(?:\.\d{1,3})?$/.test(value)) return null;
  const kg = Number(value);
  if ((!signed && kg < 0) || Math.abs(kg) > 1e9) return null;
  return kg;
}

export function parseInventoryCsv(text, type) {
  const [found, ...rows] = csvRecords(text);
  const header = columns[type];
  if (!found || found.length !== header.length || header.some((name, index) => found[index] !== name)) {
    throw new Error("CSV의 첫 줄이 양식과 다릅니다. 해당 CSV 양식을 내려받아 열 순서와 이름을 확인해 주세요.");
  }
  if (!rows.length || rows.length > 5000) throw new Error("자료는 파일당 1~5,000행을 등록할 수 있습니다.");
  const seen = new Set();
  return rows.map((fields, index) => {
    const error = message => { throw new Error("CSV " + (index + 2) + "번째 레코드 · " + message); };
    if (fields.length !== header.length) error("열 개수가 양식과 다릅니다.");
    const movement = type === "movements";
    const [item, coil] = fields.slice(movement ? 1 : 0, movement ? 3 : 2)
      .map(value => value.normalize("NFKC").toUpperCase());
    if (!item || !coil || item.length > 64 || coil.length > 64) error("품목코드와 코일번호를 각각 1~64자로 입력해 주세요.");
    if (movement) {
      const [date, , , kind, raw, ref, note] = fields;
      const delta = quantity(raw, true);
      if (!validDate(date) || !kind || delta === null) error("일자, 구분과 변동량을 확인해 주세요.");
      return { item, coil, date, kind, delta, ref, note };
    }
    const key = itemKey(item, coil);
    if (seen.has(key)) error("같은 품목코드와 코일번호가 두 번 들어 있습니다.");
    seen.add(key);
    const kg = quantity(fields.at(-1), false);
    if (kg === null) error("재고는 0 이상의 숫자로 입력해 주세요. 소수점은 셋째 자리까지 가능합니다.");
    if (type === "erp" && !fields[2]) error("자재명을 입력해 주세요.");
    return { item, coil, kg, ...(type === "erp" ? { name: fields[2] } : {}) };
  });
}

export function reconcile(state) {
  const items = new Map();
  for (const { item, coil, name, kg } of state.erp) {
    const key = itemKey(item, coil);
    items.set(key, { key, item, coil, name, erp: kg, actual: null });
  }
  for (const { item, coil, kg } of state.actual) {
    const key = itemKey(item, coil);
    const row = items.get(key) ?? { key, item, coil, name: "—", erp: null };
    items.set(key, { ...row, actual: kg });
  }
  return [...items.values()].map(row => {
    const delta = row.erp === null || row.actual === null ? null : rounded(row.actual - row.erp);
    const reviewKey = JSON.stringify([state.mode, state.date, row.key, row.erp, row.actual]);
    const review = state.reviews[reviewKey];
    return { ...row, delta, reviewKey, review };
  });
}

export function traceMovements(state, row) {
  const { item, coil } = row;
  return state.movements.filter(entry => entry.item === item && entry.coil === coil && entry.date <= state.date)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function suggestCause(state, row) {
  if (row.erp === null) return ["ERP 자료 또는 기준정보 확인", "실사에만 있는 코일입니다. ERP 품목코드와 코일번호, 조회 범위를 대조해 주세요."];
  if (row.actual === null) return ["실사 목록 확인", "ERP에만 있는 코일입니다. 실사 누락, 위치 이동, 식별번호 입력 여부를 확인해 주세요."];
  if (row.delta === 0) return ["재고 일치", "현재 기준일의 ERP 수량과 실사 수량이 같습니다."];
  const matching = traceMovements(state, row).find(entry => rounded(entry.delta - row.delta) === 0);
  if (matching) {
    const document = matching.ref ? " " + matching.ref : "";
    return ["수불 반영 시점 확인", matching.date + " " + matching.kind + document + " 기록의 변동량과 재고 차이가 같습니다. 실제 작업 시점과 ERP 반영 여부를 확인해 주세요."];
  }
  return row.delta < 0
    ? ["생산투입·출고 기록 확인", "실사 재고가 적습니다. 생산투입, 출고 전표, 실사 위치와 계량값을 대조해 주세요."]
    : ["입고·반품 기록 확인", "실사 재고가 많습니다. 입고·반품 전표와 ERP에 반영한 기준일을 확인해 주세요."];
}
