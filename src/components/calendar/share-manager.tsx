"use client";

import { useMemo, useState } from "react";
import PanelDialog from "@/components/ui/panel-dialog";
import { Button } from "@/components/ui/button";
import { UserPlus, X, Users, Check } from "lucide-react";
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
  size = 36,
}: {
  user: { emoji: string | null; avatar_url: string | null; name: string; color: string };
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
        <img src={user.avatar_url} alt={user.name} className="h-full w-full object-cover" />
      ) : (
        user.emoji || user.name[0]
      )}
    </span>
  );
}

/**
 * 한 사용자의 공유 상태 — 다섯 가지 중 하나.
 *  - sharing: 양방향 또는 단방향 공유 중(accepted)
 *  - incoming: 상대가 내게 공유 요청(pending) — 수락/거절
 *  - outgoing: 내가 상대에게 보낸 요청(pending) — 응답 대기
 *  - none: 관계 없음 — 초대 가능
 */
type ShareState =
  | { kind: "sharing"; shareIds: string[] /* 해제 시 모두 cancel */ }
  | { kind: "incoming"; shareId: string }
  | { kind: "outgoing"; shareId: string }
  | { kind: "none" };

interface UserRow {
  user: { id: string; emoji: string | null; avatar_url: string | null; name: string; color: string };
  state: ShareState;
}

const STATE_PRIORITY: Record<ShareState["kind"], number> = {
  incoming: 0,  // 받은 요청 — 사용자 액션 필요
  sharing: 1,   // 공유 중
  outgoing: 2,  // 보낸 요청 (대기)
  none: 3,      // 초대 가능
};

/**
 * 캘린더 공유 관리자 — 사용자별 단일 리스트.
 * 한 사용자가 여러 섹션에 중복 표시되던 문제 수정 — 각 사용자는 정확히 하나의 상태를 가짐.
 * 우선순위: 받은 요청 → 공유 중 → 보낸 요청 → 초대 가능.
 */
export default function ShareManager({ open, onOpenChange }: Props) {
  const { users } = useAppUsers();
  const currentUserId = useCurrentUserId();
  const { outgoing, incoming, invite, accept, reject, cancel } =
    useCalendarShares();
  const [cancelTarget, setCancelTarget] = useState<
    | { ids: string[]; name: string; mode: "reject-incoming" | "remove-accepted" | "cancel-outgoing" }
    | null
  >(null);

  // 모든 다른 사용자에 대해 단일 상태 산출 — 공유중 ⊃ 받은요청 ⊃ 보낸요청 ⊃ 없음.
  const rows = useMemo<UserRow[]>(() => {
    const others = users.filter((u) => u.id !== currentUserId);
    const list: UserRow[] = others.map((u) => {
      // 양방향 모두 검사. 한 사람과 중복 share 가 있을 수 있어 모두 수집.
      const inAcc = incoming.filter((s) => s.owner_id === u.id && s.status === "accepted");
      const outAcc = outgoing.filter((s) => s.viewer_id === u.id && s.status === "accepted");
      if (inAcc.length > 0 || outAcc.length > 0) {
        return {
          user: u,
          state: {
            kind: "sharing",
            shareIds: [...inAcc.map((s) => s.id), ...outAcc.map((s) => s.id)],
          },
        };
      }
      const inPen = incoming.find((s) => s.owner_id === u.id && s.status === "pending");
      if (inPen) return { user: u, state: { kind: "incoming", shareId: inPen.id } };
      const outPen = outgoing.find((s) => s.viewer_id === u.id && s.status === "pending");
      if (outPen) return { user: u, state: { kind: "outgoing", shareId: outPen.id } };
      return { user: u, state: { kind: "none" } };
    });
    return list.sort((a, b) => {
      const p = STATE_PRIORITY[a.state.kind] - STATE_PRIORITY[b.state.kind];
      if (p !== 0) return p;
      return a.user.name.localeCompare(b.user.name);
    });
  }, [users, currentUserId, incoming, outgoing]);

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
  const confirmLabel = cancelTarget?.mode === "reject-incoming" ? "거절" : "확인";

  if (rows.length === 0) {
    return (
      <PanelDialog open={open} onOpenChange={onOpenChange} title="캘린더 공유">
        <div className="px-4 py-4">
          <EmptyState text="공유 가능한 사용자가 없어요" />
        </div>
      </PanelDialog>
    );
  }

  return (
    <PanelDialog open={open} onOpenChange={onOpenChange} title="캘린더 공유">
      <div className="px-4 py-4">
        <ul className="flex flex-col gap-2">
          {rows.map(({ user, state }) => (
            <li
              key={user.id}
              className="flex items-center gap-3 rounded-xl border bg-card p-3"
            >
              <Avatar user={user} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{user.name}</p>
                {state.kind === "sharing" && (
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <Check className="h-3 w-3" />
                    공유 중
                  </p>
                )}
                {state.kind === "incoming" && (
                  <p className="text-[11px] text-primary">
                    내 캘린더 보기 요청
                  </p>
                )}
                {state.kind === "outgoing" && (
                  <p className="text-[11px] text-muted-foreground">
                    응답 대기 중
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {state.kind === "sharing" && (
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
                )}
                {state.kind === "incoming" && (
                  <>
                    <Button
                      size="sm"
                      className="h-9 px-3 text-xs"
                      onClick={() => accept(state.shareId)}
                    >
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
                  </>
                )}
                {state.kind === "outgoing" && (
                  <button
                    type="button"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    onClick={() =>
                      setCancelTarget({
                        ids: [state.shareId],
                        name: user.name,
                        mode: "cancel-outgoing",
                      })
                    }
                    aria-label="초대 취소"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {state.kind === "none" && (
                  <Button
                    size="sm"
                    className="h-9 px-3 text-xs"
                    onClick={() => handleInvite(user.id)}
                  >
                    <UserPlus className="mr-1 h-3.5 w-3.5" />
                    초대
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
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
            // sharing 해제 / outgoing 취소 둘 다 cancel — 양방향 share 가 둘 다 있을 수도 있어 모두 처리.
            await Promise.all(cancelTarget.ids.map((id) => cancel(id)));
          }
          setCancelTarget(null);
        }}
      />
    </PanelDialog>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Users className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm text-muted-foreground break-keep">{text}</p>
    </div>
  );
}
