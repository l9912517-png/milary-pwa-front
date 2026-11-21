console.log("WRITEOFFS JS LOADED");

registerScreen("writeoffs", function() {

    window.currentScreen = "writeoffs";

    title.innerText = "Списания";

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px;">

            <div style="display:flex;gap:10px;">
                <button onclick="openWriteoffsForm()">Обновить</button>
            </div>

            <div id="writeoffsHeader"
                 style="font-weight:600;margin-top:10px;">
            </div>

            <div id="writeoffsContainer"></div>

        </div>
    `;

    loadWriteoffsReport();
});

/* ================= LOAD ================= */

async function loadWriteoffsReport(retry = 0) {

    const user = JSON.parse(localStorage.getItem("user"));
    const url = "/files/" + user.user_id + "/writeoffs.json";

    const header = document.getElementById("writeoffsHeader");
    const container = document.getElementById("writeoffsContainer");

    header.innerText = "Загрузка...";
    container.innerHTML = "";

    try {

        const r = await fetch(url + "?t=" + Date.now());

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

        if (!report.rows || !Array.isArray(report.rows)) {
            return retryLoad(retry);
        }

        if (report.period) {
            header.innerText =
                report.period.from + " — " + report.period.to;
        }

        let updatedHtml = "";

        if (report.updated_at &&
            typeof renderUpdatedAt === "function") {

            updatedHtml = renderUpdatedAt(report.updated_at);
        }

        let html = `
            ${updatedHtml}

            <div class="report-table">

                <div class="report-head">
                    <div>Номенклатура</div>
                    <div>Сумма</div>
                </div>
        `;

        report.rows.forEach(row => {

            if (!row) return;

            const article = row[0] || "";
            const product = row[1] || "";
            const qty = row[2] || "";
            const unit = row[3] || "";
            const price = row[4] || "";
            const amount = parseMoney(row[5]);

            // ===== статья =====

            if (article && article !== "ИТОГ") {

                html += `
                    <div class="report-row director"
     style="
        background:linear-gradient(135deg,#4f8cff,#6aa6ff);
        color:#fff;
        font-weight:600;
        border-radius:10px;
        margin-top:10px;
        margin-bottom:4px;
        box-shadow:0 3px 8px rgba(79,140,255,0.25);
     ">

                        <div>
                            <b>${article}</b>
                        </div>

                        <div></div>

                    </div>
                `;

                return;
            }

            // ===== итог =====

            if (article === "ИТОГ") {

                html += `
                    <div class="report-row total">

                        <div>
                            <b>ИТОГ</b>
                        </div>

                        <div class="report-sum">
                            ${formatMoney(amount)}
                        </div>

                    </div>
                `;

                return;
            }

            // ===== строка =====

            html += `
                <div class="report-row child"
                     style="align-items:flex-start;">

                    <div style="display:flex;flex-direction:column;">

                        <div>
                            ${product}
                        </div>

                        <div style="
                            font-size:12px;
                            color:#777;
                            margin-top:2px;
                        ">
                            ${qty} ${unit}
                            ×
                            ${formatMoney(price)}
                        </div>

                    </div>

                    <div class="report-sum">
                        ${formatMoney(amount)}
                    </div>

                </div>
            `;

        });

        html += `</div>`;

        container.innerHTML = html;

    } catch (e) {

        console.error("WRITEOFFS ERROR:", e);

        return retryLoad(retry);
    }

    function retryLoad(retry) {

        if (retry < 7) {

            setTimeout(() => {
                loadWriteoffsReport(retry + 1);
            }, 1500);

        } else {

            header.innerText = "Данные не готовы";

            container.innerHTML =
                "<div class='menu-item'>Попробуйте позже</div>";
        }
    }
}

/* ================= FORMAT ================= */

function parseMoney(val) {

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

    const num = parseMoney(val);

    return num.toLocaleString("ru-RU", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

/* ================= FORM ================= */

window.openWriteoffsForm = function() {

    const overlay = document.createElement("div");

    overlay.className = "modal-overlay";
    overlay.id = "writeoffsModal";

    const today = new Date()
        .toISOString()
        .split("T")[0];

    overlay.innerHTML = `
        <div class="modal-window">

            <h3>Параметры отчета</h3>

            <label>Период с</label>
            <input type="date"
                   id="writeoffsDateFrom"
                   value="${today}">

            <label>Период по</label>
            <input type="date"
                   id="writeoffsDateTo"
                   value="${today}">

            <div class="modal-actions">

                <button onclick="requestWriteoffsReport()">
                    Получить
                </button>

                <button onclick="closeWriteoffsForm()">
                    Отмена
                </button>

            </div>

        </div>
    `;

    document.body.appendChild(overlay);
};

function closeWriteoffsForm() {

    const modal = document.getElementById("writeoffsModal");

    if (modal) modal.remove();
}

/* ================= REQUEST ================= */

async function requestWriteoffsReport() {

    const payload = {
        date_from: document.getElementById("writeoffsDateFrom").value,
        date_to: document.getElementById("writeoffsDateTo").value
    };

    closeWriteoffsForm();

    runReport({
        type: "writeoffs_report",
        payload: payload,
        file: "writeoffs.json",
        screen: "writeoffs",
        text: "Формирование списаний...",
        onDone: loadWriteoffsReport
    });
}

