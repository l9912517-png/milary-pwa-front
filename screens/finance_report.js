console.log("FINANCE REPORT JS LOADED");

registerScreen("finance_report", function() {

    window.currentScreen = "finance";

    title.innerText = "Финансовый отчёт";

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px;">

            <div style="display:flex;gap:10px;">
                <button type="button" class="btn-wide" onclick="openFinanceReportForm()">${iconSvg(ICON_REPORT)}Получить отчёт</button>
            </div>

            <div id="financeHeader" style="font-weight:600;margin-top:10px;"></div>
            <div id="financeContainer"></div>

        </div>
    `;

    loadFinanceReport();
});


/* ================= LOAD ================= */

async function loadFinanceReport(retry = 0) {

    const user = JSON.parse(localStorage.getItem("user"));
    const url = "/files/" + user.user_id + "/finance_report.json";

    const header = document.getElementById("financeHeader");
    const container = document.getElementById("financeContainer");

    header.innerText = "Загрузка…";
    container.innerHTML = "";

    try {

        const r = await fetch(url + "?t=" + Date.now());
        if (!r.ok) return retryLoad(retry);

        const text = await r.text();
        if (!text || text.length < 20) return retryLoad(retry);

        let report;

        try {
            report = JSON.parse(text);
        } catch {
            return retryLoad(retry);
        }

        if (!report) return retryLoad(retry);

        header.innerText = report.date || "";

        let updatedHtml = "";
        if (report.updated_at && typeof renderUpdatedAt === "function") {
            updatedHtml = renderUpdatedAt(report.updated_at);
        }

        // ===== helpers =====

        function parseNumber(val) {

            let raw = String(val || "");

            raw = raw
                .replace(/\u00A0/g, "")
                .replace(/\u202F/g, "")
                .replace(/\s/g, "")
                .replace(",", ".");

            raw = raw.replace(/[^\d.-]/g, "");

            let num = Number(raw);

            return isNaN(num) ? 0 : num;
        }

        function formatMoney(val) {

            const num = parseNumber(val);

            return num.toLocaleString("ru-RU", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        }

        function formatMoneyColored(val) {

            const num = parseNumber(val);

            let color = "var(--text)";

            if (num > 0) color = "var(--accent)";
            if (num < 0) color = "#FF8FB3";

            return `
                <span style="color:${color};font-weight:500;">
                    ${num.toLocaleString("ru-RU", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                    })}
                </span>
            `;
        }

        const block = (title, items) => {

            let rows = "";

            items.forEach((i, index) => {

                const isTotal = index === items.length - 1;

                rows += `
                    <div style="
                        display:flex;
                        justify-content:space-between;
                        align-items:center;
                        padding:${isTotal ? "8px 0 0 0" : "4px 0"};
                        font-weight:${isTotal ? "600" : "400"};
                        font-size:${isTotal ? "15px" : "13px"};
                        border-top:${isTotal ? "1px solid var(--line)" : "none"};
                        margin-top:${isTotal ? "6px" : "0"};
                    ">
                        <div>${escapeHtml(i.name)}</div>
                        <div>${formatMoneyColored(i.value)}</div>
                    </div>
                `;
            });

            return `
                <div style="
                    background:var(--card);
                    border-radius:14px;
                    padding:14px;
                    box-shadow:0 4px 12px rgba(0,0,0,0.06);
                ">
                    <div style="
                        font-size:12px;
                        color:var(--muted);
                        margin-bottom:6px;
                        text-transform:uppercase;
                        letter-spacing:0.5px;
                    ">
                        ${escapeHtml(title)}
                    </div>
                    ${rows}
                </div>
            `;
        };

        // ===== HTML =====

        let html = `
            ${updatedHtml}

            <div style="display:flex;gap:10px;margin-bottom:8px;">

                <div style="flex:1;background:var(--card);padding:10px;border-radius:12px;">
                    <div style="font-size:11px;color:var(--muted);">Продажи</div>
                    <div style="font-weight:600;">
                        ${formatMoney(report.sales?.total)}
                    </div>
                </div>

                <div style="flex:1;background:var(--card);padding:10px;border-radius:12px;">
                    <div style="font-size:11px;color:var(--muted);">ВП</div>
                    <div style="font-weight:600;">
                        ${formatMoney(report.profit_block?.profit)}
                    </div>
                </div>

            </div>

            <div style="
                display:grid;
                grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
                gap:12px;
            ">
        `;

        // ===== БЛОКИ =====

        if (report.sales) {
            html += block("Продажи", [
                { name: "Б/н", value: report.sales.bn },
                { name: "Нал", value: report.sales.cash },
                { name: "Итого", value: report.sales.total }
            ]);
        }

        if (report.purchases) {
            html += block("Закупки", [
                { name: "Б/н", value: report.purchases.bn },
                { name: "Нал", value: report.purchases.cash },
                { name: "Итого", value: report.purchases.total }
            ]);
        }

        if (report.balances) {
            html += block("Взаиморасчеты", [
                { name: "Дебиторка", value: report.balances.debit },
                { name: "Кредиторка", value: report.balances.credit }
            ]);
        }

        if (report.bank) {
            html += block("Банк", [
                { name: "Приход", value: report.bank.income },
                { name: "Расход", value: report.bank.expense }
            ]);
        }

        if (report.profit_block) {
            html += block("Валовая прибыль", [
                { name: "ВП", value: report.profit_block.profit },
                { name: "Себестоимость", value: report.profit_block.cost }
            ]);
        }

        html += `</div>`;

        // ===== СКЛАД =====

        if (report.warehouse) {
            html += `
                <div style="
                    margin-top:12px;
                    background:linear-gradient(135deg, rgba(181,224,138,0.16) 0%, rgba(255,255,255,0.05) 100%);
                    border:1px solid rgba(181,224,138,0.35);
                    color:var(--text);
                    border-radius:16px;
                    padding:18px;
                    display:flex;
                    flex-direction:column;
                    gap:6px;
                    box-shadow:0 6px 18px rgba(79,140,255,0.35);
                ">
                    <div style="font-size:12px;opacity:0.8;">
                        Склад (оценка)
                    </div>
                    <div style="font-size:22px;font-weight:700;">
                        ${formatMoney(report.warehouse.value)}
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;

    } catch (e) {

        console.error("FINANCE ERROR:", e);
        return retryLoad(retry);
    }

    function retryLoad(retry) {

        if (retry < 7) {
            setTimeout(() => loadFinanceReport(retry + 1), 1500);
        } else {
            header.innerText = "Данные не готовы";
            container.innerHTML = "<div class='menu-item'>Попробуйте позже</div>";
        }
    }
}

/* ================= FORMAT ================= */

function formatMoney(val) {

    const num = parseNumber(val);

    return num.toLocaleString("ru-RU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function formatMoney(val) {

    const num = parseNumber(val);

    return num.toLocaleString("ru-RU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}


/* ================= FORM ================= */

window.openFinanceReportForm = function() {

    closeFinanceReportForm();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "financeModal";

    overlay.innerHTML = `
        <div class="modal-window">

            <h3>Параметры</h3>

            <label>Дата</label>
            <input type="date" id="financeDateFrom">

            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="closeFinanceReportForm()">Отмена</button>
                <button type="button" class="btn-primary-wide" onclick="requestFinanceReport()">Получить</button>
            </div>

        </div>
    `;

    document.body.appendChild(overlay);

    // сегодня по умолчанию (локальная дата, а не UTC)
    const d = new Date();
    const pad = n => String(n).padStart(2, "0");
    document.getElementById("financeDateFrom").value =
        d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
};


function closeFinanceReportForm() {

    const modal = document.getElementById("financeModal");
    if (modal) modal.remove();
}


/* ================= REQUEST ================= */

async function requestFinanceReport() {

    const dateFrom = document.getElementById("financeDateFrom")?.value || "";

    if (!dateFrom) {
        alert("Выберите дату");
        return;
    }

    closeFinanceReportForm();

    runReport({
        type: "finance_report",
        payload: {
            date_from: dateFrom
        },
        file: "finance_report.json",
        screen: "finance",
        text: "Формирование финансового отчёта...",
        onDone: loadFinanceReport
    });
}


function parseNumber(val) {

    let raw = String(val || "");

    raw = raw
        .replace(/\u00A0/g, "")   // NBSP
        .replace(/\u202F/g, "")   // узкий NBSP
        .replace(/\s/g, "")       // обычные пробелы
        .replace(",", ".");       // запятая → точка

    raw = raw.replace(/[^\d.-]/g, "");

    let num = Number(raw);

    return isNaN(num) ? 0 : num;
}
function formatMoney(val) {

    const num = parseNumber(val);

    return num.toLocaleString("ru-RU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}