// 에디터(@tiptap/extension-code-block-lowlight)용 lowlight 인스턴스.
// highlight.js 전체(common ~190KB) 대신 실제로 노출하는 언어만 등록해 번들 절약.
// rich-editor 자체가 dynamic import 라 이 모듈도 그때 같이 로드됨.

import { createLowlight } from "lowlight";
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

export const lowlight = createLowlight();
lowlight.register({
  plaintext,
  python,
  sql,
  bash,
  markdown,
  javascript,
  typescript,
  json,
  yaml,
  xml,
  css,
});
