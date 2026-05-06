import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const DEFAULT_LAT = "37.5665";
const DEFAULT_LON = "126.978";

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

export interface HourlyEntry {
  /** ISO "YYYY-MM-DDTHH:00". */
  time: string;
  /** 정수 °C. */
  temperature: number;
  /** 강수 확률 0~100. null 가능(과거 데이터). */
  precipitation_probability: number | null;
  /** 풍속 m/s. */
  wind_speed: number;
  weather_icon: string;
  weather_description: string;
}

/**
 * 특정 날짜의 시간별 날씨 — Open-Meteo forecast API 사용.
 * 한국·해외 모두 동일한 API. 과거 날짜는 archive API 사용.
 *
 * 캐시 X — 시간별은 자주 갱신되며 1일치만 반환하므로 부담 없음.
 */
export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date 는 YYYY-MM-DD 형식 필수" }, { status: 400 });
  }

  const rawLat = request.nextUrl.searchParams.get("lat") ?? DEFAULT_LAT;
  const rawLon = request.nextUrl.searchParams.get("lon") ?? DEFAULT_LON;
  const latNum = parseFloat(rawLat);
  const lonNum = parseFloat(rawLon);
  if (Number.isNaN(latNum) || Number.isNaN(lonNum)) {
    return NextResponse.json({ error: "lat/lon 숫자 형식" }, { status: 400 });
  }

  const today = new Date().toISOString().split("T")[0];
  const isPast = date < today;

  // 과거 날짜는 archive(history) API, 그 외는 forecast API.
  // forecast 은 과거 7일까지도 허용하지만 archive 가 더 정확한 실측 기반이라 분기.
  const baseUrl = isPast
    ? "https://archive-api.open-meteo.com/v1/archive"
    : "https://api.open-meteo.com/v1/forecast";

  // archive 는 precipitation_probability 가 없으므로 분기.
  const hourlyParams = isPast
    ? "temperature_2m,weather_code,wind_speed_10m"
    : "temperature_2m,weather_code,precipitation_probability,wind_speed_10m";

  const url = `${baseUrl}?latitude=${latNum}&longitude=${lonNum}&hourly=${hourlyParams}&start_date=${date}&end_date=${date}&timezone=Asia/Seoul`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return NextResponse.json({ error: "외부 API 응답 실패" }, { status: 502 });
    }
    const json = await res.json();
    const h = json?.hourly;
    if (!h || !Array.isArray(h.time)) {
      return NextResponse.json({ entries: [] });
    }

    const entries: HourlyEntry[] = h.time.map((t: string, i: number) => {
      const code = h.weather_code?.[i] ?? 0;
      return {
        time: t,
        temperature: Math.round(h.temperature_2m?.[i] ?? 0),
        precipitation_probability:
          h.precipitation_probability?.[i] ?? null,
        wind_speed: Math.round((h.wind_speed_10m?.[i] ?? 0) * 10) / 10,
        weather_icon: wmoToIcon(code),
        weather_description: WMO_DESC[code] || "흐림",
      };
    });

    return NextResponse.json({ entries });
  } catch (e) {
    console.error("[weather hourly] failed:", e);
    return NextResponse.json({ error: "시간별 날씨 조회 실패" }, { status: 500 });
  }
}
