/*
 * «Что нового»: после обновления один раз показываем, что появилось (2–6 строк).
 * Новая запись — сверху WHATSNEW, id должен быть новым. Просмотренное — localStorage «whatsnew_seen»
 * (переживает выход из приложения). Повторно — «Настройки» → «Что нового».
 */

const WHATSNEW = [
    {
        id: "2026-11-22",
        date: "22 ноября",
        items: [
            ["M15 6l-6 6 6 6", "«Назад» возвращает на предыдущий экран, а не в меню — и в шапке, и жестом телефона."],
            ["M12 11v3 M8 6a6 6 0 0 1 10 4.5V13 M5 11a7 7 0 0 1 1-3.6 M9 18.5a10 10 0 0 0 1-5.5v-2a2 2 0 0 1 4 0v1", "Вход по отпечатку или лицу: создайте ключ доступа — «Настройки» (шестерёнка вверху) → «Вход и защита»."],
            ["M12 3v12 M8 7l4-4 4 4 M5 11v9h14v-9", "Кнопка «Отправить» у каждого файла — сразу в Telegram, WhatsApp или почту."],
            ["M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z", "Светлая тема — «Настройки» → «Оформление»."],
            ["M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", "Вместо «Справки» вверху — «Настройки» (шестерёнка): устройства, вход, оформление и справка."],
            ["M7 2h10v20H7z M11 18h2", "«Мои устройства»: где выполнен вход, выйти на чужом устройстве."],
            ["M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z M15 9a4 4 0 0 1 0 6", "Важные объявления — полосой вверху главной."]
        ]
    }
];

function whatsNewShow(entry) {
    const e = entry || WHATSNEW[0];
    if (!e) return;
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "whatsNewOverlay";
    overlay.addEventListener("click", ev => { if (ev.target === overlay) overlay.remove(); });
    overlay.innerHTML = `
        <div class="modal-window" role="dialog" aria-label="Что нового">
            <h3>Что нового <span class="wn-date">${escapeHtml(e.date)}</span></h3>
            <ol class="install-steps">
                ${e.items.map(([d, text]) => `<li><span class="install-step-icon">${iconSvg(d)}</span><span>${escapeHtml(text)}</span></li>`).join("")}
            </ol>
            <div class="modal-actions">
                <button type="button" class="btn-primary-wide" onclick="this.closest('.modal-overlay').remove()">Понятно</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);
}

/* на главной: если есть непросмотренная запись — показать один раз */
function whatsNewCheck() {
    const latest = WHATSNEW[0];
    if (!latest || !localStorage.getItem("jwt")) return;
    if (localStorage.getItem("whatsnew_seen") === latest.id) return;
    if (document.querySelector(".modal-overlay, .lock-screen")) return;     // не поверх другого окна
    localStorage.setItem("whatsnew_seen", latest.id);
    whatsNewShow(latest);
}

function whatsNewHelpButtonHtml() {
    return `<button type="button" class="btn-secondary help-install" onclick="whatsNewShow()">${iconSvg("M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z", "btn-ico")}Что нового</button>`;
}
