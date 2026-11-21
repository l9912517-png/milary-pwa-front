/*
 * Ошибки приложения: всё, что сломалось в JavaScript у пользователя, уходит на сервер (/api/client-errors).
 * Админ видит их сгруппированными: «Администрирование» → «Ошибки приложения» (screens/admin_errors.js).
 *
 * Подключается раньше app.js, чтобы ловить и ошибки запуска. Одна и та же ошибка за открытие приложения
 * отправляется один раз, всего — не больше 20; отправка пачкой через 3 секунды.
 */

const ERRORS_SENT = new Set();
const ERRORS_QUEUE = [];
let errorsTimer = null;
let errorsTotal = 0;

function errorsVersion() {
    try {
        const s = [...document.scripts].find(x => /\/app\.js\?/.test(x.src));
        return s ? new URL(s.src).searchParams.get("v") || "" : "";
    } catch (e) { return ""; }
}

function errorsPush(item) {
    const key = [item.kind, item.message, item.source, item.line].join("|");
    if (ERRORS_SENT.has(key) || errorsTotal >= 20) return;
    ERRORS_SENT.add(key);
    errorsTotal++;
    ERRORS_QUEUE.push(Object.assign(item, { screen: String(window.currentScreen || "") }));
    clearTimeout(errorsTimer);
    errorsTimer = setTimeout(errorsFlush, 3000);
}

function errorsFlush() {
    if (!ERRORS_QUEUE.length) return;
    const batch = ERRORS_QUEUE.splice(0, 10);
    const headers = { "Content-Type": "application/json" };
    const jwt = localStorage.getItem("jwt");
    if (jwt) headers["Authorization"] = "Bearer " + jwt;
    try {
        fetch("/api/client-errors", {
            method: "POST",
            keepalive: true,
            headers,
            body: JSON.stringify({
                errors: batch,
                version: errorsVersion(),
                device: typeof inviteDeviceText === "function" ? inviteDeviceText() : navigator.userAgent.slice(0, 200)
            })
        }).catch(() => null);
    } catch (e) { /* не страшно */ }
    if (ERRORS_QUEUE.length) errorsTimer = setTimeout(errorsFlush, 3000);
}

window.addEventListener("error", e => {
    if (!e || !e.message) return;              // ошибки загрузки картинок и т. п. — не наши
    errorsPush({
        kind: "error",
        message: String(e.message).slice(0, 500),
        source: e.filename || "",
        line: e.lineno || 0,
        col: e.colno || 0,
        stack: e.error && e.error.stack ? String(e.error.stack).slice(0, 2000) : ""
    });
});

window.addEventListener("unhandledrejection", e => {
    const r = e && e.reason;
    const message = r && r.message ? r.message : String(r);
    errorsPush({
        kind: "promise",
        message: String(message).slice(0, 500),
        source: "",
        line: 0,
        stack: r && r.stack ? String(r.stack).slice(0, 2000) : ""
    });
});

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") errorsFlush();
});

/* счётчик на карточке «Ошибки приложения» в админке */
async function errorsRefreshBadge() {
    const badge = document.querySelector("[data-errors-count]");
    if (!badge) return;
    try {
        const r = await fetch("/api/admin/client-errors", { headers: { "Authorization": "Bearer " + localStorage.getItem("jwt") } });
        const d = await r.json();
        const n = r.ok && d.success ? Number(d.open) || 0 : 0;
        badge.textContent = n > 99 ? "99+" : String(n);
        badge.hidden = !n;
    } catch (e) { /* без счётчика */ }
}
