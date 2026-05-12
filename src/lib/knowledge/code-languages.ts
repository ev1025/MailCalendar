// 코드 블록에서 선택 가능한 언어 목록.
// value 는 highlight.js / lowlight 가 인식하는 식별자, label 은 UI 표기.
// (lowlight.ts 의 register 대상 + reader 하이라이팅과 1:1 일치해야 함.)

export interface CodeLanguage {
  value: string;
  label: string;
}

export const CODE_LANGUAGES: CodeLanguage[] = [
  { value: "plaintext", label: "텍스트" },
  { value: "python", label: "Python" },
  { value: "sql", label: "SQL" },
  { value: "bash", label: "Bash / SSH" },
  { value: "markdown", label: "Markdown" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "xml", label: "HTML / XML" },
  { value: "css", label: "CSS" },
];

const LABELS = new Map(CODE_LANGUAGES.map((l) => [l.value, l.label]));

/** language 식별자 → 표시 라벨. 모르는 값이면 그대로 반환. */
export function codeLanguageLabel(value: string | null | undefined): string {
  if (!value) return LABELS.get("plaintext")!;
  return LABELS.get(value) ?? value;
}
