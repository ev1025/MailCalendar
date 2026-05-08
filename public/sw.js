/* MailCalendar Service Worker — 정적 자산 cacheFirst + 네비게이션 networkFirst.
 *
 * 전략:
 *  1. 설치(install) — 자체 sw 만 캐시. 정적 자산은 첫 fetch 시 lazily.
 *  2. activate — 구버전 캐시 정리.
 *  3. fetch:
 *     - GET 만 가로채기 (POST/PUT/DELETE 우회).
 *     - chrome-extension://, blob:, data: 등 비-http 스킴 우회.
 *     - 매니페스트 / 아이콘 / Next.js 정적 산출물 → cacheFirst.
 *     - HTML 페이지 → networkFirst (fallback: cache).
 *     - 그 외 (API, 외부 스크립트 등) → 네트워크 직행 (캐시 안 함).
 *
 * 버전: 변경 시 OLD_CACHES 배열에 이전 버전 남기지 말고 그냥 prefix 매칭으로 정리.
 */

const SW_VERSION = "v1";
const STATIC_CACHE = `mc-static-${SW_VERSION}`;
const PAGES_CACHE = `mc-pages-${SW_VERSION}`;

self.addEventListener("install", (event) => {
  // 즉시 활성화 — 새 sw 가 즉시 fetch 핸들 받도록.
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
      // 모든 클라이언트에 즉시 적용.
      await self.clients.claim();
    })(),
  );
});

function isStaticAsset(url) {
  // Next.js 빌드 산출물 (해시 포함 영구).
  if (url.pathname.startsWith("/_next/static/")) return true;
  // 매니페스트.
  if (url.pathname === "/manifest.webmanifest") return true;
  // 아이콘.
  if (url.pathname.startsWith("/icons/")) return true;
  // 단순 파일 확장자 (PNG/JPG/SVG/WEBP/ICO/JS/CSS/WOFF2 등).
  return /\.(?:png|jpg|jpeg|svg|webp|ico|js|css|woff2?|ttf)$/.test(url.pathname);
}

function isAppNavigation(request, url) {
  // 페이지 네비게이션 — HTML 요청.
  if (request.mode === "navigate") return true;
  // 명시적으로 HTML accept.
  const accept = request.headers.get("accept") || "";
  if (accept.includes("text/html")) {
    // API 라우트는 제외 — 동적 응답.
    if (url.pathname.startsWith("/api/")) return false;
    return true;
  }
  return false;
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    // 백그라운드 갱신 시도 (실패 무시).
    fetch(request)
      .then((res) => {
        if (res && res.ok) cache.put(request, res.clone());
      })
      .catch(() => {});
    return cached;
  }
  const res = await fetch(request);
  if (res && res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // GET 만 처리.
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // http(s) 가 아닌 스킴 우회.
  if (url.protocol !== "http:" && url.protocol !== "https:") return;

  // 외부 호스트 우회 (Supabase, 지도 API 등은 그냥 네트워크).
  if (url.origin !== self.location.origin) return;

  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (isAppNavigation(request, url)) {
    event.respondWith(networkFirst(request, PAGES_CACHE));
    return;
  }

  // 그 외 (API 등) — 그냥 네트워크.
});
