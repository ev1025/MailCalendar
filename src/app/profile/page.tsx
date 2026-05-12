"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  Upload,
  Check,
  Settings as SettingsIcon,
  Share2,
  ImageIcon,
  Smile,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useSupabaseAuth } from "@/lib/auth-supabase";
import { useAppUsers, useCurrentUser } from "@/lib/current-user";
import { uploadToStorage, deleteFromStorage } from "@/lib/storage";
import { PRESET_EMOJIS } from "@/lib/preset-emojis";
import AvatarCropDialog from "@/components/layout/avatar-crop-dialog";
import ShareManager from "@/components/calendar/share-manager";
import PageHeader from "@/components/layout/page-header";
import ColorPickerRow from "@/components/ui/color-picker-popover";
import SectionLabel from "@/components/ui/section-label";

const DEFAULT_COLOR = "#3B82F6";
const AVATAR_MAX_BYTES = 10 * 1024 * 1024;

// 페이지 진입 stagger — Hero → 섹션들이 순차 등장.
const reveal = (delay: number) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const, delay },
});

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
  const emojiGridRef = useRef<HTMLDivElement>(null);
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

  const handleImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > AVATAR_MAX_BYTES) {
        toast.error("10MB 이하 이미지만 선택할 수 있어요");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => setCropping({ src: reader.result as string });
      reader.readAsDataURL(file);
      e.target.value = "";
    },
    [],
  );

  const handleUpdate = useCallback(async () => {
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
  }, [currentUser, name, emoji, color, avatarUrl, avatarMode, updateUser]);

  // Hero 아바타 클릭: 이미지 모드면 파일 선택, 이모지 모드면 아래 이모지 그리드로 스크롤.
  const handleAvatarClick = useCallback(() => {
    if (avatarMode === "image") {
      fileRef.current?.click();
    } else {
      emojiGridRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [avatarMode]);

  if (authLoading || !currentUser) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        불러오는 중...
      </div>
    );
  }

  const isImageAvatar = avatarMode === "image" && !!avatarUrl;

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="내 프로필"
        showBell
        actions={
          <div className="flex items-center gap-1">
            <motion.button
              type="button"
              onClick={() => setShareOpen(true)}
              aria-label="캘린더 공유"
              whileTap={{ scale: 0.92 }}
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <Share2 className="h-5 w-5" strokeWidth={1.6} />
            </motion.button>
            <motion.button
              type="button"
              onClick={() => router.push("/settings")}
              aria-label="설정"
              whileTap={{ scale: 0.92 }}
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <SettingsIcon className="h-5 w-5" strokeWidth={1.6} />
            </motion.button>
          </div>
        }
      />

      {/* ── Hero ──────────────────────────────────────────────────────
          배경 색 워시 없음(아바타가 주인공). 컴팩트하게 — 1뷰포트 안에 편집부까지. */}
      <section className="relative">
        <div className="flex flex-col items-center gap-2.5 px-6 pt-5 pb-4 md:pt-7 md:pb-5">
          <motion.button
            {...reveal(0.04)}
            type="button"
            onClick={handleAvatarClick}
            whileTap={{ scale: 0.96 }}
            className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-[1.6rem] text-[36px] shadow-lg ring-4 ring-background md:h-24 md:w-24 md:text-[44px]"
            style={{
              backgroundColor: isImageAvatar ? "var(--card)" : `${color}28`,
              color,
            }}
            aria-label={avatarMode === "image" ? "아바타 이미지 변경" : "이모지 선택으로 이동"}
          >
            {isImageAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
            ) : (
              emoji || (name ? name[0] : "?")
            )}
          </motion.button>

          <motion.div {...reveal(0.1)} className="text-center">
            <h1 className="font-display text-2xl font-black leading-none tracking-tight text-foreground md:text-[28px]">
              {name || "이름 없음"}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">{authUser?.email}</p>
          </motion.div>
        </div>
      </section>

      {/* ── 편집 ──────────────────────────────────────────────────────
          이름 / 프로필 사진(표시 모드 + 모드별) / (이모지 모드면) 강조 색·이모지. */}
      <motion.section
        {...reveal(0.16)}
        className="mx-auto flex w-full max-w-md flex-col gap-4 px-4 pb-6 md:px-6"
      >
        {/* 이름 */}
        <div>
          <SectionLabel>이름</SectionLabel>
          <div className="rounded-xl border bg-card px-4 py-2.5">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름"
              maxLength={20}
              className="h-9 w-full border-0 bg-transparent px-0 text-base font-medium shadow-none focus-visible:ring-0 md:h-9"
            />
          </div>
        </div>

        {/* 프로필 사진 — 표시 모드 세그먼트 + 모드별 컨텐츠 */}
        <div>
          <SectionLabel>프로필 사진</SectionLabel>
          <div className="rounded-xl border bg-card p-3">
            <div className="mb-3 inline-flex w-full rounded-full border bg-muted/40 p-0.5 text-xs">
              {([
                { mode: "image" as const, icon: ImageIcon, label: "이미지" },
                { mode: "emoji" as const, icon: Smile, label: "이모지" },
              ]).map(({ mode, icon: Icon, label }) => {
                const active = avatarMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setAvatarMode(mode)}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 transition-colors ${
                      active
                        ? "bg-background text-foreground shadow-sm font-medium"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>

            {avatarMode === "image" ? (
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileRef.current?.click()}
                  className="h-10 w-full"
                >
                  <Upload className="mr-1.5 h-4 w-4" /> 이미지 업로드 (10MB 이하)
                </Button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => setAvatarUrl("")}
                    className="self-end text-[11px] text-muted-foreground hover:text-foreground"
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
              <div className="flex flex-col gap-3">
                {/* 강조 색 */}
                <div className="flex items-center gap-3">
                  <span className="w-12 shrink-0 text-[11px] font-medium text-muted-foreground">
                    강조 색
                  </span>
                  <div className="min-w-0 flex-1">
                    <ColorPickerRow color={color} onChange={setColor} />
                  </div>
                </div>
                {/* 이모지 그리드 — 8 cols(3행) 으로 세로 압축 */}
                <div ref={emojiGridRef} className="grid grid-cols-8 gap-1.5">
                  {PRESET_EMOJIS.map((e) => {
                    const active = emoji === e;
                    return (
                      <motion.button
                        key={e}
                        type="button"
                        onClick={() => setEmoji(e)}
                        whileTap={{ scale: 0.85 }}
                        whileHover={{ scale: 1.1 }}
                        transition={{ type: "spring", stiffness: 420, damping: 20 }}
                        className={`flex h-9 w-full items-center justify-center rounded-lg text-base transition-colors ${
                          active ? "bg-primary/10 ring-2 ring-primary" : "hover:bg-accent"
                        }`}
                      >
                        {e}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 저장 — dirty 일 때만 등장(이전 disabled "저장됨" dead-end 제거). */}
        <AnimatePresence>
          {dirty && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ type: "spring", stiffness: 420, damping: 28 }}
            >
              <Button
                type="button"
                onClick={handleUpdate}
                disabled={!name.trim() || saving}
                className="h-12 w-full text-sm font-semibold"
              >
                <Check className="mr-1.5 h-4 w-4" />
                {saving ? "저장 중..." : "변경사항 저장"}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>

      <AvatarCropDialog
        src={cropping?.src ?? null}
        open={!!cropping}
        onOpenChange={(o) => {
          if (!o) setCropping(null);
        }}
        onConfirm={async (dataUrl) => {
          const prevUrl = avatarUrl;
          const { url, error } = await uploadToStorage("avatars", dataUrl, "jpg");
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
