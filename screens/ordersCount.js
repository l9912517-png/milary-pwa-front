console.log("ORDERS COUNT JS LOADED");

registerScreen("ordersCount", function() {

    window.currentScreen = "ordersCount";

    title.innerText = "Количество заказов";

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px;">

            <div style="display:flex;gap:10px;">
                <button onclick="requestOrdersCount()">Обновить</button>
            </div>

            <div id="ordersCountHeader" style="font-weight:600;margin-top:10px;"></div>
            <div id="ordersCountContainer"></div>

        </div>
    `;

    loadOrdersCount();
});


/* ================= LOAD ================= */

async function loadOrdersCount(retry = 0) {

    const user = JSON.parse(localStorage.getItem("user"));
    const url = "/files/" + user.user_id + "/ordersCount.json";

    const header = document.getElementById("ordersCountHeader");
    const container = document.getElementById("ordersCountContainer");

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

        // период
        if (report.period) {
            header.innerText = report.period.from + " — " + report.period.to;
        }

        // updated_at
        let updatedHtml = "";
        if (report.updated_at && typeof renderUpdatedAt === "function") {
            updatedHtml = renderUpdatedAt(report.updated_at);
        }

        let html = `
            ${updatedHtml}
            <div class="report-table">

                <div class="report-head">
                    <div>Дата</div>
                    <div>День</div>
                    <div>Количество</div>
                </div>
        `;

        let total = 0;

        report.rows.forEach(row => {

            if (!row) return;

            const date = row[0] || "";
            const day = row[1] || "";
            const count = Number(row[2]) || 0;

            total += count;

            html += `
                <div class="report-row">
                    <div>${escapeHtml(date)}</div>
                    <div>${escapeHtml(day)}</div>
                    <div class="report-sum">${escapeHtml(count)}</div>
                </div>
            `;
        });

        html += `
            <div class="report-row total">
                <div><b>ИТОГО</b></div>
                <div></div>
                <div class="report-sum">${escapeHtml(total)}</div>
            </div>
        </div>`;

        container.innerHTML = html;

    } catch (e) {

        console.error("ORDERS COUNT ERROR:", e);
        return retryLoad(retry);
    }

    function retryLoad(retry) {

        if (retry < 7) {
            setTimeout(() => loadOrdersCount(retry + 1), 1500);
        } else {
            header.innerText = "Данные не готовы";
            container.innerHTML = "<div class='menu-item'>Попробуйте позже</div>";
        }
    }
}


/* ================= REQUEST ================= */

async function requestOrdersCount() {

    runReport({
        type: "ordersCount_report",
        payload: {},
        file: "ordersCount.json",
        screen: "ordersCount",
        text: "Формирование количества заказов...",
        onDone: loadOrdersCount
    });
}


