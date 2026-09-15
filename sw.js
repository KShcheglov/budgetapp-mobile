// Service worker для мобильной страницы-просмотрщика бюджета.
// Два кэша с разными стратегиями:
// 1. CACHE_NAME - статика самого приложения (index.html, manifest,
//    иконки): кэш в приоритете, сеть как запасной вариант (быстрый
//    запуск, работает без связи вообще). Имя меняется с каждой версией,
//    старая статика удаляется при активации.
// 2. SNAPSHOT_CACHE - только ПОСЛЕДНИЙ удачно загруженный снимок данных:
//    сеть в приоритете (свежие цифры, когда связь есть), без сети - этот
//    снимок со старой пометкой "Обновлено...". Раньше в общий кэш ложился
//    любой ответ с чужого адреса, включая ошибки, и снимки по старым
//    ссылкам так и оставались в памяти телефона. Теперь хранится один
//    снимок, а страница очищает этот кэш при смене ссылки (saveLink в
//    index.html).

const CACHE_NAME = 'budgetapp-mobile-v18';
const SNAPSHOT_CACHE = 'budgetapp-snapshot'; // то же имя - в index.html
const APP_SHELL = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME && n !== SNAPSHOT_CACHE).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

async function saveSnapshot(req, resp) {
  const cache = await caches.open(SNAPSHOT_CACHE);
  for (const key of await cache.keys()) await cache.delete(key);
  await cache.put(req, resp);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const isAppShell = new URL(req.url).origin === self.location.origin;

  if (isAppShell) {
    event.respondWith(caches.match(req).then((cached) => cached || fetch(req)));
    return;
  }

  // Запрос к Dropbox (или куда угодно ещё) - сеть в приоритете.
  event.respondWith(
    fetch(req)
      .then((resp) => {
        if (resp.ok) saveSnapshot(req, resp.clone());
        return resp;
      })
      .catch(() => caches.open(SNAPSHOT_CACHE).then((cache) => cache.match(req)))
  );
});
