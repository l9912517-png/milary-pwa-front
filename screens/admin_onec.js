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
                <div class="ao-open-buttons" id="aoOpenBox">
                    <div class="ao-open-label">Открыть на:</div>
                    <div class="ao-buttons">
                        <button type="button" onclick="aoWindow(15)">15 мин</button>
                        <button type="button" class="btn-secondary" onclick="aoWindow(60)">1 час</button>
                        <button type="button" class="btn-secondary" onclick="aoWindow(240)">4 часа</button>
                        <button type="button" class="btn-secondary" onclick="aoWindow(1440)">1 день</button>
                        <button type="button" class="btn-secondary" onclick="aoWindow(10080)">7 дней</button>
                    </div>
                    <details class="ao-custom">
                        <summary>Своё время</summary>
                        <div class="ao-custom-row">
                            <input type="number" id="aoNum" min="1" max="720" value="2" inputmode="numeric" aria-label="Сколько">
                            <select id="aoUnit" aria-label="Единица">
                                <option value="1">минут</option><option value="60" selected>часов</option><option value="1440">дней</option>
                            </select>
                            <button type="button" onclick="aoWindowCustom()">Открыть</button>
                        </div>
                        <div class="ao-custom-row">
                            <span class="ao-until-label">или до</span>
                            <input type="datetime-local" id="aoUntil" aria-label="До даты и времени">
                            <button type="button" onclick="aoWindowUntil()">Открыть</button>
                        </div>
                        <div class="transfer-sub" style="text-align:left">Не дольше 30 дней.</div>
                    </details>
                </div>
                <div class="ao-buttons" id="aoOpenActions" hidden>
                    <button type="button" class="btn-secondary" id="aoExtendBtn" onclick="aoExtend()">Продлить</button>
                    <button type="button" class="btn-secondary ao-close" onclick="aoWindow(0)">Закрыть сейчас</button>
                </div>
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
            const rest = m >= 1440 ? aoDuration(Math.round(m / 60) * 60) : m >= 120 ? aoDuration(Math.round(m / 60) * 60) : m + " мин";
            w.className = "ao-state open";
            w.innerHTML = `<b>Открыто</b> — ещё ${escapeHtml(rest)} (до ${escapeHtml(adminTime(d.window_until))})${d.window_by ? ", открыл(а) " + escapeHtml(d.window_by) : ""}`;
        } else {
            w.className = "ao-state closed";
            w.innerHTML = `<b>Закрыто</b> — 1С не может управлять пользователями`;
            clearInterval(aoTimer);
        }
        document.getElementById("aoOpenActions").hidden = !(left > 0);
        document.getElementById("aoOpenBox").hidden = left > 0;
        const ext = document.getElementById("aoExtendBtn");
        if (ext && d.window_minutes) ext.textContent = "Продлить +" + aoDuration(d.window_minutes);
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

/* «15 мин», «4 ч», «2 дн 3 ч» */
function aoDuration(min) {
    const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
    return [d && d + " дн", h && h + " ч", m && m + " мин"].filter(Boolean).join(" ") || "0 мин";
}

async function aoWindow(minutes) {
    if (minutes && !confirm(`Разрешить 1С управлять пользователями на ${aoDuration(minutes)}?`)) return;
    try { await aoApi("/api/admin/onec/window", { minutes }); } catch (e) { return alert(e.message); }
    aoLoad();
}

function aoWindowCustom() {
    const n = Math.floor(Number(document.getElementById("aoNum").value));
    const unit = Number(document.getElementById("aoUnit").value);
    if (!n || n < 1) return alert("Укажите число больше нуля");
    const minutes = n * unit;
    if (minutes > 43200) return alert("Не дольше 30 дней");
    aoWindow(minutes);
}

async function aoWindowUntil() {
    const v = document.getElementById("aoUntil").value;
    if (!v) return alert("Выберите дату и время");
    const t = new Date(v);                                   // местное время телефона
    if (!(t.getTime() > Date.now())) return alert("Это время уже прошло");
    if (t.getTime() - Date.now() > 30 * 86400000) return alert("Не дольше 30 дней");
    if (!confirm(`Разрешить 1С управлять пользователями до ${t.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}?`)) return;
    try { await aoApi("/api/admin/onec/window", { until: t.toISOString() }); } catch (e) { return alert(e.message); }
    aoLoad();
}

async function aoExtend() {
    try { await aoApi("/api/admin/onec/window/extend", {}); } catch (e) { return alert(e.message); }
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
