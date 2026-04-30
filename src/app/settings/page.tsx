"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import SearchInput from "@/components/ui/search-input";
import { Monitor, Sun, Moon, ChevronDown, ChevronRight, ExternalLink, MapPin, Lock, Trash2, LogOut, ChevronRight as ChevronRightIcon, Palette, CalendarDays, UserCircle, Info } from "lucide-react";
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

type Theme = "system" | "light" | "dark";

function ApiSection({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded-lg">
      <button
        className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium hover:bg-accent/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        {title}
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>
      {open && <div className="px-4 pb-4 pt-1 border-t">{children}</div>}
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
  const [tab, setTab] = useState<"general" | "api">("general");
  const [theme, setTheme] = useState<Theme>("system");
  const currentLocation = useWeatherLocation();
  const [locQuery, setLocQuery] = useState("");
  const [locResults, setLocResults] = useState<GeoResult[]>([]);
  const [locSearching, setLocSearching] = useState(false);

  // 계정 — 비밀번호 변경 / 프로필 삭제 (이전엔 /profile 에 있던 것)
  const { deleteUser } = useAppUsers();
  const currentUser = useCurrentUser();

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
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "general" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setTab("general")}
        >
          일반
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "api" ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setTab("api")}
        >
          API
        </button>
      </div>

      {tab === "general" ? (
        <div className="flex flex-col gap-4">
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
                  <MapPin className="h-3.5 w-3.5" />
                </span>
                일기예보
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {/* 현재 위치 — 라벨(dim) + 값(강조) 위계로 정리. */}
              <div className="rounded-md bg-muted/40 px-3 py-2 flex items-center justify-between gap-3">
                <span className="text-xs text-muted-foreground shrink-0">현재</span>
                <span className="text-sm font-medium truncate">{currentLocation.name}</span>
              </div>
              <SearchInput
                value={locQuery}
                onChange={setLocQuery}
                placeholder="지역 변경 (예: 서울, 부산, Tokyo)"
                size="md"
              />
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
              <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground/60 leading-relaxed">
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
                  onClick={() => updateDday({ enabled: !dday.enabled })}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    dday.enabled ? "bg-primary" : "bg-muted-foreground/30"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      dday.enabled ? "translate-x-4" : "translate-x-0.5"
                    }`}
                  />
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
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-foreground/80">기준 날짜</label>
                    <DatePicker
                      value={draftDate}
                      onChange={setDraftDate}
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-foreground/80">시각</label>
                    <TimePicker
                      value={draftTime}
                      onChange={setDraftTime}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground/60 leading-relaxed">
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

          {/* 계정 — 비밀번호 변경 + 프로필 삭제 (이전엔 /profile 에 있던 액션) */}
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
        <div className="flex flex-col gap-3">
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

          {/* 데이터베이스 */}
          <ApiSection title="데이터베이스 — Supabase">
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">서비스</span>
                <span>Supabase (PostgreSQL)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">요금제</span>
                <Badge variant="secondary" className="text-xs">무료 티어</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">만료</span>
                <Badge variant="secondary" className="text-xs">만료 없음</Badge>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                <span>관리 사이트</span>
                <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                  supabase.com <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </ApiSection>

          {/* 날씨 API */}
          <ApiSection title="날씨 API">
            <div className="flex flex-col gap-4 text-sm">
              {/* 기상청 단기예보 */}
              <div className="flex flex-col gap-2">
                <p className="font-medium text-xs text-muted-foreground">기상청 단기예보</p>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">API 이름</span>
                  <span className="text-xs">VilageFcstInfoService_2.0</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">만료일</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs">{kmaExpiry}</span>
                    <Badge variant={kmaWarning || daysLeft <= 0 ? "destructive" : "secondary"} className="text-xs">
                      {daysLeft > 0 ? `${daysLeft}일 남음` : "만료됨"}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* 기상청 중기예보 */}
              <div className="flex flex-col gap-2">
                <p className="font-medium text-xs text-muted-foreground">기상청 중기예보</p>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">API 이름</span>
                  <span className="text-xs">MidFcstInfoService</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">만료일</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs">{kmaExpiry}</span>
                    <Badge variant={kmaWarning || daysLeft <= 0 ? "destructive" : "secondary"} className="text-xs">
                      {daysLeft > 0 ? `${daysLeft}일 남음` : "만료됨"}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* 갱신 안내 */}
              <div className="flex flex-col gap-1.5 pt-2 border-t text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span>갱신 사이트</span>
                  <a href="https://www.data.go.kr" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                    공공데이터포털 (data.go.kr) <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <div className="flex items-center justify-between">
                  <span>로그인 방법</span>
                  <span>네이버 간편로그인</span>
                </div>
              </div>

              {/* Open-Meteo */}
              <div className="flex flex-col gap-2 pt-2 border-t">
                <p className="font-medium text-xs text-muted-foreground">Open-Meteo (과거 날씨 + 장기 예보)</p>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">요금</span>
                  <Badge variant="secondary" className="text-xs">무료 (키 불필요)</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">만료</span>
                  <Badge variant="secondary" className="text-xs">만료 없음</Badge>
                </div>
              </div>
            </div>
          </ApiSection>

          {/* 특일정보 API */}
          <ApiSection title="공휴일 API — 한국천문연구원">
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">API 이름</span>
                <span className="text-xs">특일 정보 (SpcdeInfoService)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">만료일</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs">{holidayExpiry}</span>
                  <Badge variant={holidayWarning ? "destructive" : holidayDaysLeft <= 0 ? "destructive" : "secondary"} className="text-xs">
                    {holidayDaysLeft > 0 ? `${holidayDaysLeft}일 남음` : "만료됨"}
                  </Badge>
                </div>
              </div>
              {holidayWarning && (
                <p className="text-xs text-destructive font-medium">⚠️ 만료 2개월 이내 — 갱신이 필요합니다</p>
              )}
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                <span>갱신 사이트</span>
                <a href="https://www.data.go.kr" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                  공공데이터포털 <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </ApiSection>

          {/* 여행 계획 — 수단별 라우팅 아키텍처 한눈에 */}
          <ApiSection title="여행 계획 경로 — 수단별 API 매핑">
            <div className="flex flex-col gap-2 text-xs">
              <p className="text-muted-foreground leading-relaxed">
                여행 계획의 구간별 소요시간은 수단에 따라 다른 API 를 호출합니다.
              </p>
              <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                <span>🚗 <b>승용차</b></span>
                <span className="text-muted-foreground">NCP Directions 5 (네이버)</span>
                <span>🚶 <b>도보</b></span>
                <span className="text-muted-foreground">Google Directions (walking)</span>
                <span>🚌 <b>버스</b></span>
                <span className="text-muted-foreground">Google Directions (transit, bus)</span>
                <span>🚆 <b>기차</b></span>
                <span className="text-muted-foreground">공공데이터 KORAIL → 실패 시 Google rail 폴백</span>
              </div>
            </div>
          </ApiSection>

          {/* NCP Maps — 여러 상품이 하나의 키 아래에서 각자 신청 필요 */}
          <ApiSection title="네이버 클라우드 플랫폼 — Maps">
            <div className="flex flex-col gap-4 text-sm">
              <p className="text-xs text-muted-foreground leading-relaxed">
                NCP Maps 는 여러 하위 상품이 있고, 각각 <b>개별 신청</b>이 필요합니다.
                키는 하나이지만 상품별로 권한이 부여됩니다.
                <br />환경변수:{" "}
                <code>NEXT_PUBLIC_NCP_MAP_CLIENT_ID</code> /{" "}
                <code>NCP_MAP_CLIENT_SECRET</code>
              </p>

              {/* Dynamic / Static Map */}
              <div className="flex flex-col gap-1.5">
                <p className="font-medium text-xs">Web Dynamic Map · Static Map</p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">용도</span>
                  <span>여행 계획 지도 렌더링</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">요금</span>
                  <Badge variant="secondary" className="text-xs">월 6만건 무료</Badge>
                </div>
              </div>

              {/* Directions 5 */}
              <div className="flex flex-col gap-1.5 pt-3 border-t">
                <p className="font-medium text-xs">Directions 5 <span className="text-muted-foreground">(승용차 경로)</span></p>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">용도</span>
                  <span>자가용·택시 소요시간 + 실제 도로 path</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">요금</span>
                  <Badge variant="secondary" className="text-xs">월 6만건 무료</Badge>
                </div>
                <p className="text-xs text-amber-600 leading-relaxed">
                  ⚠️ 별도 신청 필수 — 콘솔에서 Maps 상품 목록의
                  &quot;Directions 5 이용 신청&quot; 필요. 미신청 시 HTTP 200 이지만
                  빈 body 를 반환하여 경로가 안 뜸.
                </p>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                <span>관리 사이트</span>
                <a
                  href="https://console.ncloud.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline flex items-center gap-1"
                >
                  console.ncloud.com <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </ApiSection>

          {/* 네이버 검색 (Developers) — NCP 아닌 별도 Developers 사이트 */}
          <ApiSection title="네이버 개발자센터 — 검색(Local Search)">
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-xs text-muted-foreground leading-relaxed">
                여행 계획 장소 검색에 사용. NCP 와 별개인 <b>네이버 개발자센터</b> 발급 키.
                <br />환경변수:{" "}
                <code>NAVER_SEARCH_CLIENT_ID</code> /{" "}
                <code>NAVER_SEARCH_CLIENT_SECRET</code>
              </p>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">요금</span>
                <Badge variant="secondary" className="text-xs">무료 (일 25,000건)</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">만료</span>
                <Badge variant="secondary" className="text-xs">만료 없음</Badge>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                <span>관리 사이트</span>
                <a
                  href="https://developers.naver.com/apps/#/list"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline flex items-center gap-1"
                >
                  developers.naver.com <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </ApiSection>

          {/* Google Maps Directions — 도보 · 버스 · 기차폴백 */}
          <ApiSection title="Google Maps — Directions API">
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-xs text-muted-foreground leading-relaxed">
                여행 계획에서 NCP 가 제공하지 않는 수단(도보·버스·지하철·기차폴백)을 담당.
                Google 의 다양한 mode 를 하나의 키로 사용.
                <br />환경변수: <code>GOOGLE_MAPS_API_KEY</code>
              </p>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">사용 mode</span>
                <span className="text-xs">walking · transit(bus, rail, subway)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">요금</span>
                <Badge variant="secondary" className="text-xs">월 $200 크레딧 무료</Badge>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                Directions API 단가 $0.005/건 → 월 40,000건까지 실결제 0원.
                개인 여행 계획 용도는 사실상 영구 무료.
                &quot;Requests per day&quot; 한도 100 정도로 제한 걸어두면 과금 방지 확실.
              </p>
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                <span>관리 사이트</span>
                <a
                  href="https://console.cloud.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline flex items-center gap-1"
                >
                  console.cloud.google.com <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </ApiSection>

          {/* 공공데이터 — KORAIL 열차운행정보 */}
          <ApiSection title="공공데이터포털 — 한국철도공사 열차운행정보">
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-xs text-muted-foreground leading-relaxed">
                KTX · SRT · ITX · 새마을 등 기차 구간 소요시간을 실제 운행계획으로 조회.
                미설정·실패 시 Google rail 로 자동 폴백.
                <br />환경변수: <code>PUBLIC_TRAIN_API_KEY</code> (디코딩 인증키)
                <br />엔드포인트: <code>apis.data.go.kr/B551457/run/v2/plans</code>
              </p>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">제공사</span>
                <span className="text-xs">한국철도공사 (KORAIL)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">요금</span>
                <Badge variant="secondary" className="text-xs">무료</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">매칭 방식</span>
                <span className="text-xs">좌표 ↔ 25개 주요 역 (15km 이내)</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                <span>데이터셋</span>
                <a
                  href="https://www.data.go.kr/data/15125762/openapi.do"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline flex items-center gap-1"
                >
                  15125762 <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </ApiSection>

          {/* 호스팅 */}
          <ApiSection title="호스팅 — Vercel">
            <div className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">요금제</span>
                <Badge variant="secondary" className="text-xs">Hobby (무료)</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">만료</span>
                <Badge variant="secondary" className="text-xs">만료 없음</Badge>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
                <span>관리 사이트</span>
                <a href="https://vercel.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline flex items-center gap-1">
                  vercel.com <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
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
