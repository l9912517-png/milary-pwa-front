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

   // 🔥 только для отчетов
if (type.includes("_report")) {
    window.waitingTaskType = type;
    showLoadingOverlay("Формируем отчет...");
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
        
        // 🔥 для обычных задач (не отчеты)
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

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(() => console.log("Service Worker registered"))
        .catch(err => console.log("SW registration error:", err));
}

/* ================= PUSH PERMISSION ================= */

async function initPushPermission() {

    if (!("Notification" in window)) {
        console.log("Notifications not supported");
        return;
    }

    let permission = Notification.permission;

    // 🔥 если не разрешено — запрашиваем
    if (permission !== "granted") {

        if (permission === "denied") {
            console.log("Push permission denied");
            return;
        }

        permission = await Notification.requestPermission();
        console.log("Push permission:", permission);
    }

    // 🔥 если разрешено — сразу подписываемся
    if (permission === "granted") {
        await subscribePush();
    }
}

/* ================= PUSH SUBSCRIBE ================= */

async function subscribePush() {

    try {

        if (!('serviceWorker' in navigator)) {
            console.log("NO SW");
            return;
        }

        const registration = await navigator.serviceWorker.ready;

        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {

            const vapidPublicKey = "BHQKAOwyZsptCCunx8QMFtNaznqSacFv2kywF-nuyJka9P2y1Ex5xnNsa3ZLwE47tH-DliexRr9pjwMIjqbyKZw";
            const convertedKey = urlBase64ToUint8Array(vapidPublicKey);

            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: convertedKey
            });

            console.log("SUB CREATED:", subscription.endpoint);

        } else {
            console.log("SUB EXISTS:", subscription.endpoint);
        }

        const jwt = localStorage.getItem("jwt");
        console.log("JWT:", jwt);

        const res = await fetch("/api/push/subscribe", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + jwt
            },
            body: JSON.stringify(subscription)
        });

        const text = await res.text();

        console.log("SERVER STATUS:", res.status);
        console.log("SERVER RESPONSE:", text);

    } catch (e) {
        console.log("PUSH ERROR:", e);
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

    const jwt = localStorage.getItem("jwt");

    if (!jwt) {
        showLogin();
    } else {
        await validateToken(jwt);
    }

    //preloadScreens();

    // 🔥 push запускаем ПОСЛЕ UI
    initPushPermission().catch(e => console.log("Push init error", e));
});

/* ================= TOP BAR ================= */

function showTopBar() {
    userName.innerText = currentUser.name + " (" + currentUser.role + ")";
    topBar.classList.remove("hidden");
}

function hideTopBar() {
    topBar.classList.add("hidden");
}

function logout() {
    localStorage.clear();
    showLogin();
}

function setBrandTitle() {
    title.innerHTML =
        '<span class="brand-meal">MEAL</span>' +
        '<span class="brand-fresh">FRESH</span>';
}



/* ================= LOGIN ================= */

function showLogin() {
    hideTopBar();
   setBrandTitle();

    container.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:16px;">
            <input id="accessToken" placeholder="Введите токен входа"
                style="padding:12px;border-radius:12px;border:1px solid #ccc;" />
            <button onclick="doLogin()">Войти</button>
        </div>
    `;
}

async function doLogin() {

    const access_token = document.getElementById("accessToken").value.trim();
    if (!access_token) return alert("Введите токен");

    const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access_token })
    });

    const data = await response.json();
    if (!data.success) return alert("Неверный токен");

    localStorage.setItem("jwt", data.jwt);
    localStorage.setItem("user", JSON.stringify(data.user));

    currentUser = data.user;
    showTopBar();
    showMenu();
}

async function validateToken(jwt) {

    const response = await fetch("/api/files", {
        headers: { "Authorization": "Bearer " + jwt }
    });

    if (!response.ok) return logout();

    currentUser = JSON.parse(localStorage.getItem("user"));

    console.log("CURRENT USER:", currentUser);
    console.log("ROLE:", currentUser.role);

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

await initPushPermission();
}


/* ================= TOP BAR ================= */

function showTopBar() {
    userName.innerText = currentUser.name + " (" + currentUser.role + ")";
    topBar.classList.remove("hidden");
}

function hideTopBar() {
    topBar.classList.add("hidden");
}

function logout() {
    localStorage.clear();
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
    { id: "pricefix", icon: "✏️", title: "Фиксации" },
    { id: "developments", icon: "📋", title: "Разработки" }
];



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
    { id: "financeReport", icon: "📊", title: "Финансовый отчет" },
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
            .concat(MENU_ORDER_INFO)
            .concat(MENU_ORDER_TEXT);     // «Передать заказ» — рядом с «Информацией по заказам»
    }

    // оператор — только проверка заказов
    if (role === "operator") {
        return [MENU_ORDER_REVIEW];
    }

    // 🔥 admin — аналитика В КОНЦЕ
    if (role === "admin") {

        return menu
            .concat(MENU_ORDER_INFO)
            .concat(MENU_ORDER_TEXT)      // «Передать заказ» — рядом с «Информацией по заказам»
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

        menu = menu.concat(MENU_ORDER_TEXT);   // «Передать заказ» — последним и у менеджера, и у РОПа

        return menu;
    }

    return menu;
}

/* ================= MENU ================= */

/* ================= МЕНЮ ДИРЕКТОРА И АДМИНА: РАЗДЕЛЫ ================= */

const MENU_GROUPS = [
    { key: "orders", icon: "📦", title: "Заказы", color: "#e8f3e1", ids: ["ordMy", "ordInfo", "orders", "notshipped", "returns"] },
    { key: "finance", icon: "💰", title: "Финансы", color: "#e4eef9", ids: ["payments", "receipts", "bank", "debt", "cashState", "financeReport", "grossprofit", "writeoffs"] },
    { key: "sales", icon: "📈", title: "Продажи и аналитика", color: "#efe7fa", ids: ["sales", "dir_sales", "ordersCount", "rating"] },
    { key: "clients", icon: "👥", title: "Клиенты", color: "#fbe9dc", ids: ["developments", "developments_control", "checksJournal", "block", "control"] },
    { key: "docs", icon: "📄", title: "Документы", color: "#eef0ec", ids: ["bills", "act", "upd", "pricelist"] },
    { key: "prices", icon: "💲", title: "Цены", color: "#fff4dc", ids: ["prices", "pricefix"] },
    { key: "logistics", icon: "🚚", title: "Логистика", color: "#e1f3f2", ids: ["logistics", "drivers"] },
    { key: "admin", single: true, ids: ["adminPanel"] }      // одна кнопка — без плитки, просто кнопкой внизу
];

const MENU_USAGE_KEY = "menu_usage";        // { id: [время нажатия, …] } за 14 дней — «часто используемые»
const MENU_OPEN_KEY = "menu_groups_open";   // { раздел: true/false } — что человек открыл/свернул
const MENU_OPEN_DEFAULT = { fav: true, orders: true };   // при первом входе открыты эти

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
    let extra = "";
    if (item.id === "block" && window.hasBlockMessages) {
        extra = `<span style="color:red;margin-left:6px;">●</span>`;
    }
    return `
            <div class="menu-item" onclick="handleMenuClick('${item.id}')">
                <span class="icon">${item.icon}</span>
                <span>${item.title} ${extra}</span>
            </div>`;
}

/* Разделы-плитки: цветная плитка, у свёрнутой — состав мелким текстом, нажатие — открыть/свернуть */
function menuGroupsHtml(menuItems) {
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

    const groups = MENU_GROUPS.map(g => {
        const items = g.ids.filter(id => byId[id]).map(id => { used[id] = true; return byId[id]; });
        return Object.assign({}, g, { items });
    });
    const rest = menuItems.filter(i => !used[i.id]);              // пункт без раздела — не теряем
    if (rest.length) groups.push({ key: "other", icon: "📁", title: "Прочее", color: "#f0f0ec", items: rest });
    if (top.length) groups.unshift({ key: "fav", icon: "⭐", title: "Часто используемые", color: "#fff6d6", items: top });

    const tile = g => {
        if (!g.items.length) return "";
        if (g.single) return `<div class="menu-single">${g.items.map(menuItemHtml).join("")}</div>`;
        const open = menuGroupOpen(g.key);
        let sub = g.items.map(i => i.title).join(", ");
        if (sub.length > 80) sub = sub.slice(0, 78).replace(/,?\s*\S*$/, "") + "…";
        return `
        <section class="menu-tile ${open ? "open" : ""}" data-group="${g.key}" style="--tile:${g.color}">
            <button type="button" class="menu-tile-head" onclick="menuToggleGroup('${g.key}')">
                <span class="menu-tile-icon">${g.icon}</span>
                <span class="menu-tile-title">${g.title}</span>
                <span class="menu-tile-arrow"></span>
            </button>
            <div class="menu-tile-sub">${sub}</div>
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
    if (el) el.classList.toggle("open", open);
}

function showMenu() {

   setBrandTitle();

    const menuItems = buildMenuByRole(currentUser.role);

    const menuHtml = menuItems.map(item => {

        let extra = "";

        // 🔥 правильный ID
        if (item.id === "block" && window.hasBlockMessages) {
            extra = `<span style="color:red;margin-left:6px;">●</span>`;
        }

        return `
            <div class="menu-item" onclick="handleMenuClick('${item.id}')">
                <span class="icon">${item.icon}</span>
                <span>${item.title} ${extra}</span>
            </div>
        `;

    }).join("");

    const columns = (currentUser.role === "director" || currentUser.role === "admin") ? 2 : 1;

    if (currentUser.role === "director" || currentUser.role === "admin") {
        container.innerHTML = menuGroupsHtml(menuItems);       // разделы, сворачиваются; сверху — часто используемые
    } else {
        container.innerHTML = `
    <div class="menu-grid" style="grid-template-columns: repeat(${columns}, 1fr);">
        ${menuHtml}
    </div>
    `;
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
                                ${u.name}
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
                        value="${u.name}"
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
                        value="${u.user_id}"
                    />


                    <label>
                        Access Token
                    </label>

                    <input
                        value="${u.access_token}"
                        readonly
                    />


                    <div class="admin-user-actions">

                        <button
                            onclick="event.stopPropagation(); copyText('${u.access_token}')"
                        >
                            📋 Копировать
                        </button>


                        <button
                            onclick="event.stopPropagation(); saveUser(${u.id})"
                        >
                            💾 Сохранить
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
                            onclick="event.stopPropagation(); regenerateToken(${u.id})"
                        >
                            🔐 Новый токен
                        </button>


                        <button
                            class="admin-danger"
                            onclick="event.stopPropagation(); deleteUser(${u.id})"
                        >
                            🗑 Удалить
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
                    💾 Сделать бэкап
                </button>

                <button onclick="openScreen('tasklist')">
                    📋 Список задач
                </button>

            </div>


            <button
                onclick="showMenu()"
                style="
                    background:#ccc;
                    color:#000;
                    margin-top:12px;
                "
            >
                Назад
            </button>

        </div>

    `;
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

    if (!confirm("Сгенерировать новый токен?")) return;

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
/* ================= SUPPORT ================= */

async function openSupport() {
    const jwt = localStorage.getItem("jwt");

    if (!jwt) {
        alert("Не выполнен вход");
        return;
    }

    closeSupport();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "supportOverlay";
    overlay.innerHTML = `
        <div class="modal-window">
            <h3>Поддержка</h3>
            <label for="supportMessage">Сообщение</label>
            <textarea id="supportMessage" rows="5" placeholder="Опишите вопрос или проблему"></textarea>
            <label for="supportContact">Как с вами связаться (необязательно)</label>
            <input type="text" id="supportContact" placeholder="Телефон или почта">
            <div class="modal-actions">
                <button onclick="sendSupport()">Отправить</button>
                <button onclick="closeSupport()">Отмена</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

function closeSupport() {
    const overlay = document.getElementById("supportOverlay");
    if (overlay) overlay.remove();
}

async function sendSupport() {

    const message = document.getElementById("supportMessage").value.trim();
    const contact = document.getElementById("supportContact").value.trim();

    if (!message) return alert("Введите сообщение");

    const jwt = localStorage.getItem("jwt");

    const response = await fetch("/api/support", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + jwt
        },
        body: JSON.stringify({ message, contact })
    });

    closeSupport();

    if (response.ok) alert("Сообщение отправлено");
    else alert("Ошибка отправки");
}

/* ================= FILES ================= */

async function showFiles() {

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
            <button onclick="showMenu()" style="background:#ccc;color:#000;">Назад</button>
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
               style="flex:1;padding:8px;border-radius:8px;border:1px solid #ccc;" />

        <button style="white-space:nowrap;"
                onclick="openDirectorySelectEmail('selectedEmail')">
            Выбрать
        </button>
    </div>

    <!-- 🔹 БЛОК ДЕЙСТВИЙ -->
    <div style="display:flex;gap:8px;margin-bottom:8px;">
        <button style="flex:1;" onclick="downloadSelected()">Скачать</button>
        <button style="flex:1;background:#b30000;" onclick="deleteSelected()">Удалить</button>
    </div>

    <!-- 🔹 ОТМЕНА -->
    <button onclick="disableSelection()" 
            style="width:100%;background:#ccc;color:#000;">
        Отмена
    </button>

`}
        </div>
`;

    Object.keys(groups).forEach(groupName => {

        html += `
            <div style="margin-top:16px;margin-bottom:8px;font-weight:600;color:#555;">
                ${groupName}
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
                        <span style="font-size:12px;color:#888;">
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
            color:#777;
            text-align:center;
            line-height:1.4;
        ">
            Если файл не отправляется через «Отправить», скачайте его и отправьте со своего устройства.
        </div>

        <button onclick="showMenu()" style="background:#ccc;color:#000;margin-top:16px;">Назад</button>
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
                   placeholder="Поиск..."
                   style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc;" />

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
            <strong>${item.name}</strong><br>
            <small>${item.email}</small>
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

        overlay.style.position = "fixed";
        overlay.style.top = "0";
        overlay.style.left = "0";
        overlay.style.width = "100%";
        overlay.style.height = "100%";
        overlay.style.background = "rgba(0,0,0,0.6)";
        overlay.style.display = "flex";
        overlay.style.justifyContent = "center";
        overlay.style.alignItems = "center";
        overlay.style.zIndex = "99999";

        overlay.innerHTML = `
            <div style="
                background:#fff;
                padding:20px;
                border-radius:12px;
                text-align:center;
                font-size:16px;
                max-width:280px;
            ">
                ⏳<br><br>
                <div id="loadingText"></div>
            </div>
        `;

        document.body.appendChild(overlay);
    }

    document.getElementById("loadingText").innerText = text || "Загрузка...";
}

function hideLoadingOverlay() {

    const overlay = document.getElementById("loadingOverlay");
    if (overlay) overlay.remove();
}


function waitForReport(fileName, text) {

    showLoadingOverlay(text || "Формирование отчета...");

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

                <button onclick="showMenu()" 
                        style="background:#ccc;color:#000;width:100%;margin-top:10px;">
                    Назад
                </button>
            </div>
        `;
        return;
    }

    const html = messages.map(m => `

        <div onclick="openMessage(${m.id})"
             style="
                display:flex;
                flex-direction:column;
                gap:6px;
                padding:12px;
                margin-bottom:10px;
                border-radius:12px;
                background:#fff;
                box-shadow:0 2px 6px rgba(0,0,0,0.08);
                cursor:pointer;
                max-width:100%;
                box-sizing:border-box;
                word-break:break-word;
                overflow-wrap:break-word;
                ${m.is_read ? "opacity:0.6;" : "border-left:4px solid #4CAF50;"}
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
                color:#888;
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
            style="flex:1;background:#b30000;">
        Очистить
    </button>

    <button onclick="markAllMessagesRead()" style="flex:1;">
        Прочитать все
    </button>
</div>

            ${html}

            <button onclick="showMenu()" 
                    style="background:#ccc;color:#000;width:100%;margin-top:10px;">
                Назад
            </button>

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

/* ================= SALES REPORT ================= */

function openSalesReport() {

    title.innerText = "Продажи";

    container.innerHTML = `
    
    <div class="report-screen">

        <div class="report-toolbar">
            <button onclick="requestSalesReport()">Получить</button>
            <button onclick="loadSalesReport()">Обновить</button>
        </div>

        <div id="salesReportHeader" class="report-header">
            Отчет не получен
        </div>

        <div id="salesReportContainer" class="report-table">
        </div>

        <button onclick="showMenu()" class="back-button">
            Назад
        </button>

    </div>

    `;
}

function setActive(button){

document.querySelectorAll(".bottom-btn")
.forEach(btn => btn.classList.remove("active"))

button.classList.add("active")

}

function renderUpdatedAt(date) {

    if (!date) return "";

    return `
        <div style="font-size:12px;color:#666;margin-bottom:6px;">
            Обновлено: ${date}
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
                   placeholder="Поиск..."
                   style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc;margin-bottom:10px;" />

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
                        <span>${i.name}</span>
                        <span style="font-size:12px;color:#888;">
                            ${i.full_name || ""}
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
        text: "Формирование отчета...",
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

    return "1С формирует отчет...";
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

    overlay.style.cssText =
        "position:fixed;inset:0;background:rgba(0,0,0,0.6);" +
        "display:flex;justify-content:center;align-items:center;z-index:99999;";

    overlay.innerHTML = `
        <div style="
            background:#fff;
            padding:20px;
            border-radius:12px;
            text-align:center;
            font-size:16px;
            width:260px;
            max-width:85%;
        ">
            <div style="font-size:28px;">⏳</div>
            <div id="reportOverlayText" style="margin-top:10px;font-weight:600;"></div>
            <div id="reportOverlayStatus" style="margin-top:6px;font-size:13px;color:#777;"></div>
            <button id="reportOverlayCancel"
                    style="margin-top:16px;width:100%;background:#ccc;color:#000;">
                Отменить
            </button>
        </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelector("#reportOverlayText").innerText = text || "Формирование отчета...";
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
