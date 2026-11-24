const instruction = [
  "당신은 한국어 업무 문서 초안을 작성합니다. 입력된 제목, 사유·메모, 양식 항목을 바탕으로 항목별 본문만 작성하세요.",
  "간결하고 정중한 사내 문서체를 쓰고, 각 항목의 제목을 본문에 반복하지 마세요. 필요한 경우 줄바꿈과 일반 글머리표를 사용하고 마크다운 제목, 표, 코드 블록은 사용하지 마세요.",
  "입력에 없는 수량, 금액, 일자, 모델명, 브랜드, 업체, 참석자, 결재 결과 등 사실을 만들지 마세요. 필요한 정보가 없으면 '[확인 필요: 항목명]'으로 표시하세요.",
  "구매사양 항목은 제공된 모델, 규격, 수량 등만 명시하고, 구매와 관련 없는 경우 '해당 없음'을 적으세요. 각 항목의 작성 기준은 문서 구성에만 적용하세요."
].join("\n");

function reply(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}

function readText(value, maxLength) {
  return typeof value === "string" && value.length <= maxLength ? value.trim() : "";
}

export default async function generate(request) {
  if (request.method !== "POST") {
    return reply({ error: "POST 요청만 사용할 수 있습니다." }, 405, { Allow: "POST" });
  }

  let input;
  try {
    const raw = await request.text();
    if (raw.length > 40000) return reply({ error: "요청 내용이 너무 깁니다." }, 413);
    input = JSON.parse(raw);
  } catch {
    return reply({ error: "요청 형식을 확인해 주세요." }, 400);
  }

  const title = readText(input?.title, 120);
  const reason = readText(input?.reason, 2000);
  const name = readText(input?.template?.name, 50);
  const fields = input?.template?.fields;
  if (!title || !reason || !name || !Array.isArray(fields) || !fields.length || fields.length > 12) {
    return reply({ error: "제목, 사유와 양식 항목을 확인해 주세요." }, 400);
  }
  const sections = fields.map((field, index) => ({
    key: "section_" + (index + 1),
    label: readText(field?.label, 50),
    guidance: readText(field?.guidance, 220)
  }));
  if (sections.some(section => !section.label)) {
    return reply({ error: "양식 항목 이름을 확인해 주세요." }, 400);
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return reply({ error: "로컬 서버에 OpenAI API 키가 설정되어 있지 않습니다. .env 파일을 설정한 뒤 서버를 다시 실행해 주세요." }, 503);
  const properties = Object.fromEntries(sections.map(section => [section.key, { type: "string" }]));

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
        store: false,
        max_completion_tokens: 5200,
        messages: [
          { role: "system", content: instruction },
          { role: "user", content: JSON.stringify({ title, reason, template: name, sections }) }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "document_draft",
            strict: true,
            schema: { type: "object", properties, required: Object.keys(properties), additionalProperties: false }
          }
        }
      })
    });
    if (response.status === 429) return reply({ error: "OpenAI 요청 한도에 도달했습니다. 잠시 후 다시 시도하거나 사용 한도를 확인해 주세요." }, 429);
    if (response.status === 401 || response.status === 403) {
      return reply({ error: "서버의 OpenAI API 키와 모델 접근 권한을 확인해 주세요." }, 502);
    }
    if (!response.ok) return reply({ error: "OpenAI 요청에 실패했습니다. 서버의 모델 설정을 확인하거나 잠시 후 다시 시도해 주세요." }, 502);

    const result = await response.json();
    const choice = result.choices?.[0];
    if (!choice || choice.finish_reason !== "stop" || choice.message?.refusal) {
      return reply({ error: "초안을 완성할 수 없습니다. 입력 내용을 확인하고 다시 시도해 주세요." }, 502);
    }
    const draft = JSON.parse(choice.message.content);
    const values = sections.map(section => readText(draft?.[section.key], 6000));
    if (values.some(value => !value)) {
      return reply({ error: "일부 항목이 생성되지 않았습니다. 다시 시도해 주세요." }, 502);
    }
    return reply({ sections: values });
  } catch (error) {
    const message = error.name === "TimeoutError"
      ? "초안 작성 시간이 초과되었습니다. 다시 시도해 주세요."
      : "OpenAI 응답을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
    return reply({ error: message }, error.name === "TimeoutError" ? 504 : 502);
  }
}
