console.log("DIR SALES JS LOADED");

registerScreen("dir_sales", function() {

    window.currentScreen = "dir_sales";

    title.innerText = "Продажи по менеджерам";

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;gap:10px;">
                <button type="button" class="btn-wide" onclick="openDirSalesForm()">${iconSvg(ICON_REPORT)}Получить продажи</button>
            </div>

            <div id="dirSalesHeader" style="font-weight:600;margin-top:10px;"></div>
            <div id="dirSalesContainer"></div>
        </div>
    `;

    loadDirSalesReport();
});


/* ================= LOAD ================= */

async function loadDirSalesReport(retry = 0) {

    const user = JSON.parse(localStorage.getItem("user"));
    const url = "/files/" + user.user_id + "/sales_by_managers.json";

    const header = document.getElementById("dirSalesHeader");
    const container = document.getElementById("dirSalesContainer");

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
                    <div>Руководитель / Менеджер</div>
                    <div>Сумма</div>
                </div>
        `;

        let total = 0;

        report.rows.forEach(row => {

            if (!row) return;

            const director = row[0] || "";
            const manager = row[1] || "";

            // 🔥 СУММА ВСЕГДА В row[3]
            let raw = String(row[3] || "");

            raw = raw
                .replace(/\u00A0/g, "")
                .replace(/\u202F/g, "")
                .replace(/\s/g, "")
                .replace(",", ".");

            raw = raw.replace(/[^\d.-]/g, "");

            let sum = Number(raw);
            if (isNaN(sum)) sum = 0;

            const sumFormatted = formatSum(sum);

            // --- РУКОВОДИТЕЛЬ (ЗАГОЛОВОК) ---
            if (director && !manager && director !== "ИТОГ РУКОВОДИТЕЛЯ") {

                html += `
                    <div class="report-row director" style="background:var(--card);font-weight:600;">
                        <div>${escapeHtml(director)}</div>
                        <div></div>
                    </div>
                `;
                return;
            }

            // --- ИТОГ РУКОВОДИТЕЛЯ ---
            if (director === "ИТОГ РУКОВОДИТЕЛЯ") {

                html += `
                    <div class="report-row total" style="background:var(--card);">
                        <div><b>ИТОГ РУКОВОДИТЕЛЯ</b></div>
                        <div class="report-sum">${escapeHtml(sumFormatted)}</div>
                    </div>
                `;

                total += sum;
                return;
            }

            // --- МЕНЕДЖЕР ---
            if (manager) {

                html += `
                    <div class="report-row child">
                        <div style="padding-left:20px;">${escapeHtml(manager)}</div>
                        <div class="report-sum">${escapeHtml(sumFormatted)}</div>
                    </div>
                `;
            }

        });

        html += `
            <div class="report-row total">
                <div><b>ИТОГО</b></div>
                <div class="report-sum">${escapeHtml(formatSum(total))}</div>
            </div>
        </div>`;

        container.innerHTML = html;

    } catch (e) {

        console.error("DIR SALES ERROR:", e);
        return retryLoad(retry);
    }

    function retryLoad(retry) {

        if (retry < 7) {
            setTimeout(() => loadDirSalesReport(retry + 1), 1500);
        } else {
            header.innerText = "Данные не готовы";
            container.innerHTML = "<div class='menu-item'>Попробуйте позже</div>";
        }
    }
}

/* ================= FORM ================= */

window.openDirSalesForm = function() {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "dirSalesModal";

    overlay.innerHTML = `
        <div class="modal-window">

            <h3>Период</h3>

            <div class="period-buttons">
                <button class="period-btn" onclick="setDirSalesPeriod('today',this)">Сегодня</button>
                <button class="period-btn" onclick="setDirSalesPeriod('week',this)">Неделя</button>
                <button class="period-btn" onclick="setDirSalesPeriod('month',this)">Месяц</button>
                <button class="period-btn" onclick="setDirSalesPeriod('custom',this)">Свой</button>
            </div>

            <label>С</label>
            <input type="date" id="dirSalesDateFrom">

            <label>По</label>
            <input type="date" id="dirSalesDateTo">

            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="closeDirSalesForm()">Отмена</button>
                <button type="button" class="btn-primary-wide" onclick="requestDirSalesReport()">Получить</button>
            </div>

        </div>
    `;

    document.body.appendChild(overlay);

    // вчера по умолчанию
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const val = d.toISOString().split("T")[0];

    document.getElementById("dirSalesDateFrom").value = val;
    document.getElementById("dirSalesDateTo").value = val;
};


function closeDirSalesForm() {

    const modal = document.getElementById("dirSalesModal");
    if (modal) modal.remove();
}


function setDirSalesPeriod(type, btn) {

    document.querySelectorAll(".period-btn")
        .forEach(b => b.classList.remove("active"));

    btn.classList.add("active");

    const from = document.getElementById("dirSalesDateFrom");
    const to = document.getElementById("dirSalesDateTo");

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


/* ================= REQUEST ================= */

async function requestDirSalesReport() {

    const payload = {
        date_from: document.getElementById("dirSalesDateFrom").value,
        date_to: document.getElementById("dirSalesDateTo").value
    };

    closeDirSalesForm();

    runReport({
        type: "dir_sales_report",
        payload: payload,
        file: "sales_by_managers.json",
        screen: "dir_sales",
        text: "Формирование продаж по менеджерам...",
        onDone: loadDirSalesReport
    });
}

function formatSum(sum) {

    return Number(sum || 0).toLocaleString("ru-RU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

}


