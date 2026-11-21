/*
 * Поддержка: обращения-переписки пользователя с админом.
 *
 *  - пользователь: «Справка» → «Поддержка» — свои обращения, «Новое обращение»
 *    (текст, до 5 картинок, сведения об устройстве), переписка;
 *  - админ: «Администрирование» → «Обращения в поддержку» — все обращения, ответ, закрыть/открыть;
 *  - точка на кнопке «Справка» в шапке — есть непрочитанный ответ (у админа — новые сообщения);
 *  - push ведёт на /pwa/?support=N — открывается это обращение.
 *
 * Сервер: /api/helpdesk/* (бэкенд, helpdesk/).
 */

/* ===================== Сведения об устройстве ===================== */

/* последние ошибки в приложении — прикладываются к обращению */
const SUPPORT_ERRORS = [];
function supportRememberError(text) {
    SUPPORT_ERRORS.push(new Date().toLocaleTimeString("ru-RU") + " " + String(text).slice(0, 280));
    if (SUPPORT_ERRORS.length > 8) SUPPORT_ERRORS.shift();
}
window.addEventListener("error", e => {
    supportRememberError((e.message || "Ошибка") + (e.filename ? " @ " + e.filename.split("/").pop() + ":" + e.lineno : ""));
});
window.addEventListener("unhandledrejection", e => {
    const r = e.reason;
    supportRememberError("Promise: " + (r && r.message ? r.message : String(r)));
});

/* экран, с которого открыли поддержку */
let supportFromScreen = "";

function supportParseUa(ua) {
    const out = { os: "", browser: "", device: "" };
    let m;
    if ((m = ua.match(/Android ([\d.]+)/))) out.os = "Android " + m[1];
    else if ((m = ua.match(/(iPhone|iPad|iPod).*? OS ([\d_]+)/))) out.os = (m[1] === "iPad" ? "iPadOS " : "iOS ") + m[2].replace(/_/g, ".");
    else if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) out.os = "iPadOS";
    else if ((m = ua.match(/Mac OS X ([\d_.]+)/))) out.os = "macOS " + m[1].replace(/_/g, ".");
    else if ((m = ua.match(/Windows NT ([\d.]+)/))) out.os = "Windows " + ({ "10.0": "10/11", "6.3": "8.1", "6.2": "8", "6.1": "7" }[m[1]] || m[1]);
    else if (/CrOS/.test(ua)) out.os = "ChromeOS";
    else if (/Linux/.test(ua)) out.os = "Linux";

    const tests = [
        [/YaBrowser\/([\d.]+)/, "Яндекс Браузер"], [/SamsungBrowser\/([\d.]+)/, "Samsung Internet"],
        [/Edg(?:A|iOS)?\/([\d.]+)/, "Edge"], [/OPR\/([\d.]+)/, "Opera"], [/Firefox\/([\d.]+)/, "Firefox"],
        [/FxiOS\/([\d.]+)/, "Firefox"], [/CriOS\/([\d.]+)/, "Chrome"], [/Chrome\/([\d.]+)/, "Chrome"],
        [/Version\/([\d.]+).*Safari/, "Safari"]
    ];
    for (const [re, name] of tests) {
        if ((m = ua.match(re))) { out.browser = name + " " + m[1].split(".").slice(0, 2).join("."); break; }
    }
    out.device = /iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? "планшет"
        : /Mobi|iPhone|Android/.test(ua) ? "телефон" : "компьютер";
    return out;
}

async function supportCollectDevice() {
    const ua = navigator.userAgent || "";
    const p = supportParseUa(ua);
    const appScript = document.querySelector('script[src*="/pwa/app.js"]');
    const version = appScript ? (appScript.getAttribute("src").split("v=")[1] || "") : "";
    const standalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    const d = {
        "Устройство": p.device,
        "Система": p.os,
        "Браузер": p.browser,
        "Экран": screen.width + "×" + screen.height + " (×" + (window.devicePixelRatio || 1) + ")",
        "Окно": window.innerWidth + "×" + window.innerHeight,
        "Установлено как приложение": standalone ? "да" : "нет",
        "Уведомления": "Notification" in window ? ({ granted: "разрешены", denied: "запрещены", default: "не спрашивали" }[Notification.permission] || Notification.permission) : "не поддерживаются",
        "Service worker": navigator.serviceWorker && navigator.serviceWorker.controller ? "работает" : "нет",
        "Сеть": navigator.onLine ? "есть" : "нет",
        "Версия приложения": version,
        "Экран приложения": supportFromScreen || "",
        "Язык": navigator.language || "",
        "Часовой пояс": (Intl.DateTimeFormat().resolvedOptions().timeZone || ""),
        "Время на устройстве": new Date().toLocaleString("ru-RU"),
        "User-Agent": ua
    };
    // модель телефона (Chrome на Android сообщает её по запросу)
    try {
        if (navigator.userAgentData && navigator.userAgentData.getHighEntropyValues) {
            const h = await navigator.userAgentData.getHighEntropyValues(["model", "platformVersion"]);
            if (h.model) d["Модель"] = h.model;
            if (h.platformVersion && /Windows/.test(p.os)) d["Система"] = Number(h.platformVersion.split(".")[0]) >= 13 ? "Windows 11" : "Windows 10";
        }
    } catch (e) { /* не поддерживается */ }
    if (SUPPORT_ERRORS.length) d["Последние ошибки"] = SUPPORT_ERRORS.slice();
    return d;
}

/* ===================== Картинки ===================== */

const SUPPORT_MAX_FILES = 5;
const SUPPORT_MAX_BYTES = 1.9 * 1024 * 1024;

function supportIsMobile() {
    return /Mobi|Android|iPhone|iPad/.test(navigator.userAgent) || navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent);
}

/* Картинку уменьшаем и сохраняем в JPEG: скриншоты телефона весят 1–5 МБ, нам хватает 1600 px */
async function supportCompress(source) {
    const draw = (w, h, q, maxSide) => {
        const k = Math.min(1, maxSide / Math.max(w, h));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * k);
        canvas.height = Math.round(h * k);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
        return new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", q));
    };
    const w = source.naturalWidth || source.videoWidth || source.width;
    const h = source.naturalHeight || source.videoHeight || source.height;
    let blob = await draw(w, h, 0.82, 1600);
    if (blob && blob.size > SUPPORT_MAX_BYTES) blob = await draw(w, h, 0.7, 1280);
    if (blob && blob.size > SUPPORT_MAX_BYTES) blob = await draw(w, h, 0.6, 1024);
    return blob;
}

function supportLoadImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 1000); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Не удалось открыть картинку")); };
        img.src = url;
    });
}

async function supportUpload(blob) {
    const res = await fetch("/api/helpdesk/attachments", {
        method: "POST",
        headers: { "Authorization": "Bearer " + localStorage.getItem("jwt"), "Content-Type": "image/jpeg" },
        body: blob
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.success) throw new Error(data.message || "Не удалось загрузить картинку");
    return data.id;
}

/* Снимок экрана на компьютере: браузер спросит, что снять (окно, вкладку, экран) */
async function supportCaptureScreen() {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    try {
        const video = document.createElement("video");
        video.srcObject = stream;
        video.muted = true;
        await video.play();
        await new Promise(r => setTimeout(r, 300));
        return await supportCompress(video);
    } finally {
        stream.getTracks().forEach(t => t.stop());
    }
}

/* Картинка с сервера: только с токеном, поэтому через blob */
const supportBlobCache = {};
async function supportImageUrl(id) {
    if (supportBlobCache[id]) return supportBlobCache[id];
    const res = await fetch("/api/helpdesk/attachments/" + encodeURIComponent(id), {
        headers: { "Authorization": "Bearer " + localStorage.getItem("jwt") }
    });
    if (!res.ok) throw new Error("HTTP " + res.status);
    supportBlobCache[id] = URL.createObjectURL(await res.blob());
    return supportBlobCache[id];
}

function supportFillImages(root) {
    root.querySelectorAll("img[data-att]").forEach(img => {
        supportImageUrl(img.dataset.att)
            .then(url => { img.src = url; })
            .catch(() => { img.alt = "Картинка недоступна"; img.classList.add("broken"); });
    });
}

function supportOpenImage(id) {
    supportImageUrl(id).then(url => {
        const ov = document.createElement("div");
        ov.className = "support-viewer";
        ov.innerHTML = `<img src="${escapeHtml(url)}" alt="Картинка из обращения">
            <button type="button" class="icon-btn support-viewer-close" aria-label="Закрыть">${iconSvg("M6 6l12 12 M18 6L6 18")}</button>`;
        ov.addEventListener("click", () => ov.remove());
        document.body.appendChild(ov);
    }).catch(() => alert("Картинка недоступна"));
}

/* Блок «вложения» для формы: выбор, снимок экрана, превью, удаление */
function supportAttachBlock(state, prefix) {
    const desktopShot = !supportIsMobile() && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia;
    return `
        <div class="support-attach" id="${prefix}Attach">
            <div class="support-thumbs" id="${prefix}Thumbs"></div>
            <div class="support-attach-actions">
                <label class="btn-secondary support-attach-btn">
                    ${iconSvg("M21 12.5l-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8L13.4 4.5a3.7 3.7 0 0 1 5.2 5.2l-8.7 8.7a1.8 1.8 0 0 1-2.6-2.6l8-8", "btn-ico")}
                    Приложить картинку
                    <input type="file" accept="image/*" multiple hidden onchange="supportPickFiles(this, '${prefix}')">
                </label>
                ${desktopShot ? `<button type="button" class="btn-secondary" onclick="supportShot('${prefix}')">${iconSvg("M4 7h3l2-3h6l2 3h3v13H4z M12 17a4 4 0 1 0 0-8a4 4 0 0 0 0 8z", "btn-ico")}Снимок экрана</button>` : ""}
            </div>
            ${supportIsMobile() ? `<div class="support-hint">Скриншот: сделайте его кнопками телефона, затем «Приложить картинку».</div>` : ""}
        </div>`;
}

/* состояние вложений по форме: prefix → [{id?, url, uploading, error}] */
const supportFiles = {};

function supportRenderThumbs(prefix) {
    const box = document.getElementById(prefix + "Thumbs");
    if (!box) return;
    const list = supportFiles[prefix] || [];
    box.innerHTML = list.map((f, i) => `
        <div class="support-thumb${f.uploading ? " loading" : ""}${f.error ? " failed" : ""}">
            <img src="${escapeHtml(f.url)}" alt="">
            ${f.uploading ? `<span class="support-thumb-state">Загрузка…</span>` : ""}
            ${f.error ? `<span class="support-thumb-state">${escapeHtml(f.error)}</span>` : ""}
            <button type="button" class="support-thumb-del" aria-label="Убрать картинку" onclick="supportRemoveFile('${prefix}', ${i})">×</button>
        </div>`).join("");
}

function supportRemoveFile(prefix, i) {
    const list = supportFiles[prefix] || [];
    const [f] = list.splice(i, 1);
    if (f && f.url) URL.revokeObjectURL(f.url);
    supportRenderThumbs(prefix);
}

async function supportAddBlob(prefix, blob) {
    const list = supportFiles[prefix] = supportFiles[prefix] || [];
    if (list.length >= SUPPORT_MAX_FILES) { alert("Можно приложить не больше " + SUPPORT_MAX_FILES + " картинок"); return; }
    const item = { url: URL.createObjectURL(blob), uploading: true };
    list.push(item);
    supportRenderThumbs(prefix);
    try {
        item.id = await supportUpload(blob);
    } catch (e) {
        item.error = e.message;
    }
    item.uploading = false;
    supportRenderThumbs(prefix);
}

async function supportPickFiles(input, prefix) {
    const files = Array.from(input.files || []);
    input.value = "";
    for (const file of files) {
        try {
            const blob = await supportCompress(await supportLoadImage(file));
            if (blob) await supportAddBlob(prefix, blob);
        } catch (e) {
            alert(e.message || "Не удалось приложить картинку");
        }
    }
}

async function supportShot(prefix) {
    try {
        const blob = await supportCaptureScreen();
        if (blob) await supportAddBlob(prefix, blob);
    } catch (e) {
        if (e && e.name !== "NotAllowedError") alert("Не удалось сделать снимок экрана");
    }
}

function supportReadyIds(prefix) {
    const list = supportFiles[prefix] || [];
    if (list.some(f => f.uploading)) return null;            // ещё грузятся
    return list.filter(f => f.id).map(f => f.id);
}

function supportClearFiles(prefix) {
    (supportFiles[prefix] || []).forEach(f => f.url && URL.revokeObjectURL(f.url));
    supportFiles[prefix] = [];
}

/* ===================== Запросы ===================== */

async function supportApi(path, options) {
    const opts = Object.assign({ headers: {} }, options || {});
    opts.headers = Object.assign({ "Authorization": "Bearer " + localStorage.getItem("jwt") }, opts.headers);
    if (opts.json !== undefined) {
        opts.method = opts.method || "POST";
        opts.headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(opts.json);
        delete opts.json;
    }
    const res = await fetch("/api/helpdesk" + path, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.success === false) {
        const err = new Error(data.message || (res.status === 404 ? "Обращение не найдено" : "Ошибка связи с сервером"));
        err.status = res.status;
        throw err;
    }
    return data;
}

/* ===================== Непрочитанное ===================== */

let supportUnread = { user: 0, admin: 0, open: 0 };

async function supportRefreshUnread() {
    if (!localStorage.getItem("jwt")) return;
    try {
        const d = await supportApi("/unread");
        supportUnread = { user: d.user || 0, admin: d.admin || 0, open: d.open || 0 };
    } catch (e) { return; }
    const btn = document.querySelector('.header-actions .icon-btn[aria-label="Справка"]');
    if (btn) btn.classList.toggle("has-dot", supportUnread.user > 0 || supportUnread.admin > 0);
    document.querySelectorAll("[data-support-count]").forEach(el => {
        const kind = el.dataset.supportCount;
        const n = supportUnread[kind] || 0;
        el.textContent = n ? String(n) : "";
        el.hidden = !n;
    });
}
setInterval(() => { if (document.visibilityState === "visible") supportRefreshUnread(); }, 2 * 60 * 1000);

/* ===================== Общие куски разметки ===================== */

const SUPPORT_STATUS = { open: "Открыто", closed: "Закрыто" };

function supportWhen(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return sameDay ? d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
        : d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function supportTicketCard(t, admin) {
    const unread = admin ? t.admin_unread > 0 : t.user_unread > 0;
    const who = admin ? `<span class="support-card-who">${escapeHtml(t.user_name || t.user_id)}${t.user_role ? " · " + escapeHtml(t.user_role) : ""}</span>` : "";
    return `
        <button type="button" class="support-card${unread ? " unread" : ""}" onclick="openSupportTicket(${Number(t.id)}, ${admin ? "true" : "false"})">
            <span class="support-card-top">
                <span class="support-card-no">№${Number(t.id)}</span>
                <span class="support-chip ${t.status === "closed" ? "closed" : "open"}">${SUPPORT_STATUS[t.status] || escapeHtml(t.status)}</span>
                ${unread ? `<span class="support-chip new">${admin ? "Новое" : "Новый ответ"}</span>` : ""}
                <span class="support-card-time">${escapeHtml(supportWhen(t.updated_at))}</span>
            </span>
            <span class="support-card-subject">${escapeHtml(t.subject)}</span>
            ${who}
            <span class="support-card-last">${t.last_author === "admin" ? "Поддержка: " : ""}${escapeHtml((t.last_body || "Картинка").slice(0, 140))}</span>
        </button>`;
}

/* ===================== Пользователь: список ===================== */

registerScreen("support", async function () {
    supportFromScreen = window.lastWorkScreen || "главная";
    window.currentScreen = "support";
    window.screenBack = null;
    title.innerText = "Поддержка";

    container.innerHTML = `
        <div class="support-page">
            <button type="button" class="btn-wide" onclick="openSupportNew()">${iconSvg("M12 5v14 M5 12h14")}Новое обращение</button>
            <div class="support-note">Опишите проблему — администратор ответит здесь же. Ответ придёт уведомлением.</div>
            <div id="supportList" class="support-list"><div class="report-status">Загрузка…</div></div>
        </div>`;

    try {
        const d = await supportApi("/tickets");
        const box = document.getElementById("supportList");
        if (!box) return;
        box.innerHTML = d.tickets.length
            ? d.tickets.map(t => supportTicketCard(t, false)).join("")
            : `<div class="report-status">Обращений пока нет</div>`;
    } catch (e) {
        const box = document.getElementById("supportList");
        if (box) box.innerHTML = `<div class="report-status">${escapeHtml(e.message)}</div>`;
    }
    supportRefreshUnread();
});

/* ===================== Пользователь: новое обращение ===================== */

async function openSupportNew() {
    window.currentScreen = "support_new";
    window.screenBack = () => openScreen("support");
    title.innerText = "Новое обращение";
    supportClearFiles("sn");

    const device = await supportCollectDevice();
    window.supportDeviceDraft = device;
    const rows = Object.entries(device).filter(([k]) => k !== "User-Agent" && k !== "Последние ошибки")
        .map(([k, v]) => `<div><span>${escapeHtml(k)}</span><b>${escapeHtml(Array.isArray(v) ? v.join("; ") : v)}</b></div>`).join("");

    container.innerHTML = `
        <div class="support-page">
            <label class="field">
                <span class="field-label">Что случилось?</span>
                <textarea id="snText" rows="6" maxlength="4000" placeholder="Например: не открывается отчёт «Продажи» — крутится загрузка и ничего не происходит"></textarea>
            </label>
            ${supportAttachBlock(null, "sn")}
            <details class="support-device">
                <summary>Что отправится автоматически</summary>
                <div class="support-device-rows">${rows}
                    ${device["Последние ошибки"] ? `<div><span>Последние ошибки</span><b>${device["Последние ошибки"].length}</b></div>` : ""}
                </div>
                <div class="support-hint">Это поможет быстрее найти причину. Личных данных и паролей здесь нет.</div>
            </details>
            <div id="snError" class="login-error" role="alert"></div>
            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="openScreen('support')">Отмена</button>
                <button type="button" class="btn-primary-wide" id="snSend" onclick="supportSendNew()">Отправить</button>
            </div>
        </div>`;
    document.getElementById("snText").focus();
}

async function supportSendNew() {
    const text = (document.getElementById("snText").value || "").trim();
    const err = document.getElementById("snError");
    const ids = supportReadyIds("sn");
    if (ids === null) { err.textContent = "Дождитесь загрузки картинок"; return; }
    if (!text && !ids.length) { err.textContent = "Опишите, что случилось, или приложите картинку"; return; }
    const btn = document.getElementById("snSend");
    btn.disabled = true;
    err.textContent = "";
    try {
        const d = await supportApi("/tickets", { json: { text, attachments: ids, device: window.supportDeviceDraft || await supportCollectDevice() } });
        supportClearFiles("sn");
        openSupportTicket(d.ticket.id, false);
    } catch (e) {
        err.textContent = e.message;
        btn.disabled = false;
    }
}

/* ===================== Переписка (пользователь и админ) ===================== */

let supportPollTimer = null;
let supportOpenId = null;

let supportOpenAdmin = false;

async function openSupportTicket(id, admin) {
    supportOpenAdmin = Boolean(admin);
    window.currentScreen = "support_ticket";
    window.screenBack = () => (admin ? openScreen("support_admin") : openScreen("support"));
    supportOpenId = Number(id);
    title.innerText = "Обращение №" + Number(id);
    supportClearFiles("st");
    container.innerHTML = `<div class="report-status">Загрузка…</div>`;
    await supportLoadTicket(admin, true);

    clearInterval(supportPollTimer);
    supportPollTimer = setInterval(() => {
        if (window.currentScreen !== "support_ticket" || supportOpenId !== Number(id)) { clearInterval(supportPollTimer); return; }
        if (document.visibilityState === "visible") supportLoadTicket(admin, false);
    }, 15000);
}

let supportShownCount = "";

async function supportLoadTicket(admin, first) {
    const id = supportOpenId;
    let d;
    try {
        d = await supportApi("/tickets/" + id);
    } catch (e) {
        if (first) container.innerHTML = `<div class="report-status">${escapeHtml(e.message)}</div>`;
        return;
    }
    if (window.currentScreen !== "support_ticket" || supportOpenId !== id) return;
    const viewerIsAdmin = admin && d.ticket.user_id !== (currentUser && currentUser.user_id);

    // при опросе перерисовываем только если пришло новое или сменился статус
    const sig = d.messages.length + ":" + d.ticket.status;
    if (!first && sig === supportShownCount) return;
    supportShownCount = sig;
    supportRenderTicket(d, viewerIsAdmin, first, admin);
    supportApi("/tickets/" + id + "/read", { method: "POST" }).then(supportRefreshUnread).catch(() => null);
}

/* viewerIsAdmin — админ в чужом обращении (его сообщения — «ответ поддержки»);
   adminView — открыто из «Обращений в поддержку»: сведения об устройстве и «Закрыть» — даже в своём */
function supportRenderTicket(d, viewerIsAdmin, first, adminView) {
    const t = d.ticket;
    const mineSide = viewerIsAdmin ? "admin" : "user";
    const draft = document.getElementById("stText") ? document.getElementById("stText").value : "";

    const msgs = d.messages.map(m => {
        const mine = m.author === mineSide;
        const who = m.author === "admin" ? (viewerIsAdmin ? "Вы" : "Поддержка") : (viewerIsAdmin ? (m.author_name || "Пользователь") : "Вы");
        const imgs = (m.attachments || []).map(a =>
            `<button type="button" class="support-img" onclick="supportOpenImage(${jsArg(a.id)})"><img data-att="${escapeHtml(a.id)}" alt="Картинка"></button>`).join("");
        return `
            <div class="support-msg ${mine ? "mine" : "theirs"}${m.author === "admin" ? " from-admin" : ""}">
                <div class="support-msg-who">${escapeHtml(who)} · ${escapeHtml(supportWhen(m.created_at))}</div>
                ${m.body ? `<div class="support-msg-text">${escapeHtml(m.body).replace(/\n/g, "<br>")}</div>` : ""}
                ${imgs ? `<div class="support-msg-imgs">${imgs}</div>` : ""}
            </div>`;
    }).join("");

    const deviceRows = Object.entries(t.device || {})
        .map(([k, v]) => `<div><span>${escapeHtml(k)}</span><b>${escapeHtml(Array.isArray(v) ? v.join("\n") : v)}</b></div>`).join("");

    const head = adminView ? `
        <div class="support-ticket-head">
            <div class="support-ticket-user">${escapeHtml(t.user_name || t.user_id)}${t.user_role ? ` <span>${escapeHtml(t.user_role)}</span>` : ""}</div>
            <div class="support-ticket-subject">${escapeHtml(t.subject)}</div>
            <div class="support-ticket-meta">
                <span class="support-chip ${t.status === "closed" ? "closed" : "open"}">${SUPPORT_STATUS[t.status] || ""}</span>
                <span>создано ${escapeHtml(supportWhen(t.created_at))}</span>
            </div>
            <details class="support-device"${first ? "" : " open"}>
                <summary>Устройство и приложение</summary>
                <div class="support-device-rows">${deviceRows || "<div><span>Нет сведений</span></div>"}</div>
            </details>
            <button type="button" class="btn-secondary" onclick="supportSetStatus('${t.status === "closed" ? "open" : "closed"}', true)">
                ${t.status === "closed" ? "Открыть снова" : "Закрыть обращение"}
            </button>
        </div>` : `
        <div class="support-ticket-head">
            <div class="support-ticket-subject">${escapeHtml(t.subject)}</div>
            <div class="support-ticket-meta"><span class="support-chip ${t.status === "closed" ? "closed" : "open"}">${SUPPORT_STATUS[t.status] || ""}</span></div>
            ${t.status === "closed" ? "" : `<button type="button" class="btn-secondary" onclick="supportCloseMine()">${iconSvg("M5 12l5 5 9-10", "btn-ico")}Вопрос решён — закрыть</button>`}
        </div>`;

    container.innerHTML = `
        <div class="support-page support-chat-page">
            ${head}
            <div class="support-msgs" id="supportMsgs">${msgs}</div>
            ${t.status === "closed" && !adminView ? `<div class="support-note">Обращение закрыто. Если вопрос остался — напишите, и оно откроется снова.</div>` : ""}
            <div class="support-compose">
                <textarea id="stText" rows="2" maxlength="4000" placeholder="${viewerIsAdmin ? "Ответ пользователю" : "Сообщение в поддержку"}"></textarea>
                ${supportAttachBlock(null, "st")}
                <div id="stError" class="login-error" role="alert"></div>
                <button type="button" class="btn-wide" id="stSend" onclick="supportSendMessage(${viewerIsAdmin ? "true" : "false"})">${iconSvg("M4 12l16-8-6 16-3-7z", "btn-ico")}Отправить</button>
            </div>
        </div>`;
    document.getElementById("stText").value = draft;
    supportRenderThumbs("st");
    supportFillImages(container);
    const box = document.getElementById("supportMsgs");
    const last = box && box.lastElementChild;
    if (last) last.scrollIntoView({ block: "end" });
}

async function supportSendMessage(viewerIsAdmin) {
    const input = document.getElementById("stText");
    const err = document.getElementById("stError");
    const text = (input.value || "").trim();
    const ids = supportReadyIds("st");
    if (ids === null) { err.textContent = "Дождитесь загрузки картинок"; return; }
    if (!text && !ids.length) { err.textContent = "Пустое сообщение"; return; }
    const btn = document.getElementById("stSend");
    btn.disabled = true;
    err.textContent = "";
    try {
        const d = await supportApi("/tickets/" + supportOpenId + "/messages", { json: { text, attachments: ids } });
        input.value = "";
        supportClearFiles("st");
        supportShownCount = d.messages.length + ":" + d.ticket.status;
        supportRenderTicket(d, viewerIsAdmin, false, supportOpenAdmin);
    } catch (e) {
        err.textContent = e.message;
        btn.disabled = false;
    }
}

/* пользователь сам закрывает своё обращение */
function supportCloseMine() {
    if (!confirm("Закрыть обращение? Если вопрос вернётся — просто напишите в него, и оно откроется снова.")) return;
    supportSetStatus("closed", false);
}

async function supportSetStatus(status, admin) {
    try {
        await supportApi("/tickets/" + supportOpenId + "/status", { json: { status } });
        supportShownCount = "";
        await supportLoadTicket(supportOpenAdmin, true);
    } catch (e) {
        alert(e.message);
    }
}

/* ===================== Админ: все обращения ===================== */

let supportAdminFilter = "open";

registerScreen("support_admin", async function () {
    window.currentScreen = "support_admin";
    window.screenBack = () => openAdminPanel();
    title.innerText = "Обращения в поддержку";

    const chip = (key, label) => `<button type="button" class="period-btn${supportAdminFilter === key ? " active" : ""}" onclick="supportAdminFilter='${key}';openScreen('support_admin')">${label}</button>`;
    container.innerHTML = `
        <div class="support-page">
            <div class="period-buttons">${chip("open", "Открытые")}${chip("closed", "Закрытые")}${chip("all", "Все")}</div>
            <div id="supportAdminList" class="support-list"><div class="report-status">Загрузка…</div></div>
        </div>`;
    try {
        const d = await supportApi("/admin/tickets?status=" + supportAdminFilter);
        const box = document.getElementById("supportAdminList");
        if (!box) return;
        box.innerHTML = d.tickets.length
            ? d.tickets.map(t => supportTicketCard(t, true)).join("")
            : `<div class="report-status">${supportAdminFilter === "open" ? "Открытых обращений нет" : "Обращений нет"}</div>`;
    } catch (e) {
        const box = document.getElementById("supportAdminList");
        if (box) box.innerHTML = `<div class="report-status">${escapeHtml(e.message)}</div>`;
    }
    supportRefreshUnread();
});

/* ===================== Переход из уведомления: /pwa/?support=N ===================== */

function supportOpenFromUrl() {
    const params = new URLSearchParams(location.search);
    const id = Number(params.get("support"));
    if (!id || !localStorage.getItem("jwt")) return false;
    params.delete("support");
    const rest = params.toString();
    history.replaceState(null, "", location.pathname + (rest ? "?" + rest : "") + location.hash);
    const admin = typeof currentUser !== "undefined" && currentUser && currentUser.role === "admin";
    openSupportTicket(id, admin);
    return true;
}

/* после входа: непрочитанное и, если пришли из уведомления, — нужное обращение */
function supportAfterLogin() {
    supportRefreshUnread();
    supportOpenFromUrl();
}
