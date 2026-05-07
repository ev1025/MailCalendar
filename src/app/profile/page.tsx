"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Check, Settings as SettingsIcon, Share2 } from "lucide-react";
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
  const { users, updateUser } = useAppUsers();
  const currentUser = useCurrentUser();
  void users; // keep for potential future use

  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🙂");
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarMode, setAvatarMode] = useState<"image" | "emoji">("emoji");
  const [saving, setSaving] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  // cropSrc + cropOpen 두 state 가 따로 살면 4개의 조합이 가능했고 그 중 2개가 무효
  // (src 만 있고 open=false / open 만 true 고 src 없음). 단일 discriminated state 로
  // 합쳐 invalid combo 자체를 표현 불가능하게 함.
  const [cropping, setCropping] = useState<{ src: string } | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!authUser) {
      router.replace("/");
      return;
    }
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10_000_000) {
      toast.error("10MB 이하 이미지만 선택할 수 있어요");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setCropping({ src: reader.result as string });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleUpdate = async () => {
    if (!currentUser || !name.trim()) {
      toast.error("이름을 입력하세요");
      return;
    }
    setSaving(true);
    // mode 기준으로 저장 — emoji 모드여도 avatarUrl state 는 유지(다시 image 모드로
    // 돌아왔을 때 복원되도록). DB 에는 mode 에 맞는 한쪽만 저장.
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
          <>
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              aria-label="일정 공유"
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
            >
              <Share2 className="h-[20px] w-[20px]" strokeWidth={1.6} />
            </button>
            <button
              type="button"
              onClick={() => router.push("/settings")}
              aria-label="설정"
              className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
            >
              <SettingsIcon className="h-[20px] w-[20px]" strokeWidth={1.6} />
            </button>
          </>
        }
      />
      {/* PageHeader 와 (모바일 하단 nav) 사이의 공간을 flex-1 로 채워서 세로 중앙 정렬.
          살짝 위쪽 바이어스(pt:pb = 1:1.6) — 정확히 가운데보다 살짝 위가 아바타 시선
          위치로 자연스러움. */}
      <div className="flex-1 flex flex-col justify-center px-4 pt-4 pb-10 md:px-6 md:pt-6 md:pb-16">
        <div className="w-full max-w-xl mx-auto flex flex-col gap-3.5">
        {/* 헤더 — 아바타 + 이름 + 이메일 (압축) */}
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (avatarMode === "image") fileRef.current?.click();
            }}
            className="relative flex h-20 w-20 shrink-0 items-center justify-center rounded-full text-4xl overflow-hidden ring-1 ring-border/40 transition-transform active:scale-95"
            style={
              avatarUrl
                ? { backgroundColor: "transparent" }
                : { backgroundColor: color + "30", color }
            }
            aria-label="아바타 변경"
          >
            {avatarMode === "image" && avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" />
            ) : (
              emoji || (name ? name[0] : "?")
            )}
          </button>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="이름"
            className="h-8 text-center text-[15px] font-semibold border-none bg-transparent focus-visible:ring-0 focus-visible:border-b focus-visible:border-border rounded-none shadow-none px-0"
          />
          <p className="text-[11px] text-muted-foreground/80 -mt-1">{authUser?.email}</p>
        </div>

        {/* 아바타 편집 카드 — 액션 카드와 동일한 rounded-lg border bg-card 톤으로 통일.
            세그먼트 + 모드별 옵션(업로드 / 이모지 그리드) + 배경색 + 저장 한 카드 안에. */}
        <div className="rounded-lg border bg-card p-3 flex flex-col gap-3 mt-2">
          {/* 이미지/이모지 세그먼트 */}
          <div className="flex justify-center">
            <div className="inline-flex rounded-full border bg-muted/40 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setAvatarMode("image")}
                className={`px-3 py-1 rounded-full transition-colors ${
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
                className={`px-3 py-1 rounded-full transition-colors ${
                  avatarMode === "emoji"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                이모지
              </button>
            </div>
          </div>

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
              <ColorPickerRow color={color} onChange={setColor} />
            </>
          )}

          <Button
            type="button"
            onClick={handleUpdate}
            disabled={!name.trim() || saving}
            className="h-9"
          >
            <Check className="mr-1 h-3.5 w-3.5" />
            {saving ? "저장 중..." : "저장"}
          </Button>
        </div>

        </div>
      </div>

      <AvatarCropDialog
        src={cropping?.src ?? null}
        open={!!cropping}
        onOpenChange={(o) => { if (!o) setCropping(null); }}
        onConfirm={async (dataUrl) => {
          const prevUrl = avatarUrl;
          const { url, error } = await uploadToStorage("avatars", dataUrl, "jpg");
          if (error || !url) {
            toast.error(error || "이미지 업로드 실패");
            return;
          }
          setAvatarUrl(url);
          // 이미지 업로드되면 자동으로 image 모드. emoji state 는 유지(다시 emoji
          // 모드로 돌아갔을 때 복원되도록).
          setAvatarMode("image");
          if (prevUrl && prevUrl.includes("/storage/v1/object/public/avatars/")) {
            deleteFromStorage("avatars", prevUrl);
          }
        }}
      />

      <ShareManager open={shareOpen} onOpenChange={setShareOpen} />
    </div>
  );
}
