"use strict";

/*
 * Есть ли в выбранной подсказке DaData номер дома.
 * Адрес без дома нельзя сравнить с другими клиентами (проверка дублей).
 */
function suggestionHasHouse(selected, value) {
    if (selected && selected.data && selected.data.house) return true;
    return /(?:^|[\s,])(?:д|дом|влд|владение|двлд|зд|здание|к|корп|стр|с)\.?\s*\d/i
        .test(String(value || ""));
}

const ADDRESS_NO_HOUSE_HTML = `
    <div style="margin-top:12px;padding:10px;border-radius:8px;background:#fde8e8;color:#a00000;">
        В адресе не указан номер дома. Продолжите ввод адреса и выберите в подсказках вариант с номером дома.
    </div>
`;

registerScreen("developments", async function () {

    title.innerText = "Разработки";

    const jwt = localStorage.getItem("jwt");

    container.innerHTML = `
        <div id="developmentsScreen"
             style="
                padding:10px;
                max-width:100%;
                box-sizing:border-box;
             ">
            <div id="developmentsContent">
                Загрузка...
            </div>
        </div>
    `;

    const content = document.getElementById("developmentsContent");

    let developments = [];
    let searchTimer = null;

    // =========================================================
    // API
    // =========================================================

    async function api(url, options = {}) {

        const token = localStorage.getItem("jwt");

        if (!token) {
            throw new Error("Сессия пользователя отсутствует");
        }

        const headers = {
            "Authorization": "Bearer " + token
        };

        if (options.body !== undefined) {
            headers["Content-Type"] = "application/json";
        }

        const response = await fetch(url, {
            ...options,
            headers
        });

        if (response.status === 401) {
            throw new Error("Сессия истекла. Войдите в систему заново.");
        }

        let data = null;

        try {
            data = await response.json();
        } catch (_) {
            data = null;
        }

        if (!response.ok) {

            throw new Error(
                data?.error ||
                data?.message ||
                `Ошибка запроса: ${response.status}`
            );
        }

        return data;
    }


    // =========================================================
    // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
    // =========================================================

    function esc(value) {

        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }


    function date(value) {

        if (!value) {
            return "—";
        }

        const d = new Date(value);

        if (Number.isNaN(d.getTime())) {
            return esc(value);
        }

        return d.toLocaleDateString("ru-RU");
    }


    function dateTime(value) {

        if (!value) {
            return "—";
        }

        const d = new Date(value);

        if (Number.isNaN(d.getTime())) {
            return esc(value);
        }

        return d.toLocaleString("ru-RU");
    }
    
    function dateOnly(value) {
    if (!value) return "не указана";

    const date = new Date(value);

    if (isNaN(date.getTime())) {
        return String(value).slice(0, 10);
    }

    return date.toLocaleDateString("ru-RU");
}


function daysLeft(expiresAt) {

    if (!expiresAt) {
        return null;
    }

    const end = new Date(expiresAt);

    if (Number.isNaN(end.getTime())) {
        return null;
    }

    const now = new Date();

    // Считаем именно календарные дни
    const today = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
    );

    const endDate = new Date(
        end.getFullYear(),
        end.getMonth(),
        end.getDate()
    );

    const diff =
        endDate.getTime() -
        today.getTime();

    return Math.max(
        0,
        Math.ceil(diff / 86400000)
    );
}
    
    function statusBadge(status) {

    const statuses = {
        active: {
            text: "В работе",
            background: "#e8f5e9",
            color: "#2e7d32"
        },

        contract_request: {
            text: "Заявка на договор",
            background: "#fff3e0",
            color: "#e65100"
        },

        closed: {
            text: "Закрыта",
            background: "#eeeeee",
            color: "#616161"
        },

        expired: {
            text: "Истекла",
            background: "#ffebee",
            color: "#c62828"
        },

        converted: {
            text: "Клиент заведён",
            background: "#e3f2fd",
            color: "#1565c0"
        }
    };

    const item = statuses[status] || {
        text: status || "Неизвестно",
        background: "#eeeeee",
        color: "#555"
    };

    return `
        <span style="
            display:inline-block;
            padding:6px 10px;
            border-radius:999px;
            background:${item.background};
            color:${item.color};
            font-size:13px;
            font-weight:700;
            white-space:nowrap;
        ">
            ${esc(item.text)}
        </span>
    `;
}


    function statusInfo(status) {

        switch (status) {

            case "active":
                return {
                    title: "В работе",
                    color: "#187a35",
                    background: "#e7f7eb"
                };

            case "contract_request":
                return {
                    title: "Заявка на договор",
                    color: "#856404",
                    background: "#fff3cd"
                };

            case "closed":
                return {
                    title: "Закрыта",
                    color: "#555",
                    background: "#eeeeee"
                };

            case "expired":
                return {
                    title: "Истекла",
                    color: "#a32020",
                    background: "#fde8e8"
                };

            case "converted":
                return {
                    title: "Клиент заведён",
                    color: "#1565c0",
                    background: "#e3f2fd"
                };

            default:
                return {
                    title: status || "Неизвестно",
                    color: "#555",
                    background: "#eeeeee"
                };
        }
    }


    function statusBadge(status) {

        const s = statusInfo(status);

        return `
            <span style="
                display:inline-block;
                padding:5px 9px;
                border-radius:20px;
                background:${s.background};
                color:${s.color};
                font-size:12px;
                font-weight:700;
                white-space:nowrap;
            ">
                ${esc(s.title)}
            </span>
        `;
    }


    function backButton(text = "← Назад") {

        return `
            <button
                id="devBackButton"
                type="button"
                style="
                    width:100%;
                    margin-bottom:12px;
                    padding:10px;
                    border:0;
                    border-radius:10px;
                    background:#ddd;
                    color:#222;
                    font-size:15px;
                    cursor:pointer;
                "
            >
                ${text}
            </button>
        `;
    }


    // =========================================================
    // ЗАГРУЗКА МОИХ РАЗРАБОТОК
    // =========================================================

 async function loadDevelopments() {

    content.innerHTML = `
        <div style="
            padding:20px;
            text-align:center;
            color:#777;
        ">
            Загрузка разработок...
        </div>
    `;

    try {

        const data =
            await api("/api/developments");

        /*
         * Сервер всегда является источником актуального
         * состояния разработок.
         */

        if (Array.isArray(data?.developments)) {

            developments =
                data.developments;

        } else if (Array.isArray(data)) {

            developments =
                data;

        } else {

            developments = [];
        }


        /*
         * После получения свежих данных
         * полностью перерисовываем список.
         */

        renderMain();

        // Пришли из каталога по кнопке «Взять в разработку»: сразу открываем форму создания
        if (window.__cateringPick) {
            const pick = window.__cateringPick;
            window.__cateringPick = null;
            renderCreate(null, pick);
        }


    } catch (error) {

        console.error(
            "Ошибка загрузки разработок:",
            error
        );


        content.innerHTML = `
            <div style="
                padding:15px;
                border-radius:10px;
                background:#fde8e8;
                color:#b00000;
            ">
                ${esc(
                    error.message ||
                    "Не удалось загрузить разработки."
                )}
            </div>

            <button
                id="devRetry"
                type="button"
                style="
                    width:100%;
                    margin-top:10px;
                    padding:10px;
                    border:0;
                    border-radius:10px;
                    background:#ddd;
                    cursor:pointer;
                "
            >
                Повторить
            </button>

            <button
                id="devBackError"
                type="button"
                style="
                    width:100%;
                    margin-top:10px;
                    padding:10px;
                    border:0;
                    border-radius:10px;
                    background:#ccc;
                    cursor:pointer;
                "
            >
                ← Назад
            </button>
        `;


        document
            .getElementById("devRetry")
            ?.addEventListener(
                "click",
                loadDevelopments
            );


        document
            .getElementById("devBackError")
            ?.addEventListener(
                "click",
                showMenu
            );
    }
}


    // =========================================================
    // ГЛАВНАЯ СТРАНИЦА
    // =========================================================

function renderMain() {

    content.innerHTML = `

        <button
            id="devCatalog"
            type="button"
            style="
                width:100%;
                margin-bottom:10px;
                padding:11px;
                border:1px solid #90caf9;
                border-radius:10px;
                background:#e3f2fd;
                color:#0d47a1;
                font-size:15px;
                font-weight:600;
                cursor:pointer;
            "
        >
            🍽 Каталог заведений Москвы
        </button>

        ${window.CHK && CHK.canCheck() ? `
        <button
            id="devInnCheck"
            type="button"
            style="
                width:100%;
                margin-bottom:10px;
                padding:11px;
                border:1px solid #a5d6a7;
                border-radius:10px;
                background:#e8f5e9;
                color:#1b5e20;
                font-size:15px;
                font-weight:600;
                cursor:pointer;
            "
        >
            🔎 Проверить контрагента по ИНН
        </button>` : ""}

        <div style="
            display:flex;
            gap:8px;
            margin-bottom:12px;
        ">

            <input
                id="devSearch"
                type="search"
                placeholder="Поиск ресторана, организации или ИНН"
                autocomplete="off"
                style="
                    flex:1;
                    min-width:0;
                    padding:11px;
                    border:1px solid #ccc;
                    border-radius:10px;
                    font-size:15px;
                    box-sizing:border-box;
                "
            >

            <button
                id="devCreate"
                type="button"
                style="
                    padding:10px 13px;
                    border:0;
                    border-radius:10px;
                    background:#4caf50;
                    color:#fff;
                    font-weight:600;
                    cursor:pointer;
                    white-space:nowrap;
                "
            >
                + Создать
            </button>

        </div>

        <div id="devSearchResults"></div>

        <div style="
            margin-top:20px;
            margin-bottom:10px;
            font-size:18px;
            font-weight:700;
        ">
            Мои разработки
        </div>

        <div id="devList">
            ${renderDevelopmentCards()}
        </div>

        <button
            id="devMainBack"
            type="button"
            style="
                width:100%;
                margin-top:15px;
                padding:10px;
                border:0;
                border-radius:10px;
                background:#ddd;
                color:#222;
            "
        >
            ← Назад
        </button>

    `;


    /* =========================================================
       ПЛАВАЮЩАЯ КНОПКА ЦЕНТРА УВЕДОМЛЕНИЙ
       ========================================================= */

    const oldEventsButton =
        document.getElementById("devEventsFloatingButton");

    if (oldEventsButton) {
        oldEventsButton.remove();
    }


    const eventsButton =
        document.createElement("button");

    eventsButton.id =
        "devEventsFloatingButton";

    eventsButton.type =
        "button";

    eventsButton.innerHTML = "🔔";

    eventsButton.title =
        "Центр уведомлений";


    Object.assign(
        eventsButton.style,
        {
            position: "fixed",
            right: "16px",
            bottom: "72px",
            width: "56px",
            height: "56px",
            border: "0",
            borderRadius: "50%",
            background: "#35a51f",
            color: "#fff",
            fontSize: "27px",
            lineHeight: "56px",
            textAlign: "center",
            padding: "0",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(0,0,0,.25)",
            zIndex: "9990"
        }
    );


    eventsButton.addEventListener(
        "click",
        openDevelopmentEventsModal
    );


   content.appendChild(
    eventsButton
);


    /* =========================================================
       КНОПКА НАЗАД
       ========================================================= */

    const backButton =
        document.getElementById("devMainBack");

    if (backButton) {

        backButton.addEventListener(
            "click",
            showMenu
        );

    }


    /* =========================================================
       КНОПКА СОЗДАТЬ
       ========================================================= */

    document
        .getElementById("devCatalog")
        ?.addEventListener(
            "click",
            () => openScreen("catering")
        );

    document
        .getElementById("devInnCheck")
        ?.addEventListener(
            "click",
            () => openScreen("counterparty_check")
        );

    const createButton =
        document.getElementById("devCreate");

    if (createButton) {

        createButton.addEventListener(
            "click",
            () => renderCreate()
        );

    }


    /* =========================================================
       ПОИСК
       ========================================================= */

    const search =
        document.getElementById("devSearch");

    if (search) {

        search.addEventListener(
            "input",
            function () {

                clearTimeout(searchTimer);

                const q =
                    this.value.trim();

                const results =
                    document.getElementById(
                        "devSearchResults"
                    );

                if (q.length < 3) {

                    if (results) {
                        results.innerHTML = "";
                    }

                    return;
                }


                searchTimer =
                    setTimeout(
                        () => searchCounterparties(q),
                        300
                    );
            }
        );

    }


    /* =========================================================
       КАРТОЧКИ РАЗРАБОТОК
       ========================================================= */

    document
        .querySelectorAll(
            "[data-dev-id]"
        )
        .forEach(card => {

            card.addEventListener(
                "click",
                () => {

                    const id =
                        Number(
                            card.dataset.devId
                        );

                    openDevelopment(id);
                }
            );

        });


    /* =========================================================
       СВОРАЧИВАНИЕ / РАЗВОРАЧИВАНИЕ ГРУПП
       ========================================================= */

    document
        .querySelectorAll(
            "[data-dev-group-toggle]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                function (event) {

                    event.stopPropagation();

                    const title =
                        this.dataset.devGroupToggle;

                    if (!title) {
                        return;
                    }

                    const escapedTitle =
                        CSS.escape(title);

                    const groupContent =
                        document.querySelector(
                            `[data-dev-group-content="${escapedTitle}"]`
                        );

                    const arrow =
                        document.querySelector(
                            `[data-dev-group-arrow="${escapedTitle}"]`
                        );

                    if (!groupContent) {
                        return;
                    }

                    const collapsed =
                        groupContent.style.display === "none";

                    groupContent.style.display =
                        collapsed
                            ? "block"
                            : "none";

                    this.dataset.collapsed =
                        collapsed
                            ? "0"
                            : "1";

                    if (arrow) {

                        arrow.textContent =
                            collapsed
                                ? "▾"
                                : "▸";
                    }
                }
            );

        });

}

// =========================================================
// ЦЕНТР УВЕДОМЛЕНИЙ РАЗРАБОТОК
// =========================================================

async function openDevelopmentEventsModal() {

    const oldModal =
        document.getElementById(
            "devEventsModal"
        );

    if (oldModal) {
        oldModal.remove();
    }


    const modal =
        document.createElement("div");

    modal.id =
        "devEventsModal";


    Object.assign(
        modal.style,
        {
            position: "fixed",
            inset: "0",
            background: "rgba(0,0,0,.45)",
            zIndex: "10000",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            boxSizing: "border-box"
        }
    );


    modal.innerHTML = `

        <div
            id="devEventsModalWindow"
            style="
                width:100%;
                max-width:520px;
                max-height:85vh;
                background:#fff;
                border-radius:16px;
                box-shadow:0 8px 30px rgba(0,0,0,.3);
                overflow:hidden;
                display:flex;
                flex-direction:column;
            "
        >

            <div style="
                display:flex;
                align-items:center;
                justify-content:space-between;
                gap:10px;
                padding:14px 16px;
                background:#2f7d32;
                color:#fff;
            ">

                <div style="
                    font-size:18px;
                    font-weight:700;
                ">
                    🔔 Центр уведомлений
                </div>

                <button
                    id="devEventsClose"
                    type="button"
                    style="
                        width:36px;
                        height:36px;
                        border:0;
                        border-radius:50%;
                        background:rgba(255,255,255,.18);
                        color:#fff;
                        font-size:22px;
                        cursor:pointer;
                    "
                >
                    ×
                </button>

            </div>


            <div
                id="devEventsList"
                style="
                    overflow-y:auto;
                    padding:12px;
                    box-sizing:border-box;
                "
            >
                <div style="
                    padding:25px 10px;
                    text-align:center;
                    color:#777;
                ">
                    Загрузка уведомлений...
                </div>
            </div>

        </div>

    `;


    document.body.appendChild(
        modal
    );


    const closeModal =
        () => modal.remove();


    document
        .getElementById("devEventsClose")
        ?.addEventListener(
            "click",
            closeModal
        );


    modal.addEventListener(
        "click",
        function (event) {

            if (event.target === modal) {
                closeModal();
            }

        }
    );


    const escapeHandler =
        function (event) {

            if (event.key === "Escape") {

                closeModal();

                document.removeEventListener(
                    "keydown",
                    escapeHandler
                );
            }
        };


    document.addEventListener(
        "keydown",
        escapeHandler
    );


    const list =
        document.getElementById(
            "devEventsList"
        );


    try {

        const data =
            await api(
                "/api/developments/events?limit=100"
            );


        const events =
            Array.isArray(data?.events)
                ? data.events
                : [];


        if (!events.length) {

            list.innerHTML = `
                <div style="
                    padding:30px 15px;
                    text-align:center;
                    color:#777;
                ">
                    Пока нет событий по разработкам.
                </div>
            `;

            return;
        }


        const eventInfo = {

            created: {
                icon: "🟢",
                text: "Взята в разработку",
                color: "#187a35",
                background: "#eef8f0"
            },

            closed: {
                icon: "⚪",
                text: "Разработка закрыта",
                color: "#555",
                background: "#f3f3f3"
            },

            expired: {
                icon: "🔴",
                text: "Срок разработки истёк",
                color: "#a32020",
                background: "#fde8e8"
            },

            converted: {
                icon: "🔵",
                text: "Клиент заведён в 1С",
                color: "#1565c0",
                background: "#e3f2fd"
            }

        };


        list.innerHTML =
            events.map(event => {

                const info =
                    eventInfo[event.event_type] ||
                    {
                        icon: "•",
                        text: event.event_type || "Событие",
                        color: "#555",
                        background: "#f5f5f5"
                    };


                const displayName =
                    event.display_name ||
                    "Без названия";


                const address =
                    event.address ||
                    "";


                return `

                    <div style="
                        padding:12px;
                        margin-bottom:9px;
                        border:1px solid #e0e0e0;
                        border-radius:11px;
                        background:${info.background};
                    ">

                        <div style="
                            display:flex;
                            align-items:flex-start;
                            gap:8px;
                        ">

                            <div style="
                                font-size:18px;
                                line-height:1.2;
                            ">
                                ${info.icon}
                            </div>

                            <div style="
                                flex:1;
                                min-width:0;
                            ">

                                <div style="
                                    font-size:13px;
                                    color:#777;
                                    margin-bottom:4px;
                                ">
                                    ${dateTime(event.event_at)}
                                </div>

                                <div style="
                                    font-weight:700;
                                    font-size:15px;
                                    color:#222;
                                    overflow-wrap:anywhere;
                                ">
                                    ${esc(displayName)}
                                </div>

                                ${
                                    address
                                        ? `
                                            <div style="
                                                margin-top:4px;
                                                color:#666;
                                                font-size:13px;
                                                overflow-wrap:anywhere;
                                            ">
                                                ${esc(address)}
                                            </div>
                                        `
                                        : ""
                                }

                                <div style="
                                    margin-top:7px;
                                    color:${info.color};
                                    font-size:13px;
                                    font-weight:700;
                                ">
                                    ${esc(info.text)}
                                </div>

                            </div>

                        </div>

                    </div>

                `;

            }).join("");


    } catch (error) {

        console.error(
            "Ошибка загрузки центра уведомлений:",
            error
        );


        list.innerHTML = `

            <div style="
                padding:14px;
                border-radius:10px;
                background:#fde8e8;
                color:#a00000;
            ">
                ${esc(
                    error.message ||
                    "Не удалось загрузить уведомления."
                )}
            </div>

        `;

    }

}

    // =========================================================
    // КАРТОЧКИ МОИХ РАЗРАБОТОК
    // =========================================================

    function renderDevelopmentCards() {

        if (!developments.length) {

            return `
                <div style="
                    padding:15px;
                    background:#f5f5f5;
                    border-radius:10px;
                    color:#777;
                ">
                    Пока нет созданных разработок.
                    <br><br>
                    Найдите клиента выше или создайте разработку вручную.
                </div>
            `;
        }

        /*
         * Группы:
         * active            — В работе
         * contract_request  — Заявка на договор
         * closed/expired    — Закрытые и истекшие
         *
         * Порядок специально фиксированный:
         * сначала активные, затем заявка на договор,
         * затем архив.
         */

        const active = developments.filter(
            item => item.status === "active"
        );

        const contract = developments.filter(
            item => item.status === "contract_request"
        );

        const archive = developments.filter(
            item =>
                item.status === "closed" ||
                item.status === "expired" ||
                item.status === "converted"
        );

        function renderGroup(title, count, background, items, collapsed = false) {

            if (!items.length) {
                return "";
            }

            return `
                <div style="
                    width:100%;
                    box-sizing:border-box;
                    margin-top:12px;
                ">

                    <button
                        type="button"
                        data-dev-group-toggle="${esc(title)}"
                        data-collapsed="${collapsed ? "1" : "0"}"
                        style="
                            display:flex;
                            align-items:center;
                            justify-content:space-between;
                            gap:10px;
                            width:100%;
                            box-sizing:border-box;
                            padding:11px 14px;
                            border:0;
                            border-radius:12px;
                            background:${background};
                            color:#fff;
                            font-size:15px;
                            font-weight:700;
                            text-align:left;
                            cursor:pointer;
                        "
                    >
                        <span>
                            ${esc(title)}
                        </span>

                        <span style="
                            display:flex;
                            align-items:center;
                            gap:8px;
                        ">
                            <span>
                                ${count}
                            </span>

                            <span
                                data-dev-group-arrow="${esc(title)}"
                                style="
                                    display:inline-block;
                                    font-size:18px;
                                    line-height:1;
                                    transition:transform .15s ease;
                                "
                            >${collapsed ? "▸" : "▾"}</span>
                        </span>
                    </button>

                    <div
                        data-dev-group-content="${esc(title)}"
                        style="
                            width:100%;
                            box-sizing:border-box;
                            padding-top:7px;
                            display:${collapsed ? "none" : "block"};
                        "
                    >
                        ${items.map(renderCard).join("")}
                    </div>

                </div>
            `;
        }

        function renderCard(item) {

            const days =
                daysLeft(item.expires_at);

            const title =
                item.display_name ||
                item.counterparty_name ||
                item.development_name ||
                item.legal_name ||
                "Без названия";

            return `
                <div
                    data-dev-id="${Number(item.id)}"
                    style="
                        padding:14px;
                        margin-bottom:8px;
                        border:1px solid #d6d6d6;
                        border-radius:12px;
                        background:#fff;
                        cursor:pointer;
                        box-sizing:border-box;
                        overflow-wrap:anywhere;
                    "
                >

                    <div style="
                        font-size:17px;
                        font-weight:700;
                        line-height:1.3;
                    ">
                        ${esc(title)}
                    </div>

                    ${
                        item.legal_name
                            ? `
                                <div style="
                                    margin-top:7px;
                                    color:#555;
                                ">
                                    <b>Юр. лицо:</b>
                                    ${esc(item.legal_name)}
                                </div>
                            `
                            : ""
                    }

                    ${
                        item.inn
                            ? `
                                <div style="
                                    margin-top:5px;
                                    color:#555;
                                ">
                                    <b>ИНН:</b>
                                    ${esc(item.inn)}
                                </div>
                            `
                            : ""
                    }

                    ${
                        item.address
                            ? `
                                <div style="
                                    margin-top:5px;
                                    color:#555;
                                ">
                                    <b>Адрес:</b>
                                    ${esc(item.address)}
                                </div>
                            `
                            : ""
                    }

                    <div style="
                        display:flex;
                        flex-wrap:wrap;
                        gap:8px 14px;
                        margin-top:12px;
                        padding-top:10px;
                        border-top:1px solid #eee;
                        color:#777;
                        font-size:13px;
                        line-height:1.4;
                    ">

                        <span>
                            Создана:
                            <b style="color:#333;">
                                ${date(item.created_at)}
                            </b>
                        </span>

                        ${
                            item.expires_at
                                ? `
                                    <span>
                                        Срок до:
                                        <b style="color:#333;">
                                            ${date(item.expires_at)}
                                        </b>
                                    </span>
                                `
                                : ""
                        }

                        ${
                            item.status === "active" &&
                            days !== null
                                ? `
                                    <span style="
                                        font-weight:700;
                                        color:${
                                            days <= 5
                                                ? "#b00000"
                                                : "#187a35"
                                        };
                                    ">
                                        В работе
                                        Осталось дней: ${days}
                                    </span>
                                `
                                : item.status === "contract_request"
                                    ? `
                                        <span style="
                                            font-weight:700;
                                            color:#856404;
                                        ">
                                            Заявка на договор
                                        </span>
                                    `
                                    : item.status === "closed"
                                        ? `
                                            <span style="
                                                font-weight:700;
                                                color:#616161;
                                            ">
                                                Закрыта
                                            </span>
                                        `
                                        : item.status === "expired"
                                            ? `
                                                <span style="
                                                    font-weight:700;
                                                    color:#c62828;
                                                ">
                                                    Истекла
                                                </span>
                                            `
                                            : item.status === "converted"
                                                ? `
                                                    <span style="
                                                        font-weight:700;
                                                        color:#1565c0;
                                                    ">
                                                        Клиент заведён
                                                    </span>
                                                `
                                                : ""
                        }

                    </div>

                </div>
            `;
        }

        return `
            ${renderGroup(
                "В РАБОТЕ",
                active.length,
                "#2f7d32",
                active
            )}

            ${renderGroup(
                "ЗАЯВКИ НА ДОГОВОР",
                contract.length,
                "#c47f17",
                contract,
                true
            )}

            ${renderGroup(
                "ЗАКРЫТЫЕ И ИСТЕКШИЕ",
                archive.length,
                "#6b7280",
                archive,
                true
            )}
        `;
    }


    // =========================================================
    // ПОИСК КОНТРАГЕНТОВ 1С
    // =========================================================

    async function searchCounterparties(query) {

        const box =
            document.getElementById(
                "devSearchResults"
            );

        if (!box) {
            return;
        }


        box.innerHTML = `
            <div style="
                padding:10px;
                color:#777;
            ">
                Поиск...
            </div>
        `;


        try {

            const data =
                await api(
                    "/api/developments/search?q=" +
                    encodeURIComponent(query) +
                    "&limit=30"
                );


            const results =
                Array.isArray(data?.developments)
                    ? data.developments
                    : [];


            if (!results.length) {

                box.innerHTML = `
                    <div style="
                        padding:12px;
                        background:#f5f5f5;
                        border-radius:10px;
                    ">
                        <div style="
                            color:#666;
                            margin-bottom:10px;
                        ">
                            Ничего не найдено в справочнике 1С.
                        </div>

                        <button
                            id="devCreateFromSearch"
                            style="
                                padding:9px 12px;
                                border:0;
                                border-radius:8px;
                                background:#4caf50;
                                color:white;
                            "
                        >
                            Создать разработку
                        </button>
                    </div>
                `;


                document
                    .getElementById("devCreateFromSearch")
                    .addEventListener(
                        "click",
                        () => renderCreate()
                    );

                return;
            }


            box.innerHTML = `

                <div style="
                    margin-bottom:8px;
                    font-weight:700;
                ">
                    Результаты поиска
                </div>

                ${results.map(item => {

                    const hasDevelopment =
                        Boolean(item.development_id) ||
                        item.has_active_development ||
                        item.development_status === "active" ||
                        item.development_status === "contract_request" ||
                        item.development_status === "closed" ||
                        item.development_status === "expired" ||
                        item.development_status === "converted";


                    const displayAddress =
                        item.development_address ||
                        item.actual_address ||
                        item.delivery_address ||
                        "";


                    const displayTitle =
                        hasDevelopment
                            ? (
                                item.development_name ||
                                item.name ||
                                item.legal_name ||
                                "Без названия"
                            )
                            : (
                                item.name ||
                                item.legal_name ||
                                "Без названия"
                            );


                    const managerName =
                        hasDevelopment
                            ? (
                                item.development_manager_name ||
                                ""
                            )
                            : (
                                item.manager ||
                                ""
                            );


                    const managerLabel =
                        hasDevelopment
                            ? "Менеджер разработки:"
                            : "Менеджер 1С:";


                    const creationDate =
                        hasDevelopment
                            ? (
                                item.development_created_at ||
                                item.created_at ||
                                ""
                            )
                            : (
                                item.created_at ||
                                ""
                            );


                   const workingCounterparty =
    (() => {

        if (!item.last_shipment_date) {
            return false;
        }

        const shipmentDate =
            new Date(item.last_shipment_date);

        if (isNaN(shipmentDate.getTime())) {
            return false;
        }

        const today =
            new Date();

        today.setHours(
            0, 0, 0, 0
        );

        const monthAgo =
            new Date(today);

        monthAgo.setMonth(
            monthAgo.getMonth() - 1
        );

        return shipmentDate >= monthAgo;

    })();


                    return `
                        <div
                            data-counterparty-guid="${esc(item.guid)}"
                            style="
                                padding:12px;
                                margin-bottom:8px;
                                border:1px solid #ddd;
                                border-radius:10px;
                                background:#fff;
                                cursor:pointer;
                            "
                        >

                            <div style="
                                display:flex;
                                justify-content:space-between;
                                align-items:flex-start;
                                gap:10px;
                            ">

                                <strong>
                                    ${esc(displayTitle)}
                                </strong>


                                ${
                                    hasDevelopment
                                        ? `
                                            ${statusBadge(
                                                item.development_status
                                            )}
                                        `
                                        : ""
                                }

                            </div>


                            ${
                                item.legal_name
                                    ? `
                                        <div style="
                                            margin-top:6px;
                                            color:#555;
                                        ">
                                            ${esc(item.legal_name)}
                                        </div>
                                    `
                                    : ""
                            }


                            ${
                                item.inn
                                    ? `
                                        <div style="
                                            margin-top:4px;
                                            color:#777;
                                            font-size:13px;
                                        ">
                                            ИНН:
                                            ${esc(item.inn)}
                                        </div>
                                    `
                                    : ""
                            }


                            ${
                                displayAddress
                                    ? `
                                        <div style="
                                            margin-top:6px;
                                            color:#555;
                                            font-size:13px;
                                        ">
                                            <b>Адрес:</b>
                                            ${esc(displayAddress)}
                                        </div>
                                    `
                                    : ""
                            }


                            ${
                                managerName
                                    ? `
                                        <div style="
                                            margin-top:6px;
                                            color:#555;
                                            font-size:13px;
                                        ">
                                            <b>
                                                ${esc(managerLabel)}
                                            </b>
                                            ${esc(managerName)}
                                        </div>
                                    `
                                    : ""
                            }


                            ${
                                workingCounterparty
                                    ? `
                                        <div style="
                                            margin-top:7px;
                                            color:#187a35;
                                            font-size:13px;
                                            font-weight:700;
                                        ">
                                            Работающий контрагент
                                        </div>
                                    `
                                    : ""
                            }


                            ${
                                creationDate
                                    ? `
                                        <div style="
                                            margin-top:5px;
                                            color:#777;
                                            font-size:13px;
                                        ">
                                            <b>Дата создания:</b>
                                            ${date(creationDate)}
                                        </div>
                                    `
                                    : ""
                            }


                            ${
                                item.last_shipment_date
                                    ? `
                                        <div style="
                                            margin-top:5px;
                                            color:#777;
                                            font-size:13px;
                                        ">
                                            <b>
                                                Последняя поставка:
                                            </b>
                                            ${date(
                                                item.last_shipment_date
                                            )}
                                        </div>
                                    `
                                    : ""
                            }


                            ${
                                hasDevelopment &&
                                item.development_status
                                    ? `
                                        <div style="
                                            margin-top:8px;
                                        ">
                                            Разработка:
                                            ${statusBadge(
                                                item.development_status
                                            )}
                                        </div>
                                    `
                                    : ""
                            }


                            ${
                                item.debtor_status
                                    ? `
                                        <div style="
                                            margin-top:5px;
                                            color:#777;
                                            font-size:13px;
                                        ">
                                            <b>
                                                Статус должника:
                                            </b>
                                            ${esc(
                                                item.debtor_status
                                            )}
                                        </div>
                                    `
                                    : ""
                            }


                            ${
                                Number(item.blocked) === 1
                                    ? `
                                        <div style="
                                            margin-top:5px;
                                            color:#c62828;
                                            font-size:13px;
                                            font-weight:700;
                                        ">
                                            Контрагент заблокирован
                                        </div>
                                    `
                                    : ""
                            }

                        </div>
                    `;

                }).join("")}

            `;


            box
                .querySelectorAll(
                    "[data-counterparty-guid]"
                )
                .forEach(card => {

                    card.addEventListener(
                        "click",
                        () => {

                            const guid =
                                card.dataset.counterpartyGuid;


                            const item =
                                results.find(
                                    x =>
                                        String(x.guid) ===
                                        String(guid)
                                );


                            if (item) {
                                renderCounterparty(item);
                            }

                        }
                    );

                });


        } catch (error) {

            box.innerHTML = `
                <div style="
                    padding:10px;
                    border-radius:8px;
                    background:#fde8e8;
                    color:#a00000;
                ">
                    ${esc(error.message)}
                </div>
            `;

        }

    }

    // =========================================================
    // КАРТОЧКА КОНТРАГЕНТА
    // =========================================================

  function renderCounterparty(item) {

        /*
         * -------------------------------------------------
         * Существующая разработка
         * -------------------------------------------------
         */

        if (item.development_id) {

            const developmentTitle =
                item.development_name ||
                item.name ||
                item.legal_name ||
                "Без названия";


            const developmentAddress =
                item.development_address ||
                item.actual_address ||
                item.delivery_address ||
                "";


            const developmentManager =
                item.development_manager_name ||
                "";


            const developmentCreatedAt =
                item.development_created_at ||
                item.created_at ||
                "";


            content.innerHTML = `

                ${backButton("← К разработкам")}

                <div style="
                    padding:15px;
                    background:#fff;
                    border:1px solid #ddd;
                    border-radius:12px;
                ">

                    <h2 style="
                        margin-top:0;
                        margin-bottom:10px;
                    ">
                        ${esc(developmentTitle)}
                    </h2>


                    ${
                        item.development_status
                            ? `
                                <div style="
                                    margin-bottom:14px;
                                ">
                                    ${statusBadge(
                                        item.development_status
                                    )}
                                </div>
                            `
                            : ""
                    }


                    ${
                        item.legal_name
                            ? `
                                <div style="margin-top:8px;">
                                    <b>Юр. лицо:</b>
                                    ${esc(item.legal_name)}
                                </div>
                            `
                            : ""
                    }


                    ${
                        item.inn
                            ? `
                                <div style="margin-top:8px;">
                                    <b>ИНН:</b>
                                    ${esc(item.inn)}
                                </div>
                            `
                            : ""
                    }


                    ${
                        developmentAddress
                            ? `
                                <div style="margin-top:8px;">
                                    <b>Адрес:</b><br>
                                    ${esc(developmentAddress)}
                                </div>
                            `
                            : ""
                    }


                    ${
                        developmentManager
                            ? `
                                <div style="margin-top:8px;">
                                    <b>Менеджер разработки:</b>
                                    ${esc(developmentManager)}
                                </div>
                            `
                            : ""
                    }


                    ${
                        developmentCreatedAt
                            ? `
                                <div style="margin-top:8px;">
                                    <b>Дата создания разработки:</b>
                                    ${date(developmentCreatedAt)}
                                </div>
                            `
                            : ""
                    }


                    ${
                        item.last_shipment_date
                            ? `
                                <div style="margin-top:8px;">
                                    <b>Последняя поставка:</b>
                                    ${date(item.last_shipment_date)}
                                </div>
                            `
                            : ""
                    }


                    ${
                        item.debtor_status
                            ? `
                                <div style="margin-top:8px;">
                                    <b>Статус должника:</b>
                                    ${esc(item.debtor_status)}
                                </div>
                            `
                            : ""
                    }


                    ${
                        Number(item.blocked) === 1
                            ? `
                                <div style="
                                    margin-top:12px;
                                    padding:10px;
                                    border-radius:8px;
                                    background:#fff3cd;
                                    color:#856404;
                                ">
                                    Контрагент заблокирован
                                </div>
                            `
                            : ""
                    }


                    ${
                        item.development_status === "active" &&
                        item.days_remaining !== null &&
                        item.days_remaining !== undefined
                            ? `
                                <div style="
                                    margin-top:12px;
                                    padding:10px;
                                    border-radius:9px;
                                    background:#eef8f0;
                                    color:#246b35;
                                    font-weight:700;
                                ">
                                    Осталось:
                                    ${Number(
                                        item.days_remaining
                                    )} дн.
                                </div>
                            `
                            : ""
                    }


                    <div style="
                        margin-top:18px;
                        padding:12px;
                        border-radius:9px;
                        background:#f5f5f5;
                        color:#666;
                    ">
                        Разработка уже создана.
                    </div>

                </div>
            `;


            document
                .getElementById("devBackButton")
                .addEventListener(
                    "click",
                    renderMain
                );


            return;
        }


        /*
         * -------------------------------------------------
         * Обычный контрагент 1С
         * -------------------------------------------------
         */

        const hasDevelopment =
            item.has_active_development ||
            item.development_status === "active" ||
            item.development_status === "contract_request";


        /*
         * Работающий контрагент:
         * последняя поставка не старше одного месяца.
         */

        const isWorking =
            (() => {

                if (!item.last_shipment_date) {
                    return false;
                }


                const shipmentDate =
                    new Date(
                        item.last_shipment_date
                    );


                if (
                    isNaN(
                        shipmentDate.getTime()
                    )
                ) {
                    return false;
                }


                const today =
                    new Date();

                today.setHours(
                    0,
                    0,
                    0,
                    0
                );


                const monthAgo =
                    new Date(today);

                monthAgo.setMonth(
                    monthAgo.getMonth() - 1
                );


                return shipmentDate >= monthAgo;

            })();


        content.innerHTML = `

            ${backButton("← К разработкам")}

            <div style="
                padding:15px;
                background:#fff;
                border:1px solid #ddd;
                border-radius:12px;
            ">

                <h2 style="
                    margin-top:0;
                    margin-bottom:10px;
                ">
                    ${esc(
                        item.name ||
                        item.legal_name ||
                        "Без названия"
                    )}
                </h2>


                ${
                    item.development_status
                        ? `
                            <div style="
                                margin-bottom:14px;
                            ">
                                ${statusBadge(
                                    item.development_status
                                )}
                            </div>
                        `
                        : ""
                }


                ${
                    item.legal_name
                        ? `
                            <div style="margin-top:8px;">
                                <b>Юр. лицо:</b>
                                ${esc(item.legal_name)}
                            </div>
                        `
                        : ""
                }


                ${
                    item.inn
                        ? `
                            <div style="margin-top:8px;">
                                <b>ИНН:</b>
                                ${esc(item.inn)}
                            </div>
                        `
                        : ""
                }


                ${
                    item.created_at
                        ? `
                            <div style="margin-top:8px;">
                                <b>Дата создания:</b>
                                ${date(item.created_at)}
                            </div>
                        `
                        : ""
                }


                ${
                    item.actual_address
                        ? `
                            <div style="margin-top:8px;">
                                <b>Фактический адрес:</b><br>
                                ${esc(item.actual_address)}
                            </div>
                        `
                        : ""
                }


                ${
                    item.delivery_address
                        ? `
                            <div style="margin-top:8px;">
                                <b>Адрес доставки:</b><br>
                                ${esc(item.delivery_address)}
                            </div>
                        `
                        : ""
                }


                ${
                    item.manager
                        ? `
                            <div style="margin-top:8px;">
                                <b>Менеджер 1С:</b>
                                ${esc(item.manager)}
                            </div>
                        `
                        : ""
                }


                ${
                    item.last_shipment_date
                        ? `
                            <div style="margin-top:8px;">
                                <b>Последняя поставка:</b>
                                ${date(item.last_shipment_date)}
                            </div>
                        `
                        : ""
                }


                ${
                    isWorking
                        ? `
                            <div style="
                                margin-top:12px;
                                padding:10px;
                                border-radius:8px;
                                background:#eef8f0;
                                color:#246b35;
                                font-weight:700;
                            ">
                                Работающий контрагент
                            </div>
                        `
                        : ""
                }


                ${
                    item.blocked
                        ? `
                            <div style="
                                margin-top:12px;
                                padding:10px;
                                border-radius:8px;
                                background:#fff3cd;
                                color:#856404;
                            ">
                                Контрагент заблокирован
                            </div>
                        `
                        : ""
                }


                ${
                    item.debtor_status
                        ? `
                            <div style="margin-top:8px;">
                                <b>Статус должника:</b>
                                ${esc(item.debtor_status)}
                            </div>
                        `
                        : ""
                }


                <div style="
                    margin-top:18px;
                ">

                    ${
                        hasDevelopment
                            ? `
                                <div style="
                                    padding:12px;
                                    border-radius:9px;
                                    background:#eef8f0;
                                    color:#246b35;
                                ">
                                    Разработка уже ведётся.
                                </div>
                            `
                            : isWorking
                                ? `
                                    <div style="
                                        padding:12px;
                                        border-radius:9px;
                                        background:#f5f5f5;
                                        color:#666;
                                    ">
                                        Контрагент уже работает.
                                        <br>
                                        Новую разработку создавать нельзя.
                                    </div>
                                `
                                : `
                                    <button
                                        id="devStartDevelopment"
                                        style="
                                            width:100%;
                                            padding:12px;
                                            border:0;
                                            border-radius:10px;
                                            background:#4caf50;
                                            color:#fff;
                                            font-size:15px;
                                            font-weight:600;
                                        "
                                    >
                                        Начать разработку
                                    </button>
                                `
                    }

                </div>

            </div>
        `;


        document
            .getElementById("devBackButton")
            .addEventListener(
                "click",
                renderMain
            );


        const start =
            document.getElementById(
                "devStartDevelopment"
            );


        if (start) {

            start.addEventListener(
                "click",
                () => {

                    renderCreate(item);

                }
            );
        }
    }


    // =========================================================
    // СОЗДАНИЕ
    // =========================================================

function renderCreate(counterparty = null, preset = null) {

    const data = {

        counterparty_guid:
            counterparty?.guid || "",

        display_name:
            counterparty?.name || "",

        display_name_en:
            "",

        legal_name:
            counterparty?.legal_name || "",

        inn:
            counterparty?.inn || "",

        region:
            "",

        region_fias_id:
            "",

        address:
            counterparty?.actual_address ||
            counterparty?.delivery_address ||
            "",

        phone: "",
        email: "",
        website: "",
        contact_person: "",
        comment: ""
    };


    content.innerHTML = `

        ${backButton("← К разработкам")}

        <div style="
            padding:15px;
            background:#fff;
            border:1px solid #ddd;
            border-radius:12px;
        ">

            <h2 style="
                margin-top:0;
            ">
                Создать разработку
            </h2>


            ${
                data.counterparty_guid
                    ? `
                        <div style="
                            padding:10px;
                            margin-bottom:14px;
                            background:#eef5ff;
                            border-radius:8px;
                            color:#345;
                        ">
                            Клиент выбран из справочника 1С.
                        </div>
                    `
                    : ""
            }


            <form id="devCreateForm">

                ${
                    !data.counterparty_guid
                        ? `
                            <!-- =========================
                                 КАТАЛОГ ЗАВЕДЕНИЙ МОСКВЫ
                            ========================== -->

                            <div style="
                                position:relative;
                                margin-bottom:14px;
                                padding:12px;
                                background:#f6f9ff;
                                border:1px solid #d6e2f5;
                                border-radius:10px;
                            ">
                                <label style="display:block;">
                                    <b>Найти заведение в каталоге</b>

                                    <input
                                        id="devCatSearch"
                                        type="text"
                                        autocomplete="off"
                                        placeholder="Название или улица, например: Академия Абельмановская"
                                        style="
                                            width:100%;
                                            box-sizing:border-box;
                                            margin-top:5px;
                                            padding:10px;
                                            border:1px solid #ccc;
                                            border-radius:8px;
                                            background:#fff;
                                            color:#222;
                                        "
                                    >
                                </label>

                                <div
                                    id="devCatSuggestions"
                                    style="
                                        position:absolute;
                                        left:12px;
                                        right:12px;
                                        z-index:1003;
                                        background:#fff;
                                        border:1px solid #ddd;
                                        border-radius:8px;
                                        box-shadow:0 4px 12px rgba(0,0,0,.12);
                                        overflow:hidden;
                                        display:none;
                                    "
                                ></div>

                                <div
                                    id="devCatInfo"
                                    style="
                                        display:none;
                                        margin-top:10px;
                                        padding:10px;
                                        background:#e8f5e9;
                                        border:1px solid #a5d6a7;
                                        border-radius:8px;
                                        color:#1b5e20;
                                        font-size:14px;
                                        line-height:1.4;
                                    "
                                ></div>

                                <div
                                    id="devCatHint"
                                    style="
                                        margin-top:6px;
                                        font-size:12px;
                                        color:#666;
                                    "
                                >
                                    Открытые данные Москвы: адрес, телефон и название подставятся сами.
                                    Если заведения нет в списке, заполните поля ниже вручную.
                                </div>
                            </div>
                        `
                        : ""
                }

                <label>
                    <b>Название *</b>

                    <input
                        name="display_name"
                        required
                        value="${esc(data.display_name)}"
                        style="
                            width:100%;
                            box-sizing:border-box;
                            margin-top:5px;
                            padding:10px;
                            border:1px solid #ccc;
                            border-radius:8px;
                        "
                    >
                </label>


                <label style="
                    display:block;
                    margin-top:12px;
                ">
                    <b>Наименование (англ)</b>

                    <input
                        name="display_name_en"
                        value="${esc(data.display_name_en)}"
                        style="
                            width:100%;
                            box-sizing:border-box;
                            margin-top:5px;
                            padding:10px;
                            border:1px solid #ccc;
                            border-radius:8px;
                        "
                    >
                </label>


                <label style="
                    display:block;
                    margin-top:12px;
                ">
                    <b>Юр. лицо</b>

                    <input
                        name="legal_name"
                        value="${esc(data.legal_name)}"
                        style="
                            width:100%;
                            box-sizing:border-box;
                            margin-top:5px;
                            padding:10px;
                            border:1px solid #ccc;
                            border-radius:8px;
                        "
                    >
                </label>


                <label style="
                    display:block;
                    margin-top:12px;
                ">
                    <b>ИНН</b>

                    <input
                        name="inn"
                        value="${esc(data.inn)}"
                        inputmode="numeric"
                        style="
                            width:100%;
                            box-sizing:border-box;
                            margin-top:5px;
                            padding:10px;
                            border:1px solid #ccc;
                            border-radius:8px;
                        "
                    >
                </label>


                ${
                    !data.counterparty_guid
                        ? `
                            <!-- =========================
                                 РЕГИОН
                            ========================== -->

                            <label style="
                                display:block;
                                margin-top:12px;
                                position:relative;
                            ">
                                <b>Регион</b>

                                <input
                                    name="region"
                                    id="devCreateRegion"
                                    type="text"
                                    autocomplete="off"
                                    placeholder="Например: Тверская обл"
                                    value=""
                                    style="
                                        width:100%;
                                        box-sizing:border-box;
                                        margin-top:5px;
                                        padding:10px;
                                        border:1px solid #ccc;
                                        border-radius:8px;
                                    "
                                >

                                <div
                                    id="devRegionSuggestions"
                                    style="
                                        position:absolute;
                                        left:0;
                                        right:0;
                                        top:100%;
                                        z-index:1001;
                                        background:#fff;
                                        border:1px solid #ddd;
                                        border-radius:8px;
                                        box-shadow:0 4px 12px rgba(0,0,0,.12);
                                        overflow:hidden;
                                        display:none;
                                    "
                                ></div>

                            </label>


                            <!-- =========================
                                 АДРЕС
                            ========================== -->

                            <label style="
                                display:block;
                                margin-top:12px;
                                position:relative;
                            ">
                                <b>Адрес *</b>

                                <input
                                    name="address"
                                    id="devCreateAddress"
                                    required
                                    type="text"
                                    autocomplete="off"
                                    placeholder="Сначала выберите регион"
                                    value="${esc(data.address)}"
                                    disabled
                                    style="
                                        width:100%;
                                        box-sizing:border-box;
                                        margin-top:5px;
                                        padding:10px;
                                        border:1px solid #ccc;
                                        border-radius:8px;
                                        background:#f5f5f5;
                                    "
                                >

                                <div
                                    id="devAddressSuggestions"
                                    style="
                                        position:absolute;
                                        left:0;
                                        right:0;
                                        top:100%;
                                        z-index:1000;
                                        background:#fff;
                                        border:1px solid #ddd;
                                        border-radius:8px;
                                        box-shadow:0 4px 12px rgba(0,0,0,.12);
                                        overflow:hidden;
                                        display:none;
                                    "
                                ></div>

                            </label>
                        `
                        : `
                            <label style="
                                display:block;
                                margin-top:12px;
                            ">
                                <b>Адрес *</b>

                                <input
                                    name="address"
                                    type="text"
                                    required
                                    value="${esc(data.address)}"
                                    style="
                                        width:100%;
                                        box-sizing:border-box;
                                        margin-top:5px;
                                        padding:10px;
                                        border:1px solid #ccc;
                                        border-radius:8px;
                                    "
                                >
                            </label>
                        `
                }


                <label style="
                    display:block;
                    margin-top:12px;
                ">
                    <b>Телефон</b>

                    <input
                        name="phone"
                        style="
                            width:100%;
                            box-sizing:border-box;
                            margin-top:5px;
                            padding:10px;
                            border:1px solid #ccc;
                            border-radius:8px;
                        "
                    >
                </label>


                <label style="
                    display:block;
                    margin-top:12px;
                ">
                    <b>Email</b>

                    <input
                        name="email"
                        type="email"
                        style="
                            width:100%;
                            box-sizing:border-box;
                            margin-top:5px;
                            padding:10px;
                            border:1px solid #ccc;
                            border-radius:8px;
                        "
                    >
                </label>


                <label style="
                    display:block;
                    margin-top:12px;
                ">
                    <b>Сайт</b>

                    <input
                        name="website"
                        style="
                            width:100%;
                            box-sizing:border-box;
                            margin-top:5px;
                            padding:10px;
                            border:1px solid #ccc;
                            border-radius:8px;
                        "
                    >
                </label>


                <label style="
                    display:block;
                    margin-top:12px;
                ">
                    <b>Контактное лицо</b>

                    <input
                        name="contact_person"
                        style="
                            width:100%;
                            box-sizing:border-box;
                            margin-top:5px;
                            padding:10px;
                            border:1px solid #ccc;
                            border-radius:8px;
                        "
                    >
                </label>


                <label style="
                    display:block;
                    margin-top:12px;
                ">
                    <b>Комментарий</b>

                    <textarea
                        name="comment"
                        style="
                            width:100%;
                            box-sizing:border-box;
                            margin-top:5px;
                            padding:10px;
                            border:1px solid #ccc;
                            border-radius:8px;
                            min-height:90px;
                        "
                    ></textarea>
                </label>


                <div id="devCreateError"></div>


                <button
                    type="submit"
                    id="devSave"
                    style="
                        width:100%;
                        margin-top:16px;
                        padding:12px;
                        border:0;
                        border-radius:10px;
                        background:#4caf50;
                        color:#fff;
                        font-size:15px;
                        font-weight:600;
                    "
                >
                    Создать разработку
                </button>

            </form>

        </div>
    `;


    document
        .getElementById("devBackButton")
        .addEventListener(
            "click",
            renderMain
        );


    // =========================================================
    // КАТАЛОГ ЗАВЕДЕНИЙ МОСКВЫ (открытые данные)
    // Подбор при создании: подставляет название, адрес, телефон
    // и запоминает заведение (catering_place_id).
    // =========================================================

    const catalogPicker = (function setupCatalogPicker() {

        const search = document.getElementById("devCatSearch");

        if (!search) return null;

        const box = document.getElementById("devCatSuggestions");
        const info = document.getElementById("devCatInfo");
        const hint = document.getElementById("devCatHint");
        const form = document.getElementById("devCreateForm");

        // Идентификатор региона «город Москва» в ФИАС (как отдаёт DaData)
        const MOSCOW_FIAS_ID = "0c5b2444-70a0-4932-980c-b4dc0d3f02b5";

        let timer = null;
        let seq = 0;
        let items = [];

        const hideBox = () => {
            box.innerHTML = "";
            box.style.display = "none";
        };

        const showMessage = text => {
            items = [];
            box.innerHTML = `<div style="padding:10px;font-size:13px;color:#666;">${esc(text)}</div>`;
            box.style.top = (search.offsetTop + search.offsetHeight + 4) + "px";
            box.style.display = "block";
        };

        function reset() {

            data.catering_place_id = null;
            data.address_selected_from_dadata = false;
            data.address_has_house = false;
            data.region = "";
            data.region_fias_id = "";

            const region = document.getElementById("devCreateRegion");
            const address = document.getElementById("devCreateAddress");

            if (region) {
                region.value = "";
                region.readOnly = false;
                region.style.background = "#fff";
            }

            if (address) {
                address.value = "";
                address.disabled = true;
                address.readOnly = false;
                address.placeholder = "Сначала выберите регион";
                address.style.background = "#f5f5f5";
            }

            info.style.display = "none";
            info.innerHTML = "";
            hint.style.display = "block";
            search.value = "";
        }

        function choose(item) {

            data.catering_place_id = item.id;
            data.region = "город Москва";
            data.region_fias_id = MOSCOW_FIAS_ID;
            data.address_selected_from_dadata = true;
            data.address_has_house = true;

            form.querySelector('[name="display_name"]').value = item.name || "";

            const phone = form.querySelector('[name="phone"]');
            if (phone && item.phone && !phone.value.trim()) {
                phone.value = item.phone;
            }

            const region = document.getElementById("devCreateRegion");
            const address = document.getElementById("devCreateAddress");

            if (region) {
                region.value = "город Москва";
                region.readOnly = true;
                region.style.background = "#f5f5f5";
            }

            if (address) {
                address.disabled = false;
                address.readOnly = true;
                address.value = item.address || "";
                address.style.background = "#f5f5f5";
            }

            const details = [
                item.type,
                item.seats ? "мест: " + item.seats : "",
                item.district || ""
            ].filter(Boolean).join(" · ");

            const mapLink = item.map && item.map.point
                ? `<a href="${esc(item.map.point)}" target="_blank" rel="noopener" style="color:#0b57d0;">На карте</a>`
                : "";

            info.innerHTML = `
                <div><b>✔ Заведение из каталога</b>${details ? ": " + esc(details) : ""}</div>
                <div style="margin-top:8px;">
                    ${mapLink}
                    <a href="#" id="devCatReset" style="color:#b71c1c;${mapLink ? "margin-left:16px;" : ""}">Выбрать другое или ввести вручную</a>
                </div>
            `;
            info.style.display = "block";
            hint.style.display = "none";

            document.getElementById("devCatReset").addEventListener("click", e => {
                e.preventDefault();
                reset();
            });

            search.value = item.name || "";
            hideBox();
        }

        search.addEventListener("input", () => {

            clearTimeout(timer);

            // Новый поиск после выбора: прежний выбор снимаем
            if (data.catering_place_id) reset();

            const query = search.value.trim();

            if (query.length < 2) {
                hideBox();
                return;
            }

            timer = setTimeout(async () => {

                const mine = ++seq;

                try {

                    const result = await api(
                        "/api/catering/suggest?limit=8&q=" + encodeURIComponent(query)
                    );

                    if (mine !== seq) return;

                    items = Array.isArray(result?.items) ? result.items : [];

                    if (!items.length) {
                        showMessage("Ничего не найдено. Заполните поля ниже вручную.");
                        return;
                    }

                    box.innerHTML = items.map((item, index) => `
                        <div
                            data-cat-index="${index}"
                            style="
                                padding:10px;
                                border-bottom:1px solid #eee;
                                cursor:pointer;
                                font-size:14px;
                                line-height:1.35;
                                color:#222;
                            "
                        >
                            <b>${esc(item.name)}</b>
                            <span style="color:#666;">
                                ${item.is_net ? " · сеть" : ""}
                                ${item.type ? " · " + esc(item.type) : ""}
                                ${item.seats ? " · мест: " + esc(item.seats) : ""}
                            </span>
                            ${item.availability && item.availability.taken
                                ? `<span style="color:#b71c1c;font-weight:600;"> · ${esc(item.availability.label)}</span>`
                                : ""}
                            <div style="color:#555;font-size:13px;">${esc(item.address)}</div>
                        </div>
                    `).join("");

                    box.style.top = (search.offsetTop + search.offsetHeight + 4) + "px";
                    box.style.display = "block";

                    box.querySelectorAll("[data-cat-index]").forEach(el => {
                        el.addEventListener("click", () => {
                            const item = items[Number(el.dataset.catIndex)];
                            if (!item) return;

                            // Занятое заведение (клиент 1С или чужая разработка) создать нельзя
                            const a = item.availability;
                            if (a && a.taken && !a.mine) {
                                const m = a.matches && a.matches[0];
                                showMessage(
                                    a.label + (m && m.manager_name ? " (" + m.manager_name + ")" : "") +
                                    ". Создать разработку нельзя."
                                );
                                return;
                            }

                            choose(item);
                        });
                    });

                } catch (error) {

                    if (mine !== seq) return;

                    showMessage("Каталог сейчас недоступен. Заполните поля ниже вручную.");
                }

            }, 300);
        });

        form.addEventListener("click", e => {
            if (!box.contains(e.target) && e.target !== search) hideBox();
        });

        return { choose };

    })();

    // Заведение выбрано заранее (из экрана «Каталог»): заполняем форму сразу
    if (preset && catalogPicker) catalogPicker.choose(preset);


    // =========================================================
    // DADATA — РЕГИОН + АДРЕС
    // Только для ручного создания
    // =========================================================

    if (!data.counterparty_guid) {

        const regionInput =
            document.getElementById("devCreateRegion");

        const regionSuggestions =
            document.getElementById(
                "devRegionSuggestions"
            );

        const addressInput =
            document.getElementById("devCreateAddress");

        const addressSuggestions =
            document.getElementById(
                "devAddressSuggestions"
            );


        let regionTimer = null;
        let addressTimer = null;


        // =====================================================
        // РЕГИОН
        // =====================================================

        if (
            regionInput &&
            regionSuggestions
        ) {

            regionInput.addEventListener(
                "input",
                function () {

                    clearTimeout(regionTimer);

                    // При изменении региона старый FIAS ID
                    // больше нельзя использовать
                    data.region = "";
                    data.region_fias_id = "";
                    data.address_selected_from_dadata = false;
                    data.address_has_house = false;

                    addressInput.value = "";
                    addressInput.disabled = true;

                    addressInput.placeholder =
                        "Сначала выберите регион";

                    addressInput.style.background =
                        "#f5f5f5";


                    addressSuggestions.innerHTML = "";
                    addressSuggestions.style.display =
                        "none";


                    const query =
                        this.value.trim();


                    if (query.length < 2) {

                        regionSuggestions.innerHTML = "";
                        regionSuggestions.style.display = "none";

                        return;
                    }


                    regionTimer =
                        setTimeout(
                            async () => {

                                try {

                                    const result =
                                        await api(
                                            "/api/dadata/address",
                                            {
                                                method: "POST",
                                                body: JSON.stringify({
                                                    query
                                                })
                                            }
                                        );


                                    const suggestions =
                                        Array.isArray(
                                            result?.suggestions
                                        )
                                            ? result.suggestions
                                            : [];


                                    /*
                                     * Берём только объекты,
                                     * которые являются регионом.
                                     */
                                    const regions =
                                        suggestions.filter(
                                            item => {

                                                const data =
                                                    item?.data || {};

                                                return (
                                                    data?.region &&
                                                    data?.region_type &&
                                                    (
                                                        data.region_type === "обл" ||
                                                        data.region_type === "край" ||
                                                        data.region_type === "респ" ||
                                                        data.region_type === "АО" ||
                                                        data.region_type === "авт. обл" ||
                                                        data.region_type === "г"
                                                    )
                                                );
                                            }
                                        );


                                    if (!regions.length) {

                                        regionSuggestions.innerHTML = "";
                                        regionSuggestions.style.display = "none";

                                        return;
                                    }


                                    regionSuggestions.innerHTML =
                                        regions
                                            .map(
                                                (item, index) => {

                                                    const value =
                                                        item?.value ||
                                                        item?.unrestricted_value ||
                                                        "";

                                                    const regionFiasId =
                                                        item?.data?.region_fias_id ||
                                                        "";

                                                    if (
                                                        !value ||
                                                        !regionFiasId
                                                    ) {
                                                        return "";
                                                    }


                                                    return `
                                                        <div
                                                            data-region-index="${index}"
                                                            style="
                                                                padding:10px;
                                                                border-bottom:1px solid #eee;
                                                                cursor:pointer;
                                                                font-size:14px;
                                                                line-height:1.35;
                                                            "
                                                        >
                                                            ${esc(value)}
                                                        </div>
                                                    `;
                                                }
                                            )
                                            .join("");


                                    regionSuggestions.style.display =
                                        "block";


                                    regionSuggestions
                                        .querySelectorAll(
                                            "[data-region-index]"
                                        )
                                        .forEach(
                                            item => {

                                                item.addEventListener(
                                                    "click",
                                                    () => {

                                                        const index =
                                                            Number(
                                                                item.dataset
                                                                    .regionIndex
                                                            );


                                                        const selected =
                                                            regions[index];


                                                        if (!selected) {
                                                            return;
                                                        }


                                                        const regionName =
                                                            selected?.value ||
                                                            selected?.unrestricted_value ||
                                                            "";


                                                        const regionFiasId =
                                                            selected?.data?.region_fias_id ||
                                                            "";


                                                        regionInput.value =
                                                            regionName;


                                                        data.region =
                                                            regionName;


                                                        data.region_fias_id =
                                                            regionFiasId;


                                                        regionSuggestions.innerHTML = "";

                                                        regionSuggestions.style.display =
                                                            "none";


                                                        // Теперь адрес разрешаем
                                                        addressInput.disabled =
                                                            false;

                                                        addressInput.placeholder =
                                                            "Начните вводить улицу, дом...";

                                                        addressInput.style.background =
                                                            "#fff";

                                                    }
                                                );

                                            }
                                        );

                                } catch (error) {

                                    console.error(
                                        "DaData region error:",
                                        error
                                    );

                                    regionSuggestions.innerHTML = "";
                                    regionSuggestions.style.display = "none";
                                }

                            },
                            300
                        );
                }
            );
        }


        // =====================================================
        // АДРЕС
        // =====================================================

        if (
            addressInput &&
            addressSuggestions
        ) {

            addressInput.addEventListener(
                "input",
                function () {

                    clearTimeout(addressTimer);

                    // Адрес изменён вручную — он больше
                    // не считается выбранным из подсказок DaData.
                    data.address_selected_from_dadata = false;
                    data.address_has_house = false;

                    const query =
                        this.value.trim();


                    if (
                        query.length < 3 ||
                        !data.region_fias_id
                    ) {

                        addressSuggestions.innerHTML = "";
                        addressSuggestions.style.display = "none";

                        return;
                    }


                    addressTimer =
                        setTimeout(
                            async () => {

                                try {

                                    const result =
                                        await api(
                                            "/api/dadata/address",
                                            {
                                                method: "POST",
                                                body: JSON.stringify({
                                                    query,
                                                    locations: [
                                                        {
                                                            region_fias_id:
                                                                data.region_fias_id
                                                        }
                                                    ]
                                                })
                                            }
                                        );


                                    const suggestions =
                                        Array.isArray(
                                            result?.suggestions
                                        )
                                            ? result.suggestions
                                            : [];


                                    if (!suggestions.length) {

                                        addressSuggestions.innerHTML = "";
                                        addressSuggestions.style.display = "none";

                                        return;
                                    }


                                    addressSuggestions.innerHTML =
                                        suggestions
                                            .map(
                                                (item, index) => {

                                                    const value =
                                                        item?.unrestricted_value ||
                                                        item?.value ||
                                                        "";

                                                    if (!value) {
                                                        return "";
                                                    }


                                                    return `
                                                        <div
                                                            data-address-index="${index}"
                                                            style="
                                                                padding:10px;
                                                                border-bottom:1px solid #eee;
                                                                cursor:pointer;
                                                                font-size:14px;
                                                                line-height:1.35;
                                                            "
                                                        >
                                                            ${esc(value)}
                                                        </div>
                                                    `;
                                                }
                                            )
                                            .join("");


                                    addressSuggestions.style.display =
                                        "block";


                                    addressSuggestions
                                        .querySelectorAll(
                                            "[data-address-index]"
                                        )
                                        .forEach(
                                            item => {

                                                item.addEventListener(
                                                    "click",
                                                    () => {

                                                        const index =
                                                            Number(
                                                                item.dataset
                                                                    .addressIndex
                                                            );


                                                        const selected =
                                                            suggestions[index];


                                                        if (!selected) {
                                                            return;
                                                        }


                                                        const value =
                                                            selected?.unrestricted_value ||
                                                            selected?.value ||
                                                            "";


                                                        addressInput.value =
                                                            value;

                                                        data.address_selected_from_dadata = true;
                                                        data.address_has_house = suggestionHasHouse(selected, value);


                                                        addressSuggestions.innerHTML =
                                                            "";

                                                        addressSuggestions.style.display =
                                                            "none";

                                                    }
                                                );

                                            }
                                        );

                                } catch (error) {

                                    console.error(
                                        "DaData address error:",
                                        error
                                    );

                                    addressSuggestions.innerHTML = "";
                                    addressSuggestions.style.display = "none";
                                }

                            },
                            300
                        );
                }
            );
        }


        // =====================================================
        // ЗАКРЫТИЕ ПОДСКАЗОК
        // =====================================================

        document.addEventListener(
            "click",
            function (event) {

                if (
                    regionInput &&
                    event.target !== regionInput &&
                    !regionSuggestions.contains(
                        event.target
                    )
                ) {

                    regionSuggestions.innerHTML = "";
                    regionSuggestions.style.display = "none";
                }


                if (
                    addressInput &&
                    event.target !== addressInput &&
                    !addressSuggestions.contains(
                        event.target
                    )
                ) {

                    addressSuggestions.innerHTML = "";
                    addressSuggestions.style.display = "none";
                }

            }
        );
    }


    // =========================================================
    // СОЗДАНИЕ РАЗРАБОТКИ
    // =========================================================

    document
        .getElementById("devCreateForm")
        .addEventListener(
            "submit",
            async function (event) {

                event.preventDefault();


                const form =
                    event.currentTarget;


                const fd =
                    new FormData(form);


                const payload = {

                    counterparty_guid:
                        data.counterparty_guid ||
                        null,

                    display_name:
                        String(
                            fd.get("display_name") || ""
                        ).trim(),

                    display_name_en:
                        String(
                            fd.get("display_name_en") || ""
                        ).trim(),

                    legal_name:
                        String(
                            fd.get("legal_name") || ""
                        ).trim(),

                    inn:
                        String(
                            fd.get("inn") || ""
                        ).trim(),

                    address:
                        String(
                            fd.get("address") || ""
                        ).trim(),

                    phone:
                        String(
                            fd.get("phone") || ""
                        ).trim(),

                    email:
                        String(
                            fd.get("email") || ""
                        ).trim(),

                    website:
                        String(
                            fd.get("website") || ""
                        ).trim(),

                    contact_person:
                        String(
                            fd.get("contact_person") || ""
                        ).trim(),

                    comment:
                        String(
                            fd.get("comment") || ""
                        ).trim(),

                    address_selected_from_dadata:
                        data.address_selected_from_dadata === true,

                    address_has_house:
                        data.address_has_house === true,

                    catering_place_id:
                        data.catering_place_id || null
                };


                const error =
                    document.getElementById(
                        "devCreateError"
                    );


                const save =
                    document.getElementById(
                        "devSave"
                    );


                error.innerHTML = "";

                // Проверяем адрес до отправки запроса на сервер.
                if (!payload.address) {
                    error.innerHTML = `
                        <div style="margin-top:12px;padding:10px;border-radius:8px;background:#fde8e8;color:#a00000;">
                            Укажите адрес. Без адреса разработку создать нельзя.
                        </div>
                    `;
                    const addressField = form.querySelector('[name="address"]');
                    if (addressField && !addressField.disabled) {
                        addressField.focus();
                    }
                    return;
                }

                if (!data.counterparty_guid && (!data.region || !data.region_fias_id)) {
                    error.innerHTML = `
                        <div style="margin-top:12px;padding:10px;border-radius:8px;background:#fde8e8;color:#a00000;">
                            Сначала выберите регион из списка подсказок, затем укажите адрес.
                        </div>
                    `;
                    form.querySelector('[name="region"]')?.focus();
                    return;
                }

                if (!data.counterparty_guid && !payload.address_selected_from_dadata) {
                    error.innerHTML = `
                        <div style="margin-top:12px;padding:10px;border-radius:8px;background:#fde8e8;color:#a00000;">
                            Выберите адрес из подсказок DaData: начните вводить и нажмите на нужный вариант из списка.
                        </div>
                    `;
                    form.querySelector('[name="address"]')?.focus();
                    return;
                }

                if (!data.counterparty_guid && !payload.address_has_house) {
                    error.innerHTML = ADDRESS_NO_HOUSE_HTML;
                    form.querySelector('[name="address"]')?.focus();
                    return;
                }

                error.innerHTML = "";

                save.disabled = true;
                save.innerText = "Создание...";


                try {

                    const result =
                        await api(
                            "/api/developments",
                            {
                                method: "POST",
                                body: JSON.stringify(payload)
                            }
                        );


                    const check =
                        result?.development;


                    if (
                        check &&
                        check.warning === true &&
                        Array.isArray(check.conflicts) &&
                        check.conflicts.length
                    ) {

                        const conflicts =
                            check.conflicts;


                        const working =
                            conflicts.filter(
                                item =>
                                    item.type ===
                                    "working_counterparty"
                            );


                        const developments =
                            conflicts.filter(
                                item =>
                                    item.type ===
                                    "development"
                            );


                        const previousDevelopment =
                            conflicts.find(
                                item =>
                                    item.type ===
                                    "previous_development"
                            );


                        const dormant =
                            conflicts.filter(
                                item =>
                                    item.type ===
                                    "dormant_counterparty"
                            );

                        // Строка про степень совпадения (для похожих записей).
                        const similarLine = item => {

                            if (!item.similar) {
                                // Совпало точное название или ИНН
                                // (адрес может быть другим).
                                return item.exact
                                    ? `\n  Совпадает название или ИНН` +
                                      (item.address ? `\n  Адрес: ${item.address}` : "")
                                    : "";
                            }

                            let line =
                                item.reason === "same_street"
                                    ? `\n  Такое же название на той же улице, дом другой или не указан ` +
                                      `(название ${item.name_score}%)`
                                    : `\n  Совпадение: название ${item.name_score}%, ` +
                                      `адрес ${item.address_score}%`;

                            if (item.address) {
                                line += `\n  Адрес: ${item.address}`;
                            }

                            return line;
                        };

                        const anySimilar =
                            conflicts.some(item => item.similar);

                        let message =
                            previousDevelopment
                                ? "♻️ ЭТА РАЗРАБОТКА УЖЕ БЫЛА\n\n"
                                : anySimilar
                                    ? "⚠️ ПОХОЖЕ НА СУЩЕСТВУЮЩЕГО КЛИЕНТА\n\n"
                                    : "⚠️ ВНИМАНИЕ\n\n";


                        if (previousDevelopment) {

                            const p = previousDevelopment;

                            message += `• ${p.name || "Без названия"}`;

                            if (p.address) {
                                message += `\n  Адрес: ${p.address}`;
                            }

                            if (p.manager_name) {
                                message += (/^отдел/i.test(p.manager_name) ? `\n  Была в: ${p.manager_name}` : `\n  Была у менеджера: ${p.manager_name}`);
                            }

                            message +=
                                `\n  Создана: ${dateOnly(p.created_at)}`;

                            message += p.status === "closed"
                                ? `\n  Закрыта: ${dateOnly(p.closed_at)}`
                                : `\n  Срок истёк: ${dateOnly(p.expires_at)}`;

                            if (p.close_comment) {
                                message += `\n  Причина: ${p.close_comment}`;
                            }

                            message +=
                                "\n\nВместо новой записи эта разработка " +
                                "будет возобновлена на себя: вся история " +
                                "работы с рестораном сохранится.\n\n";
                        }


                        if (working.length) {

                            message +=
                                "Найдены рабочие контрагенты:\n\n";


                            for (const item of working) {

                                message +=
                                    `• ${item.name || "Без названия"}`;


                                if (item.legal_name) {

                                    message +=
                                        `\n  ${item.legal_name}`;
                                }


                                if (item.inn) {

                                    message +=
                                        `\n  ИНН: ${item.inn}`;
                                }


                                if (
                                    item.last_shipment_date
                                ) {

                                    message +=
                                        `\n  Последняя отгрузка: ` +
                                        `${dateOnly(item.last_shipment_date)}`;
                                }


                                message += similarLine(item);

                                message += "\n\n";
                            }
                        }


                        if (developments.length) {

                            message +=
                                "Уже существуют разработки:\n\n";


                            for (const item of developments) {

                                message +=
                                    `• ${item.name || "Без названия"}`;


                                if (item.inn) {

                                    message +=
                                        `\n  ИНН: ${item.inn}`;
                                }


                                if (
                                    item.status ===
                                    "active"
                                ) {

                                    message +=
                                        "\n  Статус: В работе";
                                }


                                if (
                                    item.status ===
                                    "contract_request"
                                ) {

                                    message +=
                                        "\n  Статус: Заявка на договор";
                                }


                                if (item.expires_at) {

                                    message +=
                                        `\n  Срок до: ` +
                                        `${dateOnly(item.expires_at)}`;
                                }


                                if (item.manager_name) {

                                    message +=
                                        (/^отдел/i.test(item.manager_name) ? `\n  ${item.manager_name[0].toUpperCase() + item.manager_name.slice(1)}` : `\n  Менеджер: ${item.manager_name}`);
                                }


                                message += similarLine(item);

                                message += "\n\n";
                            }
                        }


                        if (dormant.length) {

                            message +=
                                "Похожие клиенты в 1С (сейчас не работают):\n\n";


                            for (const item of dormant) {

                                message +=
                                    `• ${item.name || "Без названия"}`;


                                message +=
                                    item.last_shipment_date
                                        ? `\n  Последняя отгрузка: ` +
                                          `${dateOnly(item.last_shipment_date)}`
                                        : "\n  Отгрузок не было";


                                message += similarLine(item);

                                message += "\n\n";
                            }

                            message +=
                                "Если это тот же клиент, лучше создайте " +
                                "разработку из его карточки (поиск контрагента).\n\n";
                        }


                        message += previousDevelopment
                            ? "Возобновить разработку?"
                            : "Всё равно записать новую разработку?";


                        const confirmed =
                            confirm(message);


                        if (!confirmed) {

                            save.disabled = false;

                            save.innerText =
                                "Создать разработку";

                            return;
                        }


                        // Пользователь подтвердил запись
                        payload.confirm_conflicts = true;


                        await api(
                            "/api/developments",
                            {
                                method: "POST",
                                body: JSON.stringify(payload)
                            }
                        );
                    }


                    await loadDevelopments();


                } catch (err) {

                    save.disabled = false;

                    save.innerText =
                        "Создать разработку";


                    error.innerHTML = `
                        <div style="
                            margin-top:12px;
                            padding:10px;
                            border-radius:8px;
                            background:#fde8e8;
                            color:#a00000;
                        ">
                            ${esc(err.message)}
                        </div>
                    `;
                }
            }
        );
}


    // =========================================================
    // ОТКРЫТИЕ РАЗРАБОТКИ
    // =========================================================

    async function openDevelopment(id) {

        content.innerHTML = `
            <div style="
                padding:20px;
                text-align:center;
                color:#777;
            ">
                Загрузка разработки...
            </div>
        `;


        try {

            const data =
                await api(
                    `/api/developments/${id}`
                );


            const development =
                data?.development ||
                data;


            renderDevelopment(
                development
            );


        } catch (error) {

            content.innerHTML = `

                ${backButton()}

                <div style="
                    padding:12px;
                    border-radius:8px;
                    background:#fde8e8;
                    color:#a00000;
                ">
                    ${esc(error.message)}
                </div>
            `;


            document
                .getElementById("devBackButton")
                .addEventListener(
                    "click",
                    renderMain
                );
        }
    }


    // =========================================================
    // КАРТОЧКА РАЗРАБОТКИ
    // =========================================================
   function getCurrentUserRole() {
    const token = localStorage.getItem("jwt");

    if (!token) {
        return "";
    }

    try {
        const payload = token.split(".")[1];

        if (!payload) {
            return "";
        }

        const base64 = payload
            .replace(/-/g, "+")
            .replace(/_/g, "/");

        const padded = base64.padEnd(
            base64.length + (4 - base64.length % 4) % 4,
            "="
        );

        const data = JSON.parse(atob(padded));

        return String(data.role || "").toLowerCase();
    } catch (e) {
        console.error("Не удалось определить роль пользователя:", e);
        return "";
    }
} 
    
function renderDevelopment(d) {

       const currentRole = getCurrentUserRole();
    const canExtend =
        (currentRole === "admin" || currentRole === "director") &&
        d.status === "active";


    const days = daysLeft(d.expires_at);

    const titleText =
        d.display_name ||
        d.counterparty_name ||
        d.legal_name ||
        "Разработка";

    content.innerHTML = `

        ${backButton("← К разработкам")}

        <div style="
            padding:15px;
            background:#fff;
            border:1px solid #ddd;
            border-radius:12px;
        ">

            <div style="
                display:flex;
                justify-content:space-between;
                align-items:flex-start;
                gap:10px;
            ">

                <h2 style="margin:0;">
                    ${esc(titleText)}
                </h2>

                ${statusBadge(d.status)}

            </div>


            ${
                d.legal_name
                    ? `
                        <div style="margin-top:14px;">
                            <b>Юр. лицо:</b>
                            ${esc(d.legal_name)}
                        </div>
                    `
                    : ""
            }


            <div style="
                margin-top:8px;
                color:${d.inn ? "#333" : "#999"};
            ">
                <b>ИНН:</b>
                ${d.inn ? esc(d.inn) : "не указан"}
            </div>


            <div style="
                margin-top:8px;
                color:${d.address ? "#333" : "#999"};
            ">
                <b>Адрес:</b>
                ${
                    d.address
                        ? `<br>${esc(d.address)}`
                        : " не указан"
                }
            </div>


            <div style="
                margin-top:8px;
                color:${d.phone ? "#333" : "#999"};
            ">
                <b>Телефон:</b>
                ${d.phone ? esc(d.phone) : "не указан"}
            </div>


            ${
                d.email
                    ? `
                        <div style="margin-top:8px;">
                            <b>Email:</b>
                            ${esc(d.email)}
                        </div>
                    `
                    : ""
            }


            ${
                d.website
                    ? `
                        <div style="margin-top:8px;">
                            <b>Сайт:</b>
                            ${esc(d.website)}
                        </div>
                    `
                    : ""
            }


            <div style="
                margin-top:8px;
                color:${d.contact_person ? "#333" : "#999"};
            ">
                <b>Контактное лицо:</b>
                ${
                    d.contact_person
                        ? esc(d.contact_person)
                        : "не указано"
                }
            </div>


            <div style="
                margin-top:16px;
                padding-top:12px;
                border-top:1px solid #eee;
            ">

                <div style="margin-top:7px;">
                    <b>Создана:</b>
                    ${dateOnly(d.created_at)}
                </div>


                ${
                    d.expires_at
                        ? `
                            <div style="margin-top:7px;">
                                <b>Срок до:</b>
                                ${dateOnly(d.expires_at)}
                            </div>
                        `
                        : ""
                }


                ${
                    d.status === "active" &&
                    days !== null
                        ? `
                            <div style="
                                margin-top:12px;
                                padding:10px;
                                border-radius:8px;
                                background:${
                                    days <= 5
                                        ? "#fff3cd"
                                        : "#eef8f0"
                                };
                            ">
                                <b>Осталось:</b>
                                ${days} дн.
                            </div>
                        `
                        : ""
                }

            </div>


            ${
                d.comment
                    ? `
                        <div style="
                            margin-top:16px;
                            padding:12px;
                            border-radius:9px;
                            background:#f7f7f7;
                        ">

                            <div style="
                                font-weight:700;
                                margin-bottom:6px;
                            ">
                                Комментарий
                            </div>

                            <div style="
                                white-space:pre-wrap;
                                color:#444;
                            ">
                                ${esc(d.comment)}
                            </div>

                        </div>
                    `
                    : `
                        <div style="
                            margin-top:16px;
                            padding:12px;
                            border-radius:9px;
                            background:#f7f7f7;
                            color:#999;
                        ">
                            Комментарий не добавлен.
                        </div>
                    `
            }


            ${
                d.status === "active"
                    ? `

                        ${
                            canExtend
                                ? `
                                    <button
                                        id="devExtendButton"
                                        type="button"
                                        style="
                                            width:100%;
                                            margin-top:18px;
                                            padding:12px;
                                            border:0;
                                            border-radius:10px;
                                            background:#6a1b9a;
                                            color:#fff;
                                            font-size:15px;
                                            font-weight:600;
                                            cursor:pointer;
                                        "
                                    >
                                        ⏱ Продлить срок
                                    </button>
                                `
                                : ""
                        }


                        <button
                            id="devContractButton"
                            type="button"
                            style="
                                width:100%;
                                margin-top:18px;
                                padding:12px;
                                border:0;
                                border-radius:10px;
                                background:#2e7d32;
                                color:#fff;
                                font-size:15px;
                                font-weight:600;
                                cursor:pointer;
                            "
                        >
                            📄 Создать заявку на договор
                        </button>


                        <button
                            id="devEditButton"
                            type="button"
                            style="
                                width:100%;
                                margin-top:10px;
                                padding:12px;
                                border:0;
                                border-radius:10px;
                                background:#1976d2;
                                color:#fff;
                                font-size:15px;
                                font-weight:600;
                                cursor:pointer;
                            "
                        >
                            ✏️ Редактировать
                        </button>


                        <button
                            id="devCloseButton"
                            type="button"
                            style="
                                width:100%;
                                margin-top:10px;
                                padding:12px;
                                border:0;
                                border-radius:10px;
                                background:#757575;
                                color:#fff;
                                font-size:15px;
                                font-weight:600;
                                cursor:pointer;
                            "
                        >
                            🔒 Закрыть разработку
                        </button>

                    `
                    : ""
            }

        </div>
    `;


    // ---------------------------------------------------------
    // Назад
    // ---------------------------------------------------------

    const backBtn =
        document.getElementById("devBackButton");

    if (backBtn) {

        backBtn.onclick = function(event) {

            event.preventDefault();

            renderMain();
        };
    }


    // ---------------------------------------------------------
    // Продление срока
    // ---------------------------------------------------------

    const extendButton =
        document.getElementById("devExtendButton");

    if (extendButton && canExtend) {

        extendButton.onclick = async function(event) {

            event.preventDefault();
            event.stopPropagation();


            const daysText = prompt(
                "На сколько дней продлить разработку?",
                "30"
            );


            if (daysText === null) {
                return;
            }


            const extendDays =
                Number(daysText);


            if (
                !Number.isInteger(extendDays) ||
                extendDays < 1 ||
                extendDays > 365
            ) {

                alert(
                    "Введите целое число от 1 до 365."
                );

                return;
            }


            extendButton.disabled = true;

            extendButton.innerText =
                "Продление...";


            try {

                const result =
                    await api(
                        `/api/developments/${d.id}/extend`,
                        {
                            method: "POST",

                            body: JSON.stringify({

                                days:
                                    extendDays

                            })
                        }
                    );


                if (
                    !result ||
                    result.success !== true
                ) {

                    throw new Error(
                        result?.error ||
                        "Не удалось продлить срок."
                    );
                }


                alert(
                    `Срок разработки продлён на ${extendDays} дн.`
                );


                /*
                 * Перечитываем список.
                 *
                 * Новая дата окончания будет
                 * сразу отображена в карточке.
                 */

                await loadDevelopments();


            } catch (error) {

                console.error(
                    "Ошибка продления разработки:",
                    error
                );


                alert(
                    error.message ||
                    "Ошибка при продлении разработки."
                );


                extendButton.disabled =
                    false;

                extendButton.innerText =
                    "⏱ Продлить срок";
            }
        };
    }


    // ---------------------------------------------------------
    // Редактирование
    // ---------------------------------------------------------

    const editButton =
        document.getElementById("devEditButton");

    if (editButton) {

        editButton.onclick = function(event) {

            event.preventDefault();
            event.stopPropagation();

            renderDevelopmentEdit(d);
        };
    }


    // ---------------------------------------------------------
    // Создание заявки на договор
    // ---------------------------------------------------------

    const contractButton =
        document.getElementById("devContractButton");

    if (contractButton) {

        contractButton.onclick = async function(event) {

            event.preventDefault();
            event.stopPropagation();


            if (!d.display_name) {

                alert(
                    "Не указано наименование разработки."
                );

                return;
            }


            const confirmed = confirm(
                "Создать заявку на создание договора?"
            );

            if (!confirmed) {
                return;
            }


            contractButton.disabled = true;
            contractButton.innerText = "Отправка...";


            try {

                /*
                 * Для разработки из справочника:
                 *
                 * {
                 *     counterparty: "GUID",
                 *     name: "Название"
                 * }
                 *
                 * Для ручной разработки:
                 *
                 * {
                 *     name: "Название"
                 * }
                 */

                const payload = {

                    name:
                        d.display_name

                };


                if (d.counterparty_guid) {

                    payload.counterparty =
                        d.counterparty_guid;
                }


                const result = await api(
                    "/api/task",
                    {
                        method: "POST",

                        body: JSON.stringify({

                            type: "app_contract",

                            payload:
                                payload

                        })
                    }
                );


                if (
                    !result ||
                    result.success !== true
                ) {

                    throw new Error(
                        result?.error ||
                        "Не удалось отправить заявку."
                    );
                }


                /*
                 * Переводим разработку:
                 *
                 * active
                 *      ↓
                 * contract_request
                 */

                const statusResult =
                    await api(
                        `/api/developments/${d.id}/contract-request`,
                        {
                            method: "POST",

                            body: JSON.stringify({

                                task_uuid:
                                    result.uuid || ""

                            })
                        }
                    );


                if (
                    !statusResult ||
                    statusResult.success !== true
                ) {

                    throw new Error(
                        statusResult?.error ||
                        "Задача отправлена, но статус разработки не изменён."
                    );
                }


                alert(
                    "Заявка на создание договора отправлена."
                );


                /*
                 * Важно:
                 * не возвращаемся в старую карточку.
                 *
                 * Перечитываем весь список,
                 * чтобы в списке сразу появился
                 * новый статус.
                 */

                await loadDevelopments();


            } catch (error) {

                console.error(
                    "Ошибка создания заявки на договор:",
                    error
                );


                alert(
                    error.message ||
                    "Ошибка при создании заявки."
                );


                contractButton.disabled = false;

                contractButton.innerText =
                    "📄 Создать заявку на договор";
            }
        };
    }


    // ---------------------------------------------------------
    // Закрытие разработки менеджером
    // ---------------------------------------------------------

    const closeButton =
        document.getElementById("devCloseButton");

    if (closeButton) {

        closeButton.onclick = async function(event) {

            event.preventDefault();
            event.stopPropagation();


            const confirmed = confirm(
                "Закрыть эту разработку?\n\n" +
                "После закрытия она перестанет " +
                "учитываться в лимите активных разработок."
            );


            if (!confirmed) {
                return;
            }


            closeButton.disabled = true;
            closeButton.innerText = "Закрытие...";


            try {

                const result =
                    await api(
                        `/api/developments/${d.id}/close`,
                        {
                            method: "POST"
                        }
                    );


                if (
                    !result ||
                    result.success !== true
                ) {

                    throw new Error(
                        result?.error ||
                        "Не удалось закрыть разработку."
                    );
                }


                alert(
                    "Разработка закрыта."
                );


                /*
                 * Перечитываем список.
                 *
                 * Разработка теперь имеет статус
                 * closed и больше не занимает слот.
                 */

                await loadDevelopments();


            } catch (error) {

                console.error(
                    "Ошибка закрытия разработки:",
                    error
                );


                alert(
                    error.message ||
                    "Ошибка при закрытии разработки."
                );


                closeButton.disabled = false;

                closeButton.innerText =
                    "🔒 Закрыть разработку";
            }
        };
    }

}

// =========================================================
// РЕДАКТИРОВАНИЕ РАЗРАБОТКИ
// =========================================================

function renderDevelopmentEdit(d) {

    // Разработки, созданные из карточки контрагента 1С,
    // сохраняют адрес в формате 1С и не используют DaData.
    const isFromCounterparty = Boolean(d.counterparty_guid);

    content.innerHTML = `

        ${backButton("← Назад к разработке")}

        <div style="
            padding:15px;
            background:#fff;
            border:1px solid #ddd;
            border-radius:12px;
        ">

            <h2 style="
                margin-top:0;
                margin-bottom:16px;
            ">
                Редактирование разработки
            </h2>


            <form id="devEditForm">

                <label style="
                    display:block;
                    margin-top:10px;
                ">
                    <b>Название *</b>

                    <input
                        name="display_name"
                        required
                        value="${esc(d.display_name)}"
                        style="
                            width:100%;
                            box-sizing:border-box;
                            margin-top:5px;
                            padding:10px;
                            border:1px solid #ccc;
                            border-radius:8px;
                        "
                    >
                </label>


                <label style="
                    display:block;
                    margin-top:12px;
                ">
                    <b>Наименование (англ)</b>

                    <input
                        name="display_name_en"
                        value="${esc(d.display_name_en || "")}"
                        placeholder="Название на английском"
                        style="
                            width:100%;
                            box-sizing:border-box;
                            margin-top:5px;
                            padding:10px;
                            border:1px solid #ccc;
                            border-radius:8px;
                        "
                    >
                </label>


                <label style="
                    display:block;
                    margin-top:12px;
                ">
                    <b>Юр. лицо</b>

                    <input
                        name="legal_name"
                        value="${esc(d.legal_name)}"
                        style="
                            width:100%;
                            box-sizing:border-box;
                            margin-top:5px;
                            padding:10px;
                            border:1px solid #ccc;
                            border-radius:8px;
                        "
                    >
                </label>


                <label style="
                    display:block;
                    margin-top:12px;
                ">
                    <b>ИНН</b>

                    <input
                        name="inn"
                        value="${esc(d.inn)}"
                        inputmode="numeric"
                        placeholder="Введите ИНН"
                        style="
                            width:100%;
                            box-sizing:border-box;
                            margin-top:5px;
                            padding:10px;
                            border:1px solid #ccc;
                            border-radius:8px;
                        "
                    >
                </label>


                ${
                    isFromCounterparty
                        ? `
                            <label style="display:block;margin-top:12px;">
                                <b>Адрес *</b>
                                <input
                                    name="address"
                                    type="text"
                                    required
                                    value="${esc(d.address || d.actual_address || d.delivery_address || "")}"
                                    placeholder="Введите адрес из 1С"
                                    style="width:100%;box-sizing:border-box;margin-top:5px;padding:10px;border:1px solid #ccc;border-radius:8px;"
                                >
                            </label>
                        `
                        : `
                            <label style="display:block;margin-top:12px;position:relative;">
                                <b>Регион *</b>
                                <input
                                    name="region"
                                    id="devEditRegion"
                                    type="text"
                                    autocomplete="off"
                                    required
                                    placeholder="Начните вводить регион"
                                    value=""
                                    style="width:100%;box-sizing:border-box;margin-top:5px;padding:10px;border:1px solid #ccc;border-radius:8px;"
                                >
                                <div id="devEditRegionSuggestions" style="position:absolute;left:0;right:0;top:100%;z-index:1001;background:#fff;border:1px solid #ddd;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.12);overflow:hidden;display:none;"></div>
                            </label>

                            <label style="display:block;margin-top:12px;position:relative;">
                                <b>Адрес *</b>
                                <input
                                    name="address"
                                    id="devEditAddress"
                                    type="text"
                                    autocomplete="off"
                                    required
                                    placeholder="Сначала выберите регион"
                                    value="${esc(d.address || "")}"
                                    disabled
                                    style="width:100%;box-sizing:border-box;margin-top:5px;padding:10px;border:1px solid #ccc;border-radius:8px;background:#f5f5f5;"
                                >
                                <div id="devEditAddressSuggestions" style="position:absolute;left:0;right:0;top:100%;z-index:1000;background:#fff;border:1px solid #ddd;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,.12);overflow:hidden;display:none;"></div>
                            </label>
                        `
                }


                <label style="
                    display:block;
                    margin-top:12px;
                ">
                    <b>Email</b>

                    <input
                        name="email"
                        type="email"
                        value="${esc(d.email)}"
                        style="
                            width:100%;
                            box-sizing:border-box;
                            margin-top:5px;
                            padding:10px;
                            border:1px solid #ccc;
                            border-radius:8px;
                        "
                    >
                </label>


                <label style="
                    display:block;
                    margin-top:12px;
                ">
                    <b>Сайт</b>

                    <input
                        name="website"
                        value="${esc(d.website)}"
                        style="
                            width:100%;
                            box-sizing:border-box;
                            margin-top:5px;
                            padding:10px;
                            border:1px solid #ccc;
                            border-radius:8px;
                        "
                    >
                </label>


                <label style="
                    display:block;
                    margin-top:12px;
                ">
                    <b>Контактное лицо</b>

                    <input
                        name="contact_person"
                        value="${esc(d.contact_person)}"
                        style="
                            width:100%;
                            box-sizing:border-box;
                            margin-top:5px;
                            padding:10px;
                            border:1px solid #ccc;
                            border-radius:8px;
                        "
                    >
                </label>


                <label style="
                    display:block;
                    margin-top:12px;
                ">
                    <b>Комментарий</b>

                    <textarea
                        name="comment"
                        placeholder="Добавьте информацию по клиенту"
                        style="
                            width:100%;
                            box-sizing:border-box;
                            margin-top:5px;
                            padding:10px;
                            border:1px solid #ccc;
                            border-radius:8px;
                            min-height:120px;
                        "
                    >${esc(d.comment)}</textarea>
                </label>


                <div id="devEditError"></div>


                <button
                    id="devEditSave"
                    type="submit"
                    style="
                        width:100%;
                        margin-top:18px;
                        padding:12px;
                        border:0;
                        border-radius:10px;
                        background:#4caf50;
                        color:#fff;
                        font-size:15px;
                        font-weight:600;
                    "
                >
                    Сохранить
                </button>

            </form>

        </div>
    `;


    // ---------------------------------------------------------
    // НАЗАД К КАРТОЧКЕ
    // ---------------------------------------------------------

    const backBtn =
        document.getElementById("devBackButton");

    if (backBtn) {

        backBtn.onclick = function(event) {

            event.preventDefault();

            renderDevelopment(d);
        };
    }


    // ---------------------------------------------------------
    // DADATA — РЕГИОН + АДРЕС (как в форме создания)
    // При редактировании регион и адрес выбираются заново.
    // ---------------------------------------------------------

    if (!isFromCounterparty) {
        const regionInput = document.getElementById("devEditRegion");
        const regionSuggestions = document.getElementById("devEditRegionSuggestions");
        const addressInput = document.getElementById("devEditAddress");
        const addressSuggestions = document.getElementById("devEditAddressSuggestions");

        let selectedRegionFiasId = "";
        let selectedAddressFromDaData = false;
        let selectedAddressHasHouse = false;
        let regionTimer = null;
        let addressTimer = null;

        regionInput.addEventListener("input", function () {
            clearTimeout(regionTimer);
            selectedRegionFiasId = "";
            selectedAddressFromDaData = false;
            selectedAddressHasHouse = false;
            addressInput.value = "";
            addressInput.disabled = true;
            addressInput.placeholder = "Сначала выберите регион";
            addressInput.style.background = "#f5f5f5";
            addressSuggestions.innerHTML = "";
            addressSuggestions.style.display = "none";

            const query = this.value.trim();
            if (query.length < 2) {
                regionSuggestions.innerHTML = "";
                regionSuggestions.style.display = "none";
                return;
            }

            regionTimer = setTimeout(async () => {
                try {
                    const result = await api("/api/dadata/address", {
                        method: "POST",
                        body: JSON.stringify({ query })
                    });
                    const suggestions = Array.isArray(result?.suggestions) ? result.suggestions : [];
                    const regions = suggestions.filter(item => {
                        const data = item?.data || {};
                        return data?.region && data?.region_type && (
                            data.region_type === "обл" ||
                            data.region_type === "край" ||
                            data.region_type === "респ" ||
                            data.region_type === "АО" ||
                            data.region_type === "авт. обл" ||
                            data.region_type === "г"
                        );
                    });

                    if (!regions.length) {
                        regionSuggestions.innerHTML = "";
                        regionSuggestions.style.display = "none";
                        return;
                    }

                    regionSuggestions.innerHTML = regions.map((item, index) => {
                        const value = item?.value || item?.unrestricted_value || "";
                        const fiasId = item?.data?.region_fias_id || "";
                        if (!value || !fiasId) return "";
                        return `<div data-region-index="${index}" style="padding:10px;border-bottom:1px solid #eee;cursor:pointer;font-size:14px;line-height:1.35;">${esc(value)}</div>`;
                    }).join("");
                    regionSuggestions.style.display = "block";

                    regionSuggestions.querySelectorAll("[data-region-index]").forEach(item => {
                        item.addEventListener("click", () => {
                            const selected = regions[Number(item.dataset.regionIndex)];
                            if (!selected) return;
                            const regionName = selected?.value || selected?.unrestricted_value || "";
                            selectedRegionFiasId = selected?.data?.region_fias_id || "";
                            if (!regionName || !selectedRegionFiasId) return;

                            regionInput.value = regionName;
                            regionSuggestions.innerHTML = "";
                            regionSuggestions.style.display = "none";
                            addressInput.disabled = false;
                            addressInput.placeholder = "Начните вводить улицу, дом...";
                            addressInput.style.background = "#fff";
                        });
                    });
                } catch (error) {
                    console.error("DaData region error:", error);
                    regionSuggestions.innerHTML = "";
                    regionSuggestions.style.display = "none";
                }
            }, 300);
        });

        addressInput.addEventListener("input", function () {
            clearTimeout(addressTimer);
            selectedAddressFromDaData = false;
            selectedAddressHasHouse = false;
            const query = this.value.trim();
            if (query.length < 3 || !selectedRegionFiasId) {
                addressSuggestions.innerHTML = "";
                addressSuggestions.style.display = "none";
                return;
            }

            addressTimer = setTimeout(async () => {
                try {
                    const result = await api("/api/dadata/address", {
                        method: "POST",
                        body: JSON.stringify({
                            query,
                            locations: [{ region_fias_id: selectedRegionFiasId }]
                        })
                    });
                    const suggestions = Array.isArray(result?.suggestions) ? result.suggestions : [];
                    if (!suggestions.length) {
                        addressSuggestions.innerHTML = "";
                        addressSuggestions.style.display = "none";
                        return;
                    }

                    addressSuggestions.innerHTML = suggestions.map((item, index) => {
                        const value = item?.unrestricted_value || item?.value || "";
                        if (!value) return "";
                        return `<div data-address-index="${index}" style="padding:10px;border-bottom:1px solid #eee;cursor:pointer;font-size:14px;line-height:1.35;">${esc(value)}</div>`;
                    }).join("");
                    addressSuggestions.style.display = "block";

                    addressSuggestions.querySelectorAll("[data-address-index]").forEach(item => {
                        item.addEventListener("click", () => {
                            const selected = suggestions[Number(item.dataset.addressIndex)];
                            if (!selected) return;
                            const value = selected?.unrestricted_value || selected?.value || "";
                            if (!value) return;
                            addressInput.value = value;
                            selectedAddressFromDaData = true;
                            selectedAddressHasHouse = suggestionHasHouse(selected, value);
                            addressSuggestions.innerHTML = "";
                            addressSuggestions.style.display = "none";
                        });
                    });
                } catch (error) {
                    console.error("DaData address error:", error);
                    addressSuggestions.innerHTML = "";
                    addressSuggestions.style.display = "none";
                }
            }, 300);
        });

        document.addEventListener("click", function (event) {
            if (event.target !== regionInput && !regionSuggestions.contains(event.target)) {
                regionSuggestions.innerHTML = "";
                regionSuggestions.style.display = "none";
            }
            if (event.target !== addressInput && !addressSuggestions.contains(event.target)) {
                addressSuggestions.innerHTML = "";
                addressSuggestions.style.display = "none";
            }
        });

    }

    // ---------------------------------------------------------
    // СОХРАНЕНИЕ
    // ---------------------------------------------------------

    const form =
        document.getElementById("devEditForm");

    if (!form) {
        console.error(
            "[DEVELOPMENTS] Форма редактирования не создана"
        );
        return;
    }


    form.addEventListener(
        "submit",
        async function(event) {

            event.preventDefault();


            const errorBox = document.getElementById("devEditError");
            if (!isFromCounterparty) {
                if (!selectedRegionFiasId) {
                    errorBox.innerHTML = `<div style="margin-top:12px;padding:10px;background:#ffebee;border:1px solid #ef9a9a;border-radius:8px;color:#b71c1c;">Выберите регион из подсказок DaData.</div>`;
                    document.getElementById("devEditRegion").focus();
                    return;
                }
                if (!selectedAddressFromDaData || !document.getElementById("devEditAddress").value.trim()) {
                    errorBox.innerHTML = `<div style="margin-top:12px;padding:10px;background:#ffebee;border:1px solid #ef9a9a;border-radius:8px;color:#b71c1c;">Выберите адрес из подсказок DaData.</div>`;
                    document.getElementById("devEditAddress").focus();
                    return;
                }
                if (!selectedAddressHasHouse) {
                    errorBox.innerHTML = ADDRESS_NO_HOUSE_HTML;
                    document.getElementById("devEditAddress").focus();
                    return;
                }
            } else if (!String(new FormData(form).get("address") || "").trim()) {
                errorBox.innerHTML = `<div style="margin-top:12px;padding:10px;background:#ffebee;border:1px solid #ef9a9a;border-radius:8px;color:#b71c1c;">Укажите адрес контрагента из 1С.</div>`;
                form.elements.address.focus();
                return;
            }

            const fd =
                new FormData(form);


            const payload = {

                display_name:
                    String(
                        fd.get("display_name") || ""
                    ).trim(),

                display_name_en:
                    String(
                        fd.get("display_name_en") || ""
                    ).trim(),

                legal_name:
                    String(
                        fd.get("legal_name") || ""
                    ).trim(),

                inn:
                    String(
                        fd.get("inn") || ""
                    ).trim(),

                address:
                    String(
                        fd.get("address") || ""
                    ).trim(),

                address_has_house:
                    isFromCounterparty || selectedAddressHasHouse,

                phone:
                    String(
                        fd.get("phone") || ""
                    ).trim(),

                email:
                    String(
                        fd.get("email") || ""
                    ).trim(),

                website:
                    String(
                        fd.get("website") || ""
                    ).trim(),

                contact_person:
                    String(
                        fd.get("contact_person") || ""
                    ).trim(),

                comment:
                    String(
                        fd.get("comment") || ""
                    ).trim()
            };


            const saveButton =
                document.getElementById(
                    "devEditSave"
                );


            errorBox.innerHTML = "";

            saveButton.disabled = true;
            saveButton.innerText =
                "Сохранение...";


            try {

                const data =
                    await api(
                        `/api/developments/${d.id}`,
                        {
                            method: "PUT",

                            body:
                                JSON.stringify(
                                    payload
                                )
                        }
                    );


                const updated =
                    data?.development ||
                    data;


                // Если сервер вернул объект —
                // сразу показываем обновлённую карточку.
                if (updated && updated.id) {

                    renderDevelopment(
                        updated
                    );

                    return;
                }


                // Если сервер не вернул объект,
                // просто возвращаемся к карточке.
                renderDevelopment(d);

            } catch (error) {

                console.error(
                    "[DEVELOPMENTS] Ошибка сохранения:",
                    error
                );

                errorBox.innerHTML = `
                    <div style="
                        margin-top:12px;
                        padding:10px;
                        background:#ffebee;
                        border:1px solid #ef9a9a;
                        border-radius:8px;
                        color:#b71c1c;
                    ">
                        ${esc(
                            error?.message ||
                            "Не удалось сохранить изменения"
                        )}
                    </div>
                `;

                saveButton.disabled = false;
                saveButton.innerText =
                    "Сохранить";
            }
        }
    );
}



    // =========================================================
    // СТАРТ
    // =========================================================

    await loadDevelopments();

});