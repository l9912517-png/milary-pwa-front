/*
 * Устройства и сессии (сервер: sessions/).
 *
 *  - clientReport(): после входа приложение сообщает о себе — версия, установлено ли, уведомления, устройство.
 *  - «Настройки» → «Мои устройства»: где выполнен вход, «Выйти» на чужом устройстве, «Выйти на всех других»,
 *    «Войти на другом устройстве» (код из 6 цифр, invite/invite.js).
 *  - Выход из приложения закрывает и сессию на сервере.
 *  - Админ: экран «Устройства и версии» (screens/admin_devices.js), «Выйти на всех устройствах» у пользователя.
 */

const APP_VERSION = (() => {
    try {
        const s = [...document.scripts].find(x => /\/app\.js\?/.test(x.src));
        return s ? new URL(s.src).searchParams.get("v") || "" : "";
    } catch (e) { return ""; }
})();

async function devicesPushState() {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
    if (Notification.permission !== "granted") return Notification.permission;
    try {
        const reg = await Promise.race([navigator.serviceWorker.ready, new Promise(r => setTimeout(() => r(null), 3000))]);
        const sub = reg && reg.pushManager ? await reg.pushManager.getSubscription() : null;
        return sub ? "subscribed" : "granted";
    } catch (e) { return "granted"; }
}

async function clientReport() {
    const jwt = localStorage.getItem("jwt");
    if (!jwt) return;
    try {
        await fetch("/api/client-info", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + jwt },
            body: JSON.stringify({
                version: APP_VERSION,
                installed: typeof installIsStandalone === "function" && installIsStandalone(),
                push: await devicesPushState(),
                device: typeof inviteDeviceText === "function" ? inviteDeviceText() : "",
                screen: String(window.currentScreen || "")
            })
        });
    } catch (e) { /* без связи — в следующий раз */ }
}

/* при выходе: закрыть сессию на сервере (не ждём ответа) */
function devicesRevokeCurrent() {
    const jwt = localStorage.getItem("jwt");
    if (!jwt) return;
    try {
        fetch("/api/sessions/current/revoke", { method: "POST", keepalive: true, headers: { "Authorization": "Bearer " + jwt } }).catch(() => null);
    } catch (e) { /* не важно */ }
}

function devicesAgo(iso) {
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.round(ms / 60000);
    if (m < 2) return "сейчас";
    if (m < 60) return m + " мин назад";
    const h = Math.round(m / 60);
    if (h < 24) return h + " ч назад";
    const d = Math.round(h / 24);
    return d === 1 ? "вчера" : d + " дн назад";
}

const DEVICES_PUSH = { subscribed: "уведомления включены", granted: "уведомления разрешены, но не подключены", denied: "уведомления запрещены", default: "уведомления не включены", unsupported: "без уведомлений" };

function devicesLine(d) {
    const parts = [];
    if (d.installed) parts.push("приложение"); else if (d.app_version) parts.push("в браузере");
    if (d.push && DEVICES_PUSH[d.push]) parts.push(DEVICES_PUSH[d.push]);
    if (d.app_version) parts.push("версия " + d.app_version);
    return parts.join(" · ");
}

function devicesName(d) {
    if (d.device) return d.device.length > 70 && d.legacy ? "Устройство (вход до обновления)" : d.device;
    return "Устройство";
}

async function devicesShow() {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "devicesOverlay";
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
    overlay.innerHTML = `
        <div class="modal-window" role="dialog" aria-label="Мои устройства">
            <h3>Мои устройства</h3>
            <div class="devices-list"><div class="transfer-sub">Загрузка…</div></div>
            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove(); transferShow()">Войти на другом</button>
                <button type="button" class="btn-primary-wide" onclick="this.closest('.modal-overlay').remove()">Готово</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    devicesLoad();
}

async function devicesLoad() {
    const box = document.querySelector("#devicesOverlay .devices-list");
    if (!box) return;
    let data = null;
    try {
        const r = await fetch("/api/sessions", { headers: { "Authorization": "Bearer " + localStorage.getItem("jwt") } });
        data = await r.json();
    } catch (e) { data = null; }
    if (!data || !data.success) {
        box.innerHTML = `<div class="transfer-sub">Не удалось загрузить список. Проверьте связь</div>`;
        return;
    }
    const list = Array.isArray(data.sessions) ? data.sessions : [];
    const others = list.filter(s => !s.current).length;
    box.innerHTML = list.map(s => `
        <div class="device-item${s.current ? " is-current" : ""}">
            <span class="device-icon">${iconSvg(/телефон|iOS|Android/.test(s.device) ? "M7 2h10v20H7z M11 18h2" : "M3 5h18v11H3z M8 20h8 M12 16v4")}</span>
            <span class="device-text">
                <span class="device-name">${escapeHtml(devicesName(s))}</span>
                <span class="device-sub">${s.current ? "это устройство" : escapeHtml(devicesAgo(s.last_seen))}${devicesLine(s) ? " · " + escapeHtml(devicesLine(s)) : ""}</span>
            </span>
            ${s.current ? "" : `<button type="button" class="btn-secondary device-out" onclick="devicesRevoke(${jsArg(s.sid)}, this)">Выйти</button>`}
        </div>`).join("") +
        (others > 1 ? `<button type="button" class="btn-secondary device-out-all" onclick="devicesRevokeOthers(this)">Выйти на всех других (${others})</button>` : "") +
        `<div class="transfer-sub">Не узнаёте устройство? Нажмите «Выйти» рядом с ним — там понадобится войти заново.</div>`;
}

async function devicesRevoke(sid, btn) {
    btn.disabled = true;
    try {
        const r = await fetch("/api/sessions/" + encodeURIComponent(sid) + "/revoke", { method: "POST", headers: { "Authorization": "Bearer " + localStorage.getItem("jwt") } });
        if (!r.ok) throw new Error();
    } catch (e) {
        btn.disabled = false;
        return alert("Не получилось. Проверьте связь и попробуйте ещё раз");
    }
    devicesLoad();
}

async function devicesRevokeOthers(btn) {
    if (!confirm("Выйти на всех других устройствах? Там понадобится войти заново.")) return;
    btn.disabled = true;
    try {
        const r = await fetch("/api/sessions/revoke-others", { method: "POST", headers: { "Authorization": "Bearer " + localStorage.getItem("jwt") } });
        if (!r.ok) throw new Error();
    } catch (e) {
        btn.disabled = false;
        return alert("Не получилось. Проверьте связь и попробуйте ещё раз");
    }
    devicesLoad();
}

function devicesHelpButtonHtml() {
    return `<button type="button" class="btn-secondary help-install" onclick="devicesShow()">${iconSvg("M7 2h10v20H7z M11 18h2", "btn-ico")}Мои устройства</button>`;
}

/* админ: выйти на всех устройствах пользователя */
async function adminRevokeUserSessions(id, name) {
    if (!confirm(`Выйти на всех устройствах: ${name}? Ему понадобится войти заново (по ссылке-приглашению или токену).`)) return;
    try {
        const r = await fetch(`/api/admin/users/${Number(id)}/sessions/revoke`, { method: "POST", headers: { "Authorization": "Bearer " + localStorage.getItem("jwt") } });
        const d = await r.json();
        if (!r.ok || !d.success) throw new Error();
        alert(d.revoked ? `Готово: закрыто входов — ${d.revoked}.` : "Готово. Открытых входов не было.");
    } catch (e) {
        alert("Не получилось. Проверьте связь и попробуйте ещё раз");
    }
}
