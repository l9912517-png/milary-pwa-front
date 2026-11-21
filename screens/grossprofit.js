console.log("GROSS PROFIT JS LOADED");

registerScreen("grossprofit", function () {

    window.currentScreen = "grossprofit";

    title.innerText = "Валовая прибыль";

    container.innerHTML = `
        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px;">

            <button type="button" class="btn-wide" onclick="openGrossProfitForm()">${iconSvg(ICON_REPORT)}Получить прибыль</button>

        </div>

        <div id="grossProfitHeader"
             style="font-weight:600;margin-bottom:10px;">
        </div>

        <div id="grossProfitContainer"></div>
    `;

    loadGrossProfitReport();
});


// =====================================================
// ЗАГРУЗКА
// =====================================================

async function loadGrossProfitReport(retry = 0) {

    const user = JSON.parse(localStorage.getItem("user"));

    const url =
        "/files/" +
        user.user_id +
        "/grossprofit.json";

    const header =
        document.getElementById("grossProfitHeader");

    const container =
        document.getElementById("grossProfitContainer");

    header.innerText = "Загрузка…";
    container.innerHTML = "";

    try {

        const r =
            await fetch(url + "?t=" + Date.now());

        if (!r.ok) {
            return retryLoad(retry);
        }

        const text = await r.text();

        if (!text || text.length < 20) {
            return retryLoad(retry);
        }

        let report;

        try {
            report = JSON.parse(text);
        } catch {
            return retryLoad(retry);
        }

        if (report.period) {

            header.innerText =
                report.period.from +
                " — " +
                report.period.to;

        } else {

            header.innerText =
                "Отчёт загружен";
        }

        let updatedHtml = "";

        if (
            report.updated_at &&
            typeof renderUpdatedAt === "function"
        ) {

            updatedHtml =
                renderUpdatedAt(
                    report.updated_at
                );
        }

        const formatMoney = value => {

            if (value === undefined ||
                value === null) {

                return "0";
            }

            return String(value)
                .split(",")[0];
        };

        let html = `
            ${updatedHtml}

            <div style="
                display:flex;
                flex-direction:column;
                gap:12px;
            ">
        `;

        // =====================
        // ИТОГИ
        // =====================

        if (report.totals) {

            html += `

                <div style="
                    background:var(--card);
                    border-radius:14px;
                    padding:14px;
                    border:1px solid var(--card-border);
                    box-shadow:0 2px 8px rgba(0,0,0,.05);
                ">

                    <div style="
                        font-size:16px;
                        font-weight:700;
                        margin-bottom:12px;
                    ">
                        Общий итог
                    </div>

                    <div class="report-row">
                        <div>Продажи</div>
                        <div>${formatMoney(report.totals.sales)}</div>
                    </div>

                    <div class="report-row">
                        <div>Себестоимость</div>
                        <div>${formatMoney(report.totals.cost)}</div>
                    </div>

                    <div class="report-row">
                        <div>Бонусы</div>
                        <div>${formatMoney(report.totals.bonus)}</div>
                    </div>

                    <div class="report-row">
                        <div><b>Валовая прибыль</b></div>
                        <div style="
                            color:var(--accent);
                            font-weight:700;
                        ">
                            ${formatMoney(report.totals.profit)}
                        </div>
                    </div>

                    <div class="report-row">
                        <div>ВП %</div>
                        <div>
                            ${escapeHtml(report.totals.profit_percent)}
                        </div>
                    </div>

                </div>
            `;
        }

        // =====================
        // МЕНЕДЖЕРЫ
        // =====================

        (report.managers || []).forEach((manager, index) => {

            const managerId =
                "gp_manager_" + index;

            const managerName =
                manager.manager &&
                manager.manager.trim()
                    ? manager.manager
                    : "Без менеджера";

            html += `

                <div style="
                    background:var(--card);
                    border-radius:14px;
                    overflow:hidden;
                    border:1px solid var(--card-border);
                    box-shadow:0 2px 8px rgba(0,0,0,.05);
                ">

                    <div
                        onclick="toggleGrossProfit('${managerId}')"
                        style="
                            padding:12px;
                            background:linear-gradient(135deg,var(--surface),rgba(255,255,255,0.16));
                            color:#fff;
                            cursor:pointer;
                        "
                    >

                        <div style="
                            display:flex;
                            justify-content:space-between;
                            align-items:center;
                        ">

                            <div>

                                <div style="
                                    font-size:15px;
                                    font-weight:700;
                                ">
                                    ${escapeHtml(managerName)}
                                </div>

                                <div style="
                                    font-size:12px;
                                    opacity:.9;
                                ">
                                    Продажи:
                                    ${formatMoney(manager.sales)}
                                </div>

                            </div>

                            <div style="
                                text-align:right;
                            ">

                                <div style="
                                    font-size:12px;
                                ">
                                    ВП %
                                </div>

                                <div style="
                                    font-weight:700;
                                ">
                                    ${escapeHtml(manager.profit_percent)}
                                </div>

                            </div>

                        </div>

                    </div>

                    <div
                        id="${managerId}"
                        style="display:none;"
                    >
            `;

            (manager.clients || []).forEach(client => {

                html += `

                    <div style="
                        padding:12px;
                        border-bottom:1px solid var(--card-border);
                    ">

                        <div style="
                            font-weight:600;
                            margin-bottom:8px;
                        ">
                            ${escapeHtml(client.client)}
                        </div>

                        <div style="
                            display:grid;
                            grid-template-columns:1fr 1fr;
                            gap:6px;
                            font-size:12px;
                        ">

                            <div>Продажи</div>
                            <div style="text-align:right;">
                                ${formatMoney(client.sales)}
                            </div>

                            <div>Себестоимость</div>
                            <div style="text-align:right;">
                                ${formatMoney(client.cost)}
                            </div>

                            <div>Бонус</div>
                            <div style="text-align:right;">
                                ${formatMoney(client.bonus)}
                            </div>

                            <div>ВП</div>
                            <div style="
                                text-align:right;
                                color:var(--accent);
                                font-weight:700;
                            ">
                                ${formatMoney(client.profit)}
                            </div>

                            <div>ВП %</div>
                            <div style="
                                text-align:right;
                                font-weight:700;
                            ">
                                ${escapeHtml(client.profit_percent)}
                            </div>

                        </div>

                    </div>
                `;
            });

            html += `
                    </div>
                </div>
            `;
        });

        html += `</div>`;

        container.innerHTML = html;

    } catch (e) {

        console.error(
            "GROSS PROFIT ERROR:",
            e
        );

        return retryLoad(retry);
    }

    function retryLoad(retry) {

        if (retry < 7) {

            setTimeout(() => {

                loadGrossProfitReport(
                    retry + 1
                );

            }, 1500);

        } else {

            header.innerText =
                "Данные не готовы";

            container.innerHTML =
                "<div class='menu-item'>Попробуйте позже</div>";
        }
    }
}


// =====================================================
// ФОРМА
// =====================================================


function closeGrossProfitForm() {

    const modal =
        document.querySelector(
            ".modal-overlay"
        );

    if (modal) {
        modal.remove();
    }
}


// =====================================================
// ЗАПРОС
// =====================================================


async function requestGrossProfitReport() {

    const managerInput = document.getElementById("grossProfitManager");

    const payload = {
        date_from: document.getElementById("grossProfitDateFrom").value,
        date_to: document.getElementById("grossProfitDateTo").value,
        manager: managerInput?.dataset?.guid || ""
    };

    closeGrossProfitForm();

    runReport({
        type: "grossprofit_report",
        payload: payload,
        file: "grossprofit.json",
        screen: "grossprofit",
        text: "Формирование валовой прибыли...",
        onDone: loadGrossProfitReport
    });
}


window.openGrossProfitForm = function () {

    const overlay =
        document.createElement("div");

    overlay.className =
        "modal-overlay";

    const today =
        new Date()
            .toISOString()
            .split("T")[0];

    overlay.innerHTML = `

        <div class="modal-window">

            <h3>
                Параметры отчёта
            </h3>

            <label>
                Дата с
            </label>

            <input
                type="date"
                id="grossProfitDateFrom"
                value="${today}"
            >

            <label>
                Дата по
            </label>

            <input
                type="date"
                id="grossProfitDateTo"
                value="${today}"
            >

            <label>
                Менеджер
            </label>

            <input
                type="text"
                id="grossProfitManager"
                placeholder="Выберите менеджера"
                readonly
                onclick="openDirectorySelect('managers','grossProfitManager')"
            >

            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="closeGrossProfitForm()">Отмена</button>
                <button type="button" class="btn-primary-wide" onclick="requestGrossProfitReport()">Получить</button>
            </div>

        </div>
    `;

    document.body.appendChild(
        overlay
    );

    const user =
        JSON.parse(
            localStorage.getItem("user")
        );

    const input =
        document.getElementById(
            "grossProfitManager"
        );

    if (user.role === "manager") {

        input.value =
            user.name || "";

        input.dataset.guid =
            user.user_id || "";

        input.removeAttribute(
            "onclick"
        );

        input.style.background = "var(--card)";
    }
};


window.toggleGrossProfit = function(id) {

    const el =
        document.getElementById(id);

    if (!el) return;

    el.style.display =
        el.style.display === "none"
            ? "block"
            : "none";
};

// === DIRECTORY ===

async function openDirectorySelect(type, targetInputId) {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal-window">

            <h3>Выбор</h3>

            <input type="text" id="searchInput"
                   placeholder="Поиск…"
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

    // 🔥 ROP / ADMIN / DIRECTOR — ВИДЯТ ВСЕХ
    if (user.role === "admin" || user.role === "director" || user.role === "rop") {
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

        div.innerHTML = `<span>${escapeHtml(item.name)}</span>`;

        div.onclick = function() {

            const input = document.getElementById(targetInputId);

            input.value = item.name;
            input.dataset.guid = item.guid || item.uuid || "";

            document.querySelector(".modal-overlay:last-of-type").remove();
        };

        container.appendChild(div);

    });
}