console.log("PAYMENTS JS LOADED");

registerScreen("payments", function() {

    window.currentScreen = "payments";

    title.innerText = "Оплаты";

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;gap:10px;">
                <button onclick="openPaymentsForm()">Получить</button>
            </div>

            <div id="paymentsHeader" style="font-weight:600;margin-top:10px;"></div>
            <div id="paymentsContainer"></div>
        </div>
    `;

    loadPaymentsReport();
});


/* ================= LOAD ================= */

async function loadPaymentsReport(retry = 0) {

    const user = JSON.parse(localStorage.getItem("user"));
    const url = "/files/" + user.user_id + "/payments.json";

    const header = document.getElementById("paymentsHeader");
    const container = document.getElementById("paymentsContainer");

    header.innerText = "Загрузка...";
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

        if (!report.rows || !Array.isArray(report.rows)) {
            return retryLoad(retry);
        }

        if (report.period) {
            header.innerText = report.period.from + " — " + report.period.to;
        }

        let updatedHtml = "";
        if (report.updated_at && typeof renderUpdatedAt === "function") {
            updatedHtml = renderUpdatedAt(report.updated_at);
        }

        let html = `
            ${updatedHtml}
            <div class="report-table">

                <div class="report-head">
                    <div>Менеджер</div>
                    <div>Сумма</div>
                </div>
        `;

        let total = 0;

        report.rows.forEach(row => {

            if (!row) return;

            const manager = row[0] || "Без менеджера";

            let raw = String(row[1] || "");

            raw = raw
                .replace(/\u00A0/g, "")
                .replace(/\s/g, "")
                .replace(",", ".")
                .replace(/[^\d.-]/g, "");

            let sum = Number(raw);

            if (isNaN(sum)) sum = 0;

            total += sum;

            html += `
                <div class="report-row">
                    <div>${manager}</div>
                    <div class="report-sum">${formatSum(sum)}</div>
                </div>
            `;
        });

        // 🔥 ИТОГО считаем только сами
        html += `
            <div class="report-row total">
                <div><b>ИТОГО</b></div>
                <div class="report-sum">${formatSum(total)}</div>
            </div>
        </div>`;

        container.innerHTML = html;

    } catch (e) {

        console.error("PAYMENTS ERROR:", e);
        return retryLoad(retry);
    }

    function retryLoad(retry) {

        if (retry < 7) {
            setTimeout(() => loadPaymentsReport(retry + 1), 1500);
        } else {
            header.innerText = "Данные не готовы";
            container.innerHTML = "<div class='menu-item'>Попробуйте позже</div>";
        }
    }
}
/* ================= FORMAT ================= */

function formatSum(sum) {

    return Number(sum || 0).toLocaleString("ru-RU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}


/* ================= FORM ================= */

window.openPaymentsForm = function() {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "paymentsModal";

    overlay.innerHTML = `
        <div class="modal-window">

            <h3>Параметры отчета</h3>

            <div class="period-buttons">
            <button class="period-btn" onclick="setPaymentsPeriod('yesterday',this)">Вчера</button>
                <button class="period-btn" onclick="setPaymentsPeriod('today',this)">Сегодня</button>
                <button class="period-btn" onclick="setPaymentsPeriod('week',this)">Неделя</button>
                <button class="period-btn" onclick="setPaymentsPeriod('month',this)">Месяц</button>
                <button class="period-btn" onclick="setPaymentsPeriod('custom',this)">Свой</button>
            </div>

            <label>Период с</label>
            <input type="date" id="paymentsDateFrom">

            <label>Период по</label>
            <input type="date" id="paymentsDateTo">

            <div class="modal-actions">
                <button onclick="requestPaymentsReport()">Получить</button>
                <button onclick="closePaymentsForm()">Отмена</button>
            </div>

        </div>
    `;

    document.body.appendChild(overlay);

   const yesterday = new Date();
yesterday.setDate(yesterday.getDate() - 1);

const val = yesterday.toISOString().split("T")[0];

const from = document.getElementById("paymentsDateFrom");
const to = document.getElementById("paymentsDateTo");

from.value = val;
to.value = val;

// снимаем активные кнопки периода
document.querySelectorAll(".period-btn")
    .forEach(b => b.classList.remove("active"));
};


function closePaymentsForm() {

    const modal = document.getElementById("paymentsModal");
    if (modal) modal.remove();
}


function setPaymentsPeriod(type, btn) {

    document.querySelectorAll(".period-btn")
        .forEach(b => b.classList.remove("active"));

    btn.classList.add("active");

    const from = document.getElementById("paymentsDateFrom");
    const to = document.getElementById("paymentsDateTo");

    const today = new Date();
    const format = d => d.toISOString().split("T")[0];

    if (type === "today") {
        const d = format(today);
        from.value = d;
        to.value = d;
    }
    
    if (type === "yesterday") {

    const d = new Date();
    d.setDate(d.getDate() - 1);

    const val = format(d);

    from.value = val;
    to.value = val;
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


/* ================= REQUEST ================= */

async function requestPaymentsReport() {

    const payload = {
        date_from: document.getElementById("paymentsDateFrom").value,
        date_to: document.getElementById("paymentsDateTo").value
    };

    closePaymentsForm();

    runReport({
        type: "payments_report",
        payload: payload,
        file: "payments.json",
        screen: "payments",
        text: "Формирование оплат...",
        onDone: loadPaymentsReport
    });
}

