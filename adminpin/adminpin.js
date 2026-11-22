/*
 * PIN администратора (сервер: admin-pin/): 4 цифры после любого входа в учётную запись админа.
 * Пока PIN не введён, сервер отвечает { pin_required: true } — показываем экран PIN поверх всего.
 * Первый вход — задать PIN (дважды). Сменить — «Настройки» → «PIN администратора».
 */

function pinApi(path, body) {
    return fetch(path, {
        method: body ? "POST" : "GET",
        headers: Object.assign({ "Authorization": "Bearer " + localStorage.getItem("jwt") }, body ? { "Content-Type": "application/json" } : {}),
        body: body ? JSON.stringify(body) : undefined
    }).then(async r => ({ status: r.status, data: await r.json().catch(() => ({})) }));
}

/* ответ сервера «нужен PIN» → экран PIN; true — показали */
async function pinGateIfNeeded(response) {
    if (!response || response.status !== 403) return false;
    let d = null;
    try { d = await response.clone().json(); } catch (e) { d = null; }
    if (!d || !d.pin_required) return false;
    await pinGate();
    return true;
}

async function pinGate() {
    if (document.getElementById("pinScreen")) return;
    const st = await pinApi("/api/admin-pin").catch(() => null);
    if (!st || st.status !== 200) return logout();
    const setup = !st.data.has_pin;
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const el = document.createElement("div");
    el.id = "pinScreen";
    el.className = "lock-screen";
    el.innerHTML = `
        <form class="lock-box" onsubmit="event.preventDefault(); pinSubmit(${setup ? "true" : "false"});" autocomplete="off">
            ${typeof GRAPES_SVG === "string" ? GRAPES_SVG : ""}
            <span class="brand-name">Milary</span>
            <div class="lock-user">${escapeHtml(user.name || "")} · администратор</div>
            <div class="pin-title">${setup ? "Задайте PIN администратора — 4 цифры" : "Введите PIN администратора"}</div>
            <input id="pinInput" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" aria-label="PIN" required>
            ${setup ? `<input id="pinInput2" class="pin-input" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" aria-label="Повторите PIN" placeholder="ещё раз" required>` : ""}
            <button type="submit" class="login-submit" id="pinBtn">${setup ? "Сохранить PIN" : "Войти"}</button>
            <div class="login-error" id="pinError" role="alert">${st.data.locked_until ? "Вход заблокирован до " + escapeHtml(new Date(st.data.locked_until).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })) : ""}</div>
            <button type="button" class="btn-secondary lock-out" onclick="pinLogout()">Выйти</button>
        </form>`;
    document.body.appendChild(el);
    setTimeout(() => { const i = document.getElementById("pinInput"); if (i) i.focus(); }, 50);
}

async function pinSubmit(setup) {
    const err = document.getElementById("pinError");
    const btn = document.getElementById("pinBtn");
    const pin = document.getElementById("pinInput").value.trim();
    if (!/^\d{4}$/.test(pin)) { err.textContent = "Нужно 4 цифры"; return; }
    if (setup && document.getElementById("pinInput2").value.trim() !== pin) { err.textContent = "PIN не совпадает"; return; }
    btn.disabled = true;
    err.textContent = "";
    const r = await pinApi(setup ? "/api/admin-pin/setup" : "/api/admin-pin/verify", { pin }).catch(() => null);
    btn.disabled = false;
    if (!r || r.status !== 200) {
        err.textContent = (r && r.data && r.data.message) || "Нет связи с сервером";
        document.getElementById("pinInput").value = "";
        return;
    }
    const el = document.getElementById("pinScreen");
    if (el) el.remove();
    await validateToken(localStorage.getItem("jwt"));
}

function pinLogout() {
    const el = document.getElementById("pinScreen");
    if (el) el.remove();
    logout();
}

/* «Настройки» → «PIN администратора» */
function pinHelpButtonHtml() {
    const user = typeof currentUser !== "undefined" && currentUser ? currentUser : {};
    if (user.role !== "admin") return "";
    return `<button type="button" class="btn-secondary help-install" onclick="pinChangeShow()">${iconSvg("M6 11V7a6 6 0 0 1 12 0v4 M5 11h14v10H5z", "btn-ico")}PIN администратора</button>`;
}

function pinChangeShow() {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
    overlay.innerHTML = `
        <form class="modal-window" role="dialog" aria-label="Сменить PIN" onsubmit="event.preventDefault(); pinChangeSubmit(this);" autocomplete="off">
            <h3>Сменить PIN администратора</h3>
            <label>Текущий PIN<input name="old" type="password" inputmode="numeric" maxlength="4" required></label>
            <label>Новый PIN<input name="pin" type="password" inputmode="numeric" maxlength="4" required></label>
            <label>Новый PIN ещё раз<input name="pin2" type="password" inputmode="numeric" maxlength="4" required></label>
            <div class="login-error" role="alert"></div>
            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Отмена</button>
                <button type="submit" class="btn-primary-wide">Сменить</button>
            </div>
        </form>`;
    document.body.appendChild(overlay);
}

async function pinChangeSubmit(form) {
    const err = form.querySelector(".login-error");
    const old = form.old.value.trim(), pin = form.pin.value.trim();
    if (!/^\d{4}$/.test(pin)) { err.textContent = "Новый PIN — 4 цифры"; return; }
    if (form.pin2.value.trim() !== pin) { err.textContent = "Новый PIN не совпадает"; return; }
    const r = await pinApi("/api/admin-pin/change", { old, pin }).catch(() => null);
    if (!r || r.status !== 200) { err.textContent = (r && r.data && r.data.message) || "Нет связи с сервером"; return; }
    form.closest(".modal-overlay").remove();
    alert("PIN изменён. Он понадобится при следующем входе.");
}
