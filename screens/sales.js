registerScreen("sales", function() {

    window.currentScreen = "sales";

    title.innerText = "Продажи";

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px;">

            <div style="display:flex;gap:10px;">
                <button onclick="openSalesForm()">Получить</button>
                
            </div>

            <div id="salesReportHeader" style="font-weight:600;margin-top:10px;"></div>

            <div id="salesReportContainer"></div>

        </div>
    `;

    loadSalesReport();

});


function screen_sales() {

    title.innerText = "Продажи";

    container.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:10px;">

        <div style="display:flex;gap:10px;">
            <button onclick="event.stopPropagation(); openSalesForm()">Получить</button>
            <button onclick="event.stopPropagation(); loadSalesReport()">Обновить</button>
        </div>

        <div id="salesReportHeader" style="font-weight:600;margin-top:10px;"></div>

        <div id="salesReportContainer"></div>

    </div>
    `;

    loadSalesReport();
}


function loadSalesReport() {

    const user = JSON.parse(localStorage.getItem("user"));
    const url = "/files/" + user.user_id + "/sales.json";

    const header = document.getElementById("salesReportHeader");
    const container = document.getElementById("salesReportContainer");

    header.innerText = "Загрузка...";
    container.innerHTML = "";

    fetch(url + "?t=" + Date.now())
        .then(r => {

            if (!r.ok) {
                header.innerText = "Отчет не найден";
                return null;
            }

            return r.json();
        })
        .then(report => {

            if (!report) return;

            header.innerText = report.period
                ? report.period.from + " — " + report.period.to
                : "";

            if (!report.rows || !Array.isArray(report.rows)) {
                header.innerText = "Нет данных";
                return;
            }

            let html = `
            <div class="report-table">

                <div class="report-head">
                    <div>Контрагент</div>
                    <div>Сумма</div>
                </div>
            `;

            let reportTotal = 0;

            report.rows.forEach(row => {

                const chief = row[0] || "";
                const manager = row[1] || "";
                const counterparty = row[2] || "";

                const rawSum = String(row[3] || "0")
                    .replace(/\u00A0/g, '')
                    .replace(/\u202F/g, '')
                    .replace(/\s/g, '')
                    .replace(',', '.');

                const sum = Number(rawSum) || 0;
                const sumFormatted = formatMoney(row[3]);

                // ===== РУКОВОДИТЕЛЬ =====
                if (chief && !manager && !counterparty && sum === 0) {

                    html += `
                    <div class="report-row manager"
                         onclick="toggleManager(this)">
                        <div>${chief}</div>
                        <div></div>
                    </div>
                    `;

                }
                // ===== МЕНЕДЖЕР =====
                else if (manager && !counterparty && sum === 0) {

                    html += `
                    <div class="report-row manager"
                         onclick="toggleManager(this)">
                        <div style="padding-left:10px;">${manager}</div>
                        <div></div>
                    </div>
                    `;

                }
                // ===== ИТОГ =====
                else if (!counterparty && sum > 0) {

                    const label = manager || chief || "ИТОГ";

                    const isManagerTotal = manager && !chief;
                    const totalClass = isManagerTotal
                        ? "report-row total manager-total"
                        : "report-row total";

                    html += `
                    <div class="${totalClass}">
                        <div>${label}</div>
                        <div class="report-sum">${sumFormatted}</div>
                    </div>
                    `;

                }
                // ===== КОНТРАГЕНТ =====
                else if (counterparty) {

                    html += `
                    <div class="report-row child">
                        <div>${counterparty}</div>
                        <div class="report-sum">${sumFormatted}</div>
                    </div>
                    `;

                    reportTotal += sum;
                }

            });

            html += `
            <div class="report-row total">
                <div>ИТОГО</div>
                <div class="report-sum">
                ${formatMoney(reportTotal)}
                </div>
            </div>
            </div>
            `;

            container.innerHTML = html;

        })
        .catch(() => {

            header.innerText = "Ошибка загрузки";

        });

}


function openSalesForm() {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "salesModal";

    overlay.innerHTML = `
        <div class="modal-window">

            <h3>Параметры отчета</h3>

            <div class="period-buttons">

                <button class="period-btn" onclick="setSalesPeriod('today',this)">Сегодня</button>
                <button class="period-btn" onclick="setSalesPeriod('week',this)">Неделя</button>
                <button class="period-btn" onclick="setSalesPeriod('month',this)">Месяц</button>
                <button class="period-btn" onclick="setSalesPeriod('custom',this)">Свой</button>

            </div>

            <label>Период с</label>
            <input type="date" id="salesDateFrom">

            <label>Период по</label>
            <input type="date" id="salesDateTo">

            <label>Контрагент</label>
<input type="text" id="salesCounterparty"
       placeholder="Выберите контрагента"
       readonly
       onclick="openDirectorySelect('counterparties','salesCounterparty')">

<label>Менеджер</label>
<input type="text" id="salesManager"
       placeholder="Выберите менеджера"
       readonly
       onclick="openDirectorySelect('managers','salesManager')">

            <div class="modal-actions">
                <button onclick="requestSalesReport()">Получить</button>
                <button onclick="closeSalesForm()">Отмена</button>
            </div>

        </div>
    `;

    document.body.appendChild(overlay);

}


function formatDateLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function setSalesPeriod(type, btn) {

    document.querySelectorAll(".period-btn")
        .forEach(b => b.classList.remove("active"));

    btn.classList.add("active");

    const from = document.getElementById("salesDateFrom");
    const to = document.getElementById("salesDateTo");

    const today = new Date();

    if (type === "today") {

        const d = formatDateLocal(today);
        from.value = d;
        to.value = d;
    }

    if (type === "week") {

        const start = new Date();
        start.setDate(today.getDate() - 7);

        from.value = formatDateLocal(start);
        to.value = formatDateLocal(today);
    }

  if (type === "month") {

    const start = new Date(today);

    start.setMonth(start.getMonth() - 1);

    from.value = formatDateLocal(start);
    to.value = formatDateLocal(today);
}

    if (type === "custom") {
        from.focus();
    }
}


function closeSalesForm() {

    const modal = document.getElementById("salesModal");
    if (modal) modal.remove();

}


async function requestSalesReport() {

    const counterparty = document.getElementById("salesCounterparty");
    const manager = document.getElementById("salesManager");

    const payload = {
        date_from: document.getElementById("salesDateFrom").value,
        date_to: document.getElementById("salesDateTo").value,
        counterparty: counterparty?.dataset?.guid || "",
        manager: manager?.dataset?.guid || ""
    };

    closeSalesForm();

    runReport({
        type: "sales_report",
        payload: payload,
        file: "sales.json",
        screen: "sales",
        text: "Формирование продаж...",
        onDone: loadSalesReport
    });
}


function toggleManager(el) {

    let next = el.nextElementSibling;

    while (next && !next.classList.contains("manager")) {

        if (next.style.display === "none") {
            next.style.display = "flex";
        } else {
            next.style.display = "none";
        }

        next = next.nextElementSibling;

    }

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

    renderDirectoryList(data, listContainer, targetInputId, overlay);

    searchInput.oninput = () => {
        const q = searchInput.value.toLowerCase();

        const filtered = data.filter(item =>
            (item.name && item.name.toLowerCase().includes(q)) ||
            (item.full_name && item.full_name.toLowerCase().includes(q))
        );

        renderDirectoryList(filtered, listContainer, targetInputId, overlay);
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

    // 🔥 admin и director видят всё
    if (user.role === "admin" || user.role === "director") {
        return data;
    }

    // 🔥 остальные — только свои
    return data.filter(item =>
        item.manager_uuid === user.user_id ||
        item.director_uuid === user.user_id ||
        item.uuid === user.user_id
    );
}


function renderDirectoryList(data, container, targetInputId, overlay) {

    if (!data || data.length === 0) {
        container.innerHTML = `<div class="menu-item">Нет данных</div>`;
        return;
    }

    container.innerHTML = data.map(item => {

        const guid = (item.guid && item.guid !== "undefined")
            ? item.guid
            : (item.uuid || "");

        return `
        <div class="menu-item"
            onclick="selectDirectoryItem(
                '${targetInputId}',
                '${(item.name || "").replace(/'/g, "\\'")}',
                '${guid}',
                this
            )">

            <div style="display:flex;flex-direction:column;">
                <span>${item.name}</span>
                <span style="font-size:12px;color:#888;">
                    ${item.full_name || ""}
                </span>
            </div>

        </div>
        `;
    }).join("");
}


function formatMoney(val) {

    if (val === null || val === undefined) return "0";

    val = String(val)
        .replace(/\u00A0/g, '')
        .replace(/\u202F/g, '')
        .replace(/\s/g, '')
        .replace(',', '.')
        .replace(/[^\d.-]/g, '');

    val = Number(val);

    if (isNaN(val)) val = 0;

    return val.toLocaleString("ru-RU", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
}


function selectDirectoryItem(targetInputId, name, guid, el) {

    const input = document.getElementById(targetInputId);

    if (input) {
        input.value = name;
        input.dataset.guid = guid || "";
    }

    const overlay = el.closest(".modal-overlay");
    if (overlay) overlay.remove();
}