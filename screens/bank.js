console.log("BANK JS LOADED NEW VERSION");

registerScreen("bank", function() {

    window.currentScreen = "bank";

    title.innerText = "Банк";

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;gap:10px;">
                <button onclick="openBankForm()">Получить</button>
              
            </div>
            <div id="bankReportHeader" style="font-weight:600;margin-top:10px;"></div>
            <div id="bankReportContainer"></div>
        </div>
    `;

    loadBankReport();
});

function screen_bank() {

    title.innerText = "Банк";

    container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;gap:10px;">
            <button onclick="event.stopPropagation(); openBankForm()">Получить</button>
          
        </div>
        <div id="bankReportHeader" style="font-weight:600;margin-top:10px;"></div>
        <div id="bankReportContainer"></div>
    </div>
    `;

    loadBankReport();
}

async function loadBankReport(retry = 0) {

    const user = JSON.parse(localStorage.getItem("user"));
    const url = "/files/" + user.user_id + "/bank.json";

    const header = document.getElementById("bankReportHeader");
    const container = document.getElementById("bankReportContainer");

    header.innerText = "Загрузка...";
    container.innerHTML = "";

    try {

        const r = await fetch(url + "?t=" + Date.now());

        if (!r.ok) {
            return retryLoad(retry);
        }

        const text = await r.text();

        // 🔥 КЛЮЧЕВАЯ ПРОВЕРКА
        if (!text || text.length < 20) {
            return retryLoad(retry);
        }

        let report;

        try {
            report = JSON.parse(text);
        } catch {
            return retryLoad(retry);
        }

        // 🔥 ПРОВЕРКА "ГОТОВНОСТИ"
        if (!report.rows || !Array.isArray(report.rows)) {
            return retryLoad(retry);
        }

        if (!report.period || !report.period.from) {
            return retryLoad(retry);
        }

        // 🔥 updated_at
        let updatedHtml = "";
        if (typeof renderUpdatedAt === "function" && report.updated_at) {
            updatedHtml = renderUpdatedAt(report.updated_at);
        }

        header.innerText = report.period.from + " — " + report.period.to;

        let html = `
            ${updatedHtml}
            <div class="report-table">
                <div class="report-head">
                    <div>Контрагент</div>
                    <div>Сумма</div>
                </div>
        `;

        let managerTotal = 0;
        let directorTotal = 0;
        let reportTotal = 0;

        report.rows.forEach(row => {

            if (!row) return;

            const director = row[0] || "";
            const manager = row[1] || "";
            const counterparty = row[2] || "";

            const textCheck = (director + manager + counterparty).toLowerCase();
            if (textCheck.includes("итог")) return;

            const isDirector = director && !manager && !counterparty;
            const isManager = manager && !counterparty;
            const isRow = counterparty;

            let sum = String(row[3] ?? "0")
                .replace(/\u00A0/g, '')
                .replace(/\u202F/g, '')
                .replace(/\s/g, '')
                .replace(',', '.')
                .replace(/[^\d.-]/g, '');

            sum = Number(sum);
            if (isNaN(sum)) sum = 0;

            const sumFormatted = sum.toLocaleString("ru-RU", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });

            if (isDirector) {

                if (managerTotal > 0) {
                    html += `
                    <div class="report-row total">
                        <div>Итого менеджера</div>
                        <div class="report-sum">${managerTotal.toLocaleString("ru-RU",{minimumFractionDigits:2})}</div>
                    </div>`;
                    managerTotal = 0;
                }

                if (directorTotal > 0) {
                    html += `
                    <div class="report-row total">
                        <div><b>ИТОГ РУКОВОДИТЕЛЯ</b></div>
                        <div class="report-sum">${directorTotal.toLocaleString("ru-RU",{minimumFractionDigits:2})}</div>
                    </div>`;
                    directorTotal = 0;
                }

                html += `
                <div class="report-row director">
                    <div><b>${escapeHtml(director)}</b></div>
                    <div></div>
                </div>`;
                return;
            }

            if (isManager) {

                if (managerTotal > 0) {
                    html += `
                    <div class="report-row total">
                        <div>Итого менеджера</div>
                        <div class="report-sum">${managerTotal.toLocaleString("ru-RU",{minimumFractionDigits:2})}</div>
                    </div>`;
                    managerTotal = 0;
                }

                html += `
                <div class="report-row manager" onclick="toggleManager(this)">
                    <div style="padding-left:10px;">${escapeHtml(manager)}</div>
                    <div></div>
                </div>`;
                return;
            }

            if (isRow) {

                managerTotal += sum;
                directorTotal += sum;
                reportTotal += sum;

                html += `
                <div class="report-row child">
                    <div style="padding-left:20px;">${escapeHtml(counterparty)}</div>
                    <div class="report-sum">${escapeHtml(sumFormatted)}</div>
                </div>`;
            }

        });

        html += `
        <div class="report-row total">
            <div><b>ИТОГО</b></div>
            <div class="report-sum">${reportTotal.toLocaleString("ru-RU",{minimumFractionDigits:2})}</div>
        </div>
        </div>`;

        container.innerHTML = html;

    } catch (e) {

        console.error("BANK ERROR:", e);
        return retryLoad(retry);
    }

    function retryLoad(retry) {

        if (retry < 7) {
            setTimeout(() => loadBankReport(retry + 1), 1500);
        } else {
            header.innerText = "Данные не готовы";
            container.innerHTML = "<div class='menu-item'>Попробуйте позже</div>";
        }
    }
}
window.openBankForm = function() {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "bankModal";

    overlay.innerHTML = `
        <div class="modal-window">

            <h3>Параметры отчета</h3>

            <div class="period-buttons">

                <button class="period-btn" onclick="setBankPeriod('today',this)">Сегодня</button>
                <button class="period-btn" onclick="setBankPeriod('week',this)">Неделя</button>
                <button class="period-btn" onclick="setBankPeriod('month',this)">Месяц</button>
                <button class="period-btn" onclick="setBankPeriod('custom',this)">Свой</button>

            </div>

            <label>Период с</label>
            <input type="date" id="bankDateFrom">

            <label>Период по</label>
            <input type="date" id="bankDateTo">

            <label>Контрагент</label>
            <input type="text"
                   id="bankCounterparty"
                   placeholder="Выберите контрагента"
                   readonly
                   onclick="openDirectorySelect('counterparties','bankCounterparty')">

            <label>Менеджер</label>
            <input type="text"
                   id="bankManager"
                   placeholder="Выберите менеджера"
                   readonly
                   onclick="openDirectorySelect('managers','bankManager')">

            <div class="modal-actions">
                <button onclick="requestBankReport()">Получить</button>
                <button onclick="closeBankForm()">Отмена</button>
            </div>

        </div>
    `;

    document.body.appendChild(overlay);

    // ===============================
    // 🔥 ДАТА ПО УМОЛЧАНИЮ (ВЧЕРА)
    // ===============================

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const y = yesterday.toISOString().split("T")[0];

    document.getElementById("bankDateFrom").value = y;
    document.getElementById("bankDateTo").value = y;

    // ===============================
    // 🔥 МЕНЕДЖЕР ПО УМОЛЧАНИЮ
    // ===============================

    const user = JSON.parse(localStorage.getItem("user"));

    if (user && user.role === "manager") {

        const input = document.getElementById("bankManager");

        input.value = user.name || "";
        input.dataset.guid = user.user_id || "";

        // блокируем выбор
        input.onclick = null;
        input.style.background = "var(--card)";
    }
};

function closeBankForm() {

    const modal = document.getElementById("bankModal");
    if (modal) modal.remove();

}

function setBankPeriod(type, btn) {

    document.querySelectorAll(".period-btn")
        .forEach(b => b.classList.remove("active"));

    btn.classList.add("active");

    const from = document.getElementById("bankDateFrom");
    const to = document.getElementById("bankDateTo");

    const today = new Date();

    const format = d => d.toISOString().split("T")[0];

    if (type === "today") {

        const d = format(today);
        from.value = d;
        to.value = d;
    }

    if (type === "week") {

        const dFrom = new Date(today);
        dFrom.setDate(today.getDate() - 7);

        from.value = format(dFrom);
        to.value = format(today);
    }

    if (type === "month") {

        const dFrom = new Date(today);
        dFrom.setMonth(today.getMonth() - 1);

        from.value = format(dFrom);
        to.value = format(today);
    }

    if (type === "custom") {
        from.focus();
    }
}

async function requestBankReport() {

    const counterpartyInput = document.getElementById("bankCounterparty");

    const counterparty =
        (counterpartyInput?.dataset?.guid && counterpartyInput.dataset.guid !== "undefined")
            ? counterpartyInput.dataset.guid
            : "";

    const managerInput = document.getElementById("bankManager");

    const manager =
        (managerInput?.dataset?.guid && managerInput.dataset.guid !== "undefined")
            ? managerInput.dataset.guid
            : "";

    const payload = {
        date_from: document.getElementById("bankDateFrom").value,
        date_to: document.getElementById("bankDateTo").value,
        counterparty: counterparty,
        manager: manager
    };

    closeBankForm();

    runReport({
        type: "bank_report",
        payload: payload,
        file: "bank.json",
        screen: "bank",
        text: "Формирование банка...",
        onDone: loadBankReport
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
                   style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--card-border);" />

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

    if (user.role === "admin" || user.role === "director") {
        return data;
    }

    return data.filter(item =>
        item.manager_uuid === user.user_id ||
        item.director_uuid === user.user_id ||
        item.uuid === user.user_id
    );
}

function renderDirectoryList(data, container, targetInputId) {

    if (!data || data.length === 0) {
        container.innerHTML = `<div class="menu-item">Нет данных</div>`;
        return;
    }

    container.innerHTML = "";

    data.forEach(item => {

        const div = document.createElement("div");
        div.className = "menu-item";

        div.innerHTML = `
            <div style="display:flex;flex-direction:column;">
                <span>${escapeHtml(item.name)}</span>
                <span style="font-size:12px;color:var(--muted);">
                    ${escapeHtml(item.full_name || "")}
                </span>
            </div>
        `;

        div.onclick = function() {
        console.log("ITEM:", item);
          selectDirectoryItem(
    targetInputId,
    item.name,
    item.uuid
);
        };

        container.appendChild(div);

    });
}

function selectDirectoryItem(targetInputId, name, guid) {

    const input = document.getElementById(targetInputId);

    if (input) {
        input.value = name;
        input.dataset.guid = (guid && guid !== "undefined") ? guid : "";
    }

    const overlay = document.querySelector(".modal-overlay:last-of-type");
    if (overlay) overlay.remove();
}
