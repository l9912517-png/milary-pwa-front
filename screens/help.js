registerScreen("help", function () {

    window.currentScreen = "help";
    title.innerText = "Справка";

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px;padding:10px;">

            <!-- ===== СОДЕРЖАНИЕ ===== -->
            <div class="menu-item" style="flex-direction:column;align-items:flex-start;">
                <b>Содержание</b>

                <div onclick="scrollHelp('about')">Что это такое</div>
                <div onclick="scrollHelp('install')">Как установить</div>
                <div onclick="scrollHelp('push')">Уведомления</div>
                <div onclick="scrollHelp('usage')">Как пользоваться</div>
                <div onclick="scrollHelp('problems')">Проблемы</div>
            </div>

            <!-- ===== ЧТО ЭТО ===== -->
            <div id="about" class="menu-item" style="flex-direction:column;align-items:flex-start;">
                <b>Что это такое</b>
                <div>
                    PWA (Progressive Web App) — это приложение, которое работает через браузер,
                    но выглядит как обычное установленное приложение.
                    <br><br>
                    • работает как приложение  
                    • устанавливается на экран  
                    • поддерживает уведомления  
                </div>
            </div>

            <!-- ===== УСТАНОВКА ===== -->
            <div id="install" class="menu-item" style="flex-direction:column;align-items:flex-start;">
                <b>Как установить</b>

                <div style="margin-top:6px;">
                    <b>Android:</b><br>
                    Chrome → ⋮ → "Добавить на экран"
                </div>

                <div style="margin-top:6px;">
                    <b>iPhone:</b><br>
                    Safari → Поделиться → "На экран Домой"
                </div>

                <div style="margin-top:6px;">
                    <b>Компьютер:</b><br>
                    Кнопка "Установить" в браузере
                </div>
            </div>

            <!-- ===== PUSH ===== -->
            <div id="push" class="menu-item" style="flex-direction:column;align-items:flex-start;">
                <b>Уведомления</b>

                <div>
                    При первом входе нажмите "Разрешить".
                </div>

                <div style="margin-top:6px;color:#b00;">
                    Если нажали "Запретить" — включается только вручную.
                </div>

                <div style="margin-top:6px;">
                    <b>iPhone:</b><br>
                    Настройки → Уведомления → выбрать приложение
                </div>

                <div style="margin-top:6px;">
                    <b>Важно:</b><br>
                    На iPhone уведомления работают только после установки на экран.
                </div>
            </div>

            <!-- ===== USAGE ===== -->
            <div id="usage" class="menu-item" style="flex-direction:column;align-items:flex-start;">
                <b>Как пользоваться</b>

                <div>
                    • Файлы — отчёты<br>
                    • Сообщения — уведомления<br>
                    • Отчёты — формирование данных
                </div>

                <div style="margin-top:6px;color:#555;">
                    Если данных нет — значит отчет еще формируется
                </div>
            </div>

            <!-- ===== ПРОБЛЕМЫ ===== -->
            <div id="problems" class="menu-item" style="flex-direction:column;align-items:flex-start;">
                <b>Проблемы</b>

                <div>
                    Нет уведомлений → проверьте разрешения<br>
                    Не работает → обновите страницу<br>
                    Нет данных → подождите
                </div>
            </div>

            <button onclick="showMenu()" style="background:#ccc;color:#000;">
                Назад
            </button>

        </div>
    `;
});

function scrollHelp(id) {
    const el = document.getElementById(id);
    if (el) {
        el.scrollIntoView({ behavior: "smooth" });
    }
}