registerScreen("help", function () {

    window.currentScreen = "help";
    title.innerText = "Справка";

    container.innerHTML = `
        <div class="help-page">

            <button type="button" class="btn-wide help-support" onclick="openScreen('support')">
                ${iconSvg("M21 15a4 4 0 0 1-4 4H8l-5 3V5a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z")}
                Поддержка <span class="count-badge dark" data-support-count="user" hidden></span>
            </button>

            ${typeof installHelpButtonHtml === "function" ? installHelpButtonHtml() : ""}

            ${typeof devicesHelpButtonHtml === "function" ? devicesHelpButtonHtml() : ""}

            ${typeof themePickerHtml === "function" ? themePickerHtml() : ""}

            <nav class="help-card help-toc" aria-label="Содержание">
                <h2>Содержание</h2>
                <button type="button" onclick="scrollHelp('about')">Что это такое</button>
                <button type="button" onclick="scrollHelp('install')">Как установить</button>
                <button type="button" onclick="scrollHelp('push')">Уведомления</button>
                <button type="button" onclick="scrollHelp('usage')">Как пользоваться</button>
                <button type="button" onclick="scrollHelp('problems')">Проблемы</button>
            </nav>

            <section id="about" class="help-card">
                <h2>Что это такое</h2>
                <p>MILARY — корпоративное приложение. Оно открывается в браузере,
                   но выглядит и работает как обычное приложение:</p>
                <ul>
                    <li>устанавливается на экран телефона или компьютера;</li>
                    <li>присылает уведомления;</li>
                    <li>показывает отчёты из 1С.</li>
                </ul>
            </section>

            <section id="install" class="help-card">
                <h2>Как установить</h2>
                <p>Проще всего — кнопка «Установить приложение» вверху этой страницы.</p>
                <p><b>Android:</b> Chrome → ⋮ → «Установить приложение» или «Добавить на главный экран».</p>
                <p><b>iPhone:</b> Safari → «Поделиться» → «На экран “Домой”».</p>
                <p><b>Компьютер:</b> кнопка «Установить» в адресной строке Chrome или Edge.</p>
                <p>Если ссылка открылась внутри Telegram или WhatsApp — сначала откройте её в браузере.</p>
            </section>

            <section id="push" class="help-card">
                <h2>Уведомления</h2>
                <p>На главной нажмите «Включить» в карточке «Включите уведомления», затем «Разрешить» в окне браузера.</p>
                <p class="help-warn">Если нажали «Запретить», включить можно только вручную в настройках браузера.</p>
                <p><b>iPhone:</b> Настройки → Уведомления → MILARY.
                   Уведомления на iPhone работают только после установки на экран «Домой».</p>
            </section>

            <section id="usage" class="help-card">
                <h2>Как пользоваться</h2>
                <ul>
                    <li><b>Главная</b> — меню отчётов;</li>
                    <li><b>Файлы</b> — готовые файлы и документы;</li>
                    <li><b>Сообщения</b> — уведомления.</li>
                </ul>
                <p class="help-muted">Если данных нет, отчёт ещё формируется — подождите.</p>
            </section>

            <section id="problems" class="help-card">
                <h2>Проблемы</h2>
                <ul>
                    <li>Нет уведомлений — проверьте разрешения.</li>
                    <li>Что-то не работает — обновите страницу.</li>
                    <li>Нет данных — подождите и нажмите «Обновить».</li>
                </ul>
            </section>

        </div>
    `;

    // число непрочитанных ответов на кнопке «Поддержка»
    if (typeof supportRefreshUnread === "function") supportRefreshUnread();
});

function scrollHelp(id) {
    const el = document.getElementById(id);
    if (el) {
        el.scrollIntoView({ behavior: "smooth" });
    }
}
