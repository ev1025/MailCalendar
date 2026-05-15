"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMotionEnabled } from "@/hooks/use-safe-motion";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import PlanTaskRow from "@/components/travel/plan-task-row";
import PlanLegCard from "@/components/travel/plan-leg-card";
import { addMinutes } from "@/lib/travel/time";
import { toDragProps } from "@/lib/dnd-types";
import type { TravelPlanTask } from "@/types";
import type { ExpectedTimeInfo } from "@/lib/travel/expected-time";
import type { TaskLeg } from "@/lib/travel/legs";

/**
 * 한 일자 분량의 task·leg 리스트 한 섹션 — 헤더 + summary + drop zone + add 버튼.
 *
 * 부모(plan-detail) 의 DndContext + SortableContext 내부에 마운트되어야 useSortable·
 * useDroppable 이 정상 동작. 자체 sortable context 는 만들지 않음.
 *
 * 분리 이유:
 * - 이전 plan-detail.tsx 가 ~500줄 → 일자 섹션 1개 ~70줄 분량을 자식 컴포넌트로 분리해
 *   가독성·테스트 가능성 확보. expected/leg 계산이 모두 외부에서 prop 으로 전달돼
 *   순수 표현 계층.
 */

interface SortableTaskRowProps {
  task: TravelPlanTask;
  onClick: () => void;
  onDelete: () => void;
  onToggleComplete?: () => void;
  onSwapAlt?: (altIndex: number) => void;
  expectedTime?: string | null;
}

function SortableTaskRow({
  task,
  onClick,
  onDelete,
  onToggleComplete,
  onSwapAlt,
  expectedTime,
}: SortableTaskRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });
  const dragProps = toDragProps<HTMLButtonElement>({ attributes, listeners });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.55 : 1,
    zIndex: isDragging ? 10 : undefined,
    // 드래그 중 살짝 떠 보이게 — shadow + 모서리 둥글림(자식 카드와 맞춤).
    boxShadow: isDragging ? "0 10px 28px -8px rgba(0,0,0,0.28)" : undefined,
    borderRadius: isDragging ? 8 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <PlanTaskRow
        task={task}
        onClick={onClick}
        onDelete={onDelete}
        onToggleComplete={onToggleComplete}
        onSwapAlt={onSwapAlt}
        expectedTime={expectedTime}
        dragListeners={dragProps.listeners}
        dragAttributes={dragProps.attributes}
      />
    </div>
  );
}

function DayDropZone({ day, children }: { day: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-${day}` });
  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col gap-2 rounded-md transition-colors ${
        isOver ? "bg-primary/5 ring-2 ring-primary/30" : ""
      }`}
    >
      {children}
    </div>
  );
}

interface Props {
  day: number;
  dayTasks: TravelPlanTask[];
  formatDayLabel: (d: number) => string;
  legsWithCoords: TaskLeg[];
  expectedTimes: Record<string, ExpectedTimeInfo>;
  onOpenEdit: (task: TravelPlanTask) => void;
  onDeleteTask: (id: string) => void;
  onToggleComplete: (task: TravelPlanTask) => void;
  onSwapAlt: (task: TravelPlanTask, altIndex: number) => void;
  onUpdateTask: (id: string, updates: Partial<TravelPlanTask>) => Promise<{ error: unknown }>;
  onOpenNew: (day: number) => void;
}

export default function PlanDaySection({
  day,
  dayTasks,
  formatDayLabel,
  legsWithCoords,
  expectedTimes,
  onOpenEdit,
  onDeleteTask,
  onToggleComplete,
  onSwapAlt,
  onUpdateTask,
  onOpenNew,
}: Props) {
  const motionOn = useMotionEnabled();
  return (
    <section className="flex flex-col gap-2">
      {/* 일자 헤더 — 부모 스크롤 컨테이너 안에서 sticky. 큰 타이포 + 반투명
          backdrop 으로 task 행이 헤더 아래로 스쳐 지나가도 가독성 유지. */}
      <div className="sticky top-0 z-10 -mx-2 px-2 py-1.5 flex items-center gap-2 bg-background/85 backdrop-blur-sm">
        <h3 className="text-base md:text-lg font-bold tracking-tight">
          {formatDayLabel(day)}
        </h3>
        <div className="flex-1 h-px bg-border" />
      </div>
      <DayDropZone day={day}>
        {dayTasks.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <AnimatePresence initial={false}>
              {dayTasks.map((t, i) => {
                const next = dayTasks[i + 1];
                const leg = next
                  ? legsWithCoords.find(
                      (l) => l.fromTaskId === t.id && l.toTaskId === next.id,
                    )
                  : undefined;
                const arr = expectedTimes[t.id]?.time ?? null;
                const legDeparture =
                  leg && arr ? addMinutes(arr, t.stay_minutes ?? 0) : null;
                return (
                  <motion.div
                    key={t.id}
                    initial={motionOn ? { opacity: 0, y: -6, scale: 0.98 } : false}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={motionOn ? { opacity: 0, x: 24, scale: 0.96 } : { opacity: 0 }}
                    transition={{ duration: motionOn ? 0.18 : 0, ease: [0.22, 1, 0.36, 1] }}
                    className="flex flex-col gap-1.5"
                  >
                    <SortableTaskRow
                      task={t}
                      onClick={() => onOpenEdit(t)}
                      onDelete={() => onDeleteTask(t.id)}
                      onToggleComplete={() => onToggleComplete(t)}
                      onSwapAlt={(idx) => onSwapAlt(t, idx)}
                      expectedTime={
                        expectedTimes[t.id]?.predicted
                          ? expectedTimes[t.id]?.time ?? null
                          : null
                      }
                    />
                    {leg && (
                      <PlanLegCard
                        leg={leg}
                        legDeparture={legDeparture}
                        onUpdateTask={onUpdateTask}
                      />
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onOpenNew(day)}
          className="self-start h-8 text-xs"
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> 일정 추가
        </Button>
      </DayDropZone>
    </section>
  );
}
