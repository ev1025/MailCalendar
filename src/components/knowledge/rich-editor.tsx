"use client";

import {
  useEditor,
  EditorContent,
  ReactNodeViewRenderer,
  type Editor,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { Table, TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { lowlight } from "@/lib/knowledge/lowlight";
import ImageNodeView from "@/components/knowledge/editor/image-node-view";
import CodeBlockNodeView from "@/components/knowledge/editor/code-block-node-view";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  Code,
  Heading1,
  Heading2,
  Heading3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Image as ImageIcon,
  Table as TableIcon,
  Link as LinkIcon,
  Minus,
  Type,
} from "lucide-react";
import { useRef, useState } from "react";
import { uploadToStorage } from "@/lib/storage";
import { toast } from "sonner";
import PromptDialog from "@/components/ui/prompt-dialog";

interface Props {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

function ToolbarButton({
  active,
  onClick,
  children,
  title,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`flex h-10 w-10 md:h-8 md:w-8 shrink-0 items-center justify-center rounded transition-colors ${
        active
          ? "bg-primary/15 text-primary"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="mx-0.5 h-5 w-px shrink-0 bg-border" />;
}

type AlignMode = "left" | "center" | "right" | "justify";
const ALIGN_CYCLE: AlignMode[] = ["left", "center", "right", "justify"];
const ALIGN_ICON: Record<AlignMode, React.ComponentType<{ className?: string }>> = {
  left: AlignLeft,
  center: AlignCenter,
  right: AlignRight,
  justify: AlignJustify,
};
const ALIGN_LABEL: Record<AlignMode, string> = {
  left: "왼쪽 정렬",
  center: "가운데 정렬",
  right: "오른쪽 정렬",
  justify: "양쪽 정렬",
};

function Toolbar({ editor }: { editor: Editor }) {
  const imageRef = useRef<HTMLInputElement>(null);
  const [textPanelOpen, setTextPanelOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDefault, setLinkDefault] = useState("");

  const currentAlign: AlignMode =
    (ALIGN_CYCLE.find((a) => editor.isActive({ textAlign: a })) as AlignMode) || "left";
  const cycleAlign = () => {
    const idx = ALIGN_CYCLE.indexOf(currentAlign);
    const next = ALIGN_CYCLE[(idx + 1) % ALIGN_CYCLE.length];
    editor.chain().focus(undefined, { scrollIntoView: false }).setTextAlign(next).run();
  };
  const AlignIcon = ALIGN_ICON[currentAlign];

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 15_000_000) {
      toast.error("15MB 이하 이미지만 삽입할 수 있어요");
      return;
    }
    // 큰 이미지는 canvas로 1600px 내로 축소 + JPEG 0.85 품질로 압축,
    // 이후 Supabase Storage에 업로드 후 public URL을 삽입 (base64 DB 폭증 방지).
    const img = document.createElement("img");
    img.onload = async () => {
      try {
        const MAX = 1600;
        let w = img.width;
        let h = img.height;
        if (w > MAX || h > MAX) {
          if (w >= h) {
            h = Math.round((h * MAX) / w);
            w = MAX;
          } else {
            w = Math.round((w * MAX) / h);
            h = MAX;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/jpeg", 0.85)
        );
        if (!blob) {
          toast.error("이미지 변환 실패");
          return;
        }
        const uploadFile = new File([blob], `note-${Date.now()}.jpg`, { type: "image/jpeg" });
        const { url, error } = await uploadToStorage("knowledge-images", uploadFile, "jpg");
        if (error || !url) {
          toast.error(error || "이미지 업로드 실패");
          return;
        }
        editor.chain().focus(undefined, { scrollIntoView: false }).setImage({ src: url }).run();
      } finally {
        URL.revokeObjectURL(img.src);
      }
    };
    img.src = URL.createObjectURL(file);
    e.target.value = "";
  };

  const openLinkDialog = () => {
    const prev = (editor.getAttributes("link").href as string | undefined) || "";
    setLinkDefault(prev);
    setLinkOpen(true);
  };

  const applyLink = (url: string) => {
    if (!url) {
      editor.chain().focus(undefined, { scrollIntoView: false }).extendMarkRange("link").unsetLink().run();
      return;
    }
    const sel = editor.state.selection;
    const hasSelection = sel.from !== sel.to;
    if (hasSelection) {
      editor
        .chain()
        .focus(undefined, { scrollIntoView: false })
        .extendMarkRange("link")
        .setLink({ href: url })
        .run();
    } else {
      editor
        .chain()
        .focus(undefined, { scrollIntoView: false })
        .insertContent({
          type: "text",
          text: url,
          marks: [{ type: "link", attrs: { href: url } }],
        })
        .run();
    }
  };

  const toggleTable = () => {
    if (editor.isActive("table")) {
      editor.chain().focus().deleteTable().run();
    } else {
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
    }
  };

  return (
    <div className="flex flex-col border-b bg-background sticky top-0 z-10">
      {/* 메인 툴바 — 1줄, 가로 스크롤 */}
      <div className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto scrollbar-none whitespace-nowrap">
        <ToolbarButton onClick={() => imageRef.current?.click()} title="이미지">
          <ImageIcon className="h-5 w-5" />
        </ToolbarButton>
        <input
          ref={imageRef}
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="hidden"
        />

        <ToolbarButton
          active={textPanelOpen}
          onClick={() => setTextPanelOpen((o) => !o)}
          title="글자 서식"
        >
          <Type className="h-5 w-5" />
        </ToolbarButton>

        {/* 정렬 — 단일 버튼 사이클 */}
        <ToolbarButton onClick={cycleAlign} title={ALIGN_LABEL[currentAlign]}>
          <AlignIcon className="h-5 w-5" />
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleBulletList().run()}
          title="글머리 기호"
        >
          <List className="h-5 w-5" />
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleOrderedList().run()}
          title="번호 목록"
        >
          <ListOrdered className="h-5 w-5" />
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleBlockquote().run()}
          title="인용구"
        >
          <Quote className="h-5 w-5" />
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive("link")}
          onClick={openLinkDialog}
          title="링크"
        >
          <LinkIcon className="h-5 w-5" />
        </ToolbarButton>

        <ToolbarButton active={editor.isActive("table")} onClick={toggleTable} title="표 (활성 시 삭제)">
          <TableIcon className="h-5 w-5" />
        </ToolbarButton>

        <ToolbarButton
          active={editor.isActive("codeBlock")}
          onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleCodeBlock().run()}
          title="코드 블록"
        >
          <Code className="h-5 w-5" />
        </ToolbarButton>

        <ToolbarButton
          onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).setHorizontalRule().run()}
          title="구분선"
        >
          <Minus className="h-5 w-5" />
        </ToolbarButton>
      </div>

      {/* 글자 서식 확장 패널 (T 버튼 눌렀을 때만) */}
      {textPanelOpen && (
        <div className="flex items-center gap-1 border-t px-2 py-1.5 overflow-x-auto scrollbar-none whitespace-nowrap bg-muted/20">
          <ToolbarButton
            active={editor.isActive("heading", { level: 1 })}
            onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleHeading({ level: 1 }).run()}
            title="제목 1"
          >
            <Heading1 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("heading", { level: 2 })}
            onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleHeading({ level: 2 }).run()}
            title="제목 2"
          >
            <Heading2 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("heading", { level: 3 })}
            onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleHeading({ level: 3 }).run()}
            title="제목 3"
          >
            <Heading3 className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton
            active={editor.isActive("bold")}
            onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleBold().run()}
            title="굵게"
          >
            <Bold className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("italic")}
            onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleItalic().run()}
            title="기울임"
          >
            <Italic className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("underline")}
            onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleUnderline().run()}
            title="밑줄"
          >
            <UnderlineIcon className="h-4 w-4" />
          </ToolbarButton>
          <ToolbarButton
            active={editor.isActive("strike")}
            onClick={() => editor.chain().focus(undefined, { scrollIntoView: false }).toggleStrike().run()}
            title="취소선"
          >
            <Strikethrough className="h-4 w-4" />
          </ToolbarButton>
          <input
            type="color"
            onChange={(e) => editor.chain().focus(undefined, { scrollIntoView: false }).setColor(e.target.value).run()}
            className="h-8 w-8 cursor-pointer rounded border-none bg-transparent"
            title="글자 색상"
          />
        </div>
      )}

      <PromptDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        title="링크 추가"
        placeholder="https://..."
        defaultValue={linkDefault}
        confirmLabel="적용"
        onConfirm={applyLink}
      />
    </div>
  );
}

// Image — 편집 시 ✕ 삭제 버튼이 달린 NodeView 사용 (백스페이스 없이 클릭 삭제).
const ImageWithControls = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
}).configure({ inline: false, allowBase64: true });

// CodeBlock — lowlight 문법 하이라이팅 + 블록별 언어 선택 드롭다운 NodeView.
const CodeBlockWithLang = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView);
  },
}).configure({ lowlight, defaultLanguage: "plaintext" });

export default function RichEditor({ content, onChange, placeholder }: Props) {
  const editor = useEditor({
    extensions: [
      // StarterKit 의 기본 codeBlock 은 끔 — CodeBlockWithLang 으로 대체.
      StarterKit.configure({ codeBlock: false }),
      Underline,
      ImageWithControls,
      CodeBlockWithLang,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TextStyle,
      Color,
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({
        placeholder: placeholder || "내용을 입력하세요...",
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: "tiptap-editor",
      },
    },
  });

  if (!editor) return null;

  return (
    <div className="flex flex-col h-full">
      <Toolbar editor={editor} />
      <div
        className="flex-1 overflow-y-auto p-4 cursor-text"
        onClick={() => editor.commands.focus()}
      >
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
