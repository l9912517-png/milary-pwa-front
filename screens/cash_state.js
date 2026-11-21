console.log("CASH STATE JS LOADED");

registerScreen("cash_state", function() {

    window.currentScreen = "cash_state";

    title.innerText = "Состояние ДС";

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px;">

            <div style="display:flex;gap:10px;">
                <button onclick="openCashStateForm()">Получить</button>
            </div>

            <div id="cashHeader" style="font-weight:600;margin-top:10px;"></div>
            <div id="cashContainer"></div>

        </div>
    `;

    loadCashState();
});


/* ================= LOAD ================= */

async function loadCashState(retry = 0) {

    const user = JSON.parse(localStorage.getItem("user"));
    const url = "/files/" + user.user_id + "/cash_state.json";

    const header = document.getElementById("cashHeader");
    const container = document.getElementById("cashContainer");

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

        // header
        header.innerText = "На дату: " + (report.date || "");

        let updatedHtml = "";
        if (report.updated_at && typeof renderUpdatedAt === "function") {
            updatedHtml = renderUpdatedAt(report.updated_at);
        }

        let html = `
            ${updatedHtml}
            <div style="display:flex;flex-direction:column;gap:10px;">
        `;

        let total = 0;

        report.rows.forEach(row => {

            if (!row) return;

            const name = row[0] || "";

            let raw = String(row[1] || "");

            // нормализация суммы
            raw = raw
                .replace(/\u00A0/g, "")
                .replace(/\u202F/g, "")
                .replace(/\s/g, "")
                .replace(",", ".");

            raw = raw.replace(/[^\d.-]/g, "");

            let sum = Number(raw);
            if (isNaN(sum)) sum = 0;

            total += sum;

            html += `
                <div style="
                    background:var(--card);
                    border-radius:12px;
                    padding:12px;
                    box-shadow:0 2px 6px rgba(0,0,0,0.05);
                    display:flex;
                    justify-content:space-between;
                    align-items:center;
                ">
                    <div style="font-size:14px;color:var(--text);">
                        ${escapeHtml(name)}
                    </div>
                    <div style="font-size:16px;font-weight:600;">
                        ${formatMoney(sum)}
                    </div>
                </div>
            `;
        });

        // итог (если вдруг нет — считаем сами)
        let finalTotal = total;

        if (report.total) {
            let raw = String(report.total)
                .replace(/\u00A0/g, "")
                .replace(/\u202F/g, "")
                .replace(/\s/g, "")
                .replace(",", ".");

            raw = raw.replace(/[^\d.-]/g, "");

            let parsed = Number(raw);
            if (!isNaN(parsed)) finalTotal = parsed;
        }

        html += `
            <div style="
                margin-top:10px;
                background:linear-gradient(135deg, rgba(181,224,138,0.16) 0%, rgba(255,255,255,0.05) 100%);
                border:1px solid rgba(181,224,138,0.35);
                color:var(--text);
                border-radius:14px;
                padding:16px;
                display:flex;
                justify-content:space-between;
                align-items:center;
                font-size:16px;
                font-weight:600;
            ">
                <div>ИТОГО</div>
                <div>${formatMoney(finalTotal)}</div>
            </div>
        `;

        html += `</div>`;

        container.innerHTML = html;

    } catch (e) {

        console.error("CASH STATE ERROR:", e);
        return retryLoad(retry);
    }

    function retryLoad(retry) {

        if (retry < 7) {
            setTimeout(() => loadCashState(retry + 1), 1500);
        } else {
            header.innerText = "Данные не готовы";
            container.innerHTML = "<div class='menu-item'>Попробуйте позже</div>";
        }
    }
}


/* ================= FORMAT ================= */

function formatMoney(sum) {

    return Number(sum || 0).toLocaleString("ru-RU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });

}


/* ================= FORM ================= */

window.openCashStateForm = function() {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "cashModal";

    overlay.innerHTML = `
        <div class="modal-window">

            <h3>Параметры</h3>

            <label>Дата</label>
            <input type="date" id="cashDate">

            <div class="modal-actions">
                <button onclick="requestCashState()">Получить</button>
                <button onclick="closeCashStateForm()">Отмена</button>
            </div>

        </div>
    `;

    document.body.appendChild(overlay);

    // вчера по умолчанию
    const d = new Date();
    d.setDate(d.getDate() - 1);
    document.getElementById("cashDate").value = d.toISOString().split("T")[0];
};


function closeCashStateForm() {

    const modal = document.getElementById("cashModal");
    if (modal) modal.remove();
}


/* ================= REQUEST ================= */

async function requestCashState() {

    const payload = {
        date_from: document.getElementById("cashDate").value
    };

    closeCashStateForm();

    runReport({
        type: "cash_state_report",
        payload: payload,
        file: "cash_state.json",
        screen: "cash_state",
        text: "Формирование состояния ДС...",
        onDone: loadCashState
    });
}


