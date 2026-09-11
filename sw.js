// Service worker для мобильной страницы-просмотрщика бюджета.
// Две разные стратегии кэширования:
// 1. Статика САМОГО приложения (index.html, manifest, иконки) - кэш
//    в приоритете, сеть как запасной вариант (быстрый запуск, работает
//    без связи вообще).
// 2. Снимок данных из Dropbox - СЕТЬ в приоритете (хотим самые свежие
//    цифры, когда связь есть), а если сети нет - отдаём последнюю
//    успешно загруженную версию из кэша, чтобы страница не была
//    пустой в метро/самолёте, только со старой пометкой "Обновлено...".

const CACHE_NAME = 'budgetapp-mobile-v2';
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
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

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
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        return resp;
      })
      .catch(() => caches.match(req))
  );
});
