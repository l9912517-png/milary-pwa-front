/*
 * Обмен с 1С (только админ): окно «Разрешить 1С управлять пользователями», смена ключа обмена, журнал.
 * Сервер: /api/admin/onec (onec-access/).
 */

let aoTimer = null;

registerScreen("admin_onec", function () {
    window.currentScreen = "admin_onec";
    window.screenBack = () => openAdminPanel();
    title.innerText = "Обмен с 1С";
    container.innerHTML = `
        <div class="tq-page">
            <section class="help-card ao-card">
                <h2>Управление пользователями из 1С</h2>
                <div id="aoWindow" class="ao-state">Загрузка…</div>
                <div class="ao-open-label">Открыть на:</div>
                <div class="ao-buttons">
                    <button type="button" onclick="aoWindow(15)">15 минут</button>
                    <button type="button" class="btn-secondary" onclick="aoWindow(60)">1 час</button>
                    <button type="button" class="btn-secondary" onclick="aoWindow(1440)">1 день</button>
                </div>
                <button type="button" class="btn-secondary ao-close" id="aoCloseBtn" onclick="aoWindow(0)" hidden>Закрыть сейчас</button>
                <div class="transfer-sub" style="text-align:left">Пока окно закрыто, 1С не может создавать, включать и отключать пользователей, выдавать токены и приглашения.
                    Отчёты, файлы, задачи и уведомления работают всегда. Всё, что 1С делает при открытом окне, приходит вам уведомлением.</div>
            </section>
            <section class="help-card ao-card">
                <h2>Ключ обмена</h2>
                <div id="aoKey" class="ao-state"></div>
                <button type="button" class="btn-secondary" onclick="aoRotate()">Сменить ключ обмена</button>
                <div class="transfer-sub" style="text-align:left">Новый ключ покажется один раз — впишите его в 1С. Старый работает ещё час.
                    Меняйте ключ, если к 1С был доступ у человека, который больше с вами не работает.</div>
            </section>
            <h2 class="an-h">Журнал</h2>
            <div id="aoLog" class="tq-list"></div>
        </div>`;
    aoLoad();
});

async function aoApi(path, body) {
    const r = await fetch(path, {
        method: body ? "POST" : "GET",
        headers: Object.assign({ "Authorization": "Bearer " + localStorage.getItem("jwt") }, body ? { "Content-Type": "application/json" } : {}),
        body: body ? JSON.stringify(body) : undefined
    });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d || !d.success) throw new Error((d && d.message) || "Ошибка " + r.status);
    return d;
}

async function aoLoad() {
    let d;
    try { d = await aoApi("/api/admin/onec"); } catch (e) {
        const w = document.getElementById("aoWindow");
        if (w) w.textContent = "Не удалось загрузить: " + e.message;
        return;
    }
    if (window.currentScreen !== "admin_onec") return;
    const w = document.getElementById("aoWindow");
    clearInterval(aoTimer);
    const paint = () => {
        const left = d.window_until ? new Date(d.window_until).getTime() - Date.now() : 0;
        if (left > 0) {
            const m = Math.ceil(left / 60000);
            w.className = "ao-state open";
            w.innerHTML = `<b>Открыто</b> — ещё ${m >= 120 ? Math.round(m / 60) + " ч" : m + " мин"} (до ${escapeHtml(adminTime(d.window_until))})${d.window_by ? ", открыл(а) " + escapeHtml(d.window_by) : ""}`;
        } else {
            w.className = "ao-state closed";
            w.innerHTML = `<b>Закрыто</b> — 1С не может управлять пользователями`;
            clearInterval(aoTimer);
        }
        document.getElementById("aoCloseBtn").hidden = !(left > 0);
    };
    paint();
    if (d.window_open) aoTimer = setInterval(() => { if (window.currentScreen !== "admin_onec") return clearInterval(aoTimer); paint(); }, 30000);

    document.getElementById("aoKey").innerHTML = d.key_changed_at
        ? `Ключ менялся ${escapeHtml(adminTime(d.key_changed_at))}${d.prev_key_until ? ` · старый работает до ${escapeHtml(adminTime(d.prev_key_until))}` : ""}`
        : "Действует ключ из настроек сервера (.env) — ещё не менялся";

    const log = document.getElementById("aoLog");
    log.innerHTML = d.log.length ? d.log.map(l => `
        <div class="ao-log${/запрещено/.test(l.result) ? " bad" : ""}">
            <span class="ao-log-time">${escapeHtml(adminTime(l.at))}</span>
            <span class="ao-log-text"><b>${escapeHtml(l.action)}</b>${l.target ? " — " + escapeHtml(l.target) : ""}<small>${escapeHtml(l.result)}${l.ip ? " · " + escapeHtml(l.ip) : ""}</small></span>
        </div>`).join("") : `<div class="report-status">Записей пока нет</div>`;
}

async function aoWindow(minutes) {
    if (minutes && !confirm(`Разрешить 1С управлять пользователями на ${minutes >= 1440 ? "1 день" : minutes >= 60 ? "1 час" : minutes + " минут"}?`)) return;
    try { await aoApi("/api/admin/onec/window", { minutes }); } catch (e) { return alert(e.message); }
    aoLoad();
}

async function aoRotate() {
    if (!confirm("Сменить ключ обмена с 1С?\n\nНовый ключ нужно будет вписать в 1С. Старый перестанет работать через час.")) return;
    let d;
    try { d = await aoApi("/api/admin/onec/key", {}); } catch (e) { return alert(e.message); }
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
        <div class="modal-window" role="dialog" aria-label="Новый ключ обмена">
            <h3>Новый ключ обмена 1С</h3>
            <div class="transfer-sub" style="text-align:left">Скопируйте и впишите в 1С (константа «Ключ PWA»). Ключ показывается <b>один раз</b>.
                Старый работает до ${escapeHtml(adminTime(d.prev_key_until))}.</div>
            <input class="invite-link ao-key" value="${escapeHtml(d.key)}" readonly onclick="this.select()">
            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="copyText(${jsArg(d.key)}, 'Ключ скопирован')">Копировать</button>
                <button type="button" class="btn-primary-wide" onclick="this.closest('.modal-overlay').remove(); aoLoad()">Готово</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
}
