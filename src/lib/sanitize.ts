// TipTap이 저장하는 HTML을 DB에 넣기 전 sanitize.
// ProseMirror가 편집 중에는 안전한 subset만 허용하지만,
// 누군가 REST로 직접 knowledge_items에 <script>나 onerror attr을 찔러넣으면
// 다음에 에디터로 불러올 때 위험. 입력/출력 양쪽에서 방어.

import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "u", "s", "code", "pre",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "blockquote", "hr",
  "a", "img",
  "table", "thead", "tbody", "tr", "td", "th",
  "span", "div",
];

const ALLOWED_ATTR = [
  "href", "target", "rel",
  "src", "alt", "width", "height",
  "colspan", "rowspan",
  "style", "class",
  "data-*",
];

// style 속성에서 허용할 CSS 프로퍼티 — TipTap 이 실제로 쓰는 것만(텍스트 색·정렬·강조).
// background:url(...) 로 데이터 exfil, expression()/-moz-binding 등 브라우저별 CSS injection
// 벡터를 차단. 화이트리스트 외 선언은 제거하고, 남는 게 없으면 style 속성 자체 제거.
const ALLOWED_CSS_PROPS = new Set([
  "color",
  "background-color",
  "text-align",
  "font-weight",
  "font-style",
  "text-decoration",
]);
let cssHookInstalled = false;
function ensureCssHook() {
  if (cssHookInstalled) return;
  cssHookInstalled = true;
  DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
    if (data.attrName !== "style") return;
    const cleaned = data.attrValue
      .split(";")
      .map((rule) => rule.trim())
      .filter((rule) => {
        const prop = rule.split(":")[0]?.trim().toLowerCase();
        return prop && ALLOWED_CSS_PROPS.has(prop) && !/url\s*\(|expression\s*\(/i.test(rule);
      })
      .join("; ");
    if (cleaned) data.attrValue = cleaned;
    else data.keepAttr = false;
  });
}

/**
 * HTML 태그를 모두 제거해 plain text 만 반환. excerpt/검색 인덱싱·드래프트 길이 비교 등에 사용.
 * &nbsp; 도 공백으로 변환. trim 적용. 간단한 정규식 — sanitize 한 결과만 통과시키는 게 안전.
 *
 * 이전엔 use-knowledge-items, use-knowledge-drafts 양쪽에 동일 함수가 인라인으로 있어 통합.
 */
export function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
}

/** TipTap/리치 에디터가 생성한 HTML을 안전하게 정리. */
export function sanitizeRichHTML(html: string): string {
  if (!html) return html;
  ensureCssHook();
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form"],
    FORBID_ATTR: [
      "onerror", "onload", "onclick", "onmouseover", "onfocus",
      "onblur", "onchange", "onsubmit",
    ],
    // http/https/data/mailto만 허용 (javascript: 차단)
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
}
