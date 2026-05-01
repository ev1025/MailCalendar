import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// weather_cache 의 RLS 는 anon SELECT 만 허용(린트 0024 권고).
// INSERT/UPDATE 는 service_role 만 가능 → 서버 라우트는 service_role 키를 우선 사용.
// SUPABASE_SERVICE_ROLE_KEY 미설정 환경(예: 로컬 개발)에선 anon 키로 폴백 — 캐시 쓰기는
// 실패하지만 읽기와 외부 API 호출은 정상 동작.
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "placeholder-key";
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DEFAULT_LAT = "37.5665";
const DEFAULT_LON = "126.978";
// 서울 기상청 격자 좌표
const KMA_NX = 60;
const KMA_NY = 127;

const WMO_DESC: Record<number, string> = {
  0: "맑음", 1: "대체로 맑음", 2: "구름 조금", 3: "흐림",
  45: "안개", 48: "안개", 51: "이슬비", 53: "이슬비", 55: "이슬비",
  61: "비", 63: "비", 65: "강한 비", 66: "진눈깨비", 67: "진눈깨비",
  71: "눈", 73: "눈", 75: "강한 눈", 77: "눈",
  80: "소나기", 81: "소나기", 82: "강한 소나기",
  85: "눈보라", 86: "강한 눈보라", 95: "뇌우", 96: "뇌우+우박", 99: "뇌우+우박",
};

function wmoToIcon(code: number): string {
  if (code === 0) return "01d";
  if (code <= 2) return "02d";
  if (code === 3) return "04d";
  if (code <= 48) return "50d";
  if (code <= 55) return "09d";
  if (code <= 65) return "10d";
  if (code <= 77) return "13d";
  if (code <= 82) return "09d";
  if (code <= 86) return "13d";
  return "11d";
}

// 기상청 하늘상태(SKY) + 강수형태(PTY) → 아이콘+설명
function kmaToWeather(sky: number, pty: number): { icon: string; desc: string } {
  if (pty === 1) return { icon: "10d", desc: "비" };
  if (pty === 2) return { icon: "13d", desc: "비/눈" };
  if (pty === 3) return { icon: "13d", desc: "눈" };
  if (pty === 4) return { icon: "09d", desc: "소나기" };
  if (sky === 1) return { icon: "01d", desc: "맑음" };
  if (sky === 3) return { icon: "02d", desc: "구름많음" };
  return { icon: "04d", desc: "흐림" };
}

interface WeatherRow {
  date: string;
  temperature_min: number;
  temperature_max: number;
  weather_icon: string;
  weather_description: string;
}

// 기상청 중기예보 지역 코드 (서울)
const KMA_MID_TEMP_REG = "11B10101"; // 서울 기온
const KMA_MID_LAND_REG = "11B00000"; // 서울/인천/경기 육상예보

// 기상청 중기예보: 오늘+3일 ~ 오늘+10일
async function fetchKMAMid(kmaKey: string): Promise<Record<string, WeatherRow>> {
  const results: Record<string, WeatherRow> = {};
  try {
    const now = new Date();
    const hour = now.getHours();
    // 발표시각: 06시, 18시
    let baseDate = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    let baseTime = "0600";
    if (hour < 6) {
      const yesterday = new Date(now.getTime() - 86400000);
      baseDate = `${yesterday.getFullYear()}${String(yesterday.getMonth() + 1).padStart(2, "0")}${String(yesterday.getDate()).padStart(2, "0")}`;
      baseTime = "1800";
    } else if (hour < 18) {
      baseTime = "0600";
    } else {
      baseTime = "1800";
    }
    const tmFc = `${baseDate}${baseTime}`;

    // 중기기온 + 중기육상예보 병렬 호출
    const [tempRes, landRes] = await Promise.all([
      fetch(`https://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa?serviceKey=${kmaKey}&pageNo=1&numOfRows=10&dataType=JSON&regId=${KMA_MID_TEMP_REG}&tmFc=${tmFc}`),
      fetch(`https://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst?serviceKey=${kmaKey}&pageNo=1&numOfRows=10&dataType=JSON&regId=${KMA_MID_LAND_REG}&tmFc=${tmFc}`),
    ]);

    const tempData = tempRes.ok ? await tempRes.json() : null;
    const landData = landRes.ok ? await landRes.json() : null;

    const tempItem = tempData?.response?.body?.items?.item?.[0];
    const landItem = landData?.response?.body?.items?.item?.[0];

    if (tempItem) {
      // 3일 후 ~ 10일 후 (N+3 ~ N+10)
      for (let n = 3; n <= 10; n++) {
        const target = new Date(now);
        target.setDate(now.getDate() + n);
        const dateStr = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(target.getDate()).padStart(2, "0")}`;

        const tmn = tempItem[`taMin${n}`];
        const tmx = tempItem[`taMax${n}`];
        if (tmn == null || tmx == null) continue;

        // 육상예보 (N+3~7까지만 Am/Pm, N+8부터 Am/Pm 없이 하루 단위)
        let weatherDesc = "흐림";
        let weatherIcon = "04d";
        if (landItem) {
          // 4~7일: wf{n}Am / wf{n}Pm, 8~10일: wf{n}
          const wf = n <= 7 ? landItem[`wf${n}Am`] : landItem[`wf${n}`];
          if (wf) {
            weatherDesc = wf;
            if (wf.includes("맑음")) weatherIcon = "01d";
            else if (wf.includes("구름많")) weatherIcon = "02d";
            else if (wf.includes("흐림")) weatherIcon = "04d";
            else if (wf.includes("비")) weatherIcon = "10d";
            else if (wf.includes("눈")) weatherIcon = "13d";
          }
        }

        results[dateStr] = {
          date: dateStr,
          temperature_min: Math.round(parseFloat(tmn)),
          temperature_max: Math.round(parseFloat(tmx)),
          weather_icon: weatherIcon,
          weather_description: weatherDesc,
        };
      }
    }
  } catch { /* ignore */ }
  return results;
}

// 기상청 단기예보에서 날짜별 min/max/sky/pty 추출
async function fetchKMA(kmaKey: string): Promise<Record<string, WeatherRow>> {
  const results: Record<string, WeatherRow> = {};
  try {
    const now = new Date();
    // base_time: 0200, 0500, 0800, 1100, 1400, 1700, 2000, 2300
    const hour = now.getHours();
    const baseTimes = ["2300", "2000", "1700", "1400", "1100", "0800", "0500", "0200"];
    let baseTime = "0200";
    let baseDate = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    for (const bt of baseTimes) {
      if (hour * 100 >= parseInt(bt) + 10) { // API 제공 시간은 base_time + ~10분
        baseTime = bt;
        break;
      }
    }
    // 자정~2시는 전날 2300 사용
    if (hour < 2) {
      const yesterday = new Date(now.getTime() - 86400000);
      baseDate = `${yesterday.getFullYear()}${String(yesterday.getMonth() + 1).padStart(2, "0")}${String(yesterday.getDate()).padStart(2, "0")}`;
      baseTime = "2300";
    }

    const url = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?serviceKey=${kmaKey}&pageNo=1&numOfRows=1000&dataType=JSON&base_date=${baseDate}&base_time=${baseTime}&nx=${KMA_NX}&ny=${KMA_NY}`;
    const res = await fetch(url);
    if (!res.ok) return results;

    const json = await res.json();
    const items = json?.response?.body?.items?.item;
    if (!items || !Array.isArray(items)) return results;

    // 날짜별 TMN(최저), TMX(최고), SKY(하늘), PTY(강수) 수집
    const daily: Record<string, { tmn?: number; tmx?: number; sky?: number; pty?: number }> = {};
    for (const item of items) {
      const d = `${item.fcstDate.slice(0, 4)}-${item.fcstDate.slice(4, 6)}-${item.fcstDate.slice(6, 8)}`;
      if (!daily[d]) daily[d] = {};
      if (item.category === "TMN") daily[d].tmn = parseFloat(item.fcstValue);
      if (item.category === "TMX") daily[d].tmx = parseFloat(item.fcstValue);
      if (item.category === "SKY" && item.fcstTime === "1200") daily[d].sky = parseInt(item.fcstValue);
      if (item.category === "PTY" && item.fcstTime === "1200") daily[d].pty = parseInt(item.fcstValue);
    }

    for (const [date, v] of Object.entries(daily)) {
      if (v.tmn != null && v.tmx != null) {
        const w = kmaToWeather(v.sky || 1, v.pty || 0);
        results[date] = {
          date,
          temperature_min: Math.round(v.tmn),
          temperature_max: Math.round(v.tmx),
          weather_icon: w.icon,
          weather_description: w.desc,
        };
      }
    }
  } catch { /* ignore */ }
  return results;
}

export async function GET(request: NextRequest) {
  const lat = request.nextUrl.searchParams.get("lat") || DEFAULT_LAT;
  const lon = request.nextUrl.searchParams.get("lon") || DEFAULT_LON;
  const country = (request.nextUrl.searchParams.get("country") || "KR").toUpperCase();
  const isKorea = country === "KR";
  const startDate = request.nextUrl.searchParams.get("start");
  const endDate = request.nextUrl.searchParams.get("end");

  if (!startDate || !endDate) {
    return NextResponse.json({ error: "start, end 파라미터 필요" }, { status: 400 });
  }

  try {
    const results: Record<string, WeatherRow> = {};
    const today = new Date().toISOString().split("T")[0];

    // ① Supabase 캐시: 서울(KR) 데이터만 공유 캐시 사용
    if (isKorea) {
      const { data: cached } = await supabase
        .from("weather_cache")
        .select("*")
        .gte("date", startDate)
        .lte("date", endDate);

      if (cached) {
        for (const row of cached) {
          results[row.date] = row;
        }
      }
    }

    // 캐시에 없는 과거 날짜 찾기 (2일 전까지)
    const safeDate = new Date(Date.now() - 2 * 86400000).toISOString().split("T")[0];
    const missingPast: string[] = [];
    let d = new Date(startDate + "T00:00:00");
    const pastEnd = new Date((endDate < safeDate ? endDate : safeDate) + "T00:00:00");
    while (d <= pastEnd) {
      const ds = d.toISOString().split("T")[0];
      if (!results[ds]) missingPast.push(ds);
      d.setDate(d.getDate() + 1);
    }

    const kmaKey = process.env.KMA_API_KEY;

    // ② 과거 데이터 (Open-Meteo archive) - 캐시 누락분
    const historyPromise = (async () => {
      if (missingPast.length === 0) return;
      try {
        const histRes = await fetch(
          `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${missingPast[0]}&end_date=${missingPast[missingPast.length - 1]}&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=Asia/Seoul`
        );
        if (!histRes.ok) return;
        const hist = await histRes.json();
        if (!hist.daily) return;
        const toCache: WeatherRow[] = [];
        for (let i = 0; i < hist.daily.time.length; i++) {
          const code = hist.daily.weather_code[i];
          if (code == null) continue;
          const row: WeatherRow = {
            date: hist.daily.time[i],
            temperature_min: Math.round(hist.daily.temperature_2m_min[i]),
            temperature_max: Math.round(hist.daily.temperature_2m_max[i]),
            weather_icon: wmoToIcon(code),
            weather_description: WMO_DESC[code] || "흐림",
          };
          results[row.date] = row;
          toCache.push(row);
        }
        if (toCache.length > 0 && isKorea) {
          supabase.from("weather_cache").upsert(
            toCache.map((r) => ({
              date: r.date, temperature_min: r.temperature_min,
              temperature_max: r.temperature_max, weather_icon: r.weather_icon,
              weather_description: r.weather_description,
            })),
            { onConflict: "date" }
          );
        }
      } catch { /* ignore */ }
    })();

    // ③ 기상청 단기예보 (한국 지역만)
    const kmaShortPromise = (async () => {
      if (!isKorea || !kmaKey || endDate < today) return;
      const kmaData = await fetchKMA(kmaKey);
      for (const [date, row] of Object.entries(kmaData)) {
        if (date >= startDate && date <= endDate) {
          results[date] = row;
        }
      }
    })();

    // ④ 기상청 중기예보 (한국 지역만)
    const kmaMidPromise = (async () => {
      if (!isKorea || !kmaKey || endDate < today) return;
      const kmaMidData = await fetchKMAMid(kmaKey);
      for (const [date, row] of Object.entries(kmaMidData)) {
        if (date >= startDate && date <= endDate && !results[date]) {
          results[date] = row;
        }
      }
    })();

    // 과거 + 기상청 먼저 완료 대기
    await Promise.all([historyPromise, kmaShortPromise, kmaMidPromise]);

    // ⑤ Open-Meteo 예보 - 빈 날짜만 채움 (기상청이 커버 못한 범위)
    try {
      const foreRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=Asia/Seoul&past_days=7&forecast_days=16`
      );
      if (foreRes.ok) {
        const fore = await foreRes.json();
        if (fore.daily) {
          for (let i = 0; i < fore.daily.time.length; i++) {
            const fd = fore.daily.time[i];
            const code = fore.daily.weather_code[i];
            if (fd >= startDate && fd <= endDate && code != null && !results[fd]) {
              results[fd] = {
                date: fd,
                temperature_min: Math.round(fore.daily.temperature_2m_min[i]),
                temperature_max: Math.round(fore.daily.temperature_2m_max[i]),
                weather_icon: wmoToIcon(code),
                weather_description: WMO_DESC[code] || "흐림",
              };
            }
          }
        }
      }
    } catch { /* ignore */ }

    return NextResponse.json(results);
  } catch {
    return NextResponse.json({ error: "날씨 데이터를 가져올 수 없습니다" }, { status: 500 });
  }
}
