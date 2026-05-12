"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
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

const DEFAULT_COLOR = "#3B82F6";
const AVATAR_MAX_BYTES = 10 * 1024 * 1024;

// 페이지 진입 stagger — Hero(그라데이션→아바타→이름) → 섹션들이 순차 등장.
const reveal = (delay: number) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const, delay },
});

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </p>
  );
}

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

  if (authLoading || !currentUser) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        불러오는 중...
      </div>
    );
  }

  const previewBg =
    avatarMode === "image" && avatarUrl ? "transparent" : `${color}28`;

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
          사용자 색을 화면 끝까지 채우는 그라데이션 메시로 — "이건 내 공간".
          아바타가 그 위에 떠 있고, 이름은 Montserrat 디스플레이로 크게. */}
      <section className="relative overflow-hidden">
        <motion.div
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="pointer-events-none absolute inset-0 -z-10"
        >
          <div
            className="absolute inset-0 transition-[background] duration-500"
            style={{
              background: `radial-gradient(78% 110% at 28% -10%, ${color}40, transparent 58%), radial-gradient(64% 88% at 92% 6%, ${color}22, transparent 54%)`,
            }}
          />
          {/* 하단을 배경색으로 페이드 — 섹션과 자연스럽게 이어짐 */}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-background" />
        </motion.div>

        <div className="flex flex-col items-center gap-4 px-6 pt-9 pb-7 md:pt-12 md:pb-8">
          <motion.button
            {...reveal(0.05)}
            type="button"
            onClick={() => {
              if (avatarMode === "image") fileRef.current?.click();
            }}
            whileTap={{ scale: 0.96 }}
            className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-[2rem] text-[44px] shadow-xl ring-[5px] ring-background md:h-28 md:w-28 md:text-[52px]"
            style={{ backgroundColor: previewBg, color }}
            aria-label={avatarMode === "image" ? "아바타 이미지 변경" : "이모지는 아래에서 선택"}
          >
            {avatarMode === "image" && avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
            ) : (
              emoji || (name ? name[0] : "?")
            )}
          </motion.button>

          <motion.div {...reveal(0.12)} className="text-center">
            <h1 className="font-[family-name:var(--font-montserrat)] text-[28px] font-black leading-none tracking-tight text-foreground md:text-3xl">
              {name || "이름 없음"}
            </h1>
            <p className="mt-1.5 text-xs text-muted-foreground">{authUser?.email}</p>
          </motion.div>
        </div>
      </section>

      {/* ── 편집 ──────────────────────────────────────────────────────
          섹션 라벨 + row 리스트(iOS 설정 결). 이름/표시/모드별 옵션. */}
      <motion.section
        {...reveal(0.18)}
        className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 pb-12 md:px-6"
      >
        <div>
          <SectionLabel>아이덴티티</SectionLabel>
          <div className="overflow-hidden rounded-2xl border bg-card divide-y divide-border/60">
            {/* 이름 */}
            <div className="flex items-center gap-3 px-4 py-3.5">
              <span className="w-12 shrink-0 text-xs font-medium text-muted-foreground">
                이름
              </span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="이름"
                maxLength={20}
                className="h-9 flex-1 border-0 bg-transparent px-2 text-base font-medium shadow-none focus-visible:ring-1 focus-visible:ring-primary/40 md:h-9"
              />
            </div>

            {/* 표시 모드 — 아이콘 세그먼트 */}
            <div className="flex items-center gap-3 px-4 py-3.5">
              <span className="w-12 shrink-0 text-xs font-medium text-muted-foreground">
                표시
              </span>
              <div className="inline-flex rounded-full border bg-muted/40 p-0.5 text-xs">
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
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors ${
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
            </div>
          </div>
        </div>

        {avatarMode === "image" ? (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <SectionLabel>아바타 이미지</SectionLabel>
            <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
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
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-6"
          >
            <div>
              <SectionLabel>강조 색</SectionLabel>
              <div className="rounded-2xl border bg-card px-4 py-3.5">
                <ColorPickerRow color={color} onChange={setColor} />
              </div>
            </div>

            <div>
              <SectionLabel>이모지</SectionLabel>
              <div className="rounded-2xl border bg-card p-3">
                <div className="grid grid-cols-6 gap-1.5">
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
                        className={`flex h-10 w-full items-center justify-center rounded-xl text-lg transition-colors ${
                          active
                            ? "bg-primary/10 ring-2 ring-primary"
                            : "hover:bg-accent"
                        }`}
                      >
                        {e}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* 저장 — dirty 일 때만 활성. */}
        <motion.div
          animate={dirty ? { y: [-2, 0] } : { y: 0 }}
          transition={{ type: "spring", stiffness: 500, damping: 18 }}
        >
          <Button
            type="button"
            onClick={handleUpdate}
            disabled={!name.trim() || !dirty || saving}
            className="h-12 w-full text-sm font-semibold"
          >
            <Check className="mr-1.5 h-4 w-4" />
            {saving ? "저장 중..." : dirty ? "변경사항 저장" : "저장됨"}
          </Button>
        </motion.div>
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
