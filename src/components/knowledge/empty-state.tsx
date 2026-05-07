"use client";

import { motion, type Variants } from "motion/react";
import { FilePlus, FolderPlus } from "lucide-react";

// 폴더/노트가 하나도 없을 때, 검색 결과가 없을 때 보여주는 안내 컴포넌트.

interface Props {
  variant: "no-folders" | "no-notes-in-folder" | "no-search-results";
  query?: string;
  onAddFolder?: () => void;
  onAddNote?: () => void;
}

export default function KnowledgeEmptyState({
  variant,
  query,
  onAddFolder,
  onAddNote,
}: Props) {
  // 빈 상태 진입 애니메이션 — 약간 위에서 fade-in + scale 살짝. 자식들 stagger.
  const containerVariants: Variants = {
    hidden: { opacity: 0, y: 8 },
    show: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1], when: "beforeChildren", staggerChildren: 0.08 },
    },
  };
  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 6 },
    show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] } },
  };

  if (variant === "no-search-results") {
    return (
      <motion.div
        initial="hidden"
        animate="show"
        variants={containerVariants}
        className="flex flex-col items-center justify-center py-16 gap-2 text-center"
      >
        <motion.p variants={itemVariants} className="text-sm text-muted-foreground">
          &quot;{query}&quot; 와 일치하는 노트가 없습니다
        </motion.p>
      </motion.div>
    );
  }

  if (variant === "no-notes-in-folder") {
    return (
      <motion.div
        initial="hidden"
        animate="show"
        variants={containerVariants}
        className="flex flex-col items-center justify-center py-12 gap-2 text-center"
      >
        <motion.p variants={itemVariants} className="text-sm text-muted-foreground">
          이 폴더에 노트가 없습니다
        </motion.p>
        {onAddNote && (
          <motion.button
            variants={itemVariants}
            type="button"
            onClick={onAddNote}
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
          >
            <FilePlus className="h-3.5 w-3.5" />첫 노트 만들기
          </motion.button>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={containerVariants}
      className="flex flex-col items-center justify-center py-12 gap-3 text-center"
    >
      <motion.div variants={itemVariants} className="flex flex-col gap-1">
        <p className="text-sm font-medium">지식창고가 비어있어요</p>
        <p className="text-xs text-muted-foreground">
          폴더를 만들거나 바로 노트를 작성해보세요
        </p>
      </motion.div>
      <motion.div variants={itemVariants} className="flex gap-2 pt-1">
        {onAddFolder && (
          <button
            type="button"
            onClick={onAddFolder}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-xs hover:bg-accent"
          >
            <FolderPlus className="h-3.5 w-3.5" />폴더
          </button>
        )}
        {onAddNote && (
          <button
            type="button"
            onClick={onAddNote}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs hover:bg-primary/90"
          >
            <FilePlus className="h-3.5 w-3.5" />노트
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}
