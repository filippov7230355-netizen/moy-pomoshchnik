const CACHE_NAME = 'moy-pomoshchnik-shell-v2';

const APP_ROOT = self.registration.scope;
const APP_INDEX = new URL('index.html', APP_ROOT).href;

const APP_SHELL = [
  APP_ROOT,
  APP_INDEX,
  new URL('manifest.webmanifest', APP_ROOT).href,
  new URL('icons/icon-192.png', APP_ROOT).href,
  new URL('icons/icon-512.png', APP_ROOT).href
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Главная страница обязательна для установки
    await cache.add(APP_INDEX);

    // Остальные файлы кешируем, если они доступны
    await Promise.all(
      APP_SHELL
        .filter(url => url !== APP_INDEX)
        .map(async url => {
          try {
            await cache.add(url);
          } catch (error) {
            console.warn('Не удалось кешировать:', url, error);
          }
        })
    );

    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();

    await Promise.all(
      keys
        .filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))
    );

    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin
  ) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response.ok) {
            const copy = response.clone();

            caches.open(CACHE_NAME).then(cache => {
              cache.put(APP_INDEX, copy);
            });
          }

          return response;
        })
        .catch(async () => {
          return await caches.match(APP_INDEX);
        })
    );

    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      return cached || fetch(request);
    })
  );
});

self.addEventListener('push', event => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = {
      body: event.data ? event.data.text() : ''
    };
  }

  event.waitUntil(
    self.registration.showNotification(
      payload.title || 'Мой помощник',
      {
        body: payload.body || 'У вас есть обновление.',
        icon: new URL('icons/icon-192.png', APP_ROOT).href,
        badge: new URL('icons/icon-192.png', APP_ROOT).href,
        tag: payload.tag || 'moy-pomoshchnik',
        data: {
          url: payload.url || APP_ROOT
        },
        actions: Array.isArray(payload.actions)
          ? payload.actions.slice(0, 2)
          : []
      }
    )
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  event.waitUntil((async () => {
    let target;

    try {
      target = new URL(
        event.notification.data?.url || APP_ROOT,
        APP_ROOT
      );

      // Не позволяем переходить за пределы приложения
      if (
        target.origin !== self.location.origin ||
        !target.pathname.startsWith(new URL(APP_ROOT).pathname)
      ) {
        target = new URL(APP_ROOT);
      }
    } catch (error) {
      target = new URL(APP_ROOT);
    }

    const windows = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    for (const client of windows) {
      if ('navigate' in client) {
        try {
          await client.navigate(target.href);
          return await client.focus();
        } catch (error) {
          console.warn('Ошибка перехода:', error);
        }
      }
    }

    return self.clients.openWindow(target.href);
  })());
});
