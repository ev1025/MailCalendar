/* MailCalendar Service Worker — 정적 자산만 cacheFirst.
 *
 * 정책 (보수적):
 *  - GET 만 가로채기 (POST/PUT/DELETE 우회).
 *  - chrome-extension://, blob:, data: 등 비-http 스킴 우회.
 *  - 외부 호스트(Supabase, 지도 API) 우회.
 *  - 응답 헤더 Cache-Control: no-store / private 인 경우 캐시 금지.
 *  - **`?_rsc=` (Next.js RSC payload) 절대 캐시 금지** — stale 시 라우터 깨짐.
 *  - **HTML/페이지 navigation 캐시 안 함** — Next.js App Router 의 RSC 직렬화가
 *    서버측 dynamic 렌더라, SW 가 stale 페이지 응답 주면 hydration mismatch 발생.
 *  - 캐시 대상은 오직: _next/static/*, /icons/*, /manifest.webmanifest,
 *    .png/.jpg/.svg/.webp/.ico/.woff2 등 hash 포함 영구 자산.
 *
 * 버전 변경 시 활성화 단계에서 구버전 캐시 자동 정리.
 */

const SW_VERSION = "v2";
const STATIC_CACHE = `mc-static-${SW_VERSION}`;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith("mc-") && !k.endsWith(SW_VERSION))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  if (url.pathname.startsWith("/_next/static/")) return true;
  if (url.pathname === "/manifest.webmanifest") return true;
  if (url.pathname.startsWith("/icons/")) return true;
  return /\.(?:png|jpg|jpeg|svg|webp|ico|woff2?|ttf)$/.test(url.pathname);
}

function shouldNotCache(response) {
  if (!response || !response.ok) return true;
  // Cache-Control no-store / private 검사 — 인증 응답·1회용 토큰 캐시 방지.
  const cc = response.headers.get("cache-control") || "";
  if (/no-store|private/i.test(cc)) return true;
  return false;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    // 백그라운드 갱신 (실패 무시).
    fetch(request)
      .then((res) => {
        if (!shouldNotCache(res)) cache.put(request, res.clone());
      })
      .catch(() => {});
    return cached;
  }
  const res = await fetch(request);
  if (!shouldNotCache(res)) cache.put(request, res.clone());
  return res;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return;
  if (url.origin !== self.location.origin) return;

  // RSC payload — 절대 캐시 금지. router 가 매번 새로 받아야 함.
  if (url.searchParams.has("_rsc")) return;

  // 정적 자산만 캐시. 그 외(HTML 페이지·API)는 그대로 네트워크.
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }
});
