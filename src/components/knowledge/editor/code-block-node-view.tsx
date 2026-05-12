"use client";

import { NodeViewWrapper, NodeViewContent, type NodeViewProps } from "@tiptap/react";
import { CODE_LANGUAGES } from "@/lib/knowledge/code-languages";

/**
 * CodeBlockLowlight 의 편집용 NodeView.
 * 코드 블록 상단에 작은 헤더(언어 선택 드롭다운)를 붙여, 블록마다
 * Python / SQL / Bash(SSH) / Markdown 등 언어를 골라 문법 색을 다르게 적용.
 *
 * lowlight 데코레이션은 NodeViewContent 안의 텍스트에 자동으로 hljs-* span 을
 * 입혀줌 — 여기선 DOM 골격과 언어 선택 UI 만 담당.
 */
export default function CodeBlockNodeView({ node, updateAttributes }: NodeViewProps) {
  const language = (node.attrs.language as string) || "plaintext";
  return (
    <NodeViewWrapper className="my-3 overflow-hidden rounded-lg ring-1 ring-foreground/10">
      <div
        contentEditable={false}
        className="flex items-center justify-between bg-[#1e293b] px-3 py-1 text-slate-300"
      >
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
          코드
        </span>
        <select
          value={language}
          onChange={(e) => updateAttributes({ language: e.target.value })}
          className="cursor-pointer rounded bg-transparent py-0.5 pl-1 pr-0.5 text-[11px] text-slate-200 focus:outline-none [&>option]:bg-slate-800 [&>option]:text-slate-100"
          aria-label="코드 언어"
        >
          {CODE_LANGUAGES.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
      {/* !mt-0 !rounded-none — globals.css 의 .tiptap-editor pre(margin/radius) 무력화,
          헤더 바로 아래 flush 하게 붙임. 색 토큰(hljs)은 globals.css 참고. */}
      <pre className="hljs !my-0 !rounded-none">
        <NodeViewContent<"code"> as="code" className={`language-${language}`} />
      </pre>
    </NodeViewWrapper>
  );
}
