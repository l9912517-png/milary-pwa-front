/*
 * Установка приложения на телефон / компьютер.
 *
 *  - Chrome, Edge, Яндекс Браузер на Android и компьютере: браузер присылает событие beforeinstallprompt —
 *    показываем свою кнопку «Установить», по нажатию — системное окно установки;
 *  - iPhone / iPad: сайт не может запустить установку — показываем шаги «Поделиться → На экран „Домой“»;
 *  - браузер внутри Telegram, WhatsApp и т. п. установку не умеет — подсказываем открыть ссылку в Chrome / Safari;
 *  - уже установлено (окно без адресной строки) — ничего не показываем.
 *
 * Карточка на главной; «Не сейчас» — снова через 7 дней. В «Настройках» — кнопка «Установить приложение».
 * На iPhone карточка «Включите уведомления» появляется только после установки (раньше они там не работают).
 */

const INSTALL_PROMPT_KEY = "install_prompt_dismissed";
const INSTALL_PROMPT_PAUSE = 7 * 86400000;

let installDeferred = null;          // событие beforeinstallprompt, пока им не воспользовались

function installIsStandalone() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
}

function installPlatform() {
    const ua = navigator.userAgent || "";
    const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const inApp = /Telegram|WhatsApp|Instagram|FBAN|FBAV|Line\/|VKClient|; wv\)/.test(ua);
    const android = /Android/.test(ua);
    const mobile = ios || android || /Mobi/.test(ua);
    return { ios, android, inApp, mobile };
}

/* что можем предложить: 'prompt' — системное окно, 'ios' — шаги для iPhone, 'inapp' — открыть в браузере,
   'android-menu' — через меню браузера, null — нечего (уже установлено или браузер не умеет) */
function installMode() {
    if (installIsStandalone()) return null;
    const p = installPlatform();
    if (p.inApp) return "inapp";
    if (installDeferred) return "prompt";
    if (p.ios) return "ios";
    if (p.android) return "android-menu";
    return null;
}

window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();                 // своё окно не показываем сразу — только по кнопке
    installDeferred = e;
    // если главная уже открыта — добавим карточку
    if (window.currentScreen === "menu" && !document.getElementById("installPrompt")) {
        const html = installPromptHtml();
        if (html) {
            const push = document.getElementById("pushPrompt");      // по одной карточке: установка важнее
            if (push) push.remove();
            container.insertAdjacentHTML("afterbegin", html);
        }
    }
});

window.addEventListener("appinstalled", () => {
    installDeferred = null;
    installRemoveCard();
});

function installPromptHtml() {
    const mode = installMode();
    if (!mode) return "";
    const dismissed = Number(localStorage.getItem(INSTALL_PROMPT_KEY) || 0);
    if (dismissed && Date.now() - dismissed < INSTALL_PROMPT_PAUSE) return "";
    if (mode === "android-menu") return "";      // без события — только через «Справку», чтобы не путать

    const p = installPlatform();
    const where = p.mobile ? "на телефон" : "на компьютер";
    const sub = mode === "inapp"
        ? "Ссылка открыта внутри мессенджера — откройте её в " + (p.ios ? "Safari" : "Chrome") + ", чтобы установить"
        : "Будет открываться с рабочего стола, как обычное приложение" + (p.ios ? ", и сможет присылать уведомления" : "");
    const main = mode === "prompt" ? "Установить" : mode === "ios" ? "Как установить" : "Как открыть";

    return `
        <div class="push-prompt install-prompt" id="installPrompt">
            <span class="push-prompt-icon">${iconSvg("M12 3v12 M7 10l5 5 5-5 M5 21h14")}</span>
            <span class="push-prompt-text">
                <span class="push-prompt-title">Установите MILARY ${where}</span>
                <span class="push-prompt-sub">${escapeHtml(sub)}</span>
            </span>
            <span class="push-prompt-actions">
                <button type="button" onclick="installStart()">${main}</button>
                <button type="button" class="btn-secondary" onclick="installDismiss()">Не сейчас</button>
            </span>
        </div>`;
}

function installDismiss() {
    localStorage.setItem(INSTALL_PROMPT_KEY, String(Date.now()));
    installRemoveCard();
}

/* убрать карточку установки; на её место — карточка уведомлений, если она нужна */
function installRemoveCard() {
    const card = document.getElementById("installPrompt");
    if (!card) return;
    card.remove();
    if (window.currentScreen === "menu" && !document.getElementById("pushPrompt") && typeof homePromptsHtml === "function") {
        const html = homePromptsHtml();
        if (html) container.insertAdjacentHTML("afterbegin", html);
    }
}

async function installStart() {
    const mode = installMode();
    if (mode === "prompt" && installDeferred) {
        const ev = installDeferred;
        installDeferred = null;              // событие одноразовое
        try {
            ev.prompt();
            const choice = await ev.userChoice;
            if (choice && choice.outcome === "accepted") installRemoveCard();
        } catch (e) {
            installShowSteps("android-menu");
        }
        return;
    }
    if (!mode) {
        alert(installIsStandalone() ? "Приложение уже установлено и открыто." :
            "Этот браузер не умеет устанавливать приложения. Откройте MILARY в Chrome, Edge или Safari.");
        return;
    }
    installShowSteps(mode);
}

const INSTALL_ICON_SHARE = "M12 3v12 M8 7l4-4 4 4 M5 11v9h14v-9";
const INSTALL_ICON_PLUS = "M4 4h16v16H4z M12 8v8 M8 12h8";
const INSTALL_ICON_DOTS = "M12 5h.01 M12 12h.01 M12 19h.01";

function installShowSteps(mode) {
    const p = installPlatform();
    let title = "Как установить";
    let steps = [];
    if (mode === "ios") {
        title = "Установка на iPhone";
        steps = [
            [INSTALL_ICON_SHARE, "Нажмите «Поделиться» — квадрат со стрелкой вверх внизу экрана Safari (на iPad — вверху)."],
            [INSTALL_ICON_PLUS, "Пролистайте список и выберите «На экран „Домой“»."],
            ["M5 12l5 5 9-10", "Нажмите «Добавить». Значок MILARY появится на экране — открывайте приложение с него."],
            ["M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9", "Откройте MILARY со значка и включите уведомления на главной."]
        ];
    } else if (mode === "inapp") {
        title = "Откройте в браузере";
        steps = [
            [INSTALL_ICON_DOTS, "Нажмите ⋯ или ⋮ в углу этого окна мессенджера."],
            ["M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6", "Выберите «Открыть в " + (p.ios ? "Safari" : "Chrome") + "» (или «Открыть в браузере»)."],
            [INSTALL_ICON_PLUS, "В браузере войдите и установите приложение — на главной появится кнопка «Установить»."]
        ];
    } else {
        title = "Установка на Android";
        steps = [
            [INSTALL_ICON_DOTS, "Нажмите ⋮ в правом верхнем углу Chrome."],
            [INSTALL_ICON_PLUS, "Выберите «Установить приложение» или «Добавить на главный экран»."],
            ["M5 12l5 5 9-10", "Подтвердите. Значок MILARY появится на рабочем столе."]
        ];
    }

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "installOverlay";
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
    overlay.innerHTML = `
        <div class="modal-window" role="dialog" aria-label="${escapeHtml(title)}">
            <h3>${escapeHtml(title)}</h3>
            <ol class="install-steps">
                ${steps.map(([d, text]) => `<li><span class="install-step-icon">${iconSvg(d)}</span><span>${escapeHtml(text)}</span></li>`).join("")}
            </ol>
            <div class="modal-actions">
                <button type="button" class="btn-primary-wide" onclick="this.closest('.modal-overlay').remove()">Понятно</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
}

/* кнопка в «Настройках» */
function installHelpButtonHtml() {
    if (installIsStandalone()) {
        return `<div class="help-installed">${iconSvg("M5 12l5 5 9-10", "btn-ico")}Приложение установлено</div>`;
    }
    return `<button type="button" class="btn-secondary help-install" onclick="installStart()">${iconSvg("M12 3v12 M7 10l5 5 5-5 M5 21h14", "btn-ico")}Установить приложение</button>`;
}
