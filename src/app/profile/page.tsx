"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Upload,
  Check,
  Settings as SettingsIcon,
  Share2,
  ChevronRight,
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

  // 변경사항 dirty 판정 — 저장 버튼 활성/비활성에 사용.
  const dirty =
    !!currentUser &&
    (name.trim() !== currentUser.name ||
      (avatarMode === "emoji" && emoji !== (currentUser.emoji ?? "")) ||
      (avatarMode === "image" &&
        (avatarUrl || null) !== (currentUser.avatar_url ?? null)) ||
      color !== (currentUser.color ?? DEFAULT_COLOR) ||
      (currentUser.avatar_url ? avatarMode !== "image" : avatarMode !== "emoji"));

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

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="내 프로필"
        showBell
        actions={
          <button
            type="button"
            onClick={() => router.push("/settings")}
            aria-label="설정"
            className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-accent transition-colors"
          >
            <SettingsIcon className="h-5 w-5" strokeWidth={1.6} />
          </button>
        }
      />

      <div className="flex-1 px-4 py-6 md:px-6 md:py-8">
        <div className="w-full max-w-md mx-auto flex flex-col gap-4">
          {/* 헤더 — 아바타 + 이름 + 이메일. 큰 시각 정보. */}
          <section className="flex flex-col items-center gap-2 pb-2">
            <button
              type="button"
              onClick={() => {
                if (avatarMode === "image") fileRef.current?.click();
              }}
              className="relative flex h-24 w-24 shrink-0 items-center justify-center rounded-full text-[42px] overflow-hidden ring-1 ring-border/40 transition-transform active:scale-95"
              style={
                avatarUrl && avatarMode === "image"
                  ? { backgroundColor: "transparent" }
                  : { backgroundColor: color + "30", color }
              }
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
            </button>
            <p className="text-base font-semibold text-foreground">
              {name || "이름 없음"}
            </p>
            <p className="text-xs text-muted-foreground">{authUser?.email}</p>
          </section>

          {/* 카드 1: 이름 — 한 줄 inline 형태 (라벨 + Input) */}
          <section className="rounded-xl border bg-card flex items-center gap-3 px-4 py-3">
            <span className="text-sm font-semibold shrink-0">이름</span>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름"
              maxLength={20}
              className="h-9 flex-1"
            />
          </section>

          {/* 카드 2: 아바타 — 이미지 / 이모지 모드 분기 */}
          <section className="rounded-xl border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <h2 className="text-sm font-semibold">아바타</h2>
              {/* 모드 세그먼트 — 헤더 우측에 배치, 시각적으로 명확. */}
              <div className="inline-flex rounded-full border bg-muted/40 p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setAvatarMode("image")}
                  className={`px-2.5 py-0.5 rounded-full transition-colors ${
                    avatarMode === "image"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground"
                  }`}
                >
                  이미지
                </button>
                <button
                  type="button"
                  onClick={() => setAvatarMode("emoji")}
                  className={`px-2.5 py-0.5 rounded-full transition-colors ${
                    avatarMode === "emoji"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground"
                  }`}
                >
                  이모지
                </button>
              </div>
            </div>
            <div className="p-4 flex flex-col gap-3">
              {avatarMode === "image" ? (
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileRef.current?.click()}
                    className="flex-1 h-9"
                  >
                    <Upload className="mr-1 h-3.5 w-3.5" /> 이미지 업로드
                  </Button>
                  {avatarUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setAvatarUrl("")}
                      className="h-9"
                    >
                      초기화
                    </Button>
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
                  <div className="grid grid-cols-8 gap-1">
                    {PRESET_EMOJIS.map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => setEmoji(e)}
                        className={`flex h-8 w-full items-center justify-center rounded-md text-base hover:bg-accent transition-colors ${
                          emoji === e ? "ring-2 ring-primary" : ""
                        }`}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                  <div className="pt-2 border-t">
                    <p className="mb-1.5 text-[11px] text-muted-foreground">
                      배경색
                    </p>
                    <ColorPickerRow color={color} onChange={setColor} />
                  </div>
                </>
              )}
            </div>
          </section>

          {/* 저장 — 변경 있을 때만 활성 (UX 명확) */}
          <Button
            type="button"
            onClick={handleUpdate}
            disabled={!name.trim() || !dirty || saving}
            className="h-10"
          >
            <Check className="mr-1 h-4 w-4" />
            {saving ? "저장 중..." : "변경사항 저장"}
          </Button>

          {/* 카드 3: 캘린더 공유 — share manager 트리거 */}
          <section className="rounded-xl border bg-card">
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/40 transition-colors rounded-xl"
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
          </section>
        </div>
      </div>

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
