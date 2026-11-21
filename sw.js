/*
 * MILARY — service worker.
 *
 * - Файлы приложения: сначала сеть, без сети — последняя сохранённая копия.
 *   Поэтому после выкатки люди сразу получают новую версию.
 * - Страница без сети — экран «Нет подключения» (offline.html): без сервера
 *   приложение всё равно ничего не покажет, а экран честно говорит, в чём дело.
 * - /api/, /files/, /storage — всегда напрямую в сеть, ничего не сохраняем (данные и файлы пользователей).
 * - Сохраняем только GET-запросы к своему сайту; адрес — без параметров (?v=, ?t=), чтобы не копить копии.
 * - Push: показываем уведомление; по нажатию открываем приложение.
 *
 * При изменении списка SHELL или логики — поменять номер в CACHE_NAME.
 */

const CACHE_NAME = "milary-v2";

const OFFLINE_URL = "/pwa/offline.html";

/* заранее сохраняем экран «Нет подключения» и картинки для уведомлений */
const SHELL = [
    OFFLINE_URL,
    "/pwa/icon-192.png",
    "/pwa/badge-96.png"
];

/* адреса, которые никогда не идут через service worker */
const BYPASS = ["/api/", "/files/", "/storage/", "/storage-chunk/"];


/* ===== INSTALL ===== */
self.addEventListener("install", event => {
    self.skipWaiting();

    // Каждый файл отдельно: один неудачный файл не должен сорвать установку
    // (иначе браузер молча оставит старый service worker).
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => Promise.all(
                SHELL.map(url => cache.add(new Request(url, { cache: "reload" })).catch(() => null))
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

function cacheKey(url) {
    return url.origin + url.pathname;          // без ?v= и ?t=
}

function offlineResponse() {
    return caches.match(OFFLINE_URL).then(r => r || new Response(
        "<!doctype html><meta charset=utf-8><title>MILARY</title><p>Нет подключения к интернету.</p>",
        { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } }
    ));
}

self.addEventListener("fetch", event => {

    const req = event.request;

    if (req.method !== "GET") return;

    const url = new URL(req.url);

    if (url.origin !== self.location.origin) return;          // шрифты и прочее — браузер сам
    if (BYPASS.some(prefix => url.pathname.startsWith(prefix))) return;

    const key = cacheKey(url);

    event.respondWith(
        fetch(req)
            .then(response => {
                // сохраняем только нормальные ответы своего сайта
                if (response.ok && response.type === "basic") {
                    const copy = response.clone();
                    caches.open(CACHE_NAME)
                        .then(cache => cache.put(key, copy))
                        .catch(() => null);
                }
                return response;
            })
            .catch(() =>
                req.mode === "navigate"
                    ? offlineResponse()
                    : caches.match(key).then(cached =>
                        cached || new Response("", { status: 504, statusText: "Offline" }))
            )
    );
});


/* ===== PUSH ===== */
self.addEventListener("push", event => {

    let payload = {};

    try {
        payload = event.data ? event.data.json() : {};
    } catch (e) {
        // не JSON — покажем как текст
        payload = { body: event.data ? event.data.text() : "" };
    }

    const pushData = payload.data || {};

    // по нажатию — только свой сайт
    let target = "/pwa/";
    if (typeof pushData.url === "string" && pushData.url.startsWith("/pwa/")) {
        target = pushData.url;
    }

    // уведомление показываем всегда: браузер требует его на каждый push
    event.waitUntil(
        self.registration.showNotification(
            payload.title || "MILARY",
            {
                body: payload.body || "Новое уведомление",
                icon: "/pwa/icon-192.png",
                badge: "/pwa/badge-96.png",

                // остаётся на экране, пока его не откроют или не закроют
                requireInteraction: true,
                vibrate: [200, 100, 200],

                // разные push не объединяем в одно уведомление
                tag: "milary-" + Date.now(),

                data: {
                    url: new URL(target, self.location.origin).href,
                    type: pushData.type || null,
                    message_id: pushData.message_id || null
                }
            }
        )
    );
});


/* ===== CLICK ===== */
self.addEventListener("notificationclick", event => {

    event.notification.close();

    const url = (event.notification.data && event.notification.data.url) ||
        new URL("/pwa/", self.location.origin).href;

    /*
     * Если приложение уже открыто — переходим в нём и показываем окно.
     * client.navigate() не работает для окна под старым service worker (сразу после обновления) —
     * тогда открываем новое окно.
     */
    event.waitUntil(
        clients.matchAll({ type: "window", includeUncontrolled: true })
            .then(list => {
                for (const client of list) {
                    if (new URL(client.url).origin !== self.location.origin) continue;
                    if ("navigate" in client) {
                        return client.navigate(url)
                            .then(c => (c || client).focus())
                            .catch(() => client.focus());
                    }
                    return client.focus();
                }
                return clients.openWindow(url);
            })
            .catch(() => clients.openWindow(url))
    );
});
