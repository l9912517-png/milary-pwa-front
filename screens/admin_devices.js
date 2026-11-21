/*
 * Устройства и версии (только админ): кто где вошёл, когда заходил, какая версия, установлено ли, уведомления.
 * Сервер: GET /api/admin/devices.
 */

let adFilter = "";

registerScreen("admin_devices", async function () {
    window.currentScreen = "admin_devices";
    window.screenBack = () => openAdminPanel();
    title.innerText = "Устройства и версии";

    const chip = (key, label) =>
        `<button type="button" class="period-btn${adFilter === key ? " active" : ""}" onclick="adSetFilter('${key}')">${label}</button>`;

    container.innerHTML = `
        <div class="tq-page">
            <div id="adCounts" class="tq-counts"></div>
            <div class="report-actions">
                <div class="period-buttons">${chip("", "Все")}${chip("nopush", "Без уведомлений")}${chip("browser", "Не установили")}${chip("never", "Не заходили")}</div>
                ${refreshButton("adLoad")}
            </div>
            <div id="adVersions" class="ad-versions"></div>
            <div id="adList" class="tq-list"><div class="report-status">Загрузка…</div></div>
        </div>`;
    adLoad();
});

function adSetFilter(key) {
    adFilter = key;
    openScreen("admin_devices");
}

async function adLoad() {
    let d;
    try {
        const r = await fetch("/api/admin/devices", { headers: { "Authorization": "Bearer " + localStorage.getItem("jwt") } });
        d = await r.json();
        if (!r.ok || !d.success) throw new Error();
    } catch (e) {
        const list = document.getElementById("adList");
        if (list) list.innerHTML = `<div class="report-status">Не удалось загрузить</div>`;
        return;
    }
    if (window.currentScreen !== "admin_devices") return;

    const users = d.users.filter(u => u.is_active);
    const withDev = users.filter(u => u.devices.length);
    const day = Date.now() - 86400000;
    const tile = (n, label, cls) => `<div class="tq-count ${cls}"><b>${Number(n) || 0}</b><span>${label}</span></div>`;
    document.getElementById("adCounts").innerHTML =
        tile(users.filter(u => u.last_seen && Date.parse(u.last_seen) > day).length, "заходили за сутки", "done") +
        tile(withDev.filter(u => u.devices.some(x => x.installed)).length, "установили", "work") +
        tile(withDev.filter(u => u.devices.some(x => x.push === "subscribed")).length, "с уведомлениями", "wait") +
        tile(users.length - withDev.length, "не заходили 90 дней", "fail");

    const vers = Object.entries(d.versions || {}).sort((a, b) => String(b[0]).localeCompare(String(a[0]), "ru", { numeric: true }));
    document.getElementById("adVersions").innerHTML = vers.length
        ? "Версии приложения: " + vers.map(([v, n]) => `<span class="ad-ver${v === APP_VERSION ? " is-current" : ""}">${escapeHtml(v)}: ${Number(n)}</span>`).join(" ")
        : "";

    const pick = {
        "": () => true,
        nopush: u => u.devices.length && !u.devices.some(x => x.push === "subscribed"),
        browser: u => u.devices.length && !u.devices.some(x => x.installed),
        never: u => !u.devices.length
    }[adFilter] || (() => true);

    const list = users.filter(pick);
    const box = document.getElementById("adList");
    if (!list.length) { box.innerHTML = `<div class="report-status">Никого</div>`; return; }
    box.innerHTML = list.map(u => `
        <div class="tq-item">
            <div class="tq-item-head" onclick="this.parentNode.classList.toggle('open')">
                <span class="tq-item-main">
                    <span class="tq-item-type">${escapeHtml(u.name)}</span>
                    <span class="tq-item-sub">${escapeHtml(u.role)} · ${u.last_seen ? "заходил(а) " + escapeHtml(devicesAgo(u.last_seen)) : "не заходил(а)"}${u.devices.length ? " · устройств: " + u.devices.length : ""}</span>
                </span>
                ${u.devices.some(x => x.push === "subscribed") ? `<span class="tq-status done">push</span>` : ""}
                ${u.devices.some(x => x.installed) ? `<span class="tq-status work">прил.</span>` : ""}
            </div>
            <div class="tq-item-body">
                ${u.devices.map(x => `<div class="ad-dev"><b>${escapeHtml(devicesName(x))}</b><small>${escapeHtml(devicesAgo(x.last_seen))}${devicesLine(x) ? " · " + escapeHtml(devicesLine(x)) : ""}</small></div>`).join("") || `<div class="ad-dev"><small>Устройств нет</small></div>`}
                ${u.devices.length ? `<button type="button" class="btn-secondary" onclick="adminRevokeUserSessions(${Number(u.id)}, ${jsArg(u.name)}).then(adLoad)">Выйти на всех устройствах</button>` : ""}
            </div>
        </div>`).join("");
}
