/* sw.js — Service Worker: العمل دون اتصال
 * ----------------------------------------------------------------------------
 * الاستراتيجيات (بنمط Workbox runtimeCaching):
 *   1) الصفحات / المستندات  → NetworkFirst  : تحاول الشبكة أولاً، وتتراجع للذاكرة
 *   2) الملفات الثابتة والبصمات (assets/*) → CacheFirst : الذاكرة أولاً
 *   3) مسارات المصادقة و OAuth → استثناء كامل (لا يعترضها الـ SW إطلاقاً)
 *
 * عند تعديل أي ملف: غيّر CACHE_VERSION لتحديث الذاكرة تلقائياً.
 * ----------------------------------------------------------------------------
 */

const CACHE_VERSION = "asmaa-v3";

/* ---------- استثناءات: لا يخزّنها الـ SW ولا يعترضها ---------- */
const AUTH_DENYLIST = [
  /\/login\/?$/i,
  /\/log-in\/?$/i,
  /\/signin\/?$/i,
  /\/sign-in\/?$/i,
  /\/logout\/?$/i,
  /\/signout\/?$/i,
  /\/register\/?$/i,
  /\/signup\/?$/i,
  /\/account\/?$/i,
  /\/profile\/?$/i,
  /\/auth(\/|$)/i,
  /\/oauth(\/|$)/i,
  /\/oauth2?(\/|$)/i,
  /\/callback(\/|$)/i,
  /\/api\/auth/i,
  /\/api\/(login|logout|token|session)/i,
  /\/wp-(login|admin)/i,
  /\/wp-json/i,
  /\/admin(\/|$)/i,
  /^\/[^\/]*(google|facebook|apple|microsoft|github|twitter|x)\.com\//i,
  /\.googleapis\.com\//i,
  /\/[^\/]*oauth2?\//i,
];

/* ---------- ملفات تُخزَّن مسبقاً عند التثبيت ---------- */
const PRECACHE = [
  "./",
  "index.html",
  "asmaa-99.html",
  "asmaa-allah-al-husna.html",
  "qawaid-book.html",
  "qawaid-quiz.html",
  "qawaid-original.html",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-maskable-512.png",
  "icons/apple-touch-icon.png",
];

const isAuthPath = (url) => AUTH_DENYLIST.some((re) => re.test(url.pathname));

/* ---------- التثبيت ---------- */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      /* نخزّن كل ملف على حدة: فشل ملف واحد لا يُفشل التثبيت */
      .then((cache) =>
        Promise.all(
          PRECACHE.map((u) =>
            cache.add(new Request(u, { cache: "reload" })).catch(() => {})
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

/* ---------- التفعيل: حذف الذاكرة القديمة ---------- */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

/* =============================================================================
 *NetworkFirst  — للصفحات والمستندات
 * ============================================================================= */
async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type === "basic") {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    /* لا شبكة → الذاكرة، وإلا الصفحة الرئيسية كحل أخير */
    const cached = await cache.match(request);
    if (cached) return cached;
    if (request.mode === "navigate") {
      const home = await cache.match("index.html");
      if (home) return home;
    }
    return Response.error();
  }
}

/* =============================================================================
 * CacheFirst  — للملفات الثابتة والبصمات (لا تتغيّر إلا بتغير الاسم)
 * ============================================================================= */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.status === 200 && response.type === "basic") {
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    return Response.error();
  }
}

/* ---------- التوجيه ---------- */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  /* المصادر الخارجية (خطوط Google مثلاً) تُترك للمتصفح */
  if (url.origin !== self.location.origin) return;

  /* استثناء مسارات المصادقة و OAuth — لا تخزين ولا اعتراض */
  if (isAuthPath(url)) return;

  /* 1) الصفحات: NetworkFirst */
  const isDocument = req.mode === "navigate" || req.destination === "document";
  if (isDocument) {
    event.respondWith(networkFirst(req));
    return;
  }

  /* 2) ملفات ثابتة / بصمات: CacheFirst */
  const isFingerprinted =
    /\/assets\//.test(url.pathname) ||            /* مخرجات Vite ذات البصمة */
    /-[A-Za-z0-9_]{8,}\.(js|css|woff2?|ttf|png|jpe?g|svg|webp|avif)$/i.test(url.pathname);
  const isStatic =
    req.destination === "script" ||
    req.destination === "style" ||
    req.destination === "font" ||
    req.destination === "image" ||
    isFingerprinted;

  if (isStatic) {
    event.respondWith(cacheFirst(req));
    return;
  }

  /* الباقي: CacheFirst كحل افتراضي (طلبات fetch/xhr بسيطة) */
  event.respondWith(cacheFirst(req));
});