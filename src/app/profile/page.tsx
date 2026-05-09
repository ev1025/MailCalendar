"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  Upload,
  Check,
  Settings as SettingsIcon,
  Share2,
  ChevronRight,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useSupabaseAuth } from "@/lib/auth-supabase";
import { useAppUsers, useCurrentUser } from "@/lib/current-user";
import { uploadToStorage, deleteFromStorage } from "@/lib/storage";
import AvatarCropDialog from "@/components/layout/avatar-crop-dialog";
import ShareManager from "@/components/calendar/share-manager";
import PageHeader from "@/components/layout/page-header";
import ColorPickerRow from "@/components/ui/color-picker-popover";

const DEFAULT_COLOR = "#3B82F6";

const PRESET_EMOJIS = [
  "🙂", "💕", "🌸", "⭐", "🐱", "🍀", "☕", "🌙",
  "🐶", "🦊", "🐼", "🐰", "🐻", "🦁", "🐯", "🐸",
  "🌈", "🔥", "✨", "💎", "🎵", "🎨", "🚀", "⚡",
];

export default function ProfilePage() {
  return (
    <Suspense fallback={null}>
      <ProfilePageInner />
    </Suspense>
  );
}

function ProfilePageInner() {
  const router = useRouter();
  const { user: authUser, loading: authLoading } = useSupabaseAuth();
  const { updateUser } = useAppUsers();
  const currentUser = useCurrentUser();

  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🙂");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarMode, setAvatarMode] = useState<"image" | "emoji">("emoji");
  const [saving, setSaving] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const [cropping, setCropping] = useState<{ src: string } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!authUser) router.replace("/");
  }, [authLoading, authUser, router]);

  useEffect(() => {
    if (currentUser) {
      setName(currentUser.name);
      setEmoji(currentUser.emoji || "🙂");
      setColor(currentUser.color || DEFAULT_COLOR);
      setAvatarUrl(currentUser.avatar_url || "");
      setAvatarMode(currentUser.avatar_url ? "image" : "emoji");
    }
  }, [currentUser]);

  const dirty = useMemo(() => {
    if (!currentUser) return false;
    if (name.trim() !== currentUser.name) return true;
    if (avatarMode === "emoji" && emoji !== (currentUser.emoji ?? "")) return true;
    if (
      avatarMode === "image" &&
      (avatarUrl || null) !== (currentUser.avatar_url ?? null)
    )
      return true;
    if (color !== (currentUser.color ?? DEFAULT_COLOR)) return true;
    const initialMode = currentUser.avatar_url ? "image" : "emoji";
    if (avatarMode !== initialMode) return true;
    return false;
  }, [currentUser, name, emoji, color, avatarUrl, avatarMode]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10_000_000) {
      toast.error("10MB 이하 이미지만 선택할 수 있어요");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCropping({ src: reader.result as string });
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleUpdate = async () => {
    if (!currentUser || !name.trim()) {
      toast.error("이름을 입력하세요");
      return;
    }
    setSaving(true);
    const { error } = await updateUser(currentUser.id, {
      name: name.trim(),
      emoji: avatarMode === "emoji" ? emoji : null,
      color,
      avatar_url: avatarMode === "image" ? avatarUrl || null : null,
    });
    setSaving(false);
    if (error) {
      toast.error(typeof error === "string" ? error : "저장 실패");
      return;
    }
    toast.success("저장됐어요");
  };

  if (authLoading || !currentUser) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        불러오는 중...
      </div>
    );
  }

  // 미리보기 색상 + emoji/avatar 변화가 즉시 hero 에 반영되도록 반응형 값.
  const previewBg =
    avatarMode === "image" && avatarUrl
      ? "transparent"
      : `${color}30`;

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="내 프로필" showBell />

      {/* ── Hero ───────────────────────────────────────
          사용자 색 기반 radial wash + 큰 아바타 + 이름 + 이메일.
          색을 바꾸면 즉시 배경에 반영 — "이건 내 공간" 인지 강화. */}
      <section className="relative px-6 pt-8 pb-7 overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 transition-colors duration-500"
          style={{
            background: `radial-gradient(60% 60% at 50% 0%, ${color}25 0%, transparent 70%)`,
          }}
        />
        <div className="flex flex-col items-center gap-3">
          <motion.button
            type="button"
            onClick={() => {
              if (avatarMode === "image") fileRef.current?.click();
            }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: "spring", stiffness: 400, damping: 22 }}
            className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full text-[48px] overflow-hidden ring-4 ring-background shadow-lg"
            style={{ backgroundColor: previewBg, color }}
            aria-label="아바타 변경"
          >
            {avatarMode === "image" && avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt="avatar"
                className="h-full w-full object-cover"
              />
            ) : (
              emoji || (name ? name[0] : "?")
            )}
            {/* 이미지 모드일 때 작은 카메라 뱃지 (편집 가능 표시) */}
            {avatarMode === "image" && (
              <span className="absolute bottom-0 right-0 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md">
                <Pencil className="h-3.5 w-3.5" />
              </span>
            )}
          </motion.button>
          <div className="text-center">
            <p className="text-xl font-bold tracking-tight text-foreground">
              {name || "이름 없음"}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {authUser?.email}
            </p>
          </div>
        </div>
      </section>

      {/* ── 편집 카드 — 단일 통합. divide-y 로 row 구분 ── */}
      <section className="px-4 md:px-6">
        <div className="mx-auto w-full max-w-md">
          <div className="rounded-2xl border bg-card divide-y">
            {/* 이름 */}
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">
                이름
              </span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="이름"
                maxLength={20}
                className="h-9 flex-1 border-0 bg-transparent px-2 shadow-none focus-visible:ring-1 focus-visible:ring-primary/40"
              />
            </div>

            {/* 표시 모드 */}
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">
                표시
              </span>
              <div className="inline-flex rounded-full border bg-muted/40 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setAvatarMode("image")}
                  className={`px-3 py-1 rounded-full transition-colors ${
                    avatarMode === "image"
                      ? "bg-background text-foreground shadow-sm font-medium"
                      : "text-muted-foreground"
                  }`}
                >
                  이미지
                </button>
                <button
                  type="button"
                  onClick={() => setAvatarMode("emoji")}
                  className={`px-3 py-1 rounded-full transition-colors ${
                    avatarMode === "emoji"
                      ? "bg-background text-foreground shadow-sm font-medium"
                      : "text-muted-foreground"
                  }`}
                >
                  이모지
                </button>
              </div>
            </div>

            {/* 모드 별 컨텐츠 */}
            {avatarMode === "image" ? (
              <div className="px-4 py-3 flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileRef.current?.click()}
                  className="h-9 w-full"
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" /> 이미지 업로드
                </Button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl("")}
                    className="text-[11px] text-muted-foreground hover:text-foreground self-end"
                  >
                    아바타 초기화
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>
            ) : (
              <>
                {/* 색상 row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <span className="text-xs font-medium text-muted-foreground w-14 shrink-0">
                    색상
                  </span>
                  <div className="flex-1 min-w-0">
                    <ColorPickerRow color={color} onChange={setColor} />
                  </div>
                </div>

                {/* 이모지 그리드 */}
                <div className="px-4 py-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    이모지
                  </p>
                  <div className="grid grid-cols-8 gap-1">
                    {PRESET_EMOJIS.map((e) => (
                      <motion.button
                        key={e}
                        type="button"
                        onClick={() => setEmoji(e)}
                        whileTap={{ scale: 0.88 }}
                        whileHover={{ scale: 1.08 }}
                        transition={{
                          type: "spring",
                          stiffness: 400,
                          damping: 20,
                        }}
                        className={`flex h-8 w-full items-center justify-center rounded-md text-base transition-colors ${
                          emoji === e
                            ? "ring-2 ring-primary bg-primary/10"
                            : "hover:bg-accent"
                        }`}
                      >
                        {e}
                      </motion.button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 저장 CTA — 카드 외부 강조. dirty 일 때만 활성. */}
          <Button
            type="button"
            onClick={handleUpdate}
            disabled={!name.trim() || !dirty || saving}
            className="mt-4 h-11 w-full text-sm font-semibold"
          >
            <Check className="mr-1.5 h-4 w-4" />
            {saving ? "저장 중..." : dirty ? "변경사항 저장" : "변경 없음"}
          </Button>
        </div>
      </section>

      {/* ── 더 보기 — 액션 row (공유 / 설정) ── */}
      <section className="px-4 md:px-6 mt-6 mb-10">
        <div className="mx-auto w-full max-w-md">
          <div className="rounded-2xl border bg-card divide-y overflow-hidden">
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/40 transition-colors"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                <Share2 className="h-4 w-4" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold">캘린더 공유</span>
                <span className="block text-[11px] text-muted-foreground">
                  함께 보고 싶은 사람을 초대하거나 수락한 공유를 관리해요
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />
            </button>
            <button
              type="button"
              onClick={() => router.push("/settings")}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/40 transition-colors"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground shrink-0">
                <SettingsIcon className="h-4 w-4" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold">설정</span>
                <span className="block text-[11px] text-muted-foreground">
                  테마, 일기예보 지역, D-day, 계정
                </span>
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground/60 shrink-0" />
            </button>
          </div>
        </div>
      </section>

      <AvatarCropDialog
        src={cropping?.src ?? null}
        open={!!cropping}
        onOpenChange={(o) => {
          if (!o) setCropping(null);
        }}
        onConfirm={async (dataUrl) => {
          const prevUrl = avatarUrl;
          const { url, error } = await uploadToStorage(
            "avatars",
            dataUrl,
            "jpg",
          );
          if (error || !url) {
            toast.error(error || "이미지 업로드 실패");
            return;
          }
          setAvatarUrl(url);
          setAvatarMode("image");
          if (
            prevUrl &&
            prevUrl.includes("/storage/v1/object/public/avatars/")
          ) {
            deleteFromStorage("avatars", prevUrl);
          }
        }}
      />

      <ShareManager open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  );
}
