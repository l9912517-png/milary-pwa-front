registerScreen("sales", function() {

    window.currentScreen = "sales";

    title.innerText = "Продажи";

    container.innerHTML = `
        <div class="report-page">

            <div class="report-actions">
                <button type="button" class="btn-wide" onclick="openSalesForm()">
                    ${iconSvg("M4 20V10 M10 20V4 M16 20v-7 M3 20h18")}
                    Получить продажи
                </button>
                <button type="button" class="btn-icon-only" aria-label="Показать последний полученный отчёт" title="Показать последний полученный отчёт"
                        onclick="loadSalesReport()">
                    ${iconSvg("M20 11a8 8 0 1 0-2.3 5.7 M20 4v7h-7")}
                </button>
            </div>

            <div id="salesReportHeader"></div>

            <div id="salesReportContainer" class="report-list"></div>

        </div>
    `;

    loadSalesReport();

});


function salesParseSum(value) {
    const raw = String(value || "0")
        .replace(/ /g, "")
        .replace(/ /g, "")
        .replace(/\s/g, "")
        .replace(",", ".");
    return Number(raw) || 0;
}

function salesPlural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
}

/* Строки отчёта из 1С: [руководитель, менеджер, контрагент, сумма].
   Порядок строк и их смысл — как раньше; меняется только вид. */
function salesBuildBlocks(rows) {

    const blocks = [];
    let section = null;
    let total = 0;

    rows.forEach(row => {

        const chief = row[0] || "";
        const manager = row[1] || "";
        const counterparty = row[2] || "";
        const sum = salesParseSum(row[3]);

        if (chief && !manager && !counterparty && sum === 0) {
            // руководитель — заголовок группы
            blocks.push({ kind: "chief", name: chief });
            section = null;
        }
        else if (manager && !counterparty && sum === 0) {
            // менеджер — новая карточка
            section = { kind: "section", name: manager, lines: [], total: null };
            blocks.push(section);
        }
        else if (!counterparty && sum > 0) {
            // итог: менеджера — в его карточку, остальные — отдельной строкой
            if (manager && !chief && section && section.total === null) {
                section.total = row[3];
            } else {
                blocks.push({ kind: "total", name: manager || chief || "Итог", sum: row[3] });
                section = null;
            }
        }
        else if (counterparty) {
            if (!section) {
                section = { kind: "section", name: manager || "", lines: [], total: null };
                blocks.push(section);
            }
            section.lines.push({ name: counterparty, sum: row[3] });
            total += sum;
        }
    });

    return { blocks, total };
}

function salesLineHtml(name, sum, isTotal) {
    return `
        <div class="report-line${isTotal ? " total" : ""}">
            <span class="report-line-name">${escapeHtml(name)}</span>
            <span class="report-line-sum">${escapeHtml(formatMoney(sum))}</span>
        </div>`;
}

function salesSectionHtml(sec, open) {
    const count = sec.lines.length;
    const countText = count + " " + salesPlural(count, "контрагент", "контрагента", "контрагентов");
    const closedText = sec.total !== null ? "Итого: " + formatMoney(sec.total) : countText;
    const name = sec.name || "Без менеджера";

    return `
        <section class="report-section${open ? " open" : ""}">
            <button type="button" class="report-section-head" aria-expanded="${open}"
                    onclick="toggleSalesSection(this)">
                <span class="report-avatar">${iconSvg("M12 12a4 4 0 1 0 0-8a4 4 0 0 0 0 8z M4 21c0-4 4-6 8-6s8 2 8 6")}</span>
                <span class="report-section-text">
                    <span class="report-section-name">${escapeHtml(name)}</span>
                    <span class="report-section-sub">
                        <span class="when-open">${escapeHtml(countText)}</span>
                        <span class="when-closed">${escapeHtml(closedText)}</span>
                    </span>
                </span>
                ${iconSvg("M9 6l6 6-6 6", "report-chevron")}
            </button>
            <div class="report-section-body">
                ${sec.lines.map(l => salesLineHtml(l.name, l.sum, false)).join("")}
                ${sec.total !== null ? salesLineHtml("Итого по менеджеру", sec.total, true) : ""}
            </div>
        </section>`;
}

function toggleSalesSection(btn) {
    const sec = btn.closest(".report-section");
    if (!sec) return;
    const open = !sec.classList.contains("open");
    sec.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", String(open));
}

function loadSalesReport() {

    const user = JSON.parse(localStorage.getItem("user"));
    const url = "/files/" + encodeURIComponent(user.user_id) + "/sales.json";

    const header = document.getElementById("salesReportHeader");
    const list = document.getElementById("salesReportContainer");
    if (!header || !list) return;

    const status = text => {
        header.innerHTML = `<div class="report-status">${escapeHtml(text)}</div>`;
    };

    status("Загрузка…");
    list.innerHTML = "";

    fetch(url + "?t=" + Date.now())
        .then(r => {

            if (!r.ok) {
                status("Отчёт ещё не получен. Нажмите «Получить продажи».");
                return null;
            }

            return r.json();
        })
        .then(report => {

            if (!report) return;

            if (!report.rows || !Array.isArray(report.rows)) {
                status("Нет данных");
                return;
            }

            const { blocks, total } = salesBuildBlocks(report.rows);
            const period = report.period
                ? (report.period.from || "") + " — " + (report.period.to || "")
                : "";

            header.innerHTML = `
                <div class="report-summary">
                    ${period ? `<span class="report-summary-period">${iconSvg("M4 6h16v14H4z M4 10h16 M8 3v4 M16 3v4")}${escapeHtml(period)}</span>` : ""}
                    <span class="report-summary-label">Итого за период</span>
                    <span class="report-summary-value">${escapeHtml(formatMoney(total))}</span>
                </div>`;

            const sections = blocks.filter(x => x.kind === "section").length;
            const openAll = sections <= 1;

            list.innerHTML = blocks.map(block => {
                if (block.kind === "chief") {
                    return `<div class="report-group-title">${escapeHtml(block.name)}</div>`;
                }
                if (block.kind === "total") {
                    return `<div class="report-total-card">${salesLineHtml(block.name, block.sum, true)}</div>`;
                }
                return salesSectionHtml(block, openAll);
            }).join("") || `<div class="report-status">Нет данных за период</div>`;

        })
        .catch(() => {

            status("Ошибка загрузки");

        });

}


function openSalesForm() {

    closeSalesForm();

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.id = "salesModal";
    overlay.addEventListener("click", e => { if (e.target === overlay) closeSalesForm(); });

    overlay.innerHTML = `
        <div class="modal-window" role="dialog" aria-label="Параметры отчёта">

            <h3>Параметры отчёта</h3>

            <div class="period-buttons">
                <button type="button" class="period-btn" onclick="setSalesPeriod('today',this)">Сегодня</button>
                <button type="button" class="period-btn" onclick="setSalesPeriod('week',this)">Неделя</button>
                <button type="button" class="period-btn" onclick="setSalesPeriod('month',this)">Месяц</button>
                <button type="button" class="period-btn" onclick="setSalesPeriod('custom',this)">Свой</button>
            </div>

            <div class="field-row">
                <label class="field">
                    <span class="field-label">Период с</span>
                    <input type="date" id="salesDateFrom">
                </label>
                <label class="field">
                    <span class="field-label">Период по</span>
                    <input type="date" id="salesDateTo">
                </label>
            </div>

            <label class="field">
                <span class="field-label">Контрагент</span>
                <input type="text" id="salesCounterparty"
                       placeholder="Выберите контрагента"
                       readonly
                       onclick="openDirectorySelect('counterparties','salesCounterparty')">
            </label>

            <label class="field">
                <span class="field-label">Менеджер</span>
                <input type="text" id="salesManager"
                       placeholder="Выберите менеджера"
                       readonly
                       onclick="openDirectorySelect('managers','salesManager')">
            </label>

            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="closeSalesForm()">Отмена</button>
                <button type="button" class="btn-primary-wide" onclick="requestSalesReport()">Получить</button>
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


async function openDirectorySelect(type, targetInputId) {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });

    overlay.innerHTML = `
        <div class="modal-window" role="dialog" aria-label="Выбор из справочника">

            <h3>Выбор</h3>

            <input type="search" id="searchInput" placeholder="Поиск…" autocomplete="off">

            <div id="directoryList" class="dir-list"><div class="dir-empty">Загрузка…</div></div>

            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Закрыть</button>
            </div>

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
        container.innerHTML = `<div class="dir-empty">Нет данных</div>`;
        return;
    }

    container.innerHTML = data.map(item => {

        const guid = (item.guid && item.guid !== "undefined")
            ? item.guid
            : (item.uuid || "");

        return `
        <button type="button" class="dir-item"
                data-target="${escapeHtml(targetInputId)}"
                data-name="${escapeHtml(item.name || "")}"
                data-guid="${escapeHtml(guid)}"
                onclick="selectDirectoryItem(this.dataset.target, this.dataset.name, this.dataset.guid, this)">
            <span class="dir-item-name">${escapeHtml(item.name || "")}</span>
            ${item.full_name ? `<span class="dir-item-sub">${escapeHtml(item.full_name)}</span>` : ""}
        </button>
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