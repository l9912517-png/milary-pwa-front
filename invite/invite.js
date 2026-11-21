/*
 * Приглашения и вход по коду.
 *
 *  - Ссылка https://…/pwa/?invite=КОД (из админки или по кнопке в 1С) входит без токена, один раз, 24 часа.
 *  - Внутри Telegram / WhatsApp ссылку не используем: там отдельный браузер, вход в нём не попадёт
 *    ни в Chrome, ни в приложение. Просим открыть ссылку в браузере.
 *  - iPhone: у приложения с экрана «Домой» своё хранилище — вход из Safari туда не переходит.
 *    После входа по ссылке показываем шаги установки и код из 6 цифр, который вводится в приложении.
 *  - Код из 6 цифр можно получить и в «Справке» → «Войти на другом устройстве».
 *  - Админ: в карточке пользователя кнопка «Пригласить» — ссылка, QR, «Поделиться», отзыв.
 */

function inviteDeviceText() {
    const d = typeof supportParseUa === "function" ? supportParseUa(navigator.userAgent || "") : {};
    const parts = [d.os, d.browser, d.device, installIsStandalone() ? "приложение" : "браузер"].filter(Boolean);
    return parts.join(" · ").slice(0, 200);
}

function inviteIsIosBrowser() {
    return installPlatform().ios && !installIsStandalone();
}

/* Вызывается при запуске до проверки входа. true — экран уже показан. */
async function inviteHandleStartup() {
    const params = new URLSearchParams(location.search);
    const code = params.get("invite");
    if (!code) return false;

    if (installPlatform().inApp) {
        inviteShowOpenInBrowser();
        return true;
    }

    history.replaceState(null, "", location.pathname);     // код одноразовый — из адреса убираем
    showLogin();
    inviteLoginBusy(true);

    let data = null;
    try {
        const r = await fetch("/api/invite/redeem", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code, device: inviteDeviceText() })
        });
        data = await r.json().catch(() => null);
    } catch (e) {
        data = { success: false, message: "Нет связи с сервером. Откройте ссылку ещё раз" };
    }
    inviteLoginBusy(false);

    if (!data || !data.success) {
        showLoginError((data && data.message) || "Не удалось войти по ссылке");
        return true;
    }

    localStorage.clear();                                   // вход другого человека на этом телефоне — с чистого листа
    localStorage.setItem("jwt", data.jwt);
    localStorage.setItem("user", JSON.stringify(data.user));

    if (inviteIsIosBrowser()) {
        currentUser = data.user;
        inviteShowIosNext();
        return true;
    }
    await validateToken(data.jwt);
    return true;
}

function inviteLoginBusy(on) {
    const btn = document.querySelector(".login-submit");
    const hint = document.querySelector(".login-hint");
    if (btn) { btn.disabled = on; btn.textContent = on ? "Входим по приглашению…" : "Войти"; }
    if (hint && on) hint.textContent = "Проверяем ссылку-приглашение";
}

/* Ссылка открыта внутри мессенджера */
function inviteShowOpenInBrowser() {
    showLogin();
    const p = installPlatform();
    const browser = p.ios ? "Safari" : "Chrome";
    const form = document.querySelector(".login-form");
    if (!form) return;
    form.outerHTML = `
        <div class="login-form invite-box">
            <div>
                <div class="login-title">Откройте ссылку в ${browser}</div>
                <div class="login-hint">Сейчас она открыта внутри мессенджера — отсюда приложение не установить, и вход здесь не сохранится.</div>
            </div>
            <ol class="install-steps">
                <li><span class="install-step-icon">${iconSvg(INSTALL_ICON_DOTS)}</span><span>Нажмите ⋯ или ⋮ в углу этого окна.</span></li>
                <li><span class="install-step-icon">${iconSvg("M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6")}</span><span>Выберите «Открыть в ${browser}» или «Открыть в браузере».</span></li>
            </ol>
            <div class="login-hint">Если такого пункта нет — скопируйте ссылку и вставьте её в адресную строку ${browser}.</div>
            <button type="button" class="login-submit" onclick="copyText(location.href, 'Ссылка скопирована. Вставьте её в ${browser}')">Скопировать ссылку</button>
        </div>`;
}

/* iPhone, Safari: вошли — дальше установка и код для приложения */
async function inviteShowIosNext() {
    hideTopBar();
    document.body.classList.add("is-login");
    container.innerHTML = `
        <div class="login-hero">
            ${GRAPES_SVG}
            <span class="brand-name">Milary</span>
            <span class="brand-tagline">Вы вошли как ${escapeHtml(currentUser.name)}</span>
            ${SWOOSH_SVG}
        </div>
        <div class="login-form invite-box">
            <div>
                <div class="login-title">Установите приложение</div>
                <div class="login-hint">На iPhone приложение с экрана «Домой» не видит вход из Safari — в нём нужно будет один раз ввести код.</div>
            </div>
            <ol class="install-steps">
                <li><span class="install-step-icon">${iconSvg(INSTALL_ICON_SHARE)}</span><span>Нажмите «Поделиться» — квадрат со стрелкой внизу экрана.</span></li>
                <li><span class="install-step-icon">${iconSvg(INSTALL_ICON_PLUS)}</span><span>Выберите «На экран „Домой“» и нажмите «Добавить».</span></li>
                <li><span class="install-step-icon">${iconSvg("M5 12l5 5 9-10")}</span><span>Откройте MILARY со значка и введите код:</span></li>
            </ol>
            <div id="transferBox" class="transfer-box"><div class="transfer-code">······</div></div>
            <button type="button" class="btn-secondary" onclick="inviteContinueInBrowser()">Продолжить в браузере</button>
        </div>`;
    await transferLoad(document.getElementById("transferBox"));
}

async function inviteContinueInBrowser() {
    const jwt = localStorage.getItem("jwt");
    if (jwt) await validateToken(jwt); else showLogin();
}

/* ---------- код для входа на другом устройстве ---------- */

let transferTimer = null;

async function transferLoad(box) {
    if (!box) return;
    clearInterval(transferTimer);
    box.innerHTML = `<div class="transfer-code">······</div><div class="transfer-sub">Получаем код…</div>`;
    let data = null;
    try {
        const r = await fetch("/api/login/transfer-code", {
            method: "POST",
            headers: { "Authorization": "Bearer " + localStorage.getItem("jwt") }
        });
        data = await r.json().catch(() => null);
    } catch (e) { data = null; }

    if (!data || !data.success) {
        box.innerHTML = `<div class="transfer-sub">${escapeHtml((data && data.message) || "Не удалось получить код. Проверьте связь")}</div>
            <button type="button" class="btn-secondary" onclick="transferLoad(this.parentNode)">Ещё раз</button>`;
        return;
    }
    const until = new Date(data.expires_at).getTime();
    box.innerHTML = `
        <div class="transfer-code" aria-label="Код ${escapeHtml(data.code.split("").join(" "))}">${escapeHtml(data.code.slice(0, 3))}<span> </span>${escapeHtml(data.code.slice(3))}</div>
        <div class="transfer-sub" data-left></div>
        <button type="button" class="btn-secondary" onclick="transferLoad(this.parentNode)">Новый код</button>`;
    const left = box.querySelector("[data-left]");
    const tick = () => {
        const s = Math.max(0, Math.round((until - Date.now()) / 1000));
        if (!document.body.contains(box)) return clearInterval(transferTimer);
        left.textContent = s > 0
            ? `Действует ещё ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}, подходит один раз`
            : "Срок кода истёк — нажмите «Новый код»";
        if (!s) { clearInterval(transferTimer); box.querySelector(".transfer-code").classList.add("is-expired"); }
    };
    tick();
    transferTimer = setInterval(tick, 1000);
}

/* «Справка» → «Войти на другом устройстве» */
function transferShow() {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
    overlay.innerHTML = `
        <div class="modal-window" role="dialog" aria-label="Вход на другом устройстве">
            <h3>Вход на другом устройстве</h3>
            <div class="transfer-sub">На другом телефоне или в установленном приложении откройте экран входа и введите этот код вместо токена.</div>
            <div class="transfer-box"></div>
            <div class="modal-actions">
                <button type="button" class="btn-primary-wide" onclick="this.closest('.modal-overlay').remove()">Готово</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
    transferLoad(overlay.querySelector(".transfer-box"));
}

function transferHelpButtonHtml() {
    return `<button type="button" class="btn-secondary help-install" onclick="transferShow()">${iconSvg("M7 2h10v20H7z M11 18h2", "btn-ico")}Войти на другом устройстве</button>`;
}

/* ---------- админ: пригласить пользователя ---------- */

function inviteFmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) + " в " +
        d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

async function inviteApi(path, method) {
    const r = await fetch(path, { method: method || "GET", headers: { "Authorization": "Bearer " + localStorage.getItem("jwt") } });
    const data = await r.json().catch(() => null);
    if (!r.ok || !data || !data.success) throw new Error((data && data.message) || "Ошибка " + r.status);
    return data;
}

function inviteStatusText(s) {
    const src = s.source === "1c" ? " (из 1С)" : "";
    switch (s.state) {
        case "active": return `Есть действующая ссылка${src}, до ${inviteFmtDate(s.expires_at)}. Новая ссылка заменит её.`;
        case "used": return `Последнюю ссылку открыли ${inviteFmtDate(s.used_at)}` + (s.used_device ? ` — ${s.used_device}` : "") + ".";
        case "expired": return `Последняя ссылка истекла ${inviteFmtDate(s.expires_at)}, ею не воспользовались.`;
        case "revoked": return "Последняя ссылка отозвана.";
        default: return "Приглашений ещё не было.";
    }
}

async function inviteUser(id, name) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "inviteOverlay";
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
    overlay.innerHTML = `
        <div class="modal-window" role="dialog" aria-label="Приглашение">
            <h3>Пригласить: ${escapeHtml(name)}</h3>
            <div class="invite-body"><div class="transfer-sub">Загрузка…</div></div>
        </div>`;
    document.body.appendChild(overlay);
    const body = overlay.querySelector(".invite-body");

    let st = { state: "none" };
    try { st = await inviteApi(`/api/admin/users/${Number(id)}/invite`); } catch (e) { /* покажем без состояния */ }

    body.innerHTML = `
        <div class="transfer-sub">Сотрудник откроет ссылку или наведёт камеру на QR-код — и сразу войдёт, без токена.
            Ссылка действует 24 часа и открывается один раз.</div>
        <div class="invite-status">${escapeHtml(inviteStatusText(st))}</div>
        <div class="modal-actions">
            ${st.state === "active" ? `<button type="button" class="btn-secondary" onclick="inviteRevoke(${Number(id)}, this)">Отозвать</button>` : `<button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Отмена</button>`}
            <button type="button" class="btn-primary-wide" onclick="inviteCreate(${Number(id)}, ${jsArg(name)})">${st.state === "active" ? "Новая ссылка" : "Создать ссылку"}</button>
        </div>`;
}

async function inviteRevoke(id, btn) {
    btn.disabled = true;
    try {
        await inviteApi(`/api/admin/users/${Number(id)}/invite/revoke`, "POST");
        const st = document.querySelector("#inviteOverlay .invite-status");
        if (st) st.textContent = "Ссылка отозвана — открыть её уже нельзя.";
        btn.remove();
    } catch (e) {
        btn.disabled = false;
        alert(e.message);
    }
}

async function inviteCreate(id, name) {
    const body = document.querySelector("#inviteOverlay .invite-body");
    if (!body) return;
    body.innerHTML = `<div class="transfer-sub">Создаём ссылку…</div>`;
    let d;
    try {
        d = await inviteApi(`/api/admin/users/${Number(id)}/invite`, "POST");
    } catch (e) {
        body.innerHTML = `<div class="transfer-sub">${escapeHtml(e.message)}</div>`;
        return;
    }
    const text = `Вход в MILARY для: ${name}. Откройте ссылку на телефоне — она действует до ${inviteFmtDate(d.expires_at)} и открывается один раз.`;
    body.innerHTML = `
        <img class="invite-qr" src="${escapeHtml(d.qr)}" alt="QR-код приглашения" width="240" height="240">
        <div class="invite-until">Действует до ${escapeHtml(inviteFmtDate(d.expires_at))}, один раз</div>
        <input class="invite-link" value="${escapeHtml(d.url)}" readonly onclick="this.select()">
        <div class="modal-actions">
            <button type="button" class="btn-secondary" onclick="copyText(${jsArg(d.url)}, 'Ссылка скопирована')">Копировать</button>
            ${navigator.share ? `<button type="button" class="btn-primary-wide" onclick="inviteShare(${jsArg(text)}, ${jsArg(d.url)})">Поделиться</button>` : `<button type="button" class="btn-primary-wide" onclick="this.closest('.modal-overlay').remove()">Готово</button>`}
        </div>`;
}

async function inviteShare(text, url) {
    try { await navigator.share({ title: "MILARY", text, url }); } catch (e) { /* отменили */ }
}
