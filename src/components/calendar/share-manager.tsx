"use client";

import { useEffect, useMemo, useState } from "react";
import PanelDialog from "@/components/ui/panel-dialog";
import { Button } from "@/components/ui/button";
import {
  UserPlus,
  X,
  Users,
  Check,
  ArrowLeftRight,
  Inbox,
  Send,
  Mail,
} from "lucide-react";
import { useCalendarShares } from "@/hooks/use-calendar-shares";
import { useAppUsers, useCurrentUserId } from "@/lib/current-user";
import { toast } from "sonner";
import ConfirmDialog from "@/components/ui/confirm-dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Avatar({
  user,
  size = 40,
}: {
  user: {
    emoji: string | null;
    avatar_url: string | null;
    name: string;
    color: string;
  };
  size?: number;
}) {
  return (
    <span
      className="flex items-center justify-center rounded-full text-base shrink-0 overflow-hidden"
      style={
        user.avatar_url
          ? { width: size, height: size, backgroundColor: "transparent" }
          : {
              width: size,
              height: size,
              backgroundColor: user.color + "25",
              color: user.color,
            }
      }
    >
      {user.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={user.avatar_url}
          alt={user.name}
          className="h-full w-full object-cover"
        />
      ) : (
        user.emoji || user.name[0]
      )}
    </span>
  );
}

type ShareState =
  | { kind: "sharing"; shareIds: string[] }
  | { kind: "incoming"; shareId: string }
  | { kind: "outgoing"; shareId: string }
  | { kind: "none" };

interface UserRow {
  user: {
    id: string;
    emoji: string | null;
    avatar_url: string | null;
    name: string;
    color: string;
  };
  state: ShareState;
}

/**
 * 캘린더 공유 관리 — 시니어 디자이너 관점 재설계.
 *
 * 구조:
 *   1. Hero — 아이콘 + 한 줄 설명. 사용자에게 "어떤 화면인지" 즉각 인지.
 *   2. 섹션 그룹 — 사용자 액션 필요도 순:
 *      [받은 요청] → [공유 중] → [응답 대기] → [초대 가능]
 *      각 섹션은 카운트 뱃지 + 색 톤 차별화.
 *   3. 카드 톤:
 *      - incoming: primary tint + ring (액션 필요)
 *      - sharing: emerald accent (활성 양방향)
 *      - outgoing: muted (수동 대기)
 *      - none: neutral (초대 가능)
 */
export default function ShareManager({ open, onOpenChange }: Props) {
  const { users, refetch: refetchUsers } = useAppUsers();
  const currentUserId = useCurrentUserId();
  const {
    outgoing,
    incoming,
    invite,
    accept,
    reject,
    cancel,
    refetch: refetchShares,
  } = useCalendarShares();
  const [cancelTarget, setCancelTarget] = useState<
    | {
        ids: string[];
        name: string;
        mode:
          | "reject-incoming"
          | "remove-accepted"
          | "cancel-outgoing";
      }
    | null
  >(null);

  useEffect(() => {
    if (!open) return;
    refetchShares();
    refetchUsers();
  }, [open, refetchShares, refetchUsers]);

  // 사용자별 단일 상태 산출.
  const rows = useMemo<UserRow[]>(() => {
    const others = users.filter((u) => u.id !== currentUserId);
    return others.map((u) => {
      const inAcc = incoming.filter(
        (s) => s.owner_id === u.id && s.status === "accepted",
      );
      const outAcc = outgoing.filter(
        (s) => s.viewer_id === u.id && s.status === "accepted",
      );
      if (inAcc.length > 0 || outAcc.length > 0) {
        return {
          user: u,
          state: {
            kind: "sharing",
            shareIds: [
              ...inAcc.map((s) => s.id),
              ...outAcc.map((s) => s.id),
            ],
          },
        };
      }
      const inPen = incoming.find(
        (s) => s.owner_id === u.id && s.status === "pending",
      );
      if (inPen) return { user: u, state: { kind: "incoming", shareId: inPen.id } };
      const outPen = outgoing.find(
        (s) => s.viewer_id === u.id && s.status === "pending",
      );
      if (outPen) return { user: u, state: { kind: "outgoing", shareId: outPen.id } };
      return { user: u, state: { kind: "none" } };
    });
  }, [users, currentUserId, incoming, outgoing]);

  // 섹션별 분리 — 액션 우선순위 순서.
  const incomingRows = rows.filter((r) => r.state.kind === "incoming");
  const sharingRows = rows.filter((r) => r.state.kind === "sharing");
  const outgoingRows = rows.filter((r) => r.state.kind === "outgoing");
  const inviteRows = rows
    .filter((r) => r.state.kind === "none")
    .sort((a, b) => a.user.name.localeCompare(b.user.name));

  const handleInvite = async (viewerId: string) => {
    const { error } = await invite(viewerId);
    if (error === "already invited") toast.info("이미 초대했습니다");
    else if (error) toast.error("초대 실패");
    else toast.success("초대를 보냈습니다");
  };

  const confirmTitle =
    cancelTarget?.mode === "reject-incoming"
      ? "공유 거절"
      : cancelTarget?.mode === "remove-accepted"
        ? "공유 해제"
        : "초대 취소";
  const confirmDesc =
    cancelTarget?.mode === "reject-incoming"
      ? `${cancelTarget?.name}님이 보낸 공유 요청을 거절합니다.`
      : cancelTarget?.mode === "remove-accepted"
        ? `${cancelTarget?.name}님과의 공유 연결을 해제합니다.`
        : `${cancelTarget?.name}님에게 보낸 초대를 취소합니다.`;
  const confirmLabel =
    cancelTarget?.mode === "reject-incoming" ? "거절" : "확인";

  // 공유할 사람 자체가 없는 경우 — 빈 상태.
  if (rows.length === 0) {
    return (
      <PanelDialog open={open} onOpenChange={onOpenChange} title="캘린더 공유">
        <div className="px-4 py-12 flex flex-col items-center gap-3 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Users className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">아직 공유할 사람이 없어요</p>
          <p className="text-xs text-muted-foreground max-w-[260px] leading-relaxed">
            함께 사용하는 사람이 매직링크로 가입하면 여기에서 캘린더를 초대할 수
            있어요.
          </p>
        </div>
      </PanelDialog>
    );
  }

  return (
    <PanelDialog open={open} onOpenChange={onOpenChange} title="캘린더 공유">
      <div className="px-4 py-4 flex flex-col gap-5">
        {/* Hero / 안내 */}
        <p className="text-xs text-muted-foreground leading-relaxed px-1">
          서로 캘린더를 공유하면 일정과 D-day, 태그 색상을 같이 볼 수 있어요.
          한쪽이 수락하면 양방향으로 자동 연결됩니다.
        </p>

        {/* 받은 요청 — 액션 우선순위 1순위, primary tint */}
        {incomingRows.length > 0 && (
          <Section
            title="받은 요청"
            count={incomingRows.length}
            icon={<Inbox className="h-3.5 w-3.5" />}
            tone="primary"
            hint="수락하면 상대 캘린더가 보여요"
          >
            {incomingRows.map(({ user, state }) => {
              if (state.kind !== "incoming") return null;
              return (
                <li
                  key={user.id}
                  className="flex items-center gap-3 rounded-xl border-2 border-primary/30 bg-primary/5 p-3"
                >
                  <Avatar user={user} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {user.name}
                    </p>
                    <p className="text-[11px] text-primary mt-0.5">
                      {user.name}님이 캘린더를 공유했어요
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      className="h-9 px-3 text-xs"
                      onClick={() => accept(state.shareId)}
                    >
                      <Check className="mr-1 h-3.5 w-3.5" />
                      수락
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 px-3 text-xs"
                      onClick={() =>
                        setCancelTarget({
                          ids: [state.shareId],
                          name: user.name,
                          mode: "reject-incoming",
                        })
                      }
                    >
                      거절
                    </Button>
                  </div>
                </li>
              );
            })}
          </Section>
        )}

        {/* 공유 중 — emerald accent + 양방향 ↔ 아이콘 */}
        {sharingRows.length > 0 && (
          <Section
            title="공유 중"
            count={sharingRows.length}
            icon={<ArrowLeftRight className="h-3.5 w-3.5" />}
            tone="success"
            hint="서로 일정을 볼 수 있어요"
          >
            {sharingRows.map(({ user, state }) => {
              if (state.kind !== "sharing") return null;
              return (
                <li
                  key={user.id}
                  className="flex items-center gap-3 rounded-xl border bg-card p-3"
                >
                  <Avatar user={user} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {user.name}
                    </p>
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                      <ArrowLeftRight className="h-3 w-3" />
                      양방향 공유 중
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9 px-3 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      setCancelTarget({
                        ids: state.shareIds,
                        name: user.name,
                        mode: "remove-accepted",
                      })
                    }
                  >
                    해제
                  </Button>
                </li>
              );
            })}
          </Section>
        )}

        {/* 보낸 요청 — muted */}
        {outgoingRows.length > 0 && (
          <Section
            title="응답 대기"
            count={outgoingRows.length}
            icon={<Send className="h-3.5 w-3.5" />}
            tone="muted"
            hint="상대 답을 기다리는 중"
          >
            {outgoingRows.map(({ user, state }) => {
              if (state.kind !== "outgoing") return null;
              return (
                <li
                  key={user.id}
                  className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3"
                >
                  <Avatar user={user} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-muted-foreground">
                      {user.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                      답장을 기다리고 있어요
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label="초대 취소"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    onClick={() =>
                      setCancelTarget({
                        ids: [state.shareId],
                        name: user.name,
                        mode: "cancel-outgoing",
                      })
                    }
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </Section>
        )}

        {/* 초대 가능 — 없을 수도 있음 */}
        {inviteRows.length > 0 && (
          <Section
            title="초대 가능"
            count={inviteRows.length}
            icon={<Mail className="h-3.5 w-3.5" />}
            tone="neutral"
          >
            {inviteRows.map(({ user }) => (
              <li
                key={user.id}
                className="flex items-center gap-3 rounded-xl border bg-card p-3 hover:bg-accent/30 transition-colors"
              >
                <Avatar user={user} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user.name}</p>
                </div>
                <Button
                  size="sm"
                  className="h-9 px-3 text-xs"
                  onClick={() => handleInvite(user.id)}
                >
                  <UserPlus className="mr-1 h-3.5 w-3.5" />
                  초대
                </Button>
              </li>
            ))}
          </Section>
        )}
      </div>

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(o) => {
          if (!o) setCancelTarget(null);
        }}
        title={confirmTitle}
        description={confirmDesc}
        confirmLabel={confirmLabel}
        destructive
        contentClassName="z-[80]"
        onConfirm={async () => {
          if (!cancelTarget) return;
          if (cancelTarget.mode === "reject-incoming") {
            await Promise.all(cancelTarget.ids.map((id) => reject(id)));
          } else {
            await Promise.all(cancelTarget.ids.map((id) => cancel(id)));
          }
          setCancelTarget(null);
        }}
      />
    </PanelDialog>
  );
}

/**
 * 상태별 섹션 헤더 + ul 컨테이너. tone 으로 헤더 색 차별화.
 */
function Section({
  title,
  count,
  icon,
  tone,
  hint,
  children,
}: {
  title: string;
  count: number;
  icon: React.ReactNode;
  tone: "primary" | "success" | "muted" | "neutral";
  hint?: string;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "primary"
      ? "text-primary"
      : tone === "success"
        ? "text-emerald-600 dark:text-emerald-400"
        : tone === "muted"
          ? "text-muted-foreground"
          : "text-foreground/80";
  const badgeClass =
    tone === "primary"
      ? "bg-primary/10 text-primary"
      : tone === "success"
        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        : tone === "muted"
          ? "bg-muted text-muted-foreground"
          : "bg-muted text-foreground/70";
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 px-1">
        <span className={`flex items-center gap-1.5 ${toneClass}`}>
          {icon}
          <span className="text-[11px] font-bold uppercase tracking-wider">
            {title}
          </span>
        </span>
        <span
          className={`flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums ${badgeClass}`}
        >
          {count}
        </span>
        {hint && (
          <span className="ml-auto text-[10px] text-muted-foreground/60">
            {hint}
          </span>
        )}
      </div>
      <ul className="flex flex-col gap-2">{children}</ul>
    </div>
  );
}
