const CACHE_NAME = "app-cache-v55";

const STATIC_ASSETS = [
    "/pwa/index.html",
    "/pwa/styles.css",
    "/pwa/logo.png",
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

    if (event.request.url.includes("/api/")) {
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

    /*
     * Messenger push имеет структуру:
     *
     * {
     *     title: "...",
     *     body: "...",
     *     data: {
     *         type: "messenger_message",
     *         chat_id: 123,
     *         message_id: 456
     *     }
     * }
     *
     * Поэтому Messenger-данные находятся
     * внутри payload.data.
     */

    const pushData =
        payload.data || {};


    /*
     * Обычные уведомления:
     *
     * /pwa/
     *
     * Messenger:
     *
     * /pwa/?messenger_chat=CHAT_ID
     */

    let notificationUrl =
        "https://pwa.mealfresh.ru/pwa/";


    if (
        pushData.type === "messenger_message" &&
        pushData.chat_id
    ) {

        notificationUrl =
            "https://pwa.mealfresh.ru/pwa/" +
            "?messenger_chat=" +
            encodeURIComponent(
                pushData.chat_id
            );
    }

    // IDF task push: open the task (/pwa/?idf_task=ID, handled by idf/pwa.js)
    if (pushData.type === "idf" && pushData.task_id) {
        notificationUrl =
            "https://pwa.mealfresh.ru/pwa/?idf_task=" +
            encodeURIComponent(pushData.task_id);
    }


    event.waitUntil(

        self.registration.showNotification(

            payload.title ||
            "MEALFRESH",

            {

                body:
                    payload.body || "",

                icon:
                    "/pwa/logo.png",

                badge:
                    "/pwa/logo.png",

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
                    "mealfresh-" +
                    Date.now(),

                data: {

                    url:
                        notificationUrl,

                    type:
                        pushData.type || null,

                    chat_id:
                        pushData.chat_id || null,

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
            "https://pwa.mealfresh.ru/pwa/";


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