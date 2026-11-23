/*
 * Инструкции к экранам: кнопка «?» в шапке → лист снизу с коротким видео и шагами.
 *
 * Как добавить инструкцию:
 *   1. ключ — имя экрана (window.currentScreen, как в openScreen('…'));
 *   2. видео — help/<имя>.mp4 (H.264, без звука), картинка до загрузки — help/<имя>.jpg;
 *      ролики делает tools/help_videos.py на тестовых данных;
 *   3. шаги — коротко, по одному действию в строке.
 * Видео загружается только при открытии окна.
 */

const HELP_TOPICS = {

    orders: {
        title: "Заказы",
        steps: [
            "Нажмите «Получить заказы».",
            "Выберите день — «Вчера», «Сегодня» или «Завтра», при необходимости — менеджера.",
            "Нажмите «Получить». Список придёт из 1С, обычно за несколько секунд.",
            "Нажмите на заказ, чтобы открыть его состав.",
            "«Сменить вид» — компактный список: заказ раскрывается прямо в нём."
        ]
    },

    sales: {
        title: "Продажи",
        steps: [
            "Нажмите «Получить продажи».",
            "Выберите период: «Сегодня», «Неделя», «Месяц» или свои даты.",
            "При необходимости выберите контрагента или менеджера и нажмите «Получить».",
            "Сверху — итог за период. Нажмите на менеджера, чтобы увидеть продажи по клиентам.",
            "Кнопка ↻ показывает последний полученный отчёт без нового запроса в 1С."
        ]
    },

    debt: {
        title: "Дебиторка",
        steps: [
            "Нажмите «Получить дебиторку» и выберите дату.",
            "«Показать на экране» — отчёт сразу на экране; «Получить файлом» — файл придёт в «Файлы».",
            "Поиск сверху находит клиента по части названия.",
            "В строке клиента — долг, просрочка и дни; документы видны под клиентом.",
            "У заблокированного клиента есть кнопка «Снять с блока» — она отправляет заявку на разблокировку."
        ]
    },

    bills: {
        title: "Счета",
        steps: [
            "Укажите период или оставьте даты пустыми — тогда придут все неоплаченные счета.",
            "Выберите контрагента.",
            "Нажмите «Получить счета».",
            "Когда 1С подготовит файлы, они появятся в «Истории» и в разделе «Файлы»."
        ]
    },

    act: {
        title: "Акт сверки",
        steps: [
            "Выберите контрагента.",
            "Укажите период: «Период с» и «Период по».",
            "Отметьте «По ИНН», если акт нужен по ИНН, а не по одному контрагенту.",
            "Нажмите «Получить акт сверки». Файл появится в «Истории» и в разделе «Файлы»."
        ]
    },

    upd: {
        title: "УПД",
        steps: [
            "Укажите период или оставьте даты пустыми — тогда придут все неоплаченные накладные.",
            "Выберите контрагента.",
            "Нажмите «Получить УПД».",
            "Файлы появятся в «Истории» и в разделе «Файлы»."
        ]
    },

    pricelist: {
        title: "Прайс",
        steps: [
            "Выберите контрагента — прайс будет с его ценами.",
            "Проверьте дату (по умолчанию — сегодня).",
            "«Получить прайс» — таблица; «Получить прайс в PDF» — для отправки клиенту.",
            "Файл появится в «Истории» и в разделе «Файлы»."
        ]
    },

    prices: {
        title: "Цены",
        steps: [
            "Выберите контрагента и номенклатуру или введите часть названия в «Поиск».",
            "Отметьте «Наличные», если нужны цены для оплаты наличными.",
            "Нажмите «Получить цены».",
            "Цены появятся в блоке «Результат», предыдущие запросы — ниже.",
            "Нажмите на блок с ценами — откроется готовый ответ клиенту: поправьте текст и нажмите «Поделиться»."
        ]
    }
};

function helpTopic(screen) {
    return screen && Object.prototype.hasOwnProperty.call(HELP_TOPICS, screen) ? HELP_TOPICS[screen] : null;
}

function openHelp(screen) {
    const key = screen || window.currentScreen;
    const topic = helpTopic(key);
    if (!topic) return;

    closeHelp();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "helpOverlay";
    overlay.addEventListener("click", e => { if (e.target === overlay) closeHelp(); });

    const steps = topic.steps.map(s => `<li>${escapeHtml(s)}</li>`).join("");

    overlay.innerHTML = `
        <div class="modal-window help-window" role="dialog" aria-label="${escapeHtml("Как пользоваться: " + topic.title)}">
            <h3>Как пользоваться: ${escapeHtml(topic.title)}</h3>
            <div class="help-video-box">
                <video class="help-video"
                       src="/pwa/help/${encodeURIComponent(key)}.mp4?v=3"
                       poster="/pwa/help/${encodeURIComponent(key)}.jpg?v=3"
                       autoplay muted loop playsinline preload="metadata"></video>
            </div>
            <ol class="help-steps">${steps}</ol>
            <div class="modal-actions">
                <button type="button" class="btn-primary-wide" onclick="closeHelp()">Понятно</button>
            </div>
        </div>`;

    document.body.appendChild(overlay);

    // если видео не загрузилось — оставляем только шаги
    const video = overlay.querySelector("video");
    video.addEventListener("error", () => {
        const box = overlay.querySelector(".help-video-box");
        if (box) box.remove();
    });
    const playing = video.play();
    if (playing && playing.catch) playing.catch(() => null);
}

function closeHelp() {
    const overlay = document.getElementById("helpOverlay");
    if (!overlay) return;
    const video = overlay.querySelector("video");
    if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();            // освобождаем загрузку
    }
    overlay.remove();
}

document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeHelp();
});

// help.js загружается после app.js — обновим шапку для уже открытого экрана
if (typeof syncHeaderMode === "function") syncHeaderMode();
