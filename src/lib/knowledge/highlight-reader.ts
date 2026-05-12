// 읽기 화면(note-reader-view) 전용 코드 하이라이팅.
//
// 에디터는 lowlight 데코레이션으로 실시간 하이라이팅하지만, DB 에 저장되는
// HTML(editor.getHTML())은 `<pre><code class="language-xxx">원본 텍스트</code></pre>`
// 뿐이라 하이라이트 span 이 없다. 그래서 reader 에선 렌더 후 highlight.js 로
// 각 코드 블록을 한 번 칠해준다. (라이브 DOM 조작 — React 가 관리하지 않는
// dangerouslySetInnerHTML 영역이라 충돌 없음.)

import hljs from "highlight.js/lib/core";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import bash from "highlight.js/lib/languages/bash";
import markdown from "highlight.js/lib/languages/markdown";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import json from "highlight.js/lib/languages/json";
import yaml from "highlight.js/lib/languages/yaml";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";

let registered = false;
function ensureRegistered() {
  if (registered) return;
  registered = true;
  hljs.registerLanguage("plaintext", plaintext);
  hljs.registerLanguage("python", python);
  hljs.registerLanguage("sql", sql);
  hljs.registerLanguage("bash", bash);
  hljs.registerLanguage("markdown", markdown);
  hljs.registerLanguage("javascript", javascript);
  hljs.registerLanguage("typescript", typescript);
  hljs.registerLanguage("json", json);
  hljs.registerLanguage("yaml", yaml);
  hljs.registerLanguage("xml", xml);
  hljs.registerLanguage("css", css);
  hljs.configure({ ignoreUnescapedHTML: true });
}

/** root 안의 모든 `<pre><code>` 를 한 번씩 하이라이팅. 이미 칠해진 건 건너뜀. */
export function highlightCodeBlocks(root: HTMLElement) {
  ensureRegistered();
  root.querySelectorAll<HTMLElement>("pre code").forEach((el) => {
    if (el.dataset.highlighted === "yes") return;
    try {
      hljs.highlightElement(el);
    } catch {
      /* 알 수 없는 언어 등 — 무시(원본 텍스트 유지) */
    }
  });
}
