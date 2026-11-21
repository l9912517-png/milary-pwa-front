/*
 * Ошибки приложения (только админ): сгруппированные ошибки JavaScript у пользователей.
 * Сервер: GET /api/admin/client-errors, POST /api/admin/client-errors/:id/hide.
 * «Скрыть» — ошибка разобрана; если повторится, вернётся в список.
 */

let aeHidden = false;

registerScreen("admin_errors", function () {
    window.currentScreen = "admin_errors";
    window.screenBack = () => openAdminPanel();
    title.innerText = "Ошибки приложения";

    container.innerHTML = `
        <div class="tq-page">
            <div class="report-actions">
                <div class="period-buttons">
                    <button type="button" class="period-btn${aeHidden ? "" : " active"}" onclick="aeShow(false)">Открытые</button>
                    <button type="button" class="period-btn${aeHidden ? " active" : ""}" onclick="aeShow(true)">Скрытые</button>
                </div>
                ${refreshButton("aeLoad")}
            </div>
            <div id="aeSummary" class="ad-versions"></div>
            <div id="aeList" class="tq-list"><div class="report-status">Загрузка…</div></div>
        </div>`;
    aeLoad();
});

function aeShow(hidden) {
    aeHidden = hidden;
    openScreen("admin_errors");
}

async function aeLoad() {
    let d;
    try {
        const r = await fetch("/api/admin/client-errors" + (aeHidden ? "?hidden=1" : ""), { headers: { "Authorization": "Bearer " + localStorage.getItem("jwt") } });
        d = await r.json();
        if (!r.ok || !d.success) throw new Error();
    } catch (e) {
        const list = document.getElementById("aeList");
        if (list) list.innerHTML = `<div class="report-status">Не удалось загрузить</div>`;
        return;
    }
    if (window.currentScreen !== "admin_errors") return;

    document.getElementById("aeSummary").innerHTML = aeHidden ? "" :
        `Открытых: <b>${Number(d.open)}</b>, за сутки: <b>${Number(d.last_day)}</b>` +
        (d.open ? ` <button type="button" class="btn-secondary ae-hide-all" onclick="aeHide('all', this)">Скрыть все</button>` : "");

    const list = document.getElementById("aeList");
    if (!d.errors.length) {
        list.innerHTML = `<div class="report-status">${aeHidden ? "Скрытых нет" : "Ошибок нет — всё работает"}</div>`;
        return;
    }
    list.innerHTML = d.errors.map(e => {
        const where = [e.source ? e.source + (e.line ? ":" + e.line : "") : "", e.last_screen ? "экран " + e.last_screen : ""].filter(Boolean).join(" · ");
        return `
        <div class="tq-item${e.count > 5 ? " failed" : ""}" data-id="${escapeHtml(e.id)}">
            <div class="tq-item-head" onclick="this.parentNode.classList.toggle('open')">
                <span class="tq-item-main">
                    <span class="tq-item-type ae-msg">${escapeHtml(e.message)}</span>
                    <span class="tq-item-sub">${escapeHtml(devicesAgo(e.last_seen))} · ${Number(e.count)} раз · людей: ${Number(e.users)}${e.last_user ? " · последний: " + escapeHtml(e.last_user) : ""}</span>
                </span>
                <span class="tq-status ${e.kind === "promise" ? "wait" : "fail"}">${e.kind === "promise" ? "promise" : "error"}</span>
            </div>
            <div class="tq-item-body">
                ${where ? `<div class="ad-dev"><small>Где</small>${escapeHtml(where)}</div>` : ""}
                <div class="ad-dev"><small>Последний раз</small>${escapeHtml(tqTimeSafe(e.last_seen))}${e.last_version ? ", версия " + escapeHtml(e.last_version) : ""}${e.last_device ? "<br>" + escapeHtml(e.last_device) : ""}</div>
                <div class="ad-dev"><small>Впервые</small>${escapeHtml(tqTimeSafe(e.first_seen))}</div>
                ${e.stack ? `<pre class="ae-stack">${escapeHtml(e.stack)}</pre>` : ""}
                ${aeHidden ? "" : `<button type="button" class="btn-secondary" onclick="aeHide(${jsArg(e.id)}, this)">Скрыть (разобрано)</button>`}
            </div>
        </div>`;
    }).join("");
}

function tqTimeSafe(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

async function aeHide(id, btn) {
    if (id === "all" && !confirm("Скрыть все открытые ошибки? Повторившиеся снова появятся в списке.")) return;
    btn.disabled = true;
    try {
        const r = await fetch("/api/admin/client-errors/" + encodeURIComponent(id) + "/hide", { method: "POST", headers: { "Authorization": "Bearer " + localStorage.getItem("jwt") } });
        if (!r.ok) throw new Error();
    } catch (e) {
        btn.disabled = false;
        return alert("Не получилось. Проверьте связь");
    }
    aeLoad();
}
