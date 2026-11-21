console.log("ORDERS JS LOADED");
window.ordersViewMode = "list"; // list | tree
window.ordersExpanded = false;

registerScreen("orders", function () {

    window.currentScreen = "orders";

    title.innerText = "Заказы";

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px;">

    <div style="display:flex;gap:10px;">
    <button type="button" class="btn-wide" onclick="openOrdersForm()">${iconSvg(ICON_REPORT)}Получить заказы</button>${refreshButton("loadOrders")}
    <button type="button" class="btn-secondary" onclick="toggleOrdersView()">Сменить вид</button>
    <button onclick="toggleOrdersExpand()" id="ordersExpandBtn" style="display:none;">
        Развернуть
    </button>
</div>
            <div id="ordersContainer"></div>

        </div>
    `;

    loadOrders();
});

function loadOrders() {

    const user = JSON.parse(localStorage.getItem("user"));
    const url = "/files/" + user.user_id + "/orders.json";

    const container = document.getElementById("ordersContainer");

    container.innerHTML = "Загрузка…";

    fetch(url + "?t=" + Date.now())
    .then(r => {
        if (!r.ok) {
            container.innerHTML = reportEmptyHtml("Получить заказы");
            return null;
        }
        return r.json();
    })
    .then(data => {
         const updatedHtml = renderUpdatedAt(data.updated_at);
        if (!data) return;

        if (!data || !data.rows) {
            container.innerHTML = "Нет данных";
            return;
        }

            let html = updatedHtml || "";

data.rows.forEach(row => {

    const values = row.values || [];

    const counterparty = values[1] || "-";
    const number = values[2] || "-";
    const sum = values[3] || "-";
    const time = values[4] || "-";

    const rowId = "order_" + (row.id || Math.random());

    // ===============================
    // ОБЫЧНЫЙ ВИД (как сейчас)
    // ===============================
    if (window.ordersViewMode !== "tree") {

        html += `
        <div class="order-card" data-url="${escapeHtml(row.detail)}" onclick="openOrderDetailFromEl(this)">

            <div class="order-row">
                <span class="label">Контрагент:</span>
                <span class="value">${escapeHtml(counterparty)}</span>
            </div>

            <div class="order-row">
                <span class="label">Номер:</span>
                <span class="value">№ ${escapeHtml(number)}</span>
            </div>

            <div class="order-row">
                <span class="label">Сумма:</span>
                <span class="value">${escapeHtml(sum)}</span>
            </div>
            <div class="order-row">
    <span class="label">Время:</span>
    <span class="value">${escapeHtml(time)}</span>
</div>
            


        </div>
        `;
    }

    // ===============================
    // TREE ВИД (раскрытие)
    // ==============================
    else {

        html += `
        <div class="order-card">

            <div onclick="toggleOrderExpand(${jsArg(rowId)}, ${jsArg(row.detail)})" 
                 style="cursor:pointer;">

                <div class="order-row">
                    <span class="label">Контрагент:</span>
                    <span class="value">${escapeHtml(counterparty)}</span>
                </div>

                <div class="order-row">
                    <span class="label">Номер:</span>
                    <span class="value">№ ${escapeHtml(number)}</span>
                </div>

                <div class="order-row">
                    <span class="label">Сумма:</span>
                    <span class="value">${escapeHtml(sum)}</span>
                </div>
                
                <div class="order-row">
    <span class="label">Время:</span>
    <span class="value">${escapeHtml(time)}</span>
</div>

            </div>

            <div id="${escapeHtml(rowId)}" style="display:${window.ordersExpanded ? "block" : "none"};"></div>

        </div>
        `;
if (window.ordersExpanded && row.detail) {
    setTimeout(async () => {

        const container = document.getElementById(rowId);
        if (!container) return;

        container.innerHTML = "Загрузка…";

        try {
            const res = await fetch(row.detail + "?t=" + Date.now());
            if (!res.ok) return;

            const data = await res.json();

            let html = "";

            if (data.lines && data.lines.length && data.line_columns) {

                html += `<div class="order-details"><div class="table-scroll">`;

                html += `<div class="table-grid table-head">`;
                data.line_columns.forEach(col => {
                    html += `<div>${escapeHtml(col)}</div>`;
                });
                html += `</div>`;

                data.lines.forEach(line => {

                    html += `<div class="table-grid">`;

                    data.line_columns.forEach((col, i) => {
                        html += `<div>${escapeHtml(line[i] || "-")}</div>`;
                    });

                    html += `</div>`;
                });

                html += `</div></div>`;
            }

            container.innerHTML = html;

        } catch (e) {
            container.innerHTML = "Ошибка";
        }

    }, 0);
}
    }

});

            container.innerHTML = html;
            
          


const btn = document.getElementById("ordersExpandBtn");

if (btn) {
    btn.style.display = window.ordersViewMode === "tree" ? "block" : "none";
    btn.innerText = window.ordersExpanded ? "Свернуть" : "Развернуть";
}

        })
        .catch(() => {
            container.innerHTML = "Ошибка загрузки";
        });
        

}

function openOrderDetail(url) {

    navEnter("orders:detail:" + url, () => openOrderDetail(url));

    fetch(url + "?t=" + Date.now())
        .then(r => {
            if (!r.ok) throw new Error("Ошибка загрузки");
            return r.json();
        })
        .then(data => {

            title.innerText = data.meta?.title || "Заказ";

            let html = `
                <div style="display:flex;flex-direction:column;gap:12px;">
            `;

            // ===== ШАПКА (оставляем как есть) =====
            if (data.fields && data.fields.length) {

                html += `<div class="order-card">`;

                data.fields.forEach(f => {
                    html += `
                        <div class="order-row">
                            <span class="label">${escapeHtml(f[0])}</span>
                            <span class="value">${escapeHtml(f[1] || "-")}</span>
                        </div>
                    `;
                });

                html += `</div>`;
            }

            // ===== ТОВАРЫ (ТАБЛИЦА) =====
            if (data.lines && data.lines.length > 0 && data.line_columns) {

                html += `<div class="table-scroll">`;

                // шапка таблицы
                html += `<div class="table-grid table-head">`;
                data.line_columns.forEach(col => {
                    html += `<div>${escapeHtml(col)}</div>`;
                });
                html += `</div>`;

                // строки
                data.lines.forEach(line => {

                    html += `<div class="table-grid">`;

                    data.line_columns.forEach((col, i) => {
                        html += `<div>${escapeHtml(line[i] || "-")}</div>`;
                    });

                    html += `</div>`;
                });

                html += `</div>`;
            }

            // ===== НАЗАД =====
            html += `
                <button type="button" onclick="headerBack()" class="btn-secondary"
                        style="margin-top:10px;">
                    Назад
                </button>
            </div>`;

            container.innerHTML = html;

        })
        .catch(() => {
            container.innerHTML = "Ошибка загрузки заказа";
        });
}

window.openOrdersForm = function () {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal-window">

            <h3>Фильтр</h3>

            <div class="period-buttons">

                <button class="period-btn" onclick="setOrdersPeriod('today', this)">Сегодня</button>
                <button class="period-btn" onclick="setOrdersPeriod('yesterday', this)">Вчера</button>
                <button class="period-btn" onclick="setOrdersPeriod('tomorrow', this)">Завтра</button>

            </div>

            <input type="hidden" id="ordersDate">

            <label>Менеджер</label>
            <input type="text"
                   id="ordersManager"
                   placeholder="Выберите менеджера"
                   readonly
                   onclick="openDirectorySelect('managers','ordersManager')">

            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="closeOrdersForm()">Отмена</button>
                <button type="button" class="btn-primary-wide" onclick="requestOrders()">Получить</button>
            </div>

        </div>
    `;

    document.body.appendChild(overlay);

    // 🔥 сразу ставим "сегодня"
    const btn = overlay.querySelector(".period-btn");
    if (btn) setOrdersPeriod('today', btn);
};


async function requestOrders() {

    const date = document.getElementById("ordersDate").value;

    if (!date) {
        alert("Выберите дату");
        return;
    }

    const manager = document.querySelector("#ordersManager");

    const payload = {
        date_from: date,
        date_to: date,
        manager: (manager?.dataset?.guid && manager.dataset.guid !== "undefined")
            ? manager.dataset.guid
            : ""
    };

    closeOrdersForm();

    runReport({
        type: "orders_report",
        payload: payload,
        file: "orders.json",
        screen: "orders",
        text: "Формирование заказов...",
        onDone: loadOrders
    });
}

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

    if (user.role === "admin" || user.role === "director") {
        return data;
    }

    return data.filter(item =>
        item.manager_uuid === user.user_id ||
        item.director_uuid === user.user_id ||
        item.uuid === user.user_id
    );
}

function renderDirectoryList(data, container, targetInputId) {

    if (!data || data.length === 0) {
        container.innerHTML = `<div class="menu-item">Нет данных</div>`;
        return;
    }

    container.innerHTML = "";

    data.forEach(item => {

        const div = document.createElement("div");
        div.className = "menu-item";

        div.innerHTML = `
            <div style="display:flex;flex-direction:column;">
                <span>${escapeHtml(item.name)}</span>
                <span style="font-size:12px;color:var(--muted);">
                    ${escapeHtml(item.full_name || "")}
                </span>
            </div>
        `;

      div.onclick = function() {

    const guid =
        (item.guid && item.guid !== "undefined")
        ? item.guid
        : (item.uuid || "");

    selectDirectoryItem(
        targetInputId,
        item.name,
        guid
    );
};

        container.appendChild(div);

    });
}

function selectDirectoryItem(targetInputId, name, guid) {

    const input = document.getElementById(targetInputId);

    if (input) {
        input.value = name;
        input.dataset.guid = guid ? String(guid) : "";
    }

    const overlay = document.querySelector(".modal-overlay:last-of-type");
    if (overlay) overlay.remove();
}

function setOrdersPeriod(type, btn) {

    document.querySelectorAll(".period-btn")
        .forEach(b => b.classList.remove("active"));

    if (btn) btn.classList.add("active");

    const input = document.getElementById("ordersDate");

    const d = new Date();

    if (type === "yesterday") d.setDate(d.getDate() - 1);
    if (type === "tomorrow") d.setDate(d.getDate() + 1);

    input.value = d.toISOString().split("T")[0];
}

function closeOrdersForm() {
    const modal = document.querySelector(".modal-overlay");
    if (modal) modal.remove();
}

function toggleOrdersView() {

    window.ordersViewMode =
        window.ordersViewMode === "tree" ? "list" : "tree";

    loadOrders();
}

function openOrderDetailFromEl(el) {
    const url = el.dataset.url;
    if (url) openOrderDetail(url);
}

async function toggleOrderExpand(containerId, url) {

    const container = document.getElementById(containerId);
    if (!container) return;

    // 🔥 если уже открыт — закрываем
    if (container.style.display === "block") {
        container.style.display = "none";
        container.innerHTML = "";
        return;
    }

    // 🔥 открываем
    container.style.display = "block";
    container.innerHTML = "Загрузка…";

    try {

        const res = await fetch(url + "?t=" + Date.now());

        if (!res.ok) {
            container.innerHTML = "Ошибка загрузки";
            return;
        }

        const data = await res.json();

        let html = "";

      

        // ===== ТОВАРЫ ======
        if (data.lines && data.lines.length && data.line_columns) {

            html += `<div class="order-details">`;
html += `<div class="table-scroll">`;

            html += `<div class="table-grid table-head">`;
            data.line_columns.forEach(col => {
                html += `<div>${escapeHtml(col)}</div>`;
            });
            html += `</div>`;

            data.lines.forEach(line => {

                html += `<div class="table-grid">`;

                data.line_columns.forEach((col, i) => {
                    html += `<div>${escapeHtml(line[i] || "-")}</div>`;
                });

                html += `</div>`;
            });

            html += `</div>`; // table-scroll
html += `</div>`; // order-details
        }

        container.innerHTML = html;

    } catch (e) {
        container.innerHTML = "Ошибка";
    }

}

window.toggleOrdersExpand = function () {

    window.ordersExpanded = !window.ordersExpanded;

    loadOrders();
}

