registerScreen("block", async function () {

    window.currentScreen = "block";

    title.innerText = "Блокировка";

    const jwt = localStorage.getItem("jwt");

    let approvalsHtml = `<div class="menu-item">Нет запросов</div>`;

    // ===== ПОЛУЧАЕМ ЗАПРОСЫ =====
    try {

const res = await fetch("/api/messages", {
    headers: { "Authorization": "Bearer " + jwt }
});

if (res.ok) {

    const result = await res.json();

    let data = result.messages || [];

    if (!Array.isArray(data)) {
        data = Object.values(data);
    }

    const requests = data.filter(m => m.type === "unblock_message");

            if (requests.length) {
            const decisions = getBlockDecisions();

                approvalsHtml = requests.map(r => {

                    const p = r.data || {};
const decision = decisions[r.id];

                    return `
<<div class="menu-item"
     onclick="void(0)"
     style="flex-direction:column;align-items:flex-start;gap:6px;cursor:pointer;">

    <div><strong>${p.name ? p.name : "Без названия"}</strong></div>

<div style="font-size:12px;color:#666;">
   Менеджер: ${p.manager || p.Manager || p.manager_name || p["Менеджер"] || "Не указан"}
</div>

<div style="display:flex;gap:10px;margin-top:6px;">

    <button 
        id="approve_${r.id}"
        onclick="handleBlockDecision('${r.id}', 'approve', '${r.id}', '${p.counterparty}')"
        style="background:${decision === 'approve' ? '#5c6bc0' : decision ? '#ccc' : '#4CAF50'};"
        ${decision ? "disabled" : ""}>
        ✔ Подтвердить
    </button>

    <button 
        id="reject_${r.id}"
        onclick="handleBlockDecision('${r.id}', 'reject', '${r.id}', '${p.counterparty}')"
        style="background:${decision === 'reject' ? '#5c6bc0' : decision ? '#ccc' : '#f44336'};"
        ${decision ? "disabled" : ""}>
        ✖ Отклонить
    </button>

</div>

</div>
`;
                }).join("");
            }

        }

    } catch (e) {
        console.error(e);
    }

    // ===== UI =====

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px;">

            <!-- ДЕЙСТВИЕ -->

            <div style="
                display:flex;
                flex-direction:column;
                gap:10px;
                padding:12px;
                border-radius:12px;
                background:#fff;
            ">

                <label>Контрагент</label>

                <input type="text"
                       id="blockCounterparty"
                       placeholder="Выберите контрагента"
                       readonly
                       onclick="openBlockCounterpartySelect()"
                       style="width:100%;padding:10px;border-radius:10px;border:1px solid #ccc;">

                <button onclick="blockClient()" style="background:#f44336;">
                    Заблокировать
                </button>

                <button onclick="unblockClient()" style="background:#4CAF50;">
                    Разблокировать
                </button>
                <button onclick="openInfoBlockReport()" style="background:#5c6bc0;">
    Снятые с блока
</button>

            </div>

            <!-- СОГЛАСОВАНИЯ -->

            <div>
                <div style="font-weight:600;margin-bottom:6px;">
                    Запросы на разблокировку
                </div>

                ${approvalsHtml}
            </div>

            <button onclick="showMenu()" style="background:#ccc;color:#000;">
                Назад
            </button>

        </div>
    `;
});

function getBlockDecisions() {
    return JSON.parse(localStorage.getItem("block_decisions") || "{}");
}

function saveBlockDecision(id, type) {
    const data = getBlockDecisions();
    data[id] = type;
    localStorage.setItem("block_decisions", JSON.stringify(data));
}

async function approveUnblock(messageId, counterparty) {

    await sendTask("approve_unblock", {
        message_id: messageId,
        counterparty: counterparty
    });

    alert("Одобрено");
    openScreen("block");
}


async function rejectUnblock(messageId, counterparty) {

    await sendTask("reject_unblock", {
        message_id: messageId,
        counterparty: counterparty
    });

    alert("Отклонено");
    openScreen("block");
}


async function openBlockCounterpartySelect() {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal-window">

            <h3>Выбор контрагента</h3>

            <input type="text" id="blockCpSearch"
                   placeholder="Поиск..."
                   style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc;margin-bottom:10px;" />

            <div id="blockCpList" style="max-height:300px;overflow:auto;"></div>

            <button onclick="this.closest('.modal-overlay').remove()">
                Закрыть
            </button>

        </div>
    `;

    document.body.appendChild(overlay);

    const list = overlay.querySelector("#blockCpList");
    const search = overlay.querySelector("#blockCpSearch");

    const jwt = localStorage.getItem("jwt");
    const user = JSON.parse(localStorage.getItem("user"));

    try {

        const res = await fetch("/api/directory/counterparties", {
            headers: { "Authorization": "Bearer " + jwt }
        });

        let data = await res.json();

        // 🔥 НОРМАЛИЗАЦИЯ
        if (!Array.isArray(data)) {
            data = Array.isArray(data.data) ? data.data : Object.values(data);
        }

        data = filterCounterpartiesByRole(data, user);

        function render(arr) {

            list.innerHTML = "";

            arr.forEach(c => {

                const div = document.createElement("div");
                div.className = "menu-item";

                div.innerHTML = `<strong>${c.name}</strong>`;

                div.onclick = () => {

                    const input = document.getElementById("blockCounterparty");

                    input.value = c.name;
                    input.dataset.guid = c.guid;

                    overlay.remove();
                };

                list.appendChild(div);
            });
        }

        render(data);

        search.oninput = () => {

            const q = search.value.toLowerCase();

            render(data.filter(c =>
                c.name && c.name.toLowerCase().includes(q)
            ));
        };

    } catch (e) {
        console.error(e);
        alert("Ошибка загрузки");
    }
}

function filterCounterpartiesByRole(data, user) {

    if (!user || !user.role) return data;

    if (user.role === "admin" || user.role === "director") return data;

    if (user.role === "manager") {
        return data.filter(c => c.manager_uuid === user.user_id);
    }

    if (user.role === "rop") {
        return data.filter(c => c.director_uuid === user.user_id);
    }

    return [];
}

async function blockClient() {

    const input = document.getElementById("blockCounterparty");

    if (!input || !input.dataset.guid) {
        alert("Выберите контрагента");
        return;
    }

    try {

        await sendTask("block_client", {
            counterparty: input.dataset.guid,
            name: input.value
        });

    } catch (e) {
        console.error(e);
        alert("Ошибка");
    }
}


async function unblockClient() {

    const input = document.getElementById("blockCounterparty");

    if (!input || !input.dataset.guid) {
        alert("Выберите контрагента");
        return;
    }

    try {

        await sendTask("unblock_client", {
            counterparty: input.dataset.guid,
            name: input.value
        });

    } catch (e) {
        console.error(e);
        alert("Ошибка");
    }
}

async function handleBlockDecision(id, type, messageId, counterparty) {
     saveBlockDecision(id, type);
    const approveBtn = document.getElementById("approve_" + id);
    const rejectBtn = document.getElementById("reject_" + id);

    if (!approveBtn || !rejectBtn) return;

    // 🔒 блокируем кнопки
    approveBtn.disabled = true;
    rejectBtn.disabled = true;

    // 🎨 окраска
    if (type === "approve") {
        approveBtn.style.background = "#5c6bc0";
        rejectBtn.style.background = "#ccc";
    } else {
        rejectBtn.style.background = "#5c6bc0";
        approveBtn.style.background = "#ccc";
    }

    // 🚀 ОТПРАВКА ТАСКА
    saveBlockDecision(id, type);
    try {

        if (type === "approve") {

            await sendTask("approve_unblock", {
                message_id: messageId,
                counterparty: counterparty
            });

        } else {

            await sendTask("reject_unblock", {
                message_id: messageId,
                counterparty: counterparty
            });

        }

    } catch (e) {

        console.error(e);
        alert("Ошибка отправки");

        // 🔁 можно разблокировать обратно если ошибка
        approveBtn.disabled = false;
        rejectBtn.disabled = false;
    }
}

async function openInfoBlockReport() {

    const user = JSON.parse(localStorage.getItem("user"));
    const jwt = localStorage.getItem("jwt");

    if (!user || !user.user_id) {
        alert("Пользователь не определён");
        return;
    }

    const fileUrl =
        "/files/" + user.user_id + "/infoblock.json";

    // ===== ЗАПОМИНАЕМ СТАРЫЙ report_id =====

    let oldReportId = null;

    try {

        const res = await fetch(
            fileUrl + "?t=" + Date.now(),
            {
                headers: {
                    "Authorization": "Bearer " + jwt
                },
                cache: "no-store"
            }
        );

        if (res.ok) {

            const data = await res.json();

            if (data && data.report_id) {
                oldReportId = String(data.report_id);
            }
        }

    } catch (e) {

        console.warn(
            "Не удалось получить старый infoblock.json:",
            e
        );
    }

    // ===== ОТПРАВЛЯЕМ ТАСК БЕЗ sendTask() =====

    try {

        const response = await fetch("/api/task", {
            method: "POST",

            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + jwt
            },

            body: JSON.stringify({
                type: "infoblock_report",
                payload: {}
            })
        });

        if (!response.ok) {
            throw new Error("Ошибка отправки задачи");
        }

    } catch (e) {

        console.error(e);

        alert("Ошибка отправки задачи");

        return;
    }

    // ===== ОТКРЫВАЕМ НАШЕ СОБСТВЕННОЕ ОКНО =====

    const overlay = document.createElement("div");

    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal-window"
             style="
                width:92%;
                max-width:700px;
                max-height:85vh;
                display:flex;
                flex-direction:column;
             ">

            <h3 style="margin-top:0;">
                Снятые с блока
            </h3>

            <div id="infoBlockReportContent"
                 style="
                    overflow-y:auto;
                    flex:1;
                    padding:4px;
                 ">

                <div style="
                    padding:30px;
                    text-align:center;
                ">
                    ⏳ Формируем отчёт...
                </div>

            </div>

            <button
                onclick="this.closest('.modal-overlay').remove()"
                style="margin-top:10px;">
                Закрыть
            </button>

        </div>
    `;

    document.body.appendChild(overlay);

    // ===== ЖДЁМ НОВЫЙ ФАЙЛ =====

    waitForInfoBlockReport(
        fileUrl,
        oldReportId,
        overlay
    );
}

async function waitForInfoBlockReport(
    fileUrl,
    oldReportId,
    overlay
) {

    const content =
        overlay.querySelector("#infoBlockReportContent");

    let attempts = 0;
    const maxAttempts = 120;

    async function checkFile() {

        attempts++;

        if (attempts > maxAttempts) {

            content.innerHTML = `
                <div style="
                    padding:20px;
                    text-align:center;
                    color:#c00;
                ">
                    Не удалось дождаться формирования отчёта
                </div>
            `;

            return;
        }

        try {

            const res = await fetch(
                fileUrl + "?t=" + Date.now(),
                {
                    cache: "no-store"
                }
            );

            if (res.ok) {

                const data = await res.json();

                if (data && data.report_id) {

                    const newReportId =
                        String(data.report_id);

                    if (
                        oldReportId === null ||
                        newReportId !== oldReportId
                    ) {

                        // НОВЫЙ ОТЧЁТ ГОТОВ

                        renderInfoBlockReport(
                            data,
                            content
                        );

                        return;
                    }
                }
            }

        } catch (e) {

            console.warn(
                "Ошибка проверки infoblock.json:",
                e
            );
        }

        // Ещё не готов — проверяем через 500 мс

        setTimeout(checkFile, 500);
    }

    checkFile();
}

function renderInfoBlockReport(data, container) {

    if (
        !data.rows ||
        !Array.isArray(data.rows) ||
        data.rows.length === 0
    ) {

        container.innerHTML = `
            <div style="
                padding:30px 10px;
                text-align:center;
                color:#777;
            ">
                Нет снятых с блока контрагентов
            </div>
        `;

        return;
    }

    // ===== ГРУППИРОВКА ПО МЕНЕДЖЕРУ =====

    const groups = new Map();

    data.rows.forEach(row => {

        const manager =
            row.manager || "Менеджер не указан";

        if (!groups.has(manager)) {
            groups.set(manager, []);
        }

        groups.get(manager).push(row);
    });

    let html = "";

    // ===== ВЫВОД ГРУПП =====

    groups.forEach((rows, manager) => {

        html += `
            <div style="
                margin-bottom:18px;
                border-radius:12px;
                overflow:hidden;
                background:#fff;
                box-shadow:0 1px 4px rgba(0,0,0,0.10);
            ">

                <!-- МЕНЕДЖЕР -->

                <div style="
                    padding:12px 14px;
                    font-size:16px;
                    font-weight:700;
                    background:#f1f3f5;
                    border-bottom:1px solid #ddd;
                ">
                    ${escapeHtml(manager)}
                </div>

                <!-- КОНТРАГЕНТЫ -->

                <div>
        `;

        rows.forEach(row => {

            html += `
                <div style="
                    padding:10px 14px;
                    border-bottom:1px solid #eee;
                ">

                    <div style="
                        font-size:14px;
                        font-weight:500;
                    ">
                        ${escapeHtml(row.counterparty || "-")}
                    </div>

                    <div style="
                        margin-top:3px;
                        font-size:12px;
                        color:#777;
                    ">
                        Снятие блока до:
                        ${escapeHtml(row.date_to || "-")}
                    </div>

                </div>
            `;

        });

        html += `
                </div>
            </div>
        `;
    });

    html += `
        <div style="
            text-align:center;
            font-size:11px;
            color:#999;
            margin-top:8px;
        ">
            Обновлено:
            ${escapeHtml(data.updated_at || "")}
        </div>
    `;

    container.innerHTML = html;
}

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}