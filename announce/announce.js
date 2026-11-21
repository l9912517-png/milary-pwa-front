/*
 * Объявления (сервер: announcements/).
 *
 *  - Объявление приходит в «Сообщения» как обычное сообщение.
 *  - Важное и непрочитанное — ещё и полосой вверху главной: «Прочитано» убирает её.
 *  - Push с объявления ведёт на /pwa/?messages=1 — сразу открываются «Сообщения».
 *  - Админ пишет объявления: «Администрирование» → «Объявления» (screens/admin_announce.js).
 */

const ANNOUNCE_ROLES = {
    manager: "Менеджеры", rop: "РОП", director: "Директор", logistics: "Логисты",
    driver: "Водители", operator: "Операторы", admin: "Админы"
};

async function announceBannerRefresh() {
    const jwt = localStorage.getItem("jwt");
    if (!jwt || window.currentScreen !== "menu") return;
    let list = [];
    try {
        const r = await fetch("/api/messages", { headers: { "Authorization": "Bearer " + jwt } });
        if (!r.ok) return;
        list = (await r.json()).messages || [];
    } catch (e) { return; }
    if (window.currentScreen !== "menu") return;

    const m = list.find(x => x.type === "announcement" && x.priority === "high" && !x.is_read);
    const old = document.getElementById("announceBanner");
    if (old) old.remove();
    if (!m) return;

    container.insertAdjacentHTML("afterbegin", `
        <div class="announce-banner" id="announceBanner" role="status">
            <span class="announce-icon">${iconSvg("M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z M15 9a4 4 0 0 1 0 6 M18 6a8 8 0 0 1 0 12")}</span>
            <span class="announce-text">
                <span class="announce-title">${escapeHtml(m.title)}</span>
                <span class="announce-body">${formatMessageText(m.body)}</span>
            </span>
            <span class="announce-actions">
                <button type="button" onclick="announceRead(${Number(m.id) || 0})">Прочитано</button>
                <button type="button" class="btn-secondary" onclick="showMessages()">Все сообщения</button>
            </span>
        </div>`);
}

async function announceRead(id) {
    const el = document.getElementById("announceBanner");
    if (el) el.remove();
    try {
        await fetch("/api/messages/" + Number(id) + "/read", { method: "POST", headers: { "Authorization": "Bearer " + localStorage.getItem("jwt") } });
    } catch (e) { /* в следующий раз */ }
    if (typeof loadUnreadCount === "function") loadUnreadCount().catch(() => null);
    announceBannerRefresh();
}

/* переход из push: /pwa/?messages=1 */
function announceOpenFromUrl() {
    const params = new URLSearchParams(location.search);
    if (!params.get("messages") || !localStorage.getItem("jwt")) return false;
    params.delete("messages");
    const rest = params.toString();
    history.replaceState(null, "", location.pathname + (rest ? "?" + rest : "") + location.hash);
    showMessages();
    return true;
}

/* дата и время для экранов админки: «22.11 10:15» */
function adminTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
