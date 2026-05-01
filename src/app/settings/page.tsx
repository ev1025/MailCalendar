"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SearchInput from "@/components/ui/search-input";
import { Monitor, Sun, Moon, ChevronDown, ChevronRight, ExternalLink, MapPin, Lock, Trash2, LogOut, ChevronRight as ChevronRightIcon, Palette, CalendarDays, UserCircle, Info, X, CloudSun } from "lucide-react";
import PageHeader from "@/components/layout/page-header";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import PasswordChangeDialog from "@/components/layout/password-change-dialog";
import DatePicker from "@/components/ui/date-picker";
import TimePicker from "@/components/ui/time-picker";
import { useAppUsers, useCurrentUser } from "@/lib/current-user";
import { useDdaySettings } from "@/hooks/use-dday-settings";
import { supabaseSignOut } from "@/lib/auth-supabase";
import { toast } from "sonner";
import {
  useWeatherLocation,
  setWeatherLocation,
  searchLocation,
  type GeoResult,
} from "@/hooks/use-weather-location";
import {
  useUsageStats,
  SUPABASE_FREE_LIMITS,
  VERCEL_HOBBY_LIMITS,
  formatBytes,
} from "@/hooks/use-usage-stats";
import { Skeleton } from "@/components/ui/skeleton";

type Theme = "system" | "light" | "dark";

function ApiSection({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="flex items-center justify-between w-full px-3 sm:px-4 py-3 text-sm font-medium hover:bg-accent/50 transition-colors tap-feedback"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="text-left">{title}</span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform duration-200 ${open ? "rotate-0" : "-rotate-90"}`}
        />
      </button>
      {/* grid template rows 트릭 — height auto 를 transition 가능하게. */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="px-3 sm:px-4 pt-3 pb-3.5 sm:pb-4 border-t bg-muted/20 flex flex-col gap-3">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 라벨/값 한 줄. 모든 ApiSection 의 메타데이터는 이걸로 통일. */
function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between gap-3 text-xs ${className}`}>
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground/90 text-right min-w-0">{children}</span>
    </div>
  );
}

/** 하위 그룹화 — 좌측 색 막대로 시각적 단락. */
function Subsection({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 pl-3 border-l-2 border-primary/20">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">{title}</p>
        {hint && <span className="text-[11px] text-muted-foreground/70">{hint}</span>}
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

/** 정보/경고 박스 — 시멘틱 토큰 사용 (라이트/다크 자동 분기). */
function Note({ tone = "info", children }: { tone?: "info" | "warning"; children: React.ReactNode }) {
  const cls =
    tone === "warning"
      ? "bg-warning-bg text-warning border-warning/30"
      : "bg-background text-muted-foreground border-border";
  return (
    <div className={`flex items-start gap-1.5 text-[11px] rounded-md border px-2.5 py-2 leading-relaxed ${cls}`}>
      <Info className="h-3 w-3 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

/** 외부 링크 푸터 — 모든 ApiSection 의 마지막에 동일한 위치/스타일. */
function LinkFooter({ href, label }: { href: string; label: string }) {
  return (
    <div className="flex items-center justify-between pt-2.5 mt-1 border-t border-border/50 text-[11px]">
      <span className="text-muted-foreground">관리 사이트</span>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-info hover:underline"
      >
        {label} <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}

/** API 탭의 카테고리 헤더 — Supabase Auth 사이드바의 "CONFIGURATION" 라벨 스타일. */
function CategoryHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 px-1 pt-3 pb-1 first:pt-0">
      {children}
    </div>
  );
}

/** 사용량 진행률 바. 50% 미만 녹색 / 50–80 노랑 / 80+ 빨강. */
function UsageBar({ label, value, limit, valueText }: { label: string; value: number; limit: number; valueText: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(limit, 1)) * 1000) / 10);
  const color = pct >= 80 ? "bg-red-500" : pct >= 50 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium tabular-nums">
          {valueText} <span className="text-muted-foreground">/ {formatBytes(limit)} ({pct}%)</span>
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsPageInner />
    </Suspense>
  );
}

function SettingsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"general" | "account" | "api">("general");
  const [theme, setTheme] = useState<Theme>("system");
  const currentLocation = useWeatherLocation();
  const [locQuery, setLocQuery] = useState("");
  const [locResults, setLocResults] = useState<GeoResult[]>([]);
  const [locSearching, setLocSearching] = useState(false);
  // 일기예보 카드 — 평소엔 현재 위치 카드만, 클릭 시 검색 input 으로 전환.
  const [locEditing, setLocEditing] = useState(false);

  // 계정 — 비밀번호 변경 / 프로필 삭제 (이전엔 /profile 에 있던 것)
  const { deleteUser } = useAppUsers();
  const currentUser = useCurrentUser();

  // 사용량 통계 (DB / Storage). API 탭 첫 진입 시 fetch.
  const { stats: usage, loading: usageLoading, error: usageError, refetch: refetchUsage } = useUsageStats();

  // D-day — 설정 토글 + 기준 date/time. localStorage 영속.
  // 토글은 즉시 반영, date/time 은 draft → "적용" 버튼 클릭 시 commit.
  const { settings: dday, update: updateDday } = useDdaySettings();
  const [draftDate, setDraftDate] = useState(dday.date);
  const [draftTime, setDraftTime] = useState(dday.time);
  // hook 로드 후 / 외부에서 dday 가 바뀔 때 draft 동기화.
  useEffect(() => {
    setDraftDate(dday.date);
    setDraftTime(dday.time);
  }, [dday.date, dday.time]);
  const ddayDirty = draftDate !== dday.date || draftTime !== dday.time;
  const ddayApplyEnabled = ddayDirty && draftDate.length > 0 && draftTime.length >= 4;
  const applyDday = () => {
    updateDday({ date: draftDate, time: draftTime });
    toast.success("D-day 적용됨");
  };
  const [pwDialogOpen, setPwDialogOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // ?action=reset-password 진입 시 비밀번호 변경 다이얼로그 자동 오픈
  useEffect(() => {
    if (searchParams.get("action") === "reset-password") {
      setPwDialogOpen(true);
      toast.info("새 비밀번호를 설정하세요");
      router.replace("/settings", { scroll: false });
    }
  }, [searchParams, router]);

  const handleDeleteProfile = async () => {
    if (!currentUser) return;
    await deleteUser(currentUser.id);
    await supabaseSignOut();
    router.replace("/");
  };

  const handleSignOut = async () => {
    await supabaseSignOut();
    router.replace("/");
  };

  useEffect(() => {
    if (!locQuery.trim()) {
      setLocResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setLocSearching(true);
      const results = await searchLocation(locQuery);
      if (!cancelled) {
        setLocResults(results);
        setLocSearching(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [locQuery]);

  const pickLocation = (r: GeoResult) => {
    setWeatherLocation({
      name: r.name + (r.admin1 ? ` (${r.admin1})` : ""),
      lat: r.latitude,
      lon: r.longitude,
      country: r.country_code,
    });
    setLocQuery("");
    setLocResults([]);
    setLocEditing(false);
  };

  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme | null;
    if (saved) setTheme(saved);
  }, []);

  const applyTheme = (t: Theme) => {
    setTheme(t);
    localStorage.setItem("theme", t);
    const root = document.documentElement;
    if (t === "dark") root.classList.add("dark");
    else if (t === "light") root.classList.remove("dark");
    else {
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) root.classList.add("dark");
      else root.classList.remove("dark");
    }
  };

  const kmaExpiry = "2028-04-12";
  const holidayExpiry = "2028-04-18";
  const daysLeft = Math.ceil((new Date(kmaExpiry).getTime() - Date.now()) / 86400000);
  const holidayDaysLeft = Math.ceil((new Date(holidayExpiry).getTime() - Date.now()) / 86400000);

  // 만료 2개월(60일) 전부터 알림
  const kmaWarning = daysLeft <= 60 && daysLeft > 0;
  const holidayWarning = holidayDaysLeft <= 60 && holidayDaysLeft > 0;

  return (
    <>
      <PageHeader title="설정" showBack />
    <div className="p-4 md:p-6 max-w-2xl">

      {/* 탭 */}
      <div className="flex border-b mb-6">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-all duration-200 tap-feedback ${
            tab === "general" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setTab("general")}
        >
          일반
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-all duration-200 tap-feedback ${
            tab === "account" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setTab("account")}
        >
          계정
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-all duration-200 tap-feedback ${
            tab === "api" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setTab("api")}
        >
          API
        </button>
      </div>

      {tab === "general" ? (
        <div key="general" className="flex flex-col gap-4 stagger-list">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Palette className="h-3.5 w-3.5" />
                </span>
                테마
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2">
                {([
                  { value: "system" as Theme, icon: Monitor, label: "시스템" },
                  { value: "light" as Theme, icon: Sun, label: "라이트" },
                  { value: "dark" as Theme, icon: Moon, label: "다크" },
                ]).map(({ value, icon: Icon, label }) => (
                  <Button
                    key={value}
                    variant={theme === value ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => applyTheme(value)}
                  >
                    <Icon className="h-4 w-4 mr-1.5" />
                    {label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <CloudSun className="h-3.5 w-3.5" />
                </span>
                일기예보
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {!locEditing ? (
                /* 평소: 현재 위치 카드 — 클릭하면 검색 모드로 전환. */
                <button
                  type="button"
                  onClick={() => setLocEditing(true)}
                  className="flex w-full items-start gap-2 rounded-md border p-2.5 text-left hover:bg-accent/40 transition-colors"
                  aria-label="지역 변경"
                >
                  <MapPin className="h-3.5 w-3.5 mt-0.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{currentLocation.name}</div>
                  </div>
                  <span className="text-[11px] text-muted-foreground/60 shrink-0 mt-0.5">변경</span>
                </button>
              ) : (
                /* 편집 모드: 검색 input + 취소 버튼 + 결과 드롭다운. */
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <SearchInput
                      value={locQuery}
                      onChange={setLocQuery}
                      placeholder="지역 검색 (예: 서울, 부산, Tokyo)"
                      size="md"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => { setLocEditing(false); setLocQuery(""); setLocResults([]); }}
                      aria-label="취소"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {locQuery.trim() && (
                    <div className="rounded-md border max-h-60 overflow-y-auto">
                      {locSearching ? (
                        <p className="text-xs text-muted-foreground p-3">검색 중...</p>
                      ) : locResults.length === 0 ? (
                        <p className="text-xs text-muted-foreground p-3">결과 없음</p>
                      ) : (
                        locResults.map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => pickLocation(r)}
                            className="flex w-full items-center justify-between gap-2 border-b px-3 py-2.5 text-left text-sm last:border-b-0 hover:bg-accent"
                          >
                            <span className="font-medium">
                              {r.name}
                              {r.admin1 ? `, ${r.admin1}` : ""}
                            </span>
                            <span className="text-xs text-muted-foreground">{r.country}</span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
              <p className="flex items-start gap-1.5 pl-3 text-[11px] text-muted-foreground/60 leading-relaxed">
                <Info className="h-3 w-3 mt-[2px] shrink-0" />
                <span>일기예보 지역을 선택할 수 있어요.</span>
              </p>
            </CardContent>
          </Card>

          {/* D-day — 토글은 헤더 우측. ON 시에만 date/time 입력 노출.
              입력은 캘린더 일정에 쓰는 DatePicker / TimePicker 재사용. */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <CalendarDays className="h-3.5 w-3.5" />
                  </span>
                  D-day
                </CardTitle>
                <button
                  type="button"
                  role="switch"
                  aria-checked={dday.enabled}
                  aria-label="D-day 표시 켜기"
                  onClick={() => updateDday({ enabled: !dday.enabled })}
                  /* 외곽 hit area 11x11 (44px) — WCAG 권장 터치 타깃.
                     안의 트랙은 작아 보이게 inset 으로 그림 (시각/터치 분리). */
                  className="relative inline-flex h-11 w-11 items-center justify-center"
                >
                  <span
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      dday.enabled ? "bg-primary" : "bg-muted-foreground/30"
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        dday.enabled ? "translate-x-4" : "translate-x-0.5"
                      }`}
                    />
                  </span>
                </button>
              </div>
            </CardHeader>
            {dday.enabled && (
              <CardContent className="flex flex-col gap-3">
                {dday.source === "partner" && (
                  <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 text-[11px] text-primary leading-relaxed">
                    공유 파트너가 설정한 D-day 가 표시되고 있어요. 직접 입력해 적용하면 본인 값이 우선합니다.
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <DatePicker
                    value={draftDate}
                    onChange={setDraftDate}
                    className="h-9 text-xs"
                  />
                  <TimePicker
                    value={draftTime}
                    onChange={setDraftTime}
                    className="h-9 text-xs"
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-start gap-1.5 pl-3 text-[11px] text-muted-foreground/60 leading-relaxed">
                    <Info className="h-3 w-3 mt-[2px] shrink-0" />
                    <span>달력 우상단에 D-day 버튼이 표시됩니다.</span>
                  </p>
                  <Button
                    size="sm"
                    onClick={applyDday}
                    disabled={!ddayApplyEnabled}
                    className="h-8 shrink-0"
                  >
                    적용
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>

        </div>
      ) : tab === "account" ? (
        <div key="account" className="flex flex-col gap-4 stagger-list">
          {/* 계정 — 비밀번호 변경 + 로그아웃 + 프로필 삭제 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <UserCircle className="h-3.5 w-3.5" />
                </span>
                계정
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => setPwDialogOpen(true)}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-2.5 text-sm hover:bg-accent transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-muted-foreground" />
                  비밀번호 변경
                </span>
                <ChevronRightIcon className="h-4 w-4 text-muted-foreground/50" />
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <span className="flex items-center gap-2">
                  <LogOut className="h-4 w-4" />
                  로그아웃
                </span>
                <ChevronRightIcon className="h-4 w-4 text-muted-foreground/50" />
              </button>
              <button
                type="button"
                onClick={() => setDeleteConfirmOpen(true)}
                className="flex items-center justify-between gap-2 rounded-md px-2 py-2.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  프로필 삭제
                </span>
                <ChevronRightIcon className="h-4 w-4 opacity-50" />
              </button>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div key="api" className="flex flex-col gap-3 stagger-list">
          {/* 앱 정보 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">앱 정보</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">프레임워크</span>
                <span>Next.js 16 + React</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">UI 라이브러리</span>
                <span>shadcn/ui + Tailwind CSS</span>
              </div>
            </CardContent>
          </Card>

          {/* === 인프라 (호스팅 + DB) === */}
          <CategoryHeader>인프라</CategoryHeader>

          {/* 데이터베이스 — 사용량 추적 포함 */}
          <ApiSection title="데이터베이스 — Supabase" defaultOpen>
            <Field label="요금제">
              <Badge variant="secondary" className="text-[10px] h-5">Free</Badge>
            </Field>

            <Subsection title="실시간 사용량">
              {usageLoading && !usage ? (
                <div className="flex flex-col gap-2.5">
                  {[0, 1].map((i) => (
                    <div key={i} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <Skeleton className="h-3 w-16" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                      <Skeleton className="h-1.5 w-full rounded-full" />
                    </div>
                  ))}
                </div>
              ) : usageError ? (
                <Note tone="warning">
                  <span className="font-medium">조회 실패: {usageError}</span>
                  <br />
                  Vercel 환경변수에 <code className="text-[10px]">SUPABASE_SERVICE_ROLE_KEY</code> 등록 필요
                </Note>
              ) : usage ? (
                <>
                  <UsageBar
                    label="DB 용량"
                    value={usage.dbSizeBytes}
                    limit={SUPABASE_FREE_LIMITS.dbBytes}
                    valueText={formatBytes(usage.dbSizeBytes)}
                  />
                  <UsageBar
                    label={`Storage (파일 ${usage.storageObjectCount}개)`}
                    value={usage.storageSizeBytes}
                    limit={SUPABASE_FREE_LIMITS.storageBytes}
                    valueText={formatBytes(usage.storageSizeBytes)}
                  />
                </>
              ) : null}
            </Subsection>

            <Subsection title="대시보드에서 확인" hint="앱에서 추적 불가">
              <Field label="Egress (월별)">
                <span className="text-muted-foreground">한도 {formatBytes(SUPABASE_FREE_LIMITS.egressBytesPerMonth)}</span>
              </Field>
              <Field label="Edge 함수 호출">
                <span className="text-muted-foreground">한도 {SUPABASE_FREE_LIMITS.edgeFunctionInvocationsPerMonth.toLocaleString()}/월</span>
              </Field>
            </Subsection>

            <div className="flex items-center justify-between pt-2.5 mt-1 border-t border-border/50 text-[11px]">
              <button
                onClick={refetchUsage}
                disabled={usageLoading}
                className="text-info hover:underline disabled:opacity-50"
              >
                새로고침
              </button>
              <a href="https://supabase.com/dashboard" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-info hover:underline">
                대시보드 <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </ApiSection>

          {/* 호스팅 — Vercel */}
          <ApiSection title="호스팅 — Vercel">
            <Field label="요금제">
              <Badge variant="secondary" className="text-[10px] h-5">Hobby</Badge>
            </Field>

            <Subsection title="대시보드에서 확인" hint="앱에서 추적 불가">
              <Field label="대역폭">
                <span className="text-muted-foreground">한도 {formatBytes(VERCEL_HOBBY_LIMITS.bandwidthBytesPerMonth)}/월</span>
              </Field>
              <Field label="빌드 시간">
                <span className="text-muted-foreground">한도 {VERCEL_HOBBY_LIMITS.buildMinutesPerMonth.toLocaleString()}분/월</span>
              </Field>
            </Subsection>

            <LinkFooter href="https://vercel.com/dashboard" label="vercel.com" />
          </ApiSection>

          {/* === 정보 (날씨·공휴일) === */}
          <CategoryHeader>정보</CategoryHeader>

          {/* 날씨 API */}
          <ApiSection title="날씨 API">
            <Subsection title="기상청 단기예보">
              <Field label="API">
                <code className="text-[10px]">VilageFcstInfoService_2.0</code>
              </Field>
              <Field label="만료일">
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-[11px]">{kmaExpiry}</span>
                  <Badge variant={kmaWarning || daysLeft <= 0 ? "destructive" : "secondary"} className="text-[10px] h-5">
                    {daysLeft > 0 ? `D-${daysLeft}` : "만료"}
                  </Badge>
                </span>
              </Field>
            </Subsection>

            <Subsection title="기상청 중기예보">
              <Field label="API">
                <code className="text-[10px]">MidFcstInfoService</code>
              </Field>
              <Field label="만료일">
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-[11px]">{kmaExpiry}</span>
                  <Badge variant={kmaWarning || daysLeft <= 0 ? "destructive" : "secondary"} className="text-[10px] h-5">
                    {daysLeft > 0 ? `D-${daysLeft}` : "만료"}
                  </Badge>
                </span>
              </Field>
            </Subsection>

            <Subsection title="Open-Meteo" hint="과거·장기 예보">
              <Field label="요금">
                <Badge variant="secondary" className="text-[10px] h-5">무료 (키 불필요)</Badge>
              </Field>
              <Field label="만료">
                <Badge variant="secondary" className="text-[10px] h-5">만료 없음</Badge>
              </Field>
            </Subsection>

            <Note>
              기상청 키 갱신: 공공데이터포털(data.go.kr) → 네이버 간편로그인.
            </Note>
            <LinkFooter href="https://www.data.go.kr" label="data.go.kr" />
          </ApiSection>

          {/* 특일정보 API */}
          <ApiSection title="공휴일 API — 한국천문연구원">
            <Field label="API">
              <code className="text-[10px]">SpcdeInfoService</code>
            </Field>
            <Field label="만료일">
              <span className="inline-flex items-center gap-1.5">
                <span className="text-[11px]">{holidayExpiry}</span>
                <Badge variant={holidayWarning || holidayDaysLeft <= 0 ? "destructive" : "secondary"} className="text-[10px] h-5">
                  {holidayDaysLeft > 0 ? `D-${holidayDaysLeft}` : "만료"}
                </Badge>
              </span>
            </Field>
            {holidayWarning && (
              <Note tone="warning">
                만료 2개월 이내 — 공공데이터포털에서 키 갱신 필요.
              </Note>
            )}
            <LinkFooter href="https://www.data.go.kr" label="data.go.kr" />
          </ApiSection>

          {/* === 지도·경로 (위치·길찾기) === */}
          <CategoryHeader>지도·경로</CategoryHeader>

          {/* 여행 계획 — 수단별 라우팅 아키텍처 한눈에 */}
          <ApiSection title="여행 계획 경로 — 수단별 API 매핑">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              구간 소요시간은 수단별로 다른 API 를 호출합니다.
            </p>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-[11px]">
              <span className="font-medium">🚗 승용차</span>
              <span className="text-muted-foreground">NCP Directions 5</span>
              <span className="font-medium">🚶 도보</span>
              <span className="text-muted-foreground">Google Directions (walking)</span>
              <span className="font-medium">🚌 버스</span>
              <span className="text-muted-foreground">Google Directions (transit)</span>
              <span className="font-medium">🚆 기차</span>
              <span className="text-muted-foreground">KORAIL → 실패 시 Google rail 폴백</span>
            </div>
          </ApiSection>

          {/* NCP Maps — 여러 상품이 하나의 키 아래에서 각자 신청 필요 */}
          <ApiSection title="네이버 클라우드 플랫폼 — Maps">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              하위 상품마다 <b className="text-foreground/80">개별 신청</b> 필요. 키는 하나, 상품별 권한 부여.
            </p>
            <div className="flex flex-wrap gap-1.5">
              <code className="text-[10px] bg-background border rounded px-1.5 py-0.5">NEXT_PUBLIC_NCP_MAP_CLIENT_ID</code>
              <code className="text-[10px] bg-background border rounded px-1.5 py-0.5">NCP_MAP_CLIENT_SECRET</code>
            </div>

            <Subsection title="Web Dynamic Map · Static Map">
              <Field label="용도">여행 계획 지도 렌더링</Field>
              <Field label="요금"><Badge variant="secondary" className="text-[10px] h-5">월 6만건 무료</Badge></Field>
            </Subsection>

            <Subsection title="Directions 5" hint="승용차 경로">
              <Field label="용도">자가용·택시 소요시간 + 도로 path</Field>
              <Field label="요금"><Badge variant="secondary" className="text-[10px] h-5">월 6만건 무료</Badge></Field>
            </Subsection>

            <Note tone="warning">
              <b>별도 신청 필수</b> — 콘솔에서 &ldquo;Directions 5 이용 신청&rdquo; 필요.
              미신청 시 HTTP 200 이지만 빈 body 반환 → 경로가 안 뜸.
            </Note>

            <LinkFooter href="https://console.ncloud.com" label="console.ncloud.com" />
          </ApiSection>

          {/* 네이버 검색 (Developers) — NCP 아닌 별도 Developers 사이트 */}
          <ApiSection title="네이버 개발자센터 — 검색 (Local Search)">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              여행 계획 장소 검색용. NCP 와 별개인 <b className="text-foreground/80">네이버 개발자센터</b> 발급 키.
            </p>
            <div className="flex flex-wrap gap-1.5">
              <code className="text-[10px] bg-background border rounded px-1.5 py-0.5">NAVER_SEARCH_CLIENT_ID</code>
              <code className="text-[10px] bg-background border rounded px-1.5 py-0.5">NAVER_SEARCH_CLIENT_SECRET</code>
            </div>
            <Field label="요금"><Badge variant="secondary" className="text-[10px] h-5">무료 (일 25,000건)</Badge></Field>
            <Field label="만료"><Badge variant="secondary" className="text-[10px] h-5">만료 없음</Badge></Field>
            <LinkFooter href="https://developers.naver.com/apps/#/list" label="developers.naver.com" />
          </ApiSection>

          {/* Google Maps Directions — 도보 · 버스 · 기차폴백 */}
          <ApiSection title="Google Maps — Directions API">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              NCP 가 제공하지 않는 수단(도보·버스·지하철·기차폴백) 담당.
            </p>
            <div className="flex flex-wrap gap-1.5">
              <code className="text-[10px] bg-background border rounded px-1.5 py-0.5">GOOGLE_MAPS_API_KEY</code>
            </div>
            <Field label="사용 mode">
              <span className="text-[11px]">walking · transit (bus·rail·subway)</span>
            </Field>
            <Field label="요금"><Badge variant="secondary" className="text-[10px] h-5">월 $200 크레딧 무료</Badge></Field>
            <Note>
              단가 $0.005/건 → 월 40,000건까지 실결제 0원. 개인 용도엔 사실상 무료.
              과금 방지를 위해 콘솔에서 &ldquo;Requests per day&rdquo; 한도 100 으로 잠가두기.
            </Note>
            <LinkFooter href="https://console.cloud.google.com" label="console.cloud.google.com" />
          </ApiSection>

          {/* 공공데이터 — KORAIL 열차운행정보 */}
          <ApiSection title="공공데이터포털 — KORAIL 열차운행정보">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              KTX·SRT·ITX·새마을 구간 소요시간을 실제 운행계획으로 조회.
              미설정·실패 시 Google rail 자동 폴백.
            </p>
            <div className="flex flex-wrap gap-1.5">
              <code className="text-[10px] bg-background border rounded px-1.5 py-0.5">PUBLIC_TRAIN_API_KEY</code>
            </div>
            <Field label="엔드포인트">
              <code className="text-[10px]">B551457/run/v2/plans</code>
            </Field>
            <Field label="제공사">한국철도공사 (KORAIL)</Field>
            <Field label="요금"><Badge variant="secondary" className="text-[10px] h-5">무료</Badge></Field>
            <Field label="매칭">좌표 ↔ 25개 주요 역 (15km 이내)</Field>
            <LinkFooter href="https://www.data.go.kr/data/15125762/openapi.do" label="data.go.kr (15125762)" />
          </ApiSection>

        </div>
      )}
    </div>

    <PasswordChangeDialog open={pwDialogOpen} onOpenChange={setPwDialogOpen} />
    <ConfirmDialog
      open={deleteConfirmOpen}
      onOpenChange={setDeleteConfirmOpen}
      title="프로필 삭제"
      description="프로필과 로그인 세션이 삭제됩니다."
      confirmLabel="삭제"
      destructive
      onConfirm={handleDeleteProfile}
    />
    </>
  );
}
