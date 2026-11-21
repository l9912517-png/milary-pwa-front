/* Файлы хранилища (/files/…) сервер отдаёт только после входа. Ко всем запросам этого сайта на /files/
   добавляем Authorization: Bearer <jwt>, если заголовка нет (нужно и во встроенном окне 1С, где cookie может не передаваться). */
(function () {
    const originalFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
        try {
            const raw = typeof input === "string" ? input : (input && input.url) || "";
            const url = new URL(raw, window.location.href);
            const jwt = localStorage.getItem("jwt");
            if (jwt && url.origin === window.location.origin && url.pathname.startsWith("/files/")) {
                init = Object.assign({}, init);
                const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
                if (!headers.has("Authorization")) headers.set("Authorization", "Bearer " + jwt);
                init.headers = headers;
            }
        } catch (e) { /* неразборчивый адрес — запрос как есть */ }
        return originalFetch(input, init);
    };
})();

/* Файл хранилища как blob (с токеном) */
async function fetchFileBlob(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error("HTTP " + response.status);
    return response.blob();
}

/* Скачать файл хранилища: fetch → blob → <a download> */
async function downloadStorageFile(url, fileName) {
    const blob = await fetchFileBlob(url);
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
}




const container = document.getElementById("screen-container");
const title = document.getElementById("screen-title");
const topBar = document.getElementById("top-bar");
const userName = document.getElementById("user-name");
const SCREENS = {};

let currentUser = null;

let selectionMode = false;
let selectedFiles = new Set();

const ROLES = ["admin","manager","logistics","rop","director","driver","staff","operator"];

window.hasBlockMessages = false;

window.waitingFile = null;
window.waitingInterval = null;

window.screenReloadMap = {
    orders: "loadOrders",
    sales: "loadSalesReport",
    bank: "loadBankReport",
    debt: "loadDebt",
    bills: "loadBills",
    drivers: "loadDrivers",
    rating: "loadRating",
    notshipped: "loadNotShipped"
};






function registerScreen(name, fn) {
    SCREENS[name] = fn;
}

function openReportForm(config) {
    const { prefix, titleText, requestFn, fields } = config;

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    let html = `
        <div class="modal-window">
            <h3>${titleText}</h3>

            <label>Период с</label>
            <input type="date" id="${prefix}DateFrom">

            <label>Период по</label>
            <input type="date" id="${prefix}DateTo">
    `;

    if (fields.includes("counterparty")) {
        html += `
            <label>Контрагент</label>
            <input type="text"
                   id="${prefix}Counterparty"
                   readonly
                   onclick="openDirectorySelect('counterparties','${prefix}Counterparty')">
        `;
    }

    if (fields.includes("manager")) {
        html += `
            <label>Менеджер</label>
            <input type="text"
                   id="${prefix}Manager"
                   readonly
                   onclick="openDirectorySelect('managers','${prefix}Manager')">
        `;
    }

    html += `
            <div class="modal-actions">
                <button onclick="${requestFn}('${prefix}')">Получить</button>
                <button onclick="this.closest('.modal-overlay').remove()">Отмена</button>
            </div>
        </div>
    `;

    overlay.innerHTML = html;
    document.body.appendChild(overlay);
}

function buildReportPayload(prefix) {

    const payload = {
        date_from: document.getElementById(prefix + "DateFrom")?.value || "",
        date_to: document.getElementById(prefix + "DateTo")?.value || ""
    };

    const cp = document.getElementById(prefix + "Counterparty");
    if (cp && cp.dataset.guid) {
        payload.counterparty = cp.dataset.guid;
    }

    const mgr = document.getElementById(prefix + "Manager");
    if (mgr && mgr.dataset.guid) {
        payload.manager = mgr.dataset.guid;
    }

    return payload;
}

async function sendTask(type, payload) {

    const jwt = localStorage.getItem("jwt");

   // 🔥 только для отчётов
if (type.includes("_report")) {
    window.waitingTaskType = type;
    showLoadingOverlay("Формируем отчёт...");
}

    try {

        const response = await fetch("/api/task", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + jwt
            },
            body: JSON.stringify({ type, payload })
        });

        if (!response.ok) {
            hideLoadingOverlay();
            alert("Ошибка отправки");
            return;
        }
        
        // 🔥 для обычных задач (не отчёты)
if (!type.includes("_report")) {
    alert("Задача отправлена");
    return;
}

        // fallback
        setTimeout(() => {
            hideLoadingOverlay();
            window.waitingTaskType = null;
        }, 15000);

    } catch (e) {

        hideLoadingOverlay();
        window.waitingTaskType = null;
        alert("Ошибка сети");

    }
}
/* ================= SERVICE WORKER ================= */

/* Регистрируем один раз (только здесь). sw.js браузер всегда проверяет на сервере (updateViaCache: none).
   Новый service worker включается сразу; если приложение уже было открыто под старым —
   предлагаем обновить страницу, чтобы подтянулись новые файлы. */
if ('serviceWorker' in navigator) {
    const hadController = Boolean(navigator.serviceWorker.controller);

    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' })
        .then(reg => {
            // приложение на телефоне может быть открыто сутками — проверяем обновление раз в час
            setInterval(() => reg.update().catch(() => null), 60 * 60 * 1000);
        })
        .catch(err => console.log("SW registration error:", err && err.message));

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (hadController) showUpdateNotice();
    });
}

function showUpdateNotice() {
    if (document.getElementById('updateNotice')) return;
    const box = document.createElement('div');
    box.id = 'updateNotice';
    box.className = 'update-notice';
    box.setAttribute('role', 'status');
    box.innerHTML = `
        <span>Доступна новая версия приложения</span>
        <button type="button" onclick="location.reload()">Обновить</button>`;
    document.body.appendChild(box);
}

/* ================= PUSH ================= */

/* Уведомления.
   - Разрешение спрашиваем только по нажатию кнопки (карточка на главной): iPhone без нажатия не спрашивает,
     а Chrome глушит сайты, которые спрашивают сразу при открытии.
   - Открытый ключ берём с сервера (/api/push/public-key). Если подписка сделана другим ключом
     (например, ключом MealFresh из старой версии) — переподписываемся. */

const PUSH_PROMPT_KEY = "push_prompt_dismissed";      // когда нажали «Не сейчас»
const PUSH_PROMPT_PAUSE = 7 * 86400000;               // снова предложим через 7 дней

/* карточки над меню — по одной: сначала установка, после неё (или «Не сейчас») — уведомления.
   На iPhone без установки и во встроенном браузере мессенджера уведомления не работают — там их не предлагаем. */
function homePromptsHtml() {
    const install = typeof installPromptHtml === "function" ? installPromptHtml() : "";
    if (install) return install;
    if (typeof installPlatform === "function") {
        const p = installPlatform();
        if (p.inApp || (p.ios && !installIsStandalone())) return "";
    }
    return pushPromptHtml();
}

function pushSupported() {
    return "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
}

/* после входа: если уже разрешено — тихо обновляем подписку */
async function initPushPermission() {
    if (!pushSupported() || !localStorage.getItem("jwt")) return;
    if (Notification.permission === "granted") {
        await subscribePush();
    }
}

function pushPromptHtml() {
    if (!pushSupported() || Notification.permission !== "default") return "";
    const dismissed = Number(localStorage.getItem(PUSH_PROMPT_KEY) || 0);
    if (dismissed && Date.now() - dismissed < PUSH_PROMPT_PAUSE) return "";
    return `
        <div class="push-prompt" id="pushPrompt">
            <span class="push-prompt-icon">${iconSvg("M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M10.3 21a1.9 1.9 0 0 0 3.4 0")}</span>
            <span class="push-prompt-text">
                <span class="push-prompt-title">Включите уведомления</span>
                <span class="push-prompt-sub">Чтобы сразу узнавать о готовых отчётах и сообщениях</span>
            </span>
            <span class="push-prompt-actions">
                <button type="button" onclick="enablePush()">Включить</button>
                <button type="button" class="btn-secondary" onclick="dismissPushPrompt()">Не сейчас</button>
            </span>
        </div>`;
}

function hidePushPrompt() {
    const el = document.getElementById("pushPrompt");
    if (el) el.remove();
}

function dismissPushPrompt() {
    localStorage.setItem(PUSH_PROMPT_KEY, String(Date.now()));
    hidePushPrompt();
}

/* по нажатию «Включить» */
async function enablePush() {
    if (!pushSupported()) return;
    let permission = Notification.permission;
    if (permission === "default") {
        try {
            permission = await Notification.requestPermission();
        } catch (e) {
            permission = Notification.permission;
        }
    }
    hidePushPrompt();
    if (permission === "granted") {
        const ok = await subscribePush();
        if (!ok) alert("Не удалось включить уведомления. Попробуйте позже.");
    } else if (permission === "denied") {
        alert("Уведомления запрещены в настройках браузера. Как включить — в «Справке», раздел «Уведомления».");
    }
}

function sameKey(buffer, keyBytes) {
    if (!buffer) return false;
    const a = new Uint8Array(buffer);
    if (a.length !== keyBytes.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== keyBytes[i]) return false;
    return true;
}

/* подписка этого устройства; true — подписка сохранена на сервере */
async function subscribePush() {

    try {

        const jwt = localStorage.getItem("jwt");
        if (!jwt || !pushSupported()) return false;

        const keyRes = await fetch("/api/push/public-key", {
            headers: { "Authorization": "Bearer " + jwt }
        });
        if (!keyRes.ok) return false;
        const keyData = await keyRes.json();
        if (!keyData || !keyData.publicKey) return false;
        const serverKey = urlBase64ToUint8Array(keyData.publicKey);

        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();

        // подписка другим ключом — сервер не сможет на неё отправлять
        if (subscription && !sameKey(subscription.options && subscription.options.applicationServerKey, serverKey)) {
            await subscription.unsubscribe().catch(() => null);
            subscription = null;
        }

        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: serverKey
            });
        }

        const res = await fetch("/api/push/subscribe", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + jwt
            },
            body: JSON.stringify(subscription)
        });

        return res.ok;

    } catch (e) {
        console.log("Push subscribe error:", e && e.message);
        return false;
    }
}


function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

/* ================= INIT ================= */

document.addEventListener("DOMContentLoaded", async () => {

    if (typeof inviteHandleStartup === "function" && await inviteHandleStartup()) return;

    const jwt = localStorage.getItem("jwt");

    if (!jwt) {
        showLogin();
    } else {
        await validateToken(jwt);
    }

    //preloadScreens();
});

/* ================= ШАПКА ================= */

const appHeader = document.getElementById("app-header");

function setBrandTitle() {
    title.innerHTML =
        '<span class="brand-logo">' +
        '<span class="brand-name">Milary</span>' +
        '<span class="brand-tagline">Корпоративный<br>мобильный портал</span>' +
        '</span>';
}

/* Главная — логотип и кнопки «Справка»/«Выход»; любой другой экран — «назад» и название.
   Экраны сами пишут название в title, поэтому режим шапки определяем по содержимому. */
function syncHeaderMode() {
    if (!appHeader) return;
    const home = Boolean(title.querySelector(".brand-logo"));
    appHeader.classList.toggle("is-home", home);
    appHeader.classList.toggle("is-inner", !home);
    // кнопка «?» — только на экранах, для которых есть инструкция (help/help.js)
    const hasHelp = !home && typeof helpTopic === "function" && Boolean(helpTopic(window.currentScreen));
    appHeader.classList.toggle("has-help", hasHelp);
}

if (appHeader) {
    new MutationObserver(syncHeaderMode).observe(title, { childList: true, characterData: true, subtree: true });
}

function setNavActive(id) {
    document.querySelectorAll(".bottom-btn").forEach(btn => btn.classList.toggle("active", btn.id === id));
}

/* ================= НАВИГАЦИЯ: «НАЗАД» ПО ИСТОРИИ ЭКРАНОВ =================
   Каждый открытый экран — запись в истории браузера. «Назад» в шапке, кнопка «Назад» на Android,
   жест назад на iPhone возвращают на предыдущий экран; открытое окно (лист снизу) закрывается.
   С главной «назад» — выход из приложения (как в обычных приложениях).

   navEnter(key, restore)      — экран открыт (тот же key — не новая запись, а обновление);
   navEnter(key, restore, true) — заменить текущую запись (например, после отправки формы);
   navRoot(restore)             — главная: история приложения начинается заново. */

const NAV = {
    entries: [],        // [{ key, restore }], индекс = state.nav
    cur: -1,
    restoring: false,   // во время восстановления новые записи не создаём
    modal: false,       // для открытого окна добавлена запись истории
    ignorePop: 0,       // сколько popstate пропустить (сами вызвали history.back)
    closing: false      // окно закрываем сами — наблюдатель не должен звать history.back
};

function navRoot(restore) {
    NAV.entries = [{ key: "home", restore }];
    NAV.cur = 0;
    NAV.modal = false;
    try { history.replaceState({ nav: 0 }, ""); } catch (e) { /* недоступно */ }
}

function navEnter(key, restore, replace) {
    if (NAV.restoring || NAV.cur < 0) return;
    const top = NAV.entries[NAV.cur];
    if (top && top.key === key) { top.restore = restore; return; }
    if (replace && NAV.cur > 0) {
        NAV.entries[NAV.cur] = { key, restore };
        return;
    }
    navDropModalEntry();
    NAV.cur += 1;
    NAV.entries.length = NAV.cur;
    NAV.entries[NAV.cur] = { key, restore };
    try { history.pushState({ nav: NAV.cur }, ""); } catch (e) { /* недоступно */ }
}

/* окна поверх экрана: листы снизу, инструкции, просмотр картинки, ожидание отчёта */
const NAV_OVERLAYS = ".modal-overlay, .support-viewer, .report-overlay";

function navCloseOverlays() {
    NAV.closing = true;
    document.querySelectorAll(NAV_OVERLAYS).forEach(el => {
        // ожидание отчёта — через его «Отменить», чтобы остановить опрос
        const cancel = el.querySelector && el.querySelector("#reportOverlayCancel");
        if (cancel) cancel.click(); else el.remove();
    });
    if (typeof closeHelp === "function") closeHelp();
    NAV.closing = false;
}

/* если окно открыто, у него своя запись истории — убрать её перед переходом на новый экран */
function navDropModalEntry() {
    if (!NAV.modal) return;
    NAV.modal = false;
    // запись окна превращаем в запись текущего экрана (history.back здесь асинхронный и мешал бы новой записи)
    try { history.replaceState({ nav: NAV.cur }, ""); } catch (e) { /* недоступно */ }
}

/* открылось окно — запись в истории, чтобы «назад» закрыло его, а не экран */
new MutationObserver(() => {
    const open = Boolean(document.querySelector(NAV_OVERLAYS));
    if (open && !NAV.modal && NAV.cur >= 0) {
        NAV.modal = true;
        try { history.pushState({ nav: NAV.cur, modal: true }, ""); } catch (e) { NAV.modal = false; }
    } else if (!open && NAV.modal && !NAV.closing) {
        // окно закрыли кнопкой — убрать его запись из истории
        NAV.modal = false;
        NAV.ignorePop += 1;
        try { history.back(); } catch (e) { NAV.ignorePop -= 1; }
    }
}).observe(document.body, { childList: true });

window.addEventListener("popstate", e => {
    if (NAV.ignorePop > 0) { NAV.ignorePop -= 1; return; }
    const state = e.state || {};
    const target = typeof state.nav === "number" ? state.nav : 0;

    // «назад» при открытом окне — закрыть окно
    if (NAV.modal && document.querySelector(NAV_OVERLAYS) && target === NAV.cur) {
        NAV.modal = false;
        navCloseOverlays();
        return;
    }
    NAV.modal = false;
    navCloseOverlays();

    const entry = NAV.entries[target];
    if (!entry) return;
    NAV.cur = target;
    NAV.restoring = true;
    try { entry.restore(); } catch (err) { console.error("NAV restore", err); }
    finally { NAV.restoring = false; }
    setNavActive(target === 0 ? "navHome" : (entry.key === "files" ? "navFiles" : entry.key === "messages" ? "navMessages" : ""));
});

/* «назад» в шапке */
function headerBack() {
    if (NAV.cur > 0) { history.back(); return; }
    const back = window.screenBack;
    window.screenBack = null;
    if (typeof back === "function") return back();
    goHome();
}

/* что показывать на главной (у логиста — свой экран) */
function homeRender() {
    if (currentUser && String(currentUser.role || "").trim().toLowerCase() === "logistics") {
        openScreen("logistic");
    } else {
        showMenu();
    }
}

/* «Главная» (нижняя панель): вернуться к началу истории — тогда «назад» дальше не водит по старым экранам */
function goHome() {
    window.screenBack = null;
    const steps = NAV.cur + (NAV.modal ? 1 : 0);
    if (NAV.cur > 0) {
        NAV.modal = false;
        navCloseOverlays();
        history.go(-steps);          // popstate вернёт главную
    } else {
        if (NAV.modal) navDropModalEntry();
        navCloseOverlays();
        homeRender();
    }
    setNavActive("navHome");
}

const GRAPES_SVG = `
<svg class="login-grapes" width="84" height="101" viewBox="0 0 100 120" aria-hidden="true">
<g fill="#B5E08A"><path d="M50 32 C 44 15, 28 10, 17 16 C 25 25, 37 31, 50 32 Z"/><path d="M50 32 C 52 15, 64 7, 78 10 C 72 21, 62 29, 50 32 Z"/></g>
<path d="M68 22 C 76 17, 88 19, 88 28 C 88 35, 79 35, 80 29" fill="none" stroke="#B5E08A" stroke-width="4" stroke-linecap="round"/>
<g fill="#FFFFFF" stroke="#3D1D5C" stroke-width="4"><circle cx="50" cy="98" r="14"/><circle cx="34" cy="72" r="15"/><circle cx="66" cy="72" r="15"/><circle cx="38" cy="47" r="13"/><circle cx="62" cy="47" r="13"/></g>
</svg>`;

const SWOOSH_SVG = `
<svg class="header-swoosh" viewBox="0 0 390 26" preserveAspectRatio="none" aria-hidden="true">
<defs><linearGradient id="swLogin" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#B5E08A" stop-opacity="0"/><stop offset="0.5" stop-color="#B5E08A"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0.9"/></linearGradient></defs>
<path d="M0 22 C 120 4, 260 2, 390 12" fill="none" stroke="url(#swLogin)" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
<path d="M30 25 C 150 10, 280 8, 390 18" fill="none" stroke="url(#swLogin)" stroke-width="1.2" stroke-opacity="0.6" vector-effect="non-scaling-stroke"/>
</svg>`;

/* иконки 24×24, только контур */
function iconSvg(d, cls) {
    return `<svg${cls ? ` class="${cls}"` : ""} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}

const ICON_REPORT = "M4 20V10 M10 20V4 M16 20v-7 M3 20h18";
const ICON_REFRESH = "M20 11a8 8 0 1 0-2.3 5.7 M20 4v7h-7";

/* ↻ — показать последний полученный отчёт без нового запроса в 1С */
/* пустое состояние отчёта: одна формулировка на всех экранах */
function reportEmptyHtml(buttonLabel) {
    return `<div class="report-status">Отчёт ещё не получен. Нажмите «${escapeHtml(buttonLabel)}».</div>`;
}

function refreshButton(fnName) {
    return `<button type="button" class="btn-icon-only" aria-label="Показать последний полученный отчёт"
                    title="Показать последний полученный отчёт" onclick="${fnName}()">${iconSvg(ICON_REFRESH)}</button>`;
}

const ICON_EYE = "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M15 12a3 3 0 1 1-6 0a3 3 0 0 1 6 0";
const ICON_CHEVRON = "M9 6l6 6-6 6";


/* ================= LOGIN ================= */

function showLogin() {
    hideTopBar();
    document.body.classList.add("is-login");
    setBrandTitle();

    container.innerHTML = `
        <div class="login-hero">
            ${GRAPES_SVG}
            <span class="brand-name">Milary</span>
            <span class="brand-tagline">Корпоративный мобильный портал</span>
            ${SWOOSH_SVG}
        </div>
        <form class="login-form" onsubmit="event.preventDefault(); doLogin();" autocomplete="off">
            <div>
                <div class="login-title">Вход</div>
                <div class="login-hint">Откройте ссылку-приглашение или введите код из 6 цифр либо токен от администратора</div>
            </div>
            <label class="field">
                <span class="field-label">Код или токен</span>
                <span class="login-field">
                    <input id="accessToken" type="password" placeholder="Код или токен"
                           autocapitalize="off" autocorrect="off" spellcheck="false">
                    <button type="button" class="icon-btn" aria-label="Показать токен"
                            onclick="toggleTokenVisibility(this)">${iconSvg(ICON_EYE)}</button>
                </span>
            </label>
            <div id="loginError" class="login-error" role="alert"></div>
            <button type="submit" class="login-submit">Войти</button>
            <div class="login-foot">Нет ни ссылки, ни кода? Обратитесь к администратору</div>
        </form>
    `;
}

function toggleTokenVisibility(btn) {
    const input = document.getElementById("accessToken");
    if (!input) return;
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.setAttribute("aria-label", show ? "Скрыть токен" : "Показать токен");
}

function showLoginError(text) {
    const el = document.getElementById("loginError");
    if (el) el.textContent = text;
    else alert(text);
}

async function doLogin() {

    const access_token = document.getElementById("accessToken").value.trim();
    if (!access_token) return showLoginError("Введите код или токен");

    showLoginError("");

    /* 6 цифр — код с другого устройства (см. invite/invite.js), иначе токен */
    const isCode = /^\d{3}\s?\d{3}$/.test(access_token);

    let data = null;
    try {
        const response = await fetch(isCode ? "/api/login/code" : "/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(isCode
                ? { code: access_token, device: typeof inviteDeviceText === "function" ? inviteDeviceText() : "" }
                : { access_token })
        });
        data = await response.json();
    } catch (e) {
        return showLoginError("Нет связи с сервером. Попробуйте ещё раз");
    }

    if (!data || !data.success) return showLoginError((data && data.message) || (isCode ? "Код неверный или устарел" : "Неверный токен"));

    localStorage.setItem("jwt", data.jwt);
    localStorage.setItem("user", JSON.stringify(data.user));

    await validateToken(data.jwt);
}

/* копирование в буфер; запасной путь — для старых браузеров и не-HTTPS */
async function copyText(text, done) {
    const value = String(text ?? "");
    let ok = false;
    try {
        await navigator.clipboard.writeText(value);
        ok = true;
    } catch (e) {
        const ta = document.createElement("textarea");
        ta.value = value;
        ta.setAttribute("readonly", "");
        ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
        document.body.appendChild(ta);
        ta.select();
        try { ok = document.execCommand("copy"); } catch (_) { ok = false; }
        ta.remove();
    }
    alert(ok ? (done || "Скопировано") : "Не удалось скопировать — выделите текст и скопируйте вручную");
}

async function validateToken(jwt) {

    const response = await fetch("/api/files", {
        headers: { "Authorization": "Bearer " + jwt }
    });

    if (!response.ok) return logout();

    currentUser = JSON.parse(localStorage.getItem("user"));


    showTopBar();

    await loadUnreadCount();

    // ===== LOGISTICS =====

    const role = String(currentUser.role || "")
        .trim()
        .toLowerCase();

if (role === "logistics") {

    openScreen("logistic");

} else {

    showMenu();

}

initPushPermission().catch(() => null);
if (typeof supportAfterLogin === "function") supportAfterLogin();
if (typeof clientReport === "function") setTimeout(clientReport, 1500);
}


/* ================= TOP BAR ================= */

function showTopBar() {
    userName.innerText = currentUser.name + " (" + currentUser.role + ")";
    topBar.title = userName.innerText;
    topBar.classList.remove("hidden");
    document.body.classList.remove("is-login");
}

function hideTopBar() {
    topBar.classList.add("hidden");
}

function logout() {
    if (typeof devicesRevokeCurrent === "function") devicesRevokeCurrent();
    localStorage.clear();
    NAV.entries = []; NAV.cur = -1; NAV.modal = false;
    showLogin();
}

/* ================= MENU CONFIG ================= */

const MENU_MANAGER_BASE = [
    { id: "orders", icon: "📦", title: "Заказы" },
    { id: "sales", icon: "📈", title: "Продажи" },
    { id: "rating", icon: "🏆", title: "Рейтинг" },
    { id: "notshipped", icon: "📦", title: "Неотгруженные" },
    { id: "returns", icon: "↩️", title: "Возвраты" },
    { id: "drivers", icon: "🚚", title: "Водители" },
    { id: "bank", icon: "🏛️", title: "Банк" },
    { id: "debt", icon: "📊", title: "Дебиторка" },
    { id: "bills", icon: "🧾", title: "Счета" },
    { id: "act", icon: "📑", title: "Акт сверки" },
    { id: "upd", icon: "📄", title: "УПД" },
    { id: "pricelist", icon: "📋", title: "Прайс" },
    { id: "prices", icon: "💲", title: "Цены" },
    { id: "pricefix", icon: "✏️", title: "Фиксации" }
];

/* «Разработки» и «Передать заказ» в меню не показываем (экраны остаются, вход — из 1С). */

/* подписи и иконки пунктов меню */
const MENU_META = {
    orders:        { sub: "Список и статусы заказов",  d: "M3 7l9-4 9 4v10l-9 4-9-4z M3 7l9 4 9-4 M12 11v10" },
    sales:         { sub: "Аналитика и отчёты",        d: "M4 20V10 M10 20V4 M16 20v-7 M3 20h18" },
    rating:        { sub: "Результаты менеджеров",     d: "M8 4h8v5a4 4 0 0 1-8 0z M8 6H4v1a3 3 0 0 0 4 3 M16 6h4v1a3 3 0 0 1-4 3 M12 13v4 M8 21h8" },
    notshipped:    { sub: "Контроль отгрузок",         d: "M12 7v5l3 2 M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0" },
    returns:       { sub: "Заявки и обработка",        d: "M9 14L4 9l5-5 M4 9h11a5 5 0 0 1 0 10h-3" },
    drivers:       { sub: "Сведения по водителям",     d: "M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0 M14 12a2 2 0 1 1-4 0a2 2 0 0 1 4 0 M3 11h7 M14 11h7 M12 14v7" },
    bank:          { sub: "Платежи и выписки",         d: "M3 10l9-6 9 6 M5 10v8 M10 10v8 M14 10v8 M19 10v8 M3 21h18" },
    debt:          { sub: "Задолженность клиентов",    d: "M3 7h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H3z M3 7l12-3v3 M16 13h2" },
    bills:         { sub: "Выставленные счета",        d: "M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6" },
    act:           { sub: "Сверка с клиентом",         d: "M14 3H6v18h12V7z M14 3v4h4 M9 14l2 2 4-4" },
    upd:           { sub: "Передаточные документы",    d: "M14 3H6v18h12V7z M14 3v4h4 M9 12h6 M9 16h6" },
    pricelist:     { sub: "Актуальный прайс-лист",     d: "M8 6h13 M8 12h13 M8 18h13 M3 6h1 M3 12h1 M3 18h1" },
    prices:        { sub: "Цены по номенклатуре",      d: "M3 12V3h9l9 9-9 9z M7.5 7.5h.01" },
    pricefix:      { sub: "Зафиксированные цены",      d: "M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4" },
    payments:      { sub: "Оплаты клиентов",           d: "M3 6h18v12H3z M3 10h18 M7 15h3" },
    dir_sales:     { sub: "Сравнение менеджеров",      d: "M9 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M2 21c0-4 3-6 7-6s7 2 7 6 M16 3.5a4 4 0 0 1 0 7 M22 21c0-3-1.5-5-4-5.6" },
    ordersCount:   { sub: "Динамика заказов",          d: "M4 9h16 M4 15h16 M10 3L8 21 M16 3l-2 18" },
    cashState:     { sub: "Остатки денежных средств",  d: "M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3z M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5 M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" },
    financeReport: { sub: "Финансовые показатели",     d: "M21 12A9 9 0 1 1 12 3v9z M15 3.5A9 9 0 0 1 20.5 9H15z" },
    writeoffs:     { sub: "Списанные товары",          d: "M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14 M10 11v6 M14 11v6" },
    grossprofit:   { sub: "Маржа и прибыль",           d: "M3 17l6-6 4 4 8-8 M15 7h6v6" },
    receipts:      { sub: "Поступление товаров",       d: "M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4" },
    logistics:     { sub: "Транспорт и рейсы",         d: "M3 6h11v10H3z M14 10h4l3 3v3h-7 M7 19a2 2 0 1 0 0-4a2 2 0 0 0 0 4z M17 19a2 2 0 1 0 0-4a2 2 0 0 0 0 4z" },
    developments_control: { sub: "Разработки менеджеров", d: "M9 4h6v3H9z M7 5H5v16h14V5h-2 M9 14l2 2 4-4" },
    block:         { sub: "Блокировки клиентов",       d: "M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0 M5.6 5.6l12.8 12.8" },
    control:       { sub: "Контроль показателей",      d: ICON_EYE },
    checksJournal: { sub: "Журнал проверок по ИНН",    d: "M11 18a7 7 0 1 0 0-14a7 7 0 0 0 0 14z M21 21l-5-5" },
    ordInfo:       { sub: "Проверка и статистика",     d: "M14 3H6v18h12V7z M14 3v4h4 M9 17v-3 M12 17v-5 M15 17v-2" },
    ordReview:     { sub: "Заказы на проверку",        d: "M4 4h16v16H4z M8 12l3 3 5-6" },
    createOrder:   { sub: "Новый заказ",               d: "M12 5v14 M5 12h14" },
    adminPanel:    { sub: "Пользователи и доступ",     d: "M4 6h9 M17 6h3 M4 12h3 M11 12h9 M4 18h11 M19 18h1 M15 4v4 M9 10v4 M17 16v4" }
};



const MENU_SPECIAL = [
    { id: "developments_control", icon: "📋", title: "Контроль разработок" },
    { id: "block", icon: "⛔", title: "Блокировка" },
    { id: "control", icon: "🧠", title: "Контроль" }
];

const MENU_CREATE_ORDER = {
    id: "createOrder",
    icon: "➕",
   title: "Создать заказ"
};

/* Заказ текстом: менеджер отправляет, оператор (или админ) проверяет */
const MENU_ORDER_TEXT = { id: "ordMy", icon: "📝", title: "Передать заказ" };
const MENU_ORDER_REVIEW = { id: "ordReview", icon: "✅", title: "Проверка заказов" };
const MENU_ORDER_INFO = { id: "ordInfo", icon: "📊", title: "Информация по заказам" };   // проверка + статистика (админ, директор)

/* Журнал проверок контрагентов по ИНН (директор, админ); сами проверки — у менеджера в «Разработках» */
const MENU_CHECKS_JOURNAL = { id: "checksJournal", icon: "🔎", title: "Проверки контрагентов" };

const MENU_DIRECTOR_EXTRA = [
    { id: "logistics", icon: "🚛", title: "Логистика" }
];



const MENU_ANALYTICS = [
     
    { id: "payments", icon: "💰", title: "Оплаты" },
    { id: "dir_sales", icon: "👨‍💼", title: "Продажи по менеджерам" },
    { id: "ordersCount", icon: "📦", title: "Количество заказов" },
    { id: "cashState", icon: "🏦", title: "Состояние ДС" },
    { id: "financeReport", icon: "📊", title: "Финансовый отчёт" },
    { id: "writeoffs", icon: "🧾", title: "Списания" },
    { id: "grossprofit", icon: "📈", title: "Валовая прибыль" },
    { id: "receipts", icon: "📥", title: "Поступления" }
];

const MENU_ADMIN_EXTRA = [
    { id: "adminPanel", icon: "⚙️", title: "Администрирование" }
    
];

function buildMenuByRole(role) {

    let menu = [...MENU_MANAGER_BASE];
    
    



    // 🔥 director — аналитика В НАЧАЛЕ
    if (role === "director") {

        return []
            .concat(MENU_ANALYTICS)   // 🔼 сначала новые кнопки
            .concat(menu)
            .concat(MENU_DIRECTOR_EXTRA)
            .concat(MENU_SPECIAL)
            .concat(MENU_CHECKS_JOURNAL)
            .concat(MENU_ORDER_INFO);
    }

    // оператор — только проверка заказов
    if (role === "operator") {
        return [MENU_ORDER_REVIEW];
    }

    // 🔥 admin — аналитика В КОНЦЕ
    if (role === "admin") {

        return menu
            .concat(MENU_ORDER_INFO)
            .concat(MENU_SPECIAL)
            .concat(MENU_CHECKS_JOURNAL)
            .concat(MENU_DIRECTOR_EXTRA)
            .concat(MENU_ANALYTICS)
            .concat(MENU_ADMIN_EXTRA); // 🔽 в конец
    }

    // 🔥 manager / rop
    if (role === "manager" || role === "rop") {

        if (role === "rop") {
            menu = menu.concat(MENU_SPECIAL).concat(MENU_ORDER_INFO);   // статистика заказов своих менеджеров
        }

        return menu;
    }

    return menu;
}

/* ================= MENU ================= */

/* ================= МЕНЮ ДИРЕКТОРА И АДМИНА: РАЗДЕЛЫ ================= */

/* Меню директора и админа — разделы по ролям.
   Сверху — свои пункты (у директора разложены по смыслу), ниже — «что видит менеджер» и «что видит РОП».
   У админа ещё раздел «Директор» (простым списком). Каждый пункт показывается один раз —
   в первом разделе, где он встретился. */

const MENU_IDS_MANAGER = ["orders", "sales", "rating", "notshipped", "returns", "drivers", "bank", "debt",
    "bills", "act", "upd", "pricelist", "prices", "pricefix"];
const MENU_IDS_ROP = ["developments_control", "block", "control", "ordInfo"];
const MENU_IDS_DIRECTOR = ["payments", "receipts", "cashState", "financeReport", "grossprofit", "writeoffs",
    "dir_sales", "ordersCount", "checksJournal", "logistics"];

const ICON_USER = "M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M4 21c0-4 4-6 8-6s8 2 8 6";
const ICON_USERS_STAR = "M9 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M2 21c0-4 3-6 7-6 M17 13l1.5 3 3.3.5-2.4 2.3.6 3.2-3-1.6-3 1.6.6-3.2-2.4-2.3 3.3-.5z";
const ICON_BRIEFCASE = "M3 8h18v12H3z M8 8V5h8v3 M3 13h18";

function menuGroupsForRole(role) {
    const manager = { key: "r_manager", d: ICON_USER, title: "Менеджер", ids: MENU_IDS_MANAGER };
    const rop = { key: "r_rop", d: ICON_USERS_STAR, title: "РОП", ids: MENU_IDS_ROP };

    if (role === "admin") {
        return [
            { key: "admin", single: true, ids: ["adminPanel"] },
            { key: "r_director", d: ICON_BRIEFCASE, title: "Директор", ids: MENU_IDS_DIRECTOR },
            manager,
            rop
        ];
    }

    // директор: свои разделы сверху
    return [
        { key: "d_finance", d: MENU_META.bank.d, title: "Финансы", ids: ["payments", "receipts", "cashState", "financeReport", "grossprofit", "writeoffs"] },
        { key: "d_sales", d: MENU_META.sales.d, title: "Аналитика продаж", ids: ["dir_sales", "ordersCount"] },
        { key: "d_clients", d: MENU_META.dir_sales.d, title: "Клиенты", ids: ["checksJournal"] },
        { key: "d_logistics", d: MENU_META.logistics.d, title: "Логистика", ids: ["logistics"] },
        manager,
        rop
    ];
}

const MENU_USAGE_KEY = "menu_usage";        // { id: [время нажатия, …] } за 14 дней — «часто используемые»
const MENU_OPEN_KEY = "menu_groups_open";   // { раздел: true/false } — что человек открыл/свернул
const MENU_OPEN_DEFAULT = {};   // при первом входе все разделы свёрнуты

function menuStoreGet(key) {
    try { return JSON.parse(localStorage.getItem(key)) || {}; } catch (e) { return {}; }
}

function menuStoreSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* недоступно */ }
}

/* нажатие на пункт меню — для «часто используемых» */
function menuTrackUse(id) {
    const since = Date.now() - 14 * 86400000;
    const u = menuStoreGet(MENU_USAGE_KEY);
    Object.keys(u).forEach(k => { u[k] = (u[k] || []).filter(t => t > since); if (!u[k].length) delete u[k]; });
    u[id] = (u[id] || []).concat(Date.now()).slice(-100);
    menuStoreSet(MENU_USAGE_KEY, u);
}

function menuGroupOpen(key) {
    const st = menuStoreGet(MENU_OPEN_KEY);
    return key in st ? Boolean(st[key]) : Boolean(MENU_OPEN_DEFAULT[key]);
}

function menuItemHtml(item) {
    const meta = MENU_META[item.id] || {};
    const dot = (item.id === "block" && window.hasBlockMessages)
        ? `<span class="menu-card-dot" aria-label="есть сообщения"></span>` : "";
    const icon = meta.d ? iconSvg(meta.d) : escapeHtml(item.icon || "");
    return `
            <button type="button" class="menu-card" onclick="handleMenuClick('${item.id}')">
                <span class="menu-card-icon">${icon}</span>
                <span class="menu-card-text">
                    <span class="menu-card-title">${escapeHtml(item.title)}${dot}</span>
                    ${meta.sub ? `<span class="menu-card-sub">${escapeHtml(meta.sub)}</span>` : ""}
                </span>
                ${iconSvg(ICON_CHEVRON, "menu-card-chevron")}
            </button>`;
}

/* Разделы-плитки: цветная плитка, у свёрнутой — состав мелким текстом, нажатие — открыть/свернуть */
function menuGroupsHtml(menuItems, role) {
    const byId = {};
    menuItems.forEach(i => { byId[i.id] = i; });
    const used = {};

    /* часто используемые: 4 пункта, открытых не меньше 3 раз за 14 дней */
    const usage = menuStoreGet(MENU_USAGE_KEY);
    const since = Date.now() - 14 * 86400000;
    const top = Object.keys(usage)
        .filter(id => byId[id])
        .map(id => ({ id, n: (usage[id] || []).filter(t => t > since).length }))
        .filter(x => x.n >= 3)
        .sort((a, b) => b.n - a.n)
        .slice(0, 4)
        .map(x => byId[x.id]);

    const groups = menuGroupsForRole(role).map(g => {
        const items = g.ids.filter(id => byId[id] && !used[id]).map(id => { used[id] = true; return byId[id]; });
        return Object.assign({}, g, { items });
    });
    const rest = menuItems.filter(i => !used[i.id]);              // пункт без раздела — не теряем
    if (rest.length) groups.push({ key: "other", d: "M3 6h6l2 2h10v10H3z", title: "Прочее", items: rest });
    if (top.length) groups.unshift({ key: "fav", d: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z", title: "Часто используемые", items: top });

    const tile = g => {
        if (!g.items.length) return "";
        if (g.single) return `<div class="menu-single">${g.items.map(menuItemHtml).join("")}</div>`;
        const open = menuGroupOpen(g.key);
        let sub = g.items.map(i => i.title).join(", ");
        if (sub.length > 80) sub = sub.slice(0, 78).replace(/,?\s*\S*$/, "") + "…";
        return `
        <section class="menu-tile ${open ? "open" : ""}" data-group="${g.key}">
            <button type="button" class="menu-tile-head" aria-expanded="${open}" onclick="menuToggleGroup('${g.key}')">
                <span class="menu-tile-icon">${iconSvg(g.d)}</span>
                <span class="menu-tile-title">${g.title}</span>
                <span class="menu-tile-arrow"></span>
            </button>
            <div class="menu-tile-sub">${escapeHtml(sub)}</div>
            <div class="menu-tile-items">${g.items.map(menuItemHtml).join("")}</div>
        </section>`;
    };

    return `<div class="menu-tiles">${groups.map(tile).join("")}</div>`;
}

function menuToggleGroup(key) {
    const open = !menuGroupOpen(key);
    const st = menuStoreGet(MENU_OPEN_KEY);
    st[key] = open;
    menuStoreSet(MENU_OPEN_KEY, st);
    const el = document.querySelector('.menu-tile[data-group="' + key + '"]');
    if (el) {
        el.classList.toggle("open", open);
        const head = el.querySelector(".menu-tile-head");
        if (head) head.setAttribute("aria-expanded", String(open));
    }
}

function showMenu() {

    window.currentScreen = "menu";
    window.screenBack = null;
    if (!NAV.restoring) navRoot(showMenu);
    setBrandTitle();
    setNavActive("navHome");

    const menuItems = buildMenuByRole(currentUser.role);

    if (currentUser.role === "director" || currentUser.role === "admin") {
        container.innerHTML = homePromptsHtml() + menuGroupsHtml(menuItems, currentUser.role);   // разделы, сворачиваются; сверху — часто используемые
    } else {
        container.innerHTML = homePromptsHtml() + `<div class="menu-list">${menuItems.map(menuItemHtml).join("")}</div>`;
    }

    if (typeof initDevButton === 'function') {
        initDevButton();
    }
}

function handleMenuClick(id) {

    menuTrackUse(id);

   if (id === "sales") {
    openScreen("sales");
    return;
}
if (id === "bank") {
    openScreen("bank");
    return;
}
if (id === "orders") {
    openScreen("orders");
    return;
}
if (id === "rating") {
    openScreen("rating");
    return;
}
if (id === "notshipped") {
    openScreen("notshipped");
    return;
}

if (id === "returns") {
    openScreen("returns");
    return;
}

if (id === "debt") {
    openScreen("debt");
    return;
}

if (id === "drivers") {
    openScreen("drivers");
    return;
}

if (id === "bills") {
    openScreen("bills");
    return;
}

if (id === "upd") {
    openScreen("upd");
    return;
}
if (id === "act") {
    openScreen("act");
    return;
}
if (id === "pricelist") {
    openScreen("pricelist");
    return;
}
if (id === "prices") {
    openScreen("prices");
    return;
}
if (id === "pricefix") {
    openScreen("pricefix");
    return;
}

if (id === "block") {
    openScreen("block");
    return;
}

if (id === "control") {
    openScreen("control");
    return;
}

if (id === "payments") {
    openScreen("payments");
    return;
}
if (id === "dir_sales") {
    openScreen("dir_sales");
    return;
}
if (id === "ordersCount") {
    openScreen("ordersCount");
    return;
}
if (id === "cashState") {
    openScreen("cash_state");
    return;
}
if (id === "financeReport") {
    openScreen("finance_report");
    return;
}
if (id === "writeoffs") {
    openScreen("writeoffs");
    return;
}
if (id === "grossprofit") {
    openScreen("grossprofit");
    return;
}
if (id === "receipts") {
    openScreen("receipts");
    return;
}
if (id === "logistics") {
    openScreen("logistic");
    return;
}
if (id === "developments") {
    openScreen("developments");
    return;
}
if (id === "developments_control") {
    openScreen("developments_control");
    return;
}
if (id === "checksJournal") {
    openScreen("checks_journal");
    return;
}




if (id === "ordMy") {
    openScreen("ord_my");
    return;
}

if (id === "ordReview") {
    openScreen("ord_review");
    return;
}

if (id === "ordInfo") {
    openScreen("ord_info");
    return;
}

if (id === "createOrder") {
    openScreen("orders_create_list"); 
    return;
}



    if (id === "testTask") {
        sendTestTask();
        return;
    }

    if (id === "adminPanel") {
        openAdminPanel();
        return;
    }

    alert("Раздел: " + id + " (в разработке)");
}


function openScreen(name) {

    // последний «рабочий» экран — для обращения в поддержку («с какого экрана пишут»)
    if (window.currentScreen && !/^(help|support)/.test(window.currentScreen)) window.lastWorkScreen = window.currentScreen;
    window.currentScreen = name;      // экран может уточнить сам; нужно шапке (кнопка «?»)
    window.screenBack = null;         // свой шаг «назад» экран задаёт сам

    // главная логиста — корень истории, остальные экраны — новая запись
    const isHome = name === "logistic" && currentUser && String(currentUser.role || "").trim().toLowerCase() === "logistics";
    if (isHome) { if (!NAV.restoring) navRoot(() => openScreen("logistic")); }
    else navEnter("s:" + name, () => openScreen(name));

    if (SCREENS[name]) {
        SCREENS[name]();
        return;
    }

    const script = document.createElement("script");

    script.src = "/app/screens/" + name + ".js?t=" + Date.now();

    script.onload = () => {

        if (SCREENS[name]) {
            SCREENS[name]();
        } else {
            alert("Экран не зарегистрирован: " + name);
        }

    };

    document.body.appendChild(script);

}
/* ================= ADMIN PANEL ================= */

async function openAdminPanel() {

    window.currentScreen = "admin";
    window.screenBack = null;
    navEnter("admin", openAdminPanel);
    title.innerText = "Администрирование";

    const jwt = localStorage.getItem("jwt");

    const response = await fetch("/api/admin/users", {
        headers: {
            "Authorization": "Bearer " + jwt
        }
    });

    const data = await response.json();

    if (!data.success) {
        return alert("Ошибка загрузки");
    }

    // ================================
    // ГРУППИРОВКА ПОЛЬЗОВАТЕЛЕЙ ПО РОЛЯМ
    // ================================

    const groupedUsers = {};

    data.users.forEach(u => {

        if (!groupedUsers[u.role]) {
            groupedUsers[u.role] = [];
        }

        groupedUsers[u.role].push(u);

    });


    // ================================
    // РЕНДЕР РОЛЕЙ
    // ================================

    let usersHtml = "";

    ROLES.forEach(role => {

        const roleUsers = groupedUsers[role];

        if (!roleUsers || roleUsers.length === 0) {
            return;
        }


        usersHtml += `

            <!-- РОЛЬ -->

            <div
                class="admin-role-header"
                onclick="toggleRoleBlock('${role}')"
            >

                <span
                    id="arrow_${role}"
                    class="admin-role-arrow"
                >
                    ▶
                </span>

                <strong>
                    ${role}
                </strong>

                <span class="admin-role-count">
                    ${roleUsers.length}
                </span>

            </div>


            <!-- ПОЛЬЗОВАТЕЛИ РОЛИ -->

            <div
                id="role_block_${role}"
                class="admin-role-users"
                style="display:none;"
            >

        `;


        roleUsers.forEach(u => {

            usersHtml += `

                <div
                    class="admin-user-row"
                    onclick="toggleAdminUser(${u.id})"
                >

                    <div class="admin-user-main">

                        <span
                            class="admin-user-arrow"
                            id="user_arrow_${u.id}"
                        >
                            ▶
                        </span>

                        <div>

                            <strong>
                                ${escapeHtml(u.name)}
                            </strong>

                            <div class="admin-user-status">

                                ${u.is_active
                                    ? "🟢 Активен"
                                    : "🔴 Отключён"
                                }

                            </div>

                        </div>

                    </div>

                </div>


                <!-- НАСТРОЙКИ ПОЛЬЗОВАТЕЛЯ -->

                <div
                    id="admin_user_${u.id}"
                    class="admin-user-details"
                    style="display:none;"
                >

                    <label>
                        Имя
                    </label>

                    <input
                        id="name_${u.id}"
                        value="${escapeHtml(u.name)}"
                    />


                    <label>
                        Роль
                    </label>

                    <select
                        id="role_${u.id}"
                    >

                        ${ROLES.map(r => `
                            <option
                                value="${r}"
                                ${r === u.role ? "selected" : ""}
                            >
                                ${r}
                            </option>
                        `).join("")}

                    </select>


                    <label>
                        UUID
                    </label>

                    <input
                        id="uuid_${u.id}"
                        value="${escapeHtml(u.user_id)}"
                    />


                    <label>
                        Access Token
                    </label>

                    <input
                        value="${escapeHtml(u.access_token)}"
                        readonly
                    />


                    <div class="admin-user-actions">

                        <button
                            onclick="event.stopPropagation(); copyText(${jsArg(u.access_token)})"
                        >
                            ${iconSvg("M8 8h12v12H8z M4 16V4h12", "btn-ico")} Копировать
                        </button>


                        <button
                            onclick="event.stopPropagation(); saveUser(${u.id})"
                        >
                            ${iconSvg("M5 3h11l3 3v15H5z M8 3v6h8V3 M8 21v-7h8v7", "btn-ico")} Сохранить
                        </button>


                        <button
                            onclick="event.stopPropagation(); toggleUser(${u.id})"
                        >
                            ${u.is_active
                                ? "🔴 Отключить"
                                : "🟢 Активировать"
                            }
                        </button>


                        <button
                            onclick="event.stopPropagation(); inviteUser(${u.id}, ${jsArg(u.name)})"
                        >
                            ${iconSvg("M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h2v2h-2z M18 18h2v2h-2z M18 14h2 M14 18v2", "btn-ico")} Пригласить
                        </button>


                        <button
                            onclick="event.stopPropagation(); adminRevokeUserSessions(${u.id}, ${jsArg(u.name)})"
                        >
                            ${iconSvg("M9 21H5V3h4 M16 17l5-5-5-5 M21 12H9", "btn-ico")} Выйти везде
                        </button>


                        <button
                            onclick="event.stopPropagation(); regenerateToken(${u.id})"
                        >
                            ${iconSvg("M15 7a4 4 0 1 1-3.5 6L4 20.5V17h3v-3h3l1.5-1.5", "btn-ico")} Новый токен
                        </button>


                        <button
                            class="admin-danger"
                            onclick="event.stopPropagation(); deleteUser(${u.id})"
                        >
                            ${iconSvg("M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14", "btn-ico")} Удалить
                        </button>

                    </div>

                </div>

            `;

        });


        usersHtml += `

            </div>

        `;

    });


    // ================================
    // ОСНОВНАЯ РАЗМЕТКА АДМИНКИ
    // ================================

    container.innerHTML = `

        <div class="admin-panel">

            <div class="menu-list admin-tools">
                <button type="button" class="menu-card" onclick="openScreen('support_admin')">
                    <span class="menu-card-icon">${iconSvg("M21 15a4 4 0 0 1-4 4H8l-5 3V5a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z M8 9h8 M8 13h5")}</span>
                    <span class="menu-card-text">
                        <span class="menu-card-title">Обращения в поддержку <span class="count-badge" data-support-count="admin" hidden></span></span>
                        <span class="menu-card-sub">Переписка с пользователями</span>
                    </span>
                    ${iconSvg(ICON_CHEVRON, "menu-card-chevron")}
                </button>
                <button type="button" class="menu-card" onclick="openScreen('task_queue')">
                    <span class="menu-card-icon">${iconSvg("M4 6h16 M4 12h16 M4 18h10 M18 16l2 2 4-4")}</span>
                    <span class="menu-card-text">
                        <span class="menu-card-title">Очередь задач 1С</span>
                        <span class="menu-card-sub">Обмен с 1С: что ждёт, что зависло</span>
                    </span>
                    ${iconSvg(ICON_CHEVRON, "menu-card-chevron")}
                </button>
                <button type="button" class="menu-card" onclick="openScreen('admin_announce')">
                    <span class="menu-card-icon">${iconSvg("M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z M15 9a4 4 0 0 1 0 6 M18 6a8 8 0 0 1 0 12")}</span>
                    <span class="menu-card-text">
                        <span class="menu-card-title">Объявления</span>
                        <span class="menu-card-sub">Сообщение всем или по ролям, с уведомлением</span>
                    </span>
                    ${iconSvg(ICON_CHEVRON, "menu-card-chevron")}
                </button>
                <button type="button" class="menu-card" onclick="openScreen('admin_devices')">
                    <span class="menu-card-icon">${iconSvg("M7 2h10v20H7z M11 18h2")}</span>
                    <span class="menu-card-text">
                        <span class="menu-card-title">Устройства и версии</span>
                        <span class="menu-card-sub">Кто где вошёл, установка, уведомления</span>
                    </span>
                    ${iconSvg(ICON_CHEVRON, "menu-card-chevron")}
                </button>
                <button type="button" class="menu-card" onclick="openScreen('admin_errors')">
                    <span class="menu-card-icon">${iconSvg("M12 3l10 18H2z M12 10v4 M12 17h.01")}</span>
                    <span class="menu-card-text">
                        <span class="menu-card-title">Ошибки приложения <span class="count-badge" data-errors-count hidden></span></span>
                        <span class="menu-card-sub">Что ломается у пользователей</span>
                    </span>
                    ${iconSvg(ICON_CHEVRON, "menu-card-chevron")}
                </button>
            </div>

            ${usersHtml}


            <!-- СОЗДАНИЕ ПОЛЬЗОВАТЕЛЯ -->

            <div
                class="admin-section-header"
                onclick="toggleAdminSection('createUserBlock')"
            >

                <span>
                    ▶
                </span>

                <strong>
                    Создать пользователя
                </strong>

            </div>


            <div
                id="createUserBlock"
                class="admin-section-body"
                style="display:none;"
            >

                <input
                    id="new_name"
                    placeholder="Имя"
                />


                <select id="new_role">

                    ${ROLES.map(r => `
                        <option value="${r}">
                            ${r}
                        </option>
                    `).join("")}

                </select>


                <input
                    id="new_uuid"
                    placeholder="UUID (можно пусто)"
                />


                <button onclick="createUser()">
                    Создать
                </button>

            </div>




            <!-- СИСТЕМНЫЕ ОПЕРАЦИИ -->

            <div
                class="admin-section-header"
                onclick="toggleAdminSection('systemOperationsBlock')"
            >

                <span>
                    ▶
                </span>

                <strong>
                    ⚙️ Системные операции
                </strong>

            </div>


            <div
                id="systemOperationsBlock"
                class="admin-section-body"
                style="display:none;"
            >

                <button onclick="runBackup()">
                    ${iconSvg("M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3z M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5", "btn-ico")} Сделать бэкап
                </button>

                <button onclick="openScreen('tasklist')">
                    ${iconSvg("M8 6h13 M8 12h13 M8 18h13 M3 6h1 M3 12h1 M3 18h1", "btn-ico")} Список задач
                </button>

            </div>



        </div>

    `;

    if (typeof supportRefreshUnread === "function") supportRefreshUnread();
    if (typeof errorsRefreshBadge === "function") errorsRefreshBadge();
}

/* Значение для вызова в атрибуте onclick: onclick="fn(${jsArg(x)})".
   JSON даёт строку JS с экранированием, escapeHtml — безопасный атрибут (кавычки → &quot;). */
function jsArg(value) {
    return escapeHtml(JSON.stringify(String(value ?? "")));
}

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function toggleAdminUser(id) {

    const block = document.getElementById("admin_user_" + id);
    const arrow = document.getElementById("user_arrow_" + id);

    if (!block) {
        return;
    }

    if (block.style.display === "none") {

        block.style.display = "block";

        if (arrow) {
            arrow.innerText = "▼";
        }

    } else {

        block.style.display = "none";

        if (arrow) {
            arrow.innerText = "▶";
        }

    }

}



function toggleRoleBlock(role) {

    const block = document.getElementById("role_block_" + role);
    const arrow = document.getElementById("arrow_" + role);

    if (!block) {
        return;
    }

    const isClosed =
        block.style.display === "none" ||
        block.style.display === "";

    if (isClosed) {

        block.style.display = "block";

        if (arrow) {
            arrow.innerText = "▼";
        }

    } else {

        block.style.display = "none";

        if (arrow) {
            arrow.innerText = "▶";
        }

    }
}


function toggleAdminUser(id) {

    const block =
        document.getElementById("admin_user_" + id);

    const arrow =
        document.getElementById("user_arrow_" + id);

    if (!block) {
        return;
    }

    const isClosed =
        block.style.display === "none" ||
        block.style.display === "";

    if (isClosed) {

        block.style.display = "block";

        if (arrow) {
            arrow.innerText = "▼";
        }

    } else {

        block.style.display = "none";

        if (arrow) {
            arrow.innerText = "▶";
        }

    }
}


function toggleAdminSection(id) {

    const block =
        document.getElementById(id);

    if (!block) {
        return;
    }

    const header =
        block.previousElementSibling;

    const arrow =
        header
            ? header.querySelector("span")
            : null;

    const isClosed =
        block.style.display === "none" ||
        block.style.display === "";

    if (isClosed) {

        block.style.display = "block";

        if (arrow) {
            arrow.innerText = "▼";
        }

    } else {

        block.style.display = "none";

        if (arrow) {
            arrow.innerText = "▶";
        }

    }
}

/* ================= ADMIN ACTIONS ================= */

async function saveUser(id) {

    const jwt = localStorage.getItem("jwt");

    const name = document.getElementById("name_" + id).value.trim();
    const role = document.getElementById("role_" + id).value;
    const user_id = document.getElementById("uuid_" + id).value.trim();

    const response = await fetch(`/api/admin/users/${id}/update`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + jwt
        },
        body: JSON.stringify({ name, role, user_id })
    });

    if (response.ok) {
        alert("Сохранено");
        openAdminPanel();
    } else {
        alert("Ошибка сохранения");
    }
}

async function toggleUser(id) {

    const jwt = localStorage.getItem("jwt");

    const response = await fetch(`/api/admin/users/${id}/toggle`, {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + jwt
        }
    });

    if (response.ok) {
        openAdminPanel();
    } else {
        alert("Ошибка переключения");
    }
}

async function regenerateToken(id) {

    if (!confirm("Сгенерировать новый токен? Старый перестанет работать, и пользователь выйдет на всех устройствах.")) return;

    const jwt = localStorage.getItem("jwt");

    const response = await fetch(`/api/admin/users/${id}/regenerate-token`, {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + jwt
        }
    });

    if (!response.ok) {
        alert("Ошибка генерации");
        return;
    }

    const data = await response.json();
    alert("Новый токен:\n\n" + data.access_token);

    openAdminPanel();
}

async function deleteUser(id) {

    if (!confirm("Удалить пользователя?")) return;

    const jwt = localStorage.getItem("jwt");

    const response = await fetch(`/api/admin/users/${id}`, {
        method: "DELETE",
        headers: {
            "Authorization": "Bearer " + jwt
        }
    });

    if (response.ok) {
        openAdminPanel();
    } else {
        alert("Ошибка удаления");
    }
}

async function createUser() {

    const jwt = localStorage.getItem("jwt");

    const name = document.getElementById("new_name").value.trim();
    const role = document.getElementById("new_role").value;
    const user_id = document.getElementById("new_uuid").value.trim();

    if (!name) {
        alert("Введите имя");
        return;
    }

    const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + jwt
        },
        body: JSON.stringify({ name, role, user_id })
    });

    if (!response.ok) {
        alert("Ошибка создания");
        return;
    }

    openAdminPanel();
}
/* ================= FILES ================= */

async function showFiles() {

    window.currentScreen = "files";
    window.screenBack = null;
    navEnter("files", showFiles);
    title.innerText = "Файлы";

    const jwt = localStorage.getItem("jwt");

    const response = await fetch("/api/files", {
        headers: { "Authorization": "Bearer " + jwt }
    });

    if (!response.ok) {
        alert("Ошибка загрузки файлов");
        return;
    }

    let files = await response.json();

    if (!files || files.length === 0) {
        container.innerHTML = `
            <div class="menu-item">
                Файлы отсутствуют
            </div>
        `;
        return;
    }

    const user = JSON.parse(localStorage.getItem("user"));
    const basePath = "/files/" + user.user_id + "/";

    renderFiles(files, basePath);
}

function renderFiles(files, basePath) {

    const groups = groupFilesByDate(files);

 let html = `
    <div style="margin-bottom:12px;">
${!selectionMode ? `
    <button onclick="enableSelection()">Выбрать</button>
` : `

    <!-- 🔹 БЛОК ОТПРАВКИ -->
    <div style="display:flex;gap:8px;margin-bottom:8px;">
        <button style="flex:1;" onclick="sendSelected()">Поделиться</button>
        <button style="flex:1;" onclick="sendEmailSelected()">Email</button>
    </div>

    <!-- 🔹 EMAIL -->
    <div style="display:flex;gap:8px;margin-bottom:8px;">
        <input id="selectedEmail"
               placeholder="Email"
               style="flex:1;padding:8px;border-radius:8px;border:1px solid var(--card-border);" />

        <button style="white-space:nowrap;"
                onclick="openDirectorySelectEmail('selectedEmail')">
            Выбрать
        </button>
    </div>

    <!-- 🔹 БЛОК ДЕЙСТВИЙ -->
    <div style="display:flex;gap:8px;margin-bottom:8px;">
        <button style="flex:1;" onclick="downloadSelected()">Скачать</button>
        <button style="flex:1;background:var(--danger);" onclick="deleteSelected()">Удалить</button>
    </div>

    <!-- 🔹 ОТМЕНА -->
    <button onclick="disableSelection()" 
            style="width:100%;background:rgba(255,255,255,0.10);color:var(--text);">
        Отмена
    </button>

`}
        </div>
`;

    Object.keys(groups).forEach(groupName => {

        html += `
            <div style="margin-top:16px;margin-bottom:8px;font-weight:600;color:var(--text);">
                ${escapeHtml(groupName)}
            </div>
        `;

        groups[groupName].forEach(fileObj => {

            const file = fileObj.name;
            const ext = file.split(".").pop().toLowerCase();
            const icon = getFileIcon(ext);

            html += `
                <div class="menu-item"
                     data-file="${escapeHtml(file)}"
                     data-url="${escapeHtml(basePath + encodeURIComponent(file))}"
                     data-ext="${escapeHtml(ext)}"
                     onclick="fileClick(this.dataset.file, this.dataset.url, this.dataset.ext)">
                    ${selectionMode ? `<input type="checkbox" data-file="${escapeHtml(file)}" ${selectedFiles.has(file) ? "checked" : ""} onclick="toggleSelect(event, this.dataset.file)">` : ""}
                    <span class="icon">${icon}</span>
                    <div style="display:flex;flex-direction:column;">
                        <span style="word-break:break-all;">${escapeHtml(file)}</span>
                        <span style="font-size:12px;color:var(--muted);">
                            ${formatDate(fileObj.mtime)}
                        </span>
                    </div>
                </div>
            `;
        });

    });

    html += `
        <div style="
            margin-top:16px;
            font-size:13px;
            color:var(--muted);
            text-align:center;
            line-height:1.4;
        ">
            Если файл не отправляется через «Отправить», скачайте его и отправьте со своего устройства.
        </div>

    `;

    container.innerHTML = html;
}

async function deleteSelected() {

    if (selectedFiles.size === 0) {
        alert("Файлы не выбраны");
        return;
    }

    if (!confirm("Удалить выбранные файлы?")) return;

    const jwt = localStorage.getItem("jwt");

    try {

        const response = await fetch("/api/files/delete", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + jwt
            },
            body: JSON.stringify({
                files: Array.from(selectedFiles)
            })
        });

        if (!response.ok) {
            throw new Error();
        }

        alert("Файлы удалены");

        // 🔥 очищаем выбор
        selectedFiles.clear();

        // 🔥 обновляем список
        showFiles();

    } catch (e) {

        console.error(e);
        alert("Ошибка удаления");

    }
}


function selectCounterpartyEmail(email, name) {

    const input = document.getElementById("selectedEmail");

    if (!input) return;

    input.value = email; // 🔥 главное

    input.dataset.email = email;
    input.dataset.name = name;

    const overlay = document.querySelector(".modal-overlay");
    if (overlay) overlay.remove();
}



async function sendSelected() {

    if (selectedFiles.size === 0) {
        alert("Файлы не выбраны");
        return;
    }

    const user = JSON.parse(localStorage.getItem("user"));
    const basePath = "/files/" + user.user_id + "/";

    try {

        // =====================================
        // 1. Загружаем файлы
        // =====================================
        const files = [];

        for (const fileName of selectedFiles) {

            const response = await fetch(basePath + encodeURIComponent(fileName));

            if (!response.ok) {
                alert("Ошибка загрузки: " + fileName);
                return;
            }

            const blob = await response.blob();

            files.push(
               new File([blob], fileName, {
    type: getMimeType(fileName)
})
            );
        }

        // =====================================
        // 2. Пытаемся native share
        // =====================================
        const canShareFiles =
            navigator.canShare &&
            navigator.canShare({ files });

        if (navigator.share && canShareFiles) {

            await navigator.share({
                files,
                title: "Файлы",
                text: "Отправка файлов"
            });

            return;
        }

        // =====================================
        // 3. FALLBACK → скачивание
        // =====================================
        for (const file of files) {

            const url = URL.createObjectURL(file);

            const a = document.createElement("a");
            a.href = url;
            a.download = file.name;

            document.body.appendChild(a);
            a.click();
            a.remove();

            // небольшая задержка чтобы браузер не заблокировал
            await new Promise(r => setTimeout(r, 500));

            URL.revokeObjectURL(url);
        }

        // =====================================
        // 4. UX подсказка
        // =====================================
        alert(
            "Файлы скачаны.\n\n" +
            "Откройте Telegram → скрепка → Файл → Недавние"
        );

    } catch (err) {

        console.error(err);
        alert("Ошибка отправки файлов");

    }
}

function getMimeType(fileName) {

    const ext = fileName.split('.').pop().toLowerCase();

    const map = {
        pdf: "application/pdf",
        xls: "application/vnd.ms-excel",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        doc: "application/msword",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        txt: "text/plain",
        csv: "text/csv",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        png: "image/png"
    };

    return map[ext] || "application/octet-stream";
}

async function sendEmailSelected() {

    if (selectedFiles.size === 0) {
        alert("Файлы не выбраны");
        return;
    }

    const input = document.getElementById("selectedEmail");

    let email = "";

    if (input && input.dataset.email) {
        email = input.dataset.email;
    }

    if (!email && input && input.value) {
        email = input.value.trim();
    }

    if (!email) {
        email = prompt("Введите email");
        if (!email) return;
    }

    if (!email.includes("@")) {
        alert("Некорректный email");
        return;
    }

    const jwt = localStorage.getItem("jwt");
    const user = JSON.parse(localStorage.getItem("user"));

    // 🔥 ВАЖНО — показываем ДО try
    showLoadingOverlay("Файлы отправляются...");

    try {

        const response = await fetch("/api/send-email", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + jwt
            },
            body: JSON.stringify({
                files: Array.from(selectedFiles),
                email: email,
                userName: user?.name || ""
            })
        });

        if (!response.ok) {
            throw new Error("Request failed");
        }

        alert("Файлы отправлены");

        // 🔥 сброс файлов
        selectedFiles.clear();
        showFiles();

        // 🔥 сброс email
        if (input) {
            input.value = "";
            input.dataset.email = "";
            input.dataset.name = "";
        }

    } catch (e) {

        console.error("sendEmailSelected error:", e);
        alert("Ошибка отправки");

    } finally {

        // 🔥 всегда скрываем
        hideLoadingOverlay();

    }
}

async function openDirectorySelectEmail(targetInputId) {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal-window">

            <h3>Выбор контрагента</h3>

            <input type="text" id="searchInput"
                   placeholder="Поиск…"
                   style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--card-border);" />

            <div id="directoryList" style="max-height:300px;overflow:auto;"></div>

            <button onclick="this.closest('.modal-overlay').remove()">
                Закрыть
            </button>

        </div>
    `;

    document.body.appendChild(overlay);

    const listContainer = overlay.querySelector("#directoryList");
    const searchInput = overlay.querySelector("#searchInput");

    const jwt = localStorage.getItem("jwt");
    const user = JSON.parse(localStorage.getItem("user"));

    try {

        const res = await fetch("/api/directory/counterparties", {
            headers: { "Authorization": "Bearer " + jwt }
        });

        if (!res.ok) {
            alert("Ошибка загрузки контрагентов");
            return;
        }

        let data = await res.json();

        // 🔥 фильтр по email
        data = data.filter(item => item.email && item.email.trim() !== "");

        // 🔥 фильтр по роли
        if (user.role !== "admin" && user.role !== "director") {
            data = data.filter(item => item.manager_uuid === user.user_id);
        }

        function render(list) {

    listContainer.innerHTML = "";

    list.forEach(item => {

        const div = document.createElement("div");
        div.className = "menu-item";

        div.innerHTML = `
            <strong>${escapeHtml(item.name)}</strong><br>
            <small>${escapeHtml(item.email)}</small>
        `;

        // 🔥 НОРМАЛЬНЫЙ обработчик (без HTML-каши)
        div.onclick = () => {
            selectDirectoryEmail(targetInputId, item.name, item.email);
        };

        listContainer.appendChild(div);
    });
}

        render(data);

        searchInput.oninput = () => {
            const q = searchInput.value.toLowerCase();

            const filtered = data.filter(item =>
                (item.name && item.name.toLowerCase().includes(q)) ||
                (item.full_name && item.full_name.toLowerCase().includes(q))
            );

            render(filtered);
        };

    } catch (e) {
        console.error(e);
        alert("Ошибка загрузки");
    }
}

function selectDirectoryEmail(targetInputId, name, email) {

    const input = document.getElementById(targetInputId);

    if (!input) {
        console.error("input not found:", targetInputId);
        return;
    }

    // 🔥 теперь работаем с input
    input.value = email;

    // доп. данные (если пригодится)
    input.dataset.email = email;
    input.dataset.name = name;

    const overlay = document.querySelector(".modal-overlay");
    if (overlay) overlay.remove();
}

function showLoadingOverlay(text) {

    let overlay = document.getElementById("loadingOverlay");

    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "loadingOverlay";

        overlay.className = "report-overlay";

        overlay.innerHTML = `
            <div class="report-overlay-box" role="status">
                <div class="report-spinner" aria-hidden="true"></div>
                <div id="loadingText" class="report-overlay-text"></div>
            </div>
        `;

        document.body.appendChild(overlay);
    }

    document.getElementById("loadingText").innerText = text || "Загрузка…";
}

function hideLoadingOverlay() {

    const overlay = document.getElementById("loadingOverlay");
    if (overlay) overlay.remove();
}


function waitForReport(fileName, text) {

    showLoadingOverlay(text || "Формирование отчёта…");

    const user = JSON.parse(localStorage.getItem("user"));

    window.waitingFile =
        "/files/" + user.user_id + "/" + fileName;

    // Сохраняем текущее значение updated_at
    window.lastFileUpdate = null;

    fetch(window.waitingFile + "?t=" + Date.now())
        .then(r => r.ok ? r.json() : null)
        .then(data => {

            if (!data) {
                return;
            }

            // Поддержка старых файлов,
            // где JSON был сохранён как JSON-строка
            if (typeof data === "string") {

                try {
                    data = JSON.parse(data);
                } catch (e) {
                    console.error(
                        "Ошибка разбора JSON:",
                        fileName,
                        e
                    );
                    return;
                }
            }

            window.lastFileUpdate =
                data.updated_at || null;

        })
        .catch(e => {

            console.warn(
                "Не удалось прочитать текущий файл:",
                fileName,
                e
            );

        })
        .finally(() => {

            startWaitingFile();

        });
}

function startWaitingFile() {

    if (window.waitingInterval) {
        clearInterval(window.waitingInterval);
    }

    window.waitingInterval = setInterval(async () => {

        try {

            if (!window.waitingFile) {
                return;
            }

            const res = await fetch(
                window.waitingFile + "?t=" + Date.now()
            );

            if (!res.ok) {
                return;
            }

            let data = await res.json();

            // Поддержка старого двойного JSON
            if (typeof data === "string") {
                data = JSON.parse(data);
            }

            if (!data || !data.updated_at) {
                return;
            }

            const currentUpdate =
                String(data.updated_at);

            // Первое значение просто запоминаем
            if (window.lastFileUpdate === null) {

                window.lastFileUpdate =
                    currentUpdate;

                return;
            }

            // ===== ФАЙЛ ОБНОВИЛСЯ =====

            if (
                currentUpdate !==
                String(window.lastFileUpdate)
            ) {

                console.log(
                    "Файл обновлён:",
                    window.waitingFile,
                    window.lastFileUpdate,
                    "→",
                    currentUpdate
                );

                window.lastFileUpdate =
                    currentUpdate;

                clearInterval(window.waitingInterval);
                window.waitingInterval = null;

                hideLoadingOverlay();

                // ==========================================
                // ОБНОВЛЕНИЕ ТЕКУЩЕГО ЭКРАНА
                // ==========================================

                const currentScreen =
                    window.currentScreen;

                // ===== TASKLIST =====
                // У tasklist есть собственная функция загрузки,
                // поэтому не зависим от screenReloadMap.
                if (
                    currentScreen === "tasklist" &&
                    typeof loadTaskList === "function"
                ) {

                    loadTaskList();

                    return;
                }

                // ===== ОСТАЛЬНЫЕ ЭКРАНЫ =====
                // Сохраняем существующий механизм.
                if (
                    window.screenReloadMap &&
                    currentScreen &&
                    window.screenReloadMap[currentScreen]
                ) {

                    const fnName =
                        window.screenReloadMap[currentScreen];

                    if (
                        fnName &&
                        typeof window[fnName] === "function"
                    ) {
                        window[fnName]();
                    }

                }

            }

        } catch (e) {

            console.warn(
                "Ошибка проверки обновления:",
                window.waitingFile,
                e
            );

        }

    }, 3000);
}


/* ================= GROUPING ================= */

function groupFilesByDate(files) {

    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    const groups = {
        "Сегодня": [],
        "Вчера": [],
        "Ранее": []
    };

    files.forEach(file => {

        const fileDate = new Date(file.mtime);

        if (isSameDay(fileDate, today)) {
            groups["Сегодня"].push(file);
        }
        else if (isSameDay(fileDate, yesterday)) {
            groups["Вчера"].push(file);
        }
        else {
            groups["Ранее"].push(file);
        }

    });

    return groups;
}

function isSameDay(d1, d2) {
    return d1.getFullYear() === d2.getFullYear() &&
           d1.getMonth() === d2.getMonth() &&
           d1.getDate() === d2.getDate();
}

function formatDate(timestamp) {

    const d = new Date(timestamp);

    return d.toLocaleDateString("ru-RU") + " " +
           d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

/* ================= DOWNLOAD ================= */

function downloadSelected() {

    if (selectedFiles.size === 0) {
        alert("Файлы не выбраны");
        return;
    }

    const user = JSON.parse(localStorage.getItem("user"));
    const basePath = "/files/" + user.user_id + "/";

    (async () => {
        for (const file of selectedFiles) {
            try {
                await downloadStorageFile(basePath + encodeURIComponent(file), file);
            } catch (e) {
                console.error("DOWNLOAD ERROR:", e);
                alert("Ошибка загрузки: " + file);
            }
        }
    })();

}

function enableSelection() {
    selectionMode = true;
    selectedFiles.clear();
    showFiles();
}

function disableSelection() {
    selectionMode = false;
    selectedFiles.clear();
    showFiles();
}

function toggleSelect(event, file) {

    event.stopPropagation();

    if (selectedFiles.has(file)) {
        selectedFiles.delete(file);
        event.target.checked = false;
    } else {
        selectedFiles.add(file);
        event.target.checked = true;
    }

    updateSelectionCounter();
}

function updateSelectionCounter() {

    const counter = document.querySelector("[data-selection-counter]");

    if (counter) {
        counter.innerText = "Выбрано: " + selectedFiles.size;
    }
}

function fileClick(file, url, ext) {

    if (selectionMode) {

        const checkbox = document.querySelector('input[type="checkbox"][data-file="' + CSS.escape(file) + '"]');

        if (selectedFiles.has(file)) {
            selectedFiles.delete(file);
            if (checkbox) checkbox.checked = false;
        } else {
            selectedFiles.add(file);
            if (checkbox) checkbox.checked = true;
        }

        updateSelectionCounter();
        return;
    }

    openFile(url, ext);
}

/* ================= FILE ICON ================= */

/* Значок файла: лист с загнутым углом и цветной плашкой с типом (PDF красный, Excel зелёный, Word синий…) */
function getFileIcon(ext) {
    const types = {
        pdf:  ["PDF",  "#E5252A"],
        xls:  ["XLS",  "#1D7044"], xlsx: ["XLSX", "#1D7044"], csv: ["CSV", "#1D7044"],
        doc:  ["DOC",  "#2B579A"], docx: ["DOCX", "#2B579A"],
        jpg:  ["JPG",  "#8E44AD"], jpeg: ["JPG",  "#8E44AD"], png: ["PNG", "#8E44AD"], webp: ["IMG", "#8E44AD"],
        txt:  ["TXT",  "#607D8B"],
        zip:  ["ZIP",  "#E0A100"]
    };
    const t = types[ext] || [String(ext || "").slice(0, 4).toUpperCase() || "FILE", "#78909C"];
    const label = t[0], color = t[1];
    const fs = label.length > 3 ? 8 : 9.5;
    return '<svg width="34" height="40" viewBox="0 0 34 40" aria-hidden="true" style="flex:none;display:block;">' +
        '<path d="M3 1h20l10 10v26a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2z" fill="#fff" stroke="' + color + '" stroke-opacity=".45"/>' +
        '<path d="M23 1v8a2 2 0 0 0 2 2h8" fill="' + color + '" fill-opacity=".18" stroke="' + color + '" stroke-opacity=".45"/>' +
        '<rect x="1" y="21" width="32" height="13" rx="2" fill="' + color + '"/>' +
        '<text x="17" y="30.5" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="' + fs + '" fill="#fff">' + label + '</text>' +
        '</svg>';
}

async function openFile(url, ext) {
    if (["jpg","jpeg","png","webp"].includes(ext)) {
        openImagePreview(url);
        return;
    }
    try {
        const blob = await fetchFileBlob(url);
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.target = "_blank";
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (e) {
        console.error("OPEN FILE ERROR:", e);
        alert("Не удалось открыть файл");
    }
}

function openImagePreview(url) {

    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = 0;
    overlay.style.left = 0;
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.background = "rgba(0,0,0,0.85)";
    overlay.style.display = "flex";
    overlay.style.justifyContent = "center";
    overlay.style.alignItems = "center";
    overlay.style.zIndex = "9999";

    const img = document.createElement("img");
    img.style.maxWidth = "95%";
    img.style.maxHeight = "95%";
    img.style.borderRadius = "12px";
    overlay.appendChild(img);

    let objectUrl = null;
    fetchFileBlob(url).then(blob => {
        objectUrl = URL.createObjectURL(blob);
        img.src = objectUrl;
    }).catch(e => {
        console.error("IMAGE PREVIEW ERROR:", e);
        overlay.remove();
        alert("Не удалось открыть изображение");
    });

    overlay.onclick = () => {
        overlay.remove();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
    };

    document.body.appendChild(overlay);
}



async function runBackup() {

    if (!confirm("Запустить резервное копирование сейчас?"))
        return;

    const jwt = localStorage.getItem("jwt");

    const response = await fetch("/api/admin/backup", {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + jwt
        }
    });

    const data = await response.json();

    if (data.success)
        alert("Бэкап запущен");
    else
        alert("Ошибка запуска");
}

/* ================= MESSAGES ================= */

async function showMessages() {

    window.currentScreen = "messages";
    window.screenBack = null;
    navEnter("messages", showMessages);
    title.innerText = "Сообщения";

    const jwt = localStorage.getItem("jwt");

    const response = await fetch("/api/messages", {
        headers: {
            "Authorization": "Bearer " + jwt
        }
    });

    if (!response.ok) {
        alert("Ошибка загрузки сообщений");
        return;
    }

    const result = await response.json();

    const messages = (result.messages || [])
        .filter(m => m.type !== "unblock_message");

    updateMessagesBadge(messages.filter(m => !m.is_read).length);

    checkReportAutoRefresh(messages);

    if (!messages.length) {
        container.innerHTML = `
            <div style="padding:12px;">
                <div class="menu-item">Сообщений нет</div>

            </div>
        `;
        return;
    }

    const html = messages.map(m => `

        <div onclick="openMessage(${Number(m.id) || 0})"
             style="
                display:flex;
                flex-direction:column;
                gap:6px;
                padding:12px;
                margin-bottom:10px;
                border-radius:12px;
                background:var(--card);
                box-shadow:0 2px 6px rgba(0,0,0,0.08);
                cursor:pointer;
                max-width:100%;
                box-sizing:border-box;
                word-break:break-word;
                overflow-wrap:break-word;
                ${m.is_read ? "opacity:0.6;" : "border-left:4px solid var(--accent);"}
             ">

            <div style="font-weight:600;">
                ${messageTitleHtml(m)}
            </div>

            <div style="
                font-size:14px;
                line-height:1.4;
                word-break:break-word;
            ">
                ${formatMessageText(m.body)}
            </div>

            <div style="
                font-size:12px;
                color:var(--muted);
                margin-top:4px;
            ">
                ${new Date(m.created_at).toLocaleString("ru-RU")}
            </div>

        </div>

    `).join("");

    container.innerHTML = `
        <div style="padding:10px;max-width:100%;overflow-x:hidden;">

           <div style="display:flex;gap:8px;margin-bottom:10px;">
    <button onclick="clearAllMessages()" 
            style="flex:1;background:var(--danger);">
        Очистить
    </button>

    <button onclick="markAllMessagesRead()" style="flex:1;">
        Прочитать все
    </button>
</div>

            ${html}


        </div>
    `;
}

// Заголовок сообщения — всегда экранируем
function messageTitleHtml(m) {
    return escapeHtml(m.title);
}

// Текст сообщения: экранирование, затем переносы строк в <br>
function formatMessageText(text, alreadyEscaped) {
    if (!text) return "";
    const safe = alreadyEscaped ? String(text) : escapeHtml(text);
    return safe
        .replace(/\\n/g, "<br>")
        .replace(/\n/g, "<br>");
}

async function clearAllMessages() {

    if (!confirm("Удалить все сообщения?")) return;

    const jwt = localStorage.getItem("jwt");

    try {

        const response = await fetch("/api/messages/clear", {
            method: "POST",
            headers: {
                "Authorization": "Bearer " + jwt
            }
        });

        if (!response.ok) {
            throw new Error();
        }

        showMessages();

    } catch (e) {

        console.error(e);
        alert("Ошибка очистки");

    }
}

async function markAllMessagesRead() {

    const jwt = localStorage.getItem("jwt");

    try {

        const response = await fetch("/api/messages/read-all", {
            method: "POST",
            headers: {
                "Authorization": "Bearer " + jwt
            }
        });

        if (!response.ok) {
            throw new Error();
        }

        showMessages();

    } catch (e) {

        console.error(e);
        alert("Ошибка");

    }
}
async function openMessage(id) {

    const jwt = localStorage.getItem("jwt");

    await fetch(`/api/messages/${id}/read`, {
        method: "POST",
        headers: {
            "Authorization": "Bearer " + jwt
        }
    });

    // Перезагружаем список
    showMessages();
}

function checkReportAutoRefresh(messages) {

    if (!window.currentScreen) return;

    messages.forEach(m => {

        // ===== АВТООБНОВЛЕНИЕ =====

        if (m.type === "sales_ready" && window.currentScreen === "sales") {
            if (typeof loadSalesReport === "function") {
                loadSalesReport();
            }
        }

        if (m.type === "orders_ready" && window.currentScreen === "orders") {
            if (typeof loadOrders === "function") {
                loadOrders();
            }
        }

        if (m.type === "debt_ready" && window.currentScreen === "debt") {
            if (typeof loadDebt === "function") {
                loadDebt();
            }
        }

        if (m.type === "bank_ready" && window.currentScreen === "bank") {
            if (typeof loadBankReport === "function") {
                loadBank();
            }
        }

        if (m.type === "rating_ready" && window.currentScreen === "rating") {
            if (typeof loadRating === "function") {
                loadRating();
            }
        }

        if (m.type === "notshipped_ready" && window.currentScreen === "notshipped") {
            if (typeof loadNotShipped === "function") {
                loadNotShipped();
            }
        }

        if (m.type === "drivers_ready" && window.currentScreen === "drivers") {
            if (typeof loadDrivers === "function") {
                loadDrivers();
            }
        }

        if (m.type === "bills_ready" && window.currentScreen === "bills") {
            if (typeof loadBills === "function") {
                loadBills();
            }
        }

        if (m.type === "act_ready" && window.currentScreen === "act") {
            if (typeof loadAct === "function") {
                loadAct();
            }
        }

        if (m.type === "upd_ready" && window.currentScreen === "upd") {
            if (typeof loadUpd === "function") {
                loadUpd();
            }
        }

        if (m.type === "pricelist_ready" && window.currentScreen === "pricelist") {
            if (typeof loadPricelist === "function") {
                loadPricelist();
            }
        }

        if (m.type === "prices_ready" && window.currentScreen === "prices") {
            if (typeof loadPrices === "function") {
                loadPrices();
            }
        }

        if (m.type === "pricefix_ready" && window.currentScreen === "pricefix") {
            if (typeof loadPricefix === "function") {
                loadPricefix();
            }
        }

        // ===== УНИВЕРСАЛЬНОЕ ЗАКРЫТИЕ LOADER =====

        if (window.waitingTaskType) {

            const map = {
                sales_report: "sales_ready",
                orders_report: "orders_ready",
                debt_report: "debt_ready",
                bank_report: "bank_ready",
                rating_report: "rating_ready",
                notshipped_report: "notshipped_ready",
                drivers_report: "drivers_ready",
                bills_report: "bills_ready",
                act_report: "act_ready",
                upd_report: "upd_ready",
                pricelist_report: "pricelist_ready",
                prices_report: "prices_ready",
                pricefix_report: "pricefix_ready"
            };

            const expectedEvent = map[window.waitingTaskType];

            if (m.type === expectedEvent) {
                hideLoadingOverlay();
                window.waitingTaskType = null;
            }
        }

    });

}


function updateMessagesBadge(count) {

    const badge = document.getElementById("messagesBadge");

    if (!badge) return;

    if (count > 0) {
        badge.innerText = count;
        badge.classList.remove("hidden");
    } else {
        badge.classList.add("hidden");
    }
}

async function loadUnreadCount() {

    const jwt = localStorage.getItem("jwt");
    if (!jwt) return;

    const response = await fetch("/api/messages", {
        headers: { "Authorization": "Bearer " + jwt }
    });

    if (!response.ok) return;

    const result = await response.json();

const all = result.messages || [];

// 🔥 проверка на unblock_message
window.hasBlockMessages = all.some(m => 
    m.type === "unblock_message" && !m.is_read
);

updateMessagesBadge(result.unread);
}

function setActive(button){

document.querySelectorAll(".bottom-btn")
.forEach(btn => btn.classList.remove("active"))

button.classList.add("active")

}

function renderUpdatedAt(date) {

    if (!date) return "";

    return `
        <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">
            Обновлено: ${escapeHtml(date)}
        </div>
    `;
}



// 🔥 фикс для открытия из push
(function() {

    const params = new URLSearchParams(window.location.search);

    if (params.get("fromPush")) {

        console.log("OPENED FROM PUSH");

        // 💥 полный сброс UI
        document.getElementById("screen-container").innerHTML = "";
        window.currentScreen = null;

        setTimeout(async () => {

            const jwt = localStorage.getItem("jwt");

            if (jwt) {
                await validateToken(jwt);
            } else {
                showLogin();
            }

        }, 100);
    }

})();

/*============OTHER FUNCTION========================*/
async function openNomenclatureSelect(targetInputId, options = {}) {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal-window">

            <h3>${options.title || "Выбор номенклатуры"}</h3>

            <input type="text" id="nomenclatureSearch"
                   placeholder="Поиск…"
                   style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--card-border);margin-bottom:10px;" />

            <div id="nomenclatureList" style="max-height:300px;overflow:auto;"></div>

            <button onclick="this.closest('.modal-overlay').remove()">
                Закрыть
            </button>

        </div>
    `;

    document.body.appendChild(overlay);

    const list = overlay.querySelector("#nomenclatureList");
    const search = overlay.querySelector("#nomenclatureSearch");

    const jwt = localStorage.getItem("jwt");

    try {

        const res = await fetch("/api/directory/nomenclature", {
            headers: { "Authorization": "Bearer " + jwt }
        });

        if (!res.ok) {
            alert("Ошибка загрузки номенклатуры");
            return;
        }

        let data = await res.json();

        // 🔥 УНИВЕРСАЛЬНАЯ СОРТИРОВКА
        function sortData(arr) {
            return arr.sort((a, b) => {

                const typeA = Number(a.type || 0);
                const typeB = Number(b.type || 0);

                if (typeA !== typeB) {
                    return typeA - typeB;
                }

                const nameA = (a.full_name || a.name || "").toLowerCase();
                const nameB = (b.full_name || b.name || "").toLowerCase();

                return nameA.localeCompare(nameB, "ru");
            });
        }

        function render(arr) {

            list.innerHTML = "";

            arr.forEach(i => {

                const div = document.createElement("div");
                div.className = "menu-item";

                div.innerHTML = `
                    <div style="display:flex;flex-direction:column;">
                        <span>${escapeHtml(i.name)}</span>
                        <span style="font-size:12px;color:var(--muted);">
                            ${escapeHtml(i.full_name || "")}
                        </span>
                    </div>
                `;

                div.onclick = () => {

                    const input = document.getElementById(targetInputId);

                    if (input) {
                        input.value = i.name;
                        input.dataset.guid = i.guid;
                    }

                    overlay.remove();
                };

                list.appendChild(div);
            });
        }

        // 🔥 ПРИ ОТКРЫТИИ
        render(sortData([...data]));

        // 🔥 ПОИСК
        search.oninput = () => {

            const q = search.value.toLowerCase();

            const filtered = data.filter(i =>
                (i.name && i.name.toLowerCase().includes(q)) ||
                (i.full_name && i.full_name.toLowerCase().includes(q))
            );

            render(sortData(filtered));
        };

    } catch (e) {

        console.error(e);
        alert("Ошибка загрузки");

    }
}

/* =====================================================================
   ОТЧЁТЫ — ЕДИНЫЙ МЕХАНИЗМ ОЖИДАНИЯ (runReport)

   Готовность определяет сервер: он сравнивает время изменения файла
   отчёта до и после запроса и проверяет, что файл полностью записан.
   Поле updated_at и его формат больше не важны.

   Использование в экране:

       runReport({
           type:   "rating_report",       // тип задачи для 1С
           payload: { ... },              // параметры
           file:   "rating.json",         // какой файл ждём
           screen: "rating",              // какой экран обновить
           text:   "Формирование рейтинга...",
           onDone: loadRating             // что вызвать, когда готово
       });

   Старые функции (waitForReport, startWaitingFile, sendTask) не тронуты
   и продолжают работать для ещё не переведённых экранов.
   ===================================================================== */

window.activeReportRun = null;

async function runReport(options) {

    const opts = Object.assign({
        payload: {},
        text: "Формирование отчёта…",
        timeoutMs: 3 * 60 * 1000,
        intervalMs: 2000
    }, options || {});

    if (!opts.type || !opts.file) {
        console.error("runReport: нужны type и file", opts);
        return;
    }

    // Один отчёт за раз — повторное нажатие не создаёт вторую задачу
    if (window.activeReportRun) {
        return;
    }

    const run = { cancelled: false };
    window.activeReportRun = run;

    showReportOverlay(opts.text, "Отправка запроса...", () => {
        run.cancelled = true;
        finishReportRun(run);
    });

    try {

        // ===== 1. Создаём задачу =====

        const jwt = localStorage.getItem("jwt");

        let uuid = null;

        try {

            const response = await fetch("/api/task", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + jwt
                },
                body: JSON.stringify({
                    type: opts.type,
                    payload: opts.payload,
                    wait_file: opts.file
                })
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok || !data.uuid) {
                throw new Error("HTTP " + response.status);
            }

            uuid = data.uuid;

        } catch (e) {

            console.error("runReport: ошибка отправки", e);
            finishReportRun(run);
            alert("Не удалось отправить запрос. Проверьте связь и повторите.");
            return;
        }

        // ===== 2. Ждём готовности =====

        const deadline = Date.now() + opts.timeoutMs;

        while (Date.now() < deadline) {

            await new Promise(r => setTimeout(r, opts.intervalMs));

            if (run.cancelled) {
                finishReportRun(run);
                return;
            }

            let status;

            try {

                const res = await fetch(
                    "/api/task/" + encodeURIComponent(uuid) + "/status?t=" + Date.now(),
                    {
                        headers: { "Authorization": "Bearer " + jwt },
                        cache: "no-store"
                    }
                );

                // Сервер перезапускался — задача потеряна
                if (res.status === 404) {
                    finishReportRun(run);
                    alert("Запрос потерян (сервер перезапускался). Повторите, пожалуйста.");
                    return;
                }

                if (!res.ok) {
                    continue;   // временная ошибка — пробуем ещё
                }

                status = await res.json();

            } catch (e) {
                continue;       // нет сети — пробуем ещё до таймаута
            }

            if (run.cancelled) {
                return;
            }

            if (status.status === "ready") {

                finishReportRun(run);

                // Обновляем экран, только если пользователь всё ещё на нём
                if (
                    typeof opts.onDone === "function" &&
                    (!opts.screen || window.currentScreen === opts.screen)
                ) {
                    opts.onDone();
                }

                return;
            }

            setReportOverlayStatus(reportStatusText(status));
        }

        // ===== 3. Таймаут =====

        finishReportRun(run);

        alert(
            "Отчёт пока не получен.\n\n" +
            "Возможно, 1С занята. Данные обновятся, когда отчёт будет готов — " +
            "откройте экран позже или нажмите «Обновить» ещё раз."
        );

    } catch (e) {

        console.error("runReport: непредвиденная ошибка", e);
        finishReportRun(run);
    }
}

function reportStatusText(status) {

    if (status.status === "writing") {
        return "Получаем данные...";
    }

    if (status.queue === "new") {
        return "Ожидание очереди 1С...";
    }

    return "1С формирует отчёт...";
}

function finishReportRun(run) {

    if (window.activeReportRun === run) {
        window.activeReportRun = null;
    }

    hideReportOverlay();
}

/* ===== Экран ожидания для runReport =====
   Отдельный от loadingOverlay, чтобы старые перехваты
   hideLoadingOverlay в других экранах на него не влияли. */

function showReportOverlay(text, statusText, onCancel) {

    hideReportOverlay();

    const overlay = document.createElement("div");
    overlay.id = "reportOverlay";

    overlay.className = "report-overlay";

    overlay.innerHTML = `
        <div class="report-overlay-box" role="status">
            <div class="report-spinner" aria-hidden="true"></div>
            <div id="reportOverlayText" class="report-overlay-text"></div>
            <div id="reportOverlayStatus" class="report-overlay-status"></div>
            <button id="reportOverlayCancel" type="button" class="btn-secondary">Отменить</button>
        </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector("#reportOverlayText").innerText = text || "Формирование отчёта…";
    overlay.querySelector("#reportOverlayStatus").innerText = statusText || "";

    overlay.querySelector("#reportOverlayCancel").onclick = () => {
        if (typeof onCancel === "function") {
            onCancel();
        }
        hideReportOverlay();
    };
}

function setReportOverlayStatus(text) {

    const el = document.getElementById("reportOverlayStatus");

    if (el) {
        el.innerText = text || "";
    }
}

function hideReportOverlay() {

    const overlay = document.getElementById("reportOverlay");

    if (overlay) {
        overlay.remove();
    }
}
