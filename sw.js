const CACHE_NAME = "milary-cache-v1";

const STATIC_ASSETS = [
    "/pwa/index.html",
    "/pwa/styles.css",
    "/pwa/theme.css",
    "/pwa/icon-192.png",
    "/pwa/notification.mp3"
];

/* ===== INSTALL ===== */
self.addEventListener("install", event => {
    self.skipWaiting();

    // Cache each file separately: one failed file must not abort the install
    // (otherwise the browser silently keeps the old service worker).
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => Promise.all(
                STATIC_ASSETS.map(url => cache.add(url).catch(() => null))
            ))
            .catch(() => null)
    );
});

/* ===== ACTIVATE ===== */
self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            ))
            .catch(() => null)
            .then(() => self.clients.claim())
    );
});

/* ===== FETCH ===== */
self.addEventListener("fetch", event => {

    // API и файлы пользователей (/files/) — всегда напрямую в сеть, мимо service worker и кэша
    const reqPath = new URL(event.request.url).pathname;
    if (reqPath.startsWith("/api/") || reqPath.startsWith("/files/")) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .catch(() => caches.match(event.request))
    );
});

/* ===== PUSH ===== */
self.addEventListener("push", event => {

    if (!event.data) {
        return;
    }

    let payload;

    try {

        payload = event.data.json();

    } catch (e) {

        console.error(
            "PUSH JSON ERROR:",
            e
        );

        return;
    }

    const pushData =
        payload.data || {};

    // По нажатию на уведомление открываем приложение на этом же сайте
    const notificationUrl =
        new URL("/pwa/", self.location.origin).href;


    event.waitUntil(

        self.registration.showNotification(

            payload.title ||
            "MILARY",

            {

                body:
                    payload.body || "",

                icon:
                    "/pwa/icon-192.png",

                badge:
                    "/pwa/badge-96.png",

                // Уведомление остаётся на экране,
                // пока пользователь его не откроет/закроет.
                requireInteraction:
                    true,

                // Вибрация на поддерживаемых устройствах.
                vibrate:
                    [200, 100, 200],

                // Не объединять разные push
                // в одно уведомление.
                tag:
                    "milary-" +
                    Date.now(),

                data: {

                    url:
                        notificationUrl,

                    type:
                        pushData.type || null,

                    message_id:
                        pushData.message_id || null

                }

            }

        )

    );

});


/* ===== CLICK ===== */
self.addEventListener(
    "notificationclick",
    event => {

        event.notification.close();


        const url =
            event.notification.data?.url ||
            new URL("/pwa/", self.location.origin).href;


        /*
         * Navigate an open app window that THIS service worker controls.
         * client.navigate() throws for windows controlled by an older worker
         * (right after an update) - then fall back to opening the URL.
         */
        event.waitUntil(
            clients.matchAll({ type: "window" })
                .then(clientList => {
                    for (const client of clientList) {
                        if ("focus" in client && "navigate" in client) {
                            return client.navigate(url)
                                .then(c => (c || client).focus())
                                .catch(() => clients.openWindow(url));
                        }
                    }
                    return clients.openWindow(url);
                })
                .catch(() => clients.openWindow(url))
        );

    }
);