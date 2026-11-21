console.log("RECEIPTS JS LOADED");

registerScreen("receipts", function() {

    window.currentScreen = "receipts";

    title.innerText = "Поступления";

    container.innerHTML = `

        <div style="
            display:flex;
            gap:10px;
            flex-wrap:wrap;
            margin-bottom:10px;
        ">

            <button onclick="openReceiptsForm()">
                Обновить
            </button>

            <button onclick="togglePriceIncreaseFilter()"
                    id="priceIncreaseBtn">
                Только ↑ цены
            </button>

        </div>

        <div id="receiptsHeader"
             style="
                font-weight:600;
                margin-top:10px;
                margin-bottom:10px;
             ">
        </div>

        <div id="receiptsContainer"></div>

    `;

    loadReceiptsReport();
});

/* ================= LOAD ================= */

async function loadReceiptsReport(retry = 0) {

    const user = JSON.parse(localStorage.getItem("user"));

    const url =
        "/files/" + user.user_id + "/receipts.json";

    const header =
        document.getElementById("receiptsHeader");

    const container =
        document.getElementById("receiptsContainer");

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

        if (!report.documents ||
            !Array.isArray(report.documents)) {

            return retryLoad(retry);
        }

        if (report.period) {

            header.innerText =
                report.period.from +
                " — " +
                report.period.to;
        }

        let updatedHtml = "";

        if (report.updated_at &&
            typeof renderUpdatedAt === "function") {

            updatedHtml =
                renderUpdatedAt(report.updated_at);
        }

        let html = `
            ${updatedHtml}

            <div style="
                display:flex;
                flex-direction:column;
                gap:10px;
            ">
        `;

        report.documents.forEach((doc, index) => {

            const docId = "receiptDoc_" + index;

            html += `

                <div style="
                    background:var(--card);
                    border-radius:14px;
                    overflow:hidden;
                    box-shadow:0 2px 10px rgba(0,0,0,0.05);
                    border:1px solid var(--card-border);
                ">

                    <!-- HEADER -->

                    <div onclick="toggleReceiptDoc('${docId}')"
                         style="
                            padding:12px;
                            background:linear-gradient(135deg,var(--surface),rgba(255,255,255,0.16));
                            color:#fff;
                            cursor:pointer;
                            display:flex;
                            justify-content:space-between;
                            align-items:center;
                         ">

                        <div style="
                            display:flex;
                            flex-direction:column;
                            gap:2px;
                        ">

                            <!-- контрагент -->

                            <div style="
                                font-size:15px;
                                font-weight:700;
                                line-height:1.2;
                            ">
                                ${escapeHtml(doc.counterparty || "")}
                            </div>

                            <!-- документ -->

                            <div style="
                                font-size:11px;
                                opacity:0.85;
                            ">
                                ${escapeHtml(doc.document)}
                                ·
                                ${escapeHtml(doc.date)}
                            </div>

                        </div>

                        <div style="text-align:right;">

                            <div style="font-size:12px;">
                                Итого
                            </div>

                            <div style="font-weight:700;">
                                ${formatMoney(doc.total)}
                            </div>

                        </div>

                    </div>

                    <!-- BODY -->

                    <div id="${docId}"
                         style="display:none;">

            `;

            if (doc.items && Array.isArray(doc.items)) {

                doc.items.forEach(item => {

                    let priceBg = "rgba(255,255,255,0.08)";
                    let priceColor = "var(--text)";

                    if (item.price_state === "up") {
                        priceBg = "rgba(224,69,123,0.16)";
                        priceColor = "#FF8FB3";
                    }

                    if (item.price_state === "down") {
                        priceBg = "rgba(181,224,138,0.14)";
                        priceColor = "var(--accent)";
                    }

                    // ===== ПРОЦЕНТ =====

                    let percentText = "";

                    const normalizeNumber = value => {

                        let s = String(value || "0");

                        s = s
                            .replace(/\u00A0/g, "")
                            .replace(/\s/g, "")
                            .replace(",", ".")
                            .replace(/[^\d.-]/g, "");

                        const n = Number(s);

                        return isNaN(n) ? 0 : n;
                    };

                    const currentPrice =
                        normalizeNumber(item.price);

                    const prevPrice =
                        normalizeNumber(item.prev_price);

                    if (prevPrice > 0) {

                        const percent =
                            ((currentPrice - prevPrice) / prevPrice) * 100;

                        const rounded =
                            Math.abs(percent).toFixed(1);

                        // рост

                        if (percent > 0) {

                            percentText = `
                                <span style="
                                    background:rgba(224,69,123,0.16);
                                    color:#FF8FB3;
                                    padding:3px 7px;
                                    border-radius:6px;
                                    font-weight:700;
                                ">
                                    ↑ +${escapeHtml(rounded)}%
                                </span>
                            `;
                        }

                        // падение

                        if (percent < 0) {

                            percentText = `
                                <span style="
                                    background:rgba(181,224,138,0.14);
                                    color:var(--accent);
                                    padding:3px 7px;
                                    border-radius:6px;
                                    font-weight:700;
                                ">
                                    ↓ -${escapeHtml(rounded)}%
                                </span>
                            `;
                        }
                    }

                    html += `

                        <div class="receipt-item"
                             data-price-state="${escapeHtml(item.price_state || '')}"
                             style="
                                padding:10px 12px;
                                border-bottom:1px solid var(--card-border);
                                display:flex;
                                justify-content:space-between;
                                gap:10px;
                            ">

                            <!-- LEFT -->

                            <div style="
                                flex:1;
                                display:flex;
                                flex-direction:column;
                                gap:6px;
                            ">

                                <!-- НОМЕНКЛАТУРА + КОЛИЧЕСТВО -->

                                <div style="
                                    display:flex;
                                    justify-content:space-between;
                                    align-items:flex-start;
                                    gap:10px;
                                ">

                                    <div style="
                                        font-size:14px;
                                        font-weight:600;
                                        color:var(--text);
                                        line-height:1.3;
                                        flex:1;
                                    ">
                                        ${escapeHtml(item.product)}
                                    </div>

                                    <div style="
                                        background:var(--card);
                                        color:var(--text);
                                        padding:3px 8px;
                                        border-radius:7px;
                                        font-size:11px;
                                        white-space:nowrap;
                                        font-weight:700;
                                    ">
                                        ${escapeHtml(item.qty)} ${escapeHtml(item.unit)}
                                    </div>

                                </div>

                                <!-- ТЕГИ -->

                                <div style="
                                    display:flex;
                                    flex-wrap:wrap;
                                    gap:6px;
                                    font-size:11px;
                                ">

                                    <!-- текущая цена -->

                                    <span style="
                                        background:${priceBg};
                                        color:${priceColor};
                                        padding:3px 7px;
                                        border-radius:6px;
                                        font-weight:700;
                                    ">
                                        ${formatMoney(item.price)}
                                    </span>

                                    <!-- изменение -->

                                    ${percentText}

                                    <!-- предыдущая цена -->

                                    <span style="
                                        background:rgba(255,255,255,0.10);
                                        color:var(--text);
                                        padding:3px 7px;
                                        border-radius:6px;
                                    ">
                                        пред. цена:
                                        ${formatMoney(item.prev_price)}
                                    </span>
                                    
                                    <!-- базовая цена -->

<span style="
    background:rgba(120,170,255,0.14);
    color:#9DB8FF;
    padding:3px 7px;
    border-radius:6px;
">
    база:
    ${formatMoney(item.base_price || 0)}
</span>

                                    <!-- остаток -->

                                    <span style="
                                        background:rgba(255,190,90,0.14);
                                        color:#FFC680;
                                        padding:3px 7px;
                                        border-radius:6px;
                                    ">
                                        остаток:
                                        ${escapeHtml(item.stock)}
                                    </span>

                                    <!-- прайс -->

                                    <span style="
    background:${item.in_price ? 'rgba(181,224,138,0.14)' : 'rgba(255,255,255,0.08)'};
    color:${item.in_price ? 'var(--accent)' : 'var(--muted)'};
    padding:3px 7px;
    border-radius:6px;
    font-weight:700;
    min-width:28px;
    text-align:center;
">
    ${item.in_price ? '✓' : ''}
</span>

                                </div>

                            </div>

                            <!-- RIGHT -->

                            <div style="
                                min-width:100px;
                                text-align:right;
                                font-weight:700;
                                font-size:15px;
                                align-self:center;
                                color:var(--text);
                            ">
                                ${formatMoney(item.sum)}
                            </div>

                        </div>
                    `;
                });
            }

            html += `
                    </div>
                </div>
            `;
        });

        html += `</div>`;

        container.innerHTML = html;

    } catch (e) {

        console.error("RECEIPTS ERROR:", e);

        return retryLoad(retry);
    }

    function retryLoad(retry) {

        if (retry < 7) {

            setTimeout(() => {
                loadReceiptsReport(retry + 1);
            }, 1500);

        } else {

            header.innerText = "Данные не готовы";

            container.innerHTML =
                "<div class='menu-item'>Попробуйте позже</div>";
        }
    }
}

/* ================ TOGGLE ================= */

function toggleReceiptDoc(id) {

    const el = document.getElementById(id);

    if (!el) return;

    el.style.display =
        el.style.display === "none"
            ? "block"
            : "none";
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

window.openReceiptsForm = function() {

    const overlay = document.createElement("div");

    overlay.className = "modal-overlay";
    overlay.id = "receiptsModal";

    const today = new Date()
        .toISOString()
        .split("T")[0];

    overlay.innerHTML = `
        <div class="modal-window">

            <h3>Параметры отчета</h3>

            <label>Период с</label>

            <input type="date"
                   id="receiptsDateFrom"
                   value="${today}">

            <label>Период по</label>

            <input type="date"
                   id="receiptsDateTo"
                   value="${today}">

            <div class="modal-actions">

                <button onclick="requestReceiptsReport()">
                    Получить
                </button>

                <button onclick="closeReceiptsForm()">
                    Отмена
                </button>

            </div>

        </div>
    `;

    document.body.appendChild(overlay);
};

function closeReceiptsForm() {

    const modal =
        document.getElementById("receiptsModal");

    if (modal) modal.remove();
}

let showOnlyIncreasedPrices = false;

function togglePriceIncreaseFilter() {

    showOnlyIncreasedPrices =
        !showOnlyIncreasedPrices;

    const btn =
        document.getElementById("priceIncreaseBtn");

    // все документы

    const docs =
        document.querySelectorAll("[id^='receiptDoc_']");

    docs.forEach(body => {

        const wrapper =
            body.parentElement;

        const items =
            body.querySelectorAll(".receipt-item");

        let hasIncreased = false;

        items.forEach(item => {

            const state =
                item.dataset.priceState;

            // выключен фильтр

            if (!showOnlyIncreasedPrices) {

                item.style.display = "";

                return;
            }

            // только рост

            if (state === "up") {

                item.style.display = "";
                hasIncreased = true;

            } else {

                item.style.display = "none";
            }
        });

        // ===== документ =====

        if (!showOnlyIncreasedPrices) {

            wrapper.style.display = "";
            body.style.display = "none";

        } else {

            if (hasIncreased) {

                wrapper.style.display = "";
                body.style.display = "block";

            } else {

                wrapper.style.display = "none";
            }
        }
    });

    // ===== кнопка =====

    if (showOnlyIncreasedPrices) {

        btn.style.background = "var(--danger)";
        btn.style.color = "#fff";

    } else {

        btn.style.background = "";
        btn.style.color = "";
    }
}
/* ================= REQUEST ================= */

async function requestReceiptsReport() {

    const payload = {
        date_from: document.getElementById("receiptsDateFrom").value,
        date_to: document.getElementById("receiptsDateTo").value
    };

    closeReceiptsForm();

    runReport({
        type: "receipts_report",
        payload: payload,
        file: "receipts.json",
        screen: "receipts",
        text: "Формирование поступлений...",
        onDone: loadReceiptsReport
    });
}

