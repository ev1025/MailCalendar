import { NextRequest, NextResponse } from "next/server";

// 네이버 개발자센터 Local Search API 프록시.
// 브라우저에서 CORS 걸리고 Client Secret 도 노출 불가하므로 서버 라우트로 우회.
// 키는 .env.local 의 NAVER_SEARCH_CLIENT_ID/SECRET 로 주입.

export const dynamic = "force-dynamic";

// 네이버 API 응답 title 의 <b>...</b> 하이라이트 태그 제거
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

// 네이버 Local Search 의 mapx/mapy 는 WGS84 좌표 × 10,000,000 의 정수값으로 내려옴.
function scaleCoord(raw: string | number): number {
  const n = typeof raw === "number" ? raw : parseInt(raw, 10);
  return n / 10_000_000;
}

export interface NaverPlace {
  name: string;          // 장소명 (태그 제거됨)
  category: string;      // 예: "카페,디저트>커피전문점"
  address: string;       // 지번 주소
  roadAddress: string;   // 도로명 주소
  telephone: string;
  lat: number;
  lng: number;
  link: string;          // 홈페이지
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }

  const clientId = process.env.NAVER_SEARCH_CLIENT_ID;
  const clientSecret = process.env.NAVER_SEARCH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "NAVER_SEARCH_CLIENT_ID/SECRET 환경변수가 설정되지 않았습니다." },
      { status: 503 }
    );
  }

  const url = new URL("https://openapi.naver.com/v1/search/local.json");
  url.searchParams.set("query", q);
  url.searchParams.set("display", "5");
  url.searchParams.set("sort", "random");

  const res = await fetch(url.toString(), {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    // 원본 응답 본문을 클라이언트에 전달하면 내부 키 구조·에러 코드 노출 가능 →
    // 서버 로그에만 남기고 클라이언트엔 일반화된 메시지.
    const detail = await res.text().catch(() => "(no body)");
    console.error(`[naver/search] upstream ${res.status}:`, detail);
    return NextResponse.json(
      { error: "장소 검색 서비스에 일시적 문제가 발생했습니다" },
      { status: res.status >= 500 ? 503 : 502 },
    );
  }

  const data = (await res.json()) as {
    items?: Array<{
      title: string;
      category: string;
      address: string;
      roadAddress: string;
      telephone: string;
      mapx: string;
      mapy: string;
      link: string;
    }>;
  };

  const items: NaverPlace[] = (data.items ?? []).map((it) => ({
    name: stripTags(it.title),
    category: it.category,
    address: it.address,
    roadAddress: it.roadAddress,
    telephone: it.telephone,
    lat: scaleCoord(it.mapy),
    lng: scaleCoord(it.mapx),
    link: it.link,
  }));

  return NextResponse.json({ items });
}
