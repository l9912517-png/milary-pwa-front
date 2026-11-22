/*
 * Ключи доступа (passkeys): вход по отпечатку / Face ID / PIN телефона и блокировка приложения.
 * Сервер: passkeys/ (бэкенд).
 *
 *  - Экран входа: «Войти с ключом доступа».
 *  - Главная: карточка «Входите по отпечатку» (если ключа ещё нет; «Не сейчас» — через 30 дней).
 *  - iPhone после входа по приглашению: «Создать ключ» — потом в установленном приложении «Войти с ключом».
 *  - «Справка» → «Вход и защита»: мои ключи, «Создать ключ на этом устройстве»,
 *    «Спрашивать отпечаток при открытии» (после 15 минут без дела) — по желанию.
 */

const PASSKEY_PROMPT_KEY = "passkey_prompt_dismissed";
const LOCK_KEY = "lock_enabled";
const LOCK_ACTIVE_KEY = "last_active";
const LOCK_IDLE_MS = 15 * 60 * 1000;

/* ---------- кодирование для WebAuthn ---------- */

function pkB64uToBuf(s) {
    const b64 = String(s).replace(/-/g, "+").replace(/_/g, "/") + "===".slice((String(s).length + 3) % 4);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
}

function pkBufToB64u(buf) {
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pkCredentialJson(cred) {
    const r = cred.response;
    const out = { id: cred.id, rawId: pkBufToB64u(cred.rawId), type: cred.type, response: { clientDataJSON: pkBufToB64u(r.clientDataJSON) } };
    if (r.attestationObject) out.response.attestationObject = pkBufToB64u(r.attestationObject);
    if (r.authenticatorData) out.response.authenticatorData = pkBufToB64u(r.authenticatorData);
    if (r.signature) out.response.signature = pkBufToB64u(r.signature);
    if (r.userHandle) out.response.userHandle = pkBufToB64u(r.userHandle);
    return out;
}

function pkGetOptions(pk) {
    const o = Object.assign({}, pk, { challenge: pkB64uToBuf(pk.challenge) });
    if (pk.allowCredentials) o.allowCredentials = pk.allowCredentials.map(c => ({ type: "public-key", id: pkB64uToBuf(c.id) }));
    return o;
}

/* ---------- поддержка ---------- */

function passkeySupported() {
    return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create)
        && !(typeof installPlatform === "function" && installPlatform().inApp);
}

async function passkeyPlatformReady() {
    if (!passkeySupported()) return false;
    try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch (e) { return false; }
}

/* понятный текст ошибки браузера */
function passkeyErrorText(e) {
    const n = e && e.name;
    if (n === "NotAllowedError") return "";                    // отменили или вышло время — молча
    if (n === "InvalidStateError") return "Ключ на этом устройстве уже есть.";
    if (n === "SecurityError") return "Ключ доступа работает только на milary.msk.ru.";
    if (n === "NotSupportedError") return "Это устройство не поддерживает ключи доступа.";
    return (e && e.message) || "Не получилось. Попробуйте ещё раз";
}

async function pkApi(path, body, auth) {
    const headers = { "Content-Type": "application/json" };
    if (auth) headers["Authorization"] = "Bearer " + localStorage.getItem("jwt");
    const r = await fetch(path, { method: "POST", headers, body: JSON.stringify(body || {}) });
    const d = await r.json().catch(() => null);
    if (!r.ok || !d || !d.success) throw new Error((d && d.message) || "Ошибка " + r.status);
    return d;
}

/* ---------- создать ключ ---------- */

async function passkeyCreate() {
    if (!passkeySupported()) { alert("Этот браузер не поддерживает ключи доступа."); return false; }
    try {
        const o = await pkApi("/api/passkeys/register/options", {}, true);
        const pk = o.publicKey;
        const cred = await navigator.credentials.create({
            publicKey: Object.assign({}, pk, {
                challenge: pkB64uToBuf(pk.challenge),
                user: Object.assign({}, pk.user, { id: pkB64uToBuf(pk.user.id) }),
                excludeCredentials: (pk.excludeCredentials || []).map(c => ({ type: "public-key", id: pkB64uToBuf(c.id) }))
            })
        });
        if (!cred) return false;
        await pkApi("/api/passkeys/register", {
            credential: pkCredentialJson(cred),
            name: typeof inviteDeviceText === "function" ? inviteDeviceText() : "Ключ доступа"
        }, true);
        alert("Ключ доступа создан. Теперь входите кнопкой «Войти с ключом доступа» — по отпечатку или лицу.");
        return true;
    } catch (e) {
        const t = passkeyErrorText(e);
        if (t) alert(t);
        return false;
    }
}

/* ---------- вход ---------- */

function passkeyLoginButtonHtml() {
    if (!passkeySupported()) return "";
    return `<button type="button" class="btn-secondary login-passkey" onclick="passkeyLogin(this)">
        ${iconSvg("M12 11v3 M8 6a6 6 0 0 1 10 4.5V13 M5 11a7 7 0 0 1 1-3.6 M6 15v-3 M9 18.5a10 10 0 0 0 1-5.5v-2a2 2 0 0 1 4 0v1 M14 16a14 14 0 0 1-1 5 M18 17a17 17 0 0 0 .5-3", "btn-ico")}
        Войти с ключом доступа</button>`;
}

async function passkeyLogin(btn) {
    if (btn) btn.disabled = true;
    if (typeof showLoginError === "function") showLoginError("");
    try {
        const o = await pkApi("/api/passkeys/login/options");
        const cred = await navigator.credentials.get({ publicKey: pkGetOptions(o.publicKey) });
        if (!cred) throw Object.assign(new Error(""), { name: "NotAllowedError" });
        const d = await pkApi("/api/passkeys/login", {
            credential: pkCredentialJson(cred),
            device: typeof inviteDeviceText === "function" ? inviteDeviceText() : ""
        });
        localStorage.setItem("jwt", d.jwt);
        localStorage.setItem("user", JSON.stringify(d.user));
        lockTouch();
        await validateToken(d.jwt);
    } catch (e) {
        const t = passkeyErrorText(e);
        if (t && typeof showLoginError === "function") showLoginError(t);
        if (btn) btn.disabled = false;
    }
}

/* ---------- карточка на главной ---------- */

async function passkeyPromptRefresh() {
    if (window.currentScreen !== "menu" || !localStorage.getItem("jwt")) return;
    const dismissed = Number(localStorage.getItem(PASSKEY_PROMPT_KEY) || 0);
    if (dismissed && Date.now() - dismissed < 30 * 86400000) return;
    if (document.getElementById("installPrompt") || document.getElementById("pushPrompt") || document.getElementById("passkeyPrompt")) return;
    if (!await passkeyPlatformReady()) return;
    let list = null;
    try {
        const r = await fetch("/api/passkeys", { headers: { "Authorization": "Bearer " + localStorage.getItem("jwt") } });
        list = (await r.json()).passkeys;
    } catch (e) { return; }
    if (!Array.isArray(list) || list.length || window.currentScreen !== "menu") return;
    if (document.getElementById("installPrompt") || document.getElementById("pushPrompt") || document.getElementById("passkeyPrompt")) return;
    const banner = document.getElementById("announceBanner");
    const html = `
        <div class="push-prompt" id="passkeyPrompt">
            <span class="push-prompt-icon">${iconSvg("M12 11v3 M8 6a6 6 0 0 1 10 4.5V13 M5 11a7 7 0 0 1 1-3.6 M6 15v-3 M9 18.5a10 10 0 0 0 1-5.5v-2a2 2 0 0 1 4 0v1 M14 16a14 14 0 0 1-1 5")}</span>
            <span class="push-prompt-text">
                <span class="push-prompt-title">Входите по отпечатку или лицу</span>
                <span class="push-prompt-sub">Создайте ключ доступа — токен и коды больше не понадобятся</span>
            </span>
            <span class="push-prompt-actions">
                <button type="button" onclick="passkeyCreate().then(ok => ok && passkeyPromptRemove())">Создать ключ</button>
                <button type="button" class="btn-secondary" onclick="localStorage.setItem('${PASSKEY_PROMPT_KEY}', String(Date.now())); passkeyPromptRemove()">Не сейчас</button>
            </span>
        </div>`;
    if (banner) banner.insertAdjacentHTML("afterend", html);
    else container.insertAdjacentHTML("afterbegin", html);
}

function passkeyPromptRemove() {
    const el = document.getElementById("passkeyPrompt");
    if (el) el.remove();
}

/* ---------- «Справка» → «Вход и защита» ---------- */

function passkeyHelpSectionHtml() {
    if (!passkeySupported()) return "";
    return `
        <section class="help-card pk-section" id="pkSection">
            <h2>Вход и защита</h2>
            <div class="pk-list"><div class="transfer-sub" style="text-align:left">Загрузка…</div></div>
            <button type="button" class="btn-secondary" onclick="passkeyCreate().then(ok => ok && passkeyHelpLoad())">Создать ключ на этом устройстве</button>
            <label class="an-switch pk-lock">
                <input type="checkbox" id="pkLock" ${localStorage.getItem(LOCK_KEY) === "1" ? "checked" : ""} onchange="lockToggle(this)">
                <span><b>Спрашивать отпечаток при открытии</b> — если приложением не пользовались 15 минут</span>
            </label>
        </section>`;
}

async function passkeyHelpLoad() {
    const box = document.querySelector("#pkSection .pk-list");
    if (!box) return;
    let list = [];
    try {
        const r = await fetch("/api/passkeys", { headers: { "Authorization": "Bearer " + localStorage.getItem("jwt") } });
        list = (await r.json()).passkeys || [];
    } catch (e) {
        box.innerHTML = `<div class="transfer-sub" style="text-align:left">Не удалось загрузить</div>`;
        return;
    }
    box.innerHTML = list.length ? list.map(k => `
        <div class="device-item">
            <span class="device-icon">${iconSvg("M15 7a4 4 0 1 1-3.5 6L4 20.5V17h3v-3h3l1.5-1.5")}</span>
            <span class="device-text">
                <span class="device-name">${escapeHtml(k.name || "Ключ доступа")}</span>
                <span class="device-sub">создан ${escapeHtml(adminTime(k.created_at))}${k.last_used_at ? " · вход " + escapeHtml(devicesAgo(k.last_used_at)) : ""}</span>
            </span>
            <button type="button" class="btn-secondary device-out" onclick="passkeyDelete(${jsArg(k.id)}, this)">Удалить</button>
        </div>`).join("")
        : `<div class="transfer-sub" style="text-align:left">Ключей пока нет. С ключом вход — по отпечатку или лицу, без токена и кодов.</div>`;
}

async function passkeyDelete(id, btn) {
    if (!confirm("Удалить ключ? Входить им больше не получится. Сам ключ в телефоне удалите в настройках паролей.")) return;
    btn.disabled = true;
    try {
        const r = await fetch("/api/passkeys/" + encodeURIComponent(id) + "/delete", { method: "POST", headers: { "Authorization": "Bearer " + localStorage.getItem("jwt") } });
        if (!r.ok) throw new Error();
    } catch (e) {
        btn.disabled = false;
        return alert("Не получилось. Проверьте связь");
    }
    passkeyHelpLoad();
}

/* ---------- блокировка ---------- */

let lockTouchAt = 0;
function lockTouch() {
    const t = Date.now();
    if (t - lockTouchAt < 20000) return;
    lockTouchAt = t;
    try { localStorage.setItem(LOCK_ACTIVE_KEY, String(t)); } catch (e) { /* не страшно */ }
}

async function lockVerify() {
    const o = await pkApi("/api/passkeys/verify/options", {}, true);
    const cred = await navigator.credentials.get({ publicKey: pkGetOptions(o.publicKey) });
    if (!cred) throw Object.assign(new Error(""), { name: "NotAllowedError" });
    await pkApi("/api/passkeys/verify", { credential: pkCredentialJson(cred) }, true);
}

async function lockToggle(input) {
    if (!input.checked) {
        localStorage.removeItem(LOCK_KEY);
        return;
    }
    /* включаем только после успешной проверки: ключ есть и работает на этом устройстве */
    input.disabled = true;
    try {
        await lockVerify();
        localStorage.setItem(LOCK_KEY, "1");
        lockTouch();
    } catch (e) {
        input.checked = false;
        const t = passkeyErrorText(e);
        alert(/нет ключей/i.test(t) ? "Сначала создайте ключ доступа на этом устройстве." : (t || "Проверка не пройдена — блокировка не включена."));
    }
    input.disabled = false;
}

function lockNeeded() {
    if (localStorage.getItem(LOCK_KEY) !== "1" || !localStorage.getItem("jwt")) return false;
    const last = Number(localStorage.getItem(LOCK_ACTIVE_KEY) || 0);
    return !last || Date.now() - last > LOCK_IDLE_MS;
}

function lockShow() {
    if (document.getElementById("lockScreen")) return;
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const el = document.createElement("div");
    el.id = "lockScreen";
    el.className = "lock-screen";
    el.innerHTML = `
        <div class="lock-box">
            ${typeof GRAPES_SVG === "string" ? GRAPES_SVG : ""}
            <span class="brand-name">Milary</span>
            <div class="lock-user">${escapeHtml(user.name || "")}</div>
            <button type="button" class="login-submit" id="lockBtn" onclick="lockUnlock()">Разблокировать</button>
            <div class="login-error" id="lockError" role="alert"></div>
            <button type="button" class="btn-secondary lock-out" onclick="lockLogout()">Выйти и войти заново</button>
        </div>`;
    document.body.appendChild(el);
    lockUnlock();
}

async function lockUnlock() {
    const btn = document.getElementById("lockBtn");
    const err = document.getElementById("lockError");
    if (btn) btn.disabled = true;
    if (err) err.textContent = "";
    try {
        await lockVerify();
        lockTouchAt = 0;
        lockTouch();
        const el = document.getElementById("lockScreen");
        if (el) el.remove();
    } catch (e) {
        const t = passkeyErrorText(e);
        if (err) err.textContent = t || "Нажмите «Разблокировать» и приложите палец или посмотрите в камеру";
        if (btn) btn.disabled = false;
    }
}

function lockLogout() {
    const el = document.getElementById("lockScreen");
    if (el) el.remove();
    localStorage.removeItem(LOCK_KEY);
    logout();
}

/* проверка при запуске (после входа) и при возвращении в приложение */
function lockCheck() {
    if (lockNeeded()) lockShow();
    else lockTouch();
}

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
        if (!document.getElementById("lockScreen")) { lockTouchAt = 0; lockTouch(); }
    }
    else if (localStorage.getItem("jwt")) lockCheck();
});
["pointerdown", "keydown"].forEach(ev => document.addEventListener(ev, () => {
    if (!document.getElementById("lockScreen")) lockTouch();
}, { passive: true, capture: true }));
