
"use strict";

const CACHE_PREFIX = "smart-trader-pro-";
const CACHE_NAME = `${CACHE_PREFIX}v2`;
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon.svg"
];

const APP_SCOPE = self.registration.scope;

function scopedUrl(path) {
  return new URL(path, APP_SCOPE).href;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // لا نفعّل نسخة ناقصة من ملفات التطبيق الأساسية.
      await cache.addAll(APP_SHELL.map(scopedUrl));

      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith(CACHE_PREFIX) &&
              key !== CACHE_NAME
          )
          .map((key) => caches.delete(key))
      );

      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // لا نتدخل في طلبات المواقع الخارجية أو واجهات API الخارجية.
  if (url.origin !== self.location.origin) return;

  // لا نخزّن روابط تسجيل الدخول أو المسارات الحساسة.
  if (/\/(login|auth|logout)(\/|$)/i.test(url.pathname)) return;

  // لا نخزّن طلبات API المحلية؛ يجب أن تكون البيانات حديثة.
  if (/\/api(\/|$)/i.test(url.pathname)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // صفحات التنقل: الشبكة أولًا، ثم نسخة الصفحة المحفوظة.
      if (request.mode === "navigate") {
        try {
          const response = await fetch(request);

          if (response.ok) {
            await cache.put(scopedUrl("./index.html"), response.clone());
          }

          return response;
        } catch {
          const saved =
            (await cache.match(request)) ||
            (await cache.match(scopedUrl("./index.html"))) ||
            (await cache.match(scopedUrl("./")));

          if (saved) return saved;

          return new Response(
            "<!doctype html><html lang='ar' dir='rtl'><meta charset='utf-8'><meta name='viewport' content='width=device-width'><title>غير متصل</title><body><h2>أنت غير متصل بالإنترنت</h2><p>اتصل بالإنترنت ثم أعد المحاولة.</p></body></html>",
            {
              status: 503,
              headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store"
              }
            }
          );
        }
      }

      // الموارد الثابتة: الشبكة أولًا، مع استخدام النسخة المحفوظة عند الفشل.
      try {
        const response = await fetch(request);

        if (response.ok && response.type === "basic") {
          await cache.put(request, response.clone());
        }

        return response;
      } catch {
        const saved = await cache.match(request);

        if (saved) return saved;

        return new Response("المورد غير متاح دون اتصال", {
          status: 503,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store"
          }
        });
      }
    })()
  );
});

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let data = {};

      try {
        data = event.data ? event.data.json() : {};
      } catch {
        data = {
          body: event.data
            ? event.data.text()
            : "لديك تنبيه جديد"
        };
      }

      const title = String(
        data.title || "Smart Trader Pro 2026"
      ).slice(0, 120);

      const requestedUrl = data.url || "./";
      let safeUrl = scopedUrl("./");

      try {
        const candidate = new URL(requestedUrl, APP_SCOPE);

        // نسمح فقط بروابط من نفس نطاق التطبيق وداخل نطاقه.
        if (
          candidate.origin === self.location.origin &&
          candidate.href.startsWith(APP_SCOPE)
        ) {
          safeUrl = candidate.href;
        }
      } catch {
        // الاحتفاظ برابط التطبيق الافتراضي.
      }

      await self.registration.showNotification(title, {
        body: String(
          data.body || data.message || "لديك تنبيه جديد"
        ).slice(0, 500),
        icon: scopedUrl("./icon.svg"),
        data: { url: safeUrl }
      });
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      let target = scopedUrl("./");

      try {
        const candidate = new URL(
          event.notification.data?.url || "./",
          APP_SCOPE
        );

        if (
          candidate.origin === self.location.origin &&
          candidate.href.startsWith(APP_SCOPE)
        ) {
          target = candidate.href;
        }
      } catch {
        // استخدام صفحة التطبيق الرئيسية.
      }

      const windows = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true
      });

      for (const client of windows) {
        if (
          client.url.startsWith(APP_SCOPE) &&
          "focus" in client
        ) {
          await client.focus();

          if ("navigate" in client && client.url !== target) {
            await client.navigate(target);
          }

          return;
        }
      }

      await self.clients.openWindow(target);
    })()
  );
});
