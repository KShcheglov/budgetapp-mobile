// Service worker для мобильной страницы-просмотрщика бюджета.
// Три стратегии:
// 1. Сама страница (переход на неё, index.html) - СЕТЬ в приоритете, с
//    проверкой свежести у сервера (cache: 'no-cache' - если файл не
//    менялся, сервер отвечает коротким 304). Без сети - копия из кэша.
//    Раньше страница бралась из кэша в первую очередь, и новая версия
//    доходила до телефона только через смену CACHE_NAME ниже. Хуже того:
//    при установке новой версии cache.addAll брал index.html из обычного
//    HTTP-кэша браузера (GitHub Pages отдаёт max-age=600), и если две
//    версии выходили с разницей меньше 10 минут, в кэш новой версии
//    ложилась старая страница - телефон застревал на ней до следующей
//    версии (так и случилось с v17/v18).
// 2. Остальная статика (manifest, иконки) - кэш в приоритете, сеть как
//    запасной вариант. При установке всё качается мимо HTTP-кэша
//    (cache: 'reload').
// 3. SNAPSHOT_CACHE - только ПОСЛЕДНИЙ удачно загруженный снимок данных:
//    сеть в приоритете (свежие цифры, когда связь есть), без сети - этот
//    снимок со старой пометкой "Обновлено...". Страница очищает этот кэш
//    при смене ссылки (saveLink в index.html).

const CACHE_NAME = 'budgetapp-mobile-v21'; // тот же номер - APP_VERSION в index.html
const SNAPSHOT_CACHE = 'budgetapp-snapshot'; // то же имя - в index.html
const APP_SHELL = ['./', './index.html', './manifest.json', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' })))
    )
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

function pageFromNetworkFirst(req) {
  return fetch(req, { cache: 'no-cache' })
    .then((resp) => {
      if (resp.ok) {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
      }
      return resp;
    })
    .catch(() =>
      caches.match(req, { ignoreSearch: true }).then((cached) => cached || caches.match('./index.html'))
    );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const isSameOrigin = new URL(req.url).origin === self.location.origin;

  if (isSameOrigin && req.mode === 'navigate') {
    event.respondWith(pageFromNetworkFirst(req));
    return;
  }

  if (isSameOrigin) {
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
