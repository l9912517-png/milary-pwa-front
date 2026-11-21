console.log("DEBT JS LOADED");

registerScreen("debt", function () {

    window.currentScreen = "debt";

    title.innerText = "Дебиторка";

   container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;">

        <!-- КНОПКА + ПОИСК В ОДНОЙ СТРОКЕ -->
        <div style="
            display:flex;
            align-items:center;
            gap:8px;
            width:100%;
        ">

            <button
                onclick="openDebtForm()"
                style="
                    flex:0 0 auto;
                    white-space:nowrap;
                "
            >
                Получить дебиторку
            </button>

            <!-- ПОИСК ПО КОНТРАГЕНТУ -->
            <div style="
                position:relative;
                flex:1;
                min-width:0;
            ">

                <input
                    type="text"
                    id="debtSearch"
                    placeholder="Поиск..."
                    autocomplete="off"
                    style="
                        width:100%;
                        box-sizing:border-box;
                        padding:8px 34px 8px 10px;
                        border:1px solid #ccc;
                        border-radius:8px;
                        font-size:14px;
                    "
                >

                <!-- КРЕСТИК ОЧИСТКИ -->
                <button
                    id="debtSearchClear"
                    type="button"
                    onclick="clearDebtSearch()"
                    aria-label="Очистить поиск"
                    style="
                        position:absolute;
                        right:5px;
                        top:50%;
                        transform:translateY(-50%);
                        width:26px;
                        height:26px;
                        padding:0;
                        border:none;
                        border-radius:50%;
                        background:#eee;
                        color:#777;
                        font-size:18px;
                        line-height:26px;
                        cursor:pointer;
                        display:none;
                    "
                >×</button>

            </div>

        </div>

        <div id="debtHeader" style="font-weight:600;"></div>

        <div id="debtContainer"></div>

    </div>

    <style>
        /* Сетка только для дебиторки: наименование переносится,
           цифры стоят ровными колонками */
        .debt-table .report-head,
        .debt-table .report-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 22px 40px 86px 86px;
            column-gap: 6px;
            align-items: center;
        }

        .debt-table .report-sum {
            min-width: 0;
            text-align: right;
            white-space: nowrap;
        }

        .debt-table .report-head > div:nth-child(n+2) {
            text-align: right;
        }

        .debt-table .debt-name {
            white-space: normal;
            overflow-wrap: anywhere;
            word-break: break-word;
            line-height: 1.25;
        }

        .debt-table .debt-full {
            display: block;
        }

        @media (max-width: 480px) {
            .debt-table .report-head,
            .debt-table .report-row {
                grid-template-columns: minmax(0, 1fr) 18px 32px 74px 74px;
                column-gap: 4px;
                font-size: 12px;
            }
        }
    </style>
`;

    const searchInput = document.getElementById("debtSearch");

    searchInput.addEventListener("input", function () {

        const query = this.value.trim().toLowerCase();

        const clearButton = document.getElementById("debtSearchClear");

        if (clearButton) {
            clearButton.style.display = query ? "block" : "none";
        }

        renderDebtReport(query);
    });

    loadDebt();
});


function loadDebt() {

    const user = JSON.parse(localStorage.getItem("user"));
    const url = "/files/" + user.user_id + "/debt.json";

    const header = document.getElementById("debtHeader");
    const container = document.getElementById("debtContainer");

    header.innerText = "Загрузка...";
    container.innerHTML = "";

    fetch(url + "?t=" + Date.now())
        .then(r => {

            if (!r.ok) {
                header.innerText = "Отчет не найден";
                return null;
            }

            return r.text();
        })

        .then(text => {

            if (!text) {
                header.innerText = "Нет данных";
                return;
            }

            let data;

            try {

                text = text.replace(/\\r\\n/g, '');

                if (text.startsWith('"') && text.endsWith('"')) {
                    text = text.slice(1, -1);
                }

                text = text.replace(/\\"/g, '"');

                data = JSON.parse(text);

                // ФИКС ДЛЯ WAIT
                if (data && data.updated_at) {
                    window.lastDebtUpdate = data.updated_at;
                }

            } catch (e) {

                console.error("JSON parse error:", e);
                header.innerText = "Ошибка JSON";
                return;
            }

            if (!data || !Array.isArray(data.rows)) {
                header.innerText = "Нет данных";
                return;
            }

            header.innerText = data.updated_at
                ? "Обновлено: " + data.updated_at
                : "Актуально";

            // Сохраняем данные в памяти страницы.
            // Повторно файл при поиске НЕ загружаем.
            window.debtReportData = data;

            renderDebtReport("");


        })
        .catch(() => {

            header.innerText = "Ошибка загрузки";

        });
}

function renderDebtReport(searchQuery = "") {

    const container = document.getElementById("debtContainer");

    if (!container) return;

    const data = window.debtReportData;

    if (!data || !Array.isArray(data.rows)) {
        container.innerHTML = "";
        return;
    }

    const query = String(searchQuery || "")
        .trim()
        .toLowerCase();

    let html = `
        <div class="report-table debt-table">

            <div class="report-head">
                <div>Контрагент</div>
                <div>Блок</div>
                <div>Дни</div>
                <div>Долг</div>
                <div>Просрочено</div>
            </div>
    `;

    let foundCount = 0;

    data.rows.forEach(manager => {

        const clients = Array.isArray(manager.children)
            ? manager.children
            : [];

        // Если поиска нет — показываем всех.
        // Если поиск есть — оставляем только контрагентов,
        // в названии которых есть введенный текст.
        const filteredClients = query
            ? clients.filter(client => {

                const clientName = String(client.Имя || "")
                    .toLowerCase();

                return clientName.includes(query);
            })
            : clients;

        // При поиске менеджера показываем только если
        // у него найден хотя бы один контрагент.
        if (query && filteredClients.length === 0) {
            return;
        }

        foundCount += filteredClients.length;

        // Строка менеджера
        html += `
            <div class="report-row manager">
                <div class="debt-name">${manager.Имя || ""}</div>
                <div></div>
                <div></div>
                <div class="report-sum">
                    ${formatMoney(manager.Долг)}
                </div>
                <div class="report-sum">
                    ${formatMoney(manager.Просрочка)}
                </div>
            </div>
        `;

        filteredClients.forEach(client => {

            const isBlocked = client.Блок === "Да";
            const reason = client.ПричинаБлока || "";

            html += `
                <div class="report-row child"
                     style="font-weight:600;background:#f5f5f5;">

                    <div class="debt-name">
                        ${client.Имя || ""}
                    </div>

                    <div>
                        ${isBlocked ? "🔒" : ""}
                    </div>

                    <div>
                        ${client.Дни || ""}
                    </div>

                    <div class="report-sum">
                        ${formatMoney(client.Долг)}
                    </div>

                    <div class="report-sum">
                        ${formatMoney(client.Просрочка)}
                    </div>

                </div>
            `;

            // Документы контрагента
            (client.children || []).forEach(doc => {

                const days = String(doc.Дни || "");

                const color = days.includes("-")
                    ? "red"
                    : "green";

                const rework =
                    doc.Переделка &&
                    doc.Переделка.trim()
                        ? " | " + doc.Переделка.trim()
                        : "";

                html += `
                    <div class="report-row child">

                        <div class="debt-name" style="padding-left:20px;">
                            ${doc.Имя || ""}${rework}
                        </div>

                        <div></div>

                        <div style="color:${color};">
                            ${days}
                        </div>

                        <div class="report-sum">
                            ${formatMoney(doc.Долг)}
                        </div>

                        <div class="report-sum">
                            ${formatMoney(doc.Просрочка)}
                        </div>

                    </div>
                `;
            });

            // Причина блока
            if (reason) {

                html += `
                    <div
                        class="report-row child debt-full"
                        style="
                            color:red;
                            font-size:12px;
                            padding-left:20px;
                        "
                    >
                        ${reason}
                    </div>
                `;
            }

            // Кнопка разблокировки
            if (isBlocked) {

                html += `
                    <div
                        class="report-row child debt-full"
                        style="padding-left:20px;"
                    >

                        <button
                            onclick="confirmUnlock(
                                '${client.GUID}',
                                '${client.Имя}'
                            )"
                            style="
                                font-size:11px;
                                padding:4px 8px;
                                border:none;
                                border-radius:6px;
                                background:#5a0f1c;
                                color:#fff;
                                cursor:pointer;
                            "
                        >
                            Снять с блока
                        </button>

                    </div>
                `;
            }

        });

    });

    html += `</div>`;

    // Ничего не найдено
    if (query && foundCount === 0) {

        html = `
            <div style="
                padding:20px;
                text-align:center;
                color:#777;
            ">
                Контрагент не найден
            </div>
        `;
    }

    container.innerHTML = html;
}

function clearDebtSearch() {

    const input = document.getElementById("debtSearch");
    const clearButton = document.getElementById("debtSearchClear");

    if (!input) return;

    input.value = "";

    if (clearButton) {
        clearButton.style.display = "none";
    }

    renderDebtReport("");
    
    input.focus();
}

function confirmUnlock(clientGuid, clientName) {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal-window">

            <h3>Разблокировка</h3>

            <div style="margin-bottom:15px;">
                Отправить заявку на разблокировку<br>
                <b>${clientName}</b> ?
            </div>

            <div style="display:flex;gap:10px;">
                <button onclick="sendUnlockTask('${clientGuid}', '${clientName}')">Да</button>
                <button onclick="this.closest('.modal-overlay').remove()">Нет</button>
            </div>

        </div>
    `;

    document.body.appendChild(overlay);
}

async function sendUnlockTask(clientGuid, clientName) {

    const jwt = localStorage.getItem("jwt");
    const user = JSON.parse(localStorage.getItem("user"));

    try {

        const response = await fetch("/api/task", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + jwt
            },
            body: JSON.stringify({
                type: "unblock_request",
                payload: {
                    counterparty: clientGuid,   // ✅ КАК У ТЕБЯ ВЕЗДЕ
                    name: clientName,           // (если используешь — оставляем)
                    user_uuid: user.user_id
                }
            })
        });

        if (!response.ok) {
            throw new Error("Ошибка запроса");
        }

        alert("Заявка отправлена");

        const modal = document.querySelector(".modal-overlay");
        if (modal) modal.remove();

    } catch (e) {

        console.error(e);
        alert("Ошибка отправки");

    }
}

window.openDebtForm = function () {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal-window">

            <h3>Параметры</h3>

            <label>Дата</label>
            <input type="date" id="debtDate">

            <label>Менеджер</label>
            <input type="text"
                   id="debtManager"
                   placeholder="Выберите менеджера"
                   readonly
                   onclick="openDirectorySelect('managers','debtManager')">

            <div class="modal-actions">
    <button onclick="requestDebt()">Обновить отчет</button>
    <button onclick="requestDebt(true)">Получить в файле</button>
    <button onclick="this.closest('.modal-overlay').remove()">Отмена</button>
</div>
        </div>
    `;

    document.body.appendChild(overlay);

    // ===== ДАТА =====
    const d = new Date().toISOString().split("T")[0];
    document.getElementById("debtDate").value = d;

    const user = JSON.parse(localStorage.getItem("user"));
    const input = document.getElementById("debtManager");

    // ===== ЕСЛИ МЕНЕДЖЕР =====
    if (user.role === "manager") {

        input.value = user.name || "";
        input.dataset.guid = user.user_id || "";

        // блокируем выбор
        input.removeAttribute("onclick");
        input.style.background = "#eee";
    }
};

async function requestDebt(isFile) {

    const date = document.getElementById("debtDate")?.value;

    if (!date) {
        alert("Выберите дату");
        return;
    }

    const managerGuidInput = document.getElementById("debtManager");

    const managerGuid =
        (managerGuidInput?.dataset?.guid && managerGuidInput.dataset.guid !== "undefined")
            ? managerGuidInput.dataset.guid
            : (managerGuidInput?.dataset?.uuid || "");

    if (!managerGuid) {
        alert("Выберите менеджера");
        return;
    }

    const payload = {
        date_from: date,
        manager: managerGuid
    };

    // Дебиторка файлом (Excel) — просто отправляем задачу, файл придёт в «Файлы»
    if (isFile === true) {

        try {

            const response = await fetch("/api/task", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + localStorage.getItem("jwt")
                },
                body: JSON.stringify({
                    type: "debt_report_file",
                    payload: payload
                })
            });

            if (!response.ok) {
                throw new Error("Ошибка запроса");
            }

            alert("Задача на файл отправлена");

            const modal = document.querySelector(".modal-overlay");
            if (modal) modal.remove();

        } catch (e) {

            console.error(e);
            alert("Ошибка отправки");
        }

        return;
    }

    const modal = document.querySelector(".modal-overlay");
    if (modal) modal.remove();

    runReport({
        type: "debt_report",
        payload: payload,
        file: "debt.json",
        screen: "debt",
        text: "Формирование дебиторки...",
        onDone: loadDebt
    });
}

function formatMoney(val) {

    if (!val) return "0";

    val = String(val)
        .replace(/\u00A0/g, '')   // ← ВАЖНО
        .replace(/\u202F/g, '')
        .replace(/\s/g, '')
        .replace(',', '.')
        .replace(/[^\d.-]/g, '');

    let num = Number(val);

    if (isNaN(num)) num = 0;

    return num.toLocaleString("ru-RU", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
}

async function openDirectorySelect(type, targetInputId) {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal-window">

            <h3>Выбор</h3>

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

    let data = await loadDirectoryData(type);

    renderDirectoryList(data, listContainer, targetInputId);

    searchInput.oninput = () => {
        const q = searchInput.value.toLowerCase();

        const filtered = data.filter(item =>
            (item.name && item.name.toLowerCase().includes(q)) ||
            (item.full_name && item.full_name.toLowerCase().includes(q))
        );

        renderDirectoryList(filtered, listContainer, targetInputId);
    };
}

async function loadDirectoryData(type) {

    const jwt = localStorage.getItem("jwt");

    const response = await fetch(`/api/directory/${type}`, {
        headers: {
            "Authorization": "Bearer " + jwt
        }
    });

    if (!response.ok) {
        alert("Ошибка загрузки справочника");
        return [];
    }

    let data = await response.json();

    const user = JSON.parse(localStorage.getItem("user"));

    // 🔥 АДМИН И ДИРЕКТОР ВИДЯТ ВСЕХ
    if (user.role === "admin" || user.role === "director") {
        return data;
    }

    // 🔥 ОСТАЛЬНЫЕ — ТОЛЬКО СВОИХ
    return data.filter(item =>
        item.manager_uuid === user.user_id ||
        item.director_uuid === user.user_id ||
        item.uuid === user.user_id
    );
}

function renderDirectoryList(data, container, targetInputId) {

    container.innerHTML = "";

    data.forEach(item => {

        const div = document.createElement("div");
        div.className = "menu-item";

        div.innerHTML = `<span>${item.name}</span>`;

        div.onclick = function() {

            const input = document.getElementById(targetInputId);

            input.value = item.name;
            input.dataset.guid = item.guid || item.uuid || "";

            document.querySelector(".modal-overlay:last-of-type").remove();
        };

        container.appendChild(div);

    });
}


