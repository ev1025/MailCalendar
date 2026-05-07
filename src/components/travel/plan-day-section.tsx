"use client";

import { AnimatePresence, motion } from "motion/react";
import { useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import PlanTaskRow from "@/components/travel/plan-task-row";
import PlanLegCard from "@/components/travel/plan-leg-card";
import PlanDaySummary from "@/components/travel/plan-day-summary";
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
  expectedTime?: string | null;
}

function SortableTaskRow({
  task,
  onClick,
  onDelete,
  onToggleComplete,
  expectedTime,
}: SortableTaskRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });
  const dragProps = toDragProps<HTMLButtonElement>({ attributes, listeners });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style}>
      <PlanTaskRow
        task={task}
        onClick={onClick}
        onDelete={onDelete}
        onToggleComplete={onToggleComplete}
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
  onUpdateTask,
  onOpenNew,
}: Props) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold">{formatDayLabel(day)}</h3>
        <div className="flex-1 h-px bg-border" />
      </div>
      <PlanDaySummary dayTasks={dayTasks} expectedTimes={expectedTimes} />
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
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 24, scale: 0.96 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    className="flex flex-col gap-1.5"
                  >
                    <SortableTaskRow
                      task={t}
                      onClick={() => onOpenEdit(t)}
                      onDelete={() => onDeleteTask(t.id)}
                      onToggleComplete={() => onToggleComplete(t)}
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
