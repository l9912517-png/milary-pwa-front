console.log("ORDER CREATE JS LOADED");

let orderItems = [];

registerScreen("order_create", function () {

    window.currentScreen = "order_create";

    title.innerText = "Новый заказ";

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px;">

            <!-- ===== ШАПКА ===== -->

            <div class="order-card" style="display:flex;flex-direction:column;gap:10px;">

                <label style="font-size:13px;color:#666;">Контрагент</label>
                <input type="text"
                       id="orderCounterparty"
                       placeholder="Выберите контрагента"
                       readonly
                       onclick="openOrderCounterpartySelect()"
                       style="width:100%;padding:10px;border-radius:10px;border:1px solid #ddd;font-size:14px;">

                <label style="font-size:13px;color:#666;">Дата доставки</label>
                <input type="date"
                       id="orderDate"
                       style="width:100%;padding:10px;border-radius:10px;border:1px solid #ddd;font-size:14px;">

                <div style="display:flex;gap:10px;width:100%;">
                    <div style="flex:1;">
                        <label style="font-size:13px;color:#666;">С</label>
                        <input type="time"
                               id="orderTimeFrom"
                               style="width:100%;padding:10px;border-radius:10px;border:1px solid #ddd;font-size:14px;">
                    </div>
                    <div style="flex:1;">
                        <label style="font-size:13px;color:#666;">По</label>
                        <input type="time"
                               id="orderTimeTo"
                               style="width:100%;padding:10px;border-radius:10px;border:1px solid #ddd;font-size:14px;">
                    </div>
                </div>

            </div>

            <!-- ===== ТОВАРЫ ===== -->

            <div id="orderItems"></div>

            <button onclick="addOrderRow()" style="width:100%;">
                + Добавить товар
            </button>

            <!-- ===== СОХРАНЕНИЕ ===== -->

            <button onclick="saveOrder()" style="width:100%;background:#2e7d32;">
                Сохранить заказ
            </button>

        </div>
    `;

    renderOrderItems();
});

/* ================= ITEMS ================= */

function renderOrderItems() {

    const wrap = document.getElementById("orderItems");

    if (!orderItems.length) {
        wrap.innerHTML = `<div class="menu-item">Нет позиций</div>`;
        return;
    }

    wrap.innerHTML = orderItems.map((row, i) => `
        <div class="order-card" style="display:flex;flex-direction:column;gap:8px;">

            <!-- НОМЕНКЛАТУРА -->
            <div style="display:flex;gap:6px;">

                <input type="text"
                       placeholder="Номенклатура"
                       value="${row.name || ""}"
                       oninput="searchNomenclature(${i}, this.value)"
                       style="flex:1;padding:8px;">

                <button onclick="openOrderItemSelect(${i})"
                        style="width:40px;padding:0;">
                    🔍
                </button>

            </div>

            <!-- ПОДСКАЗКИ -->
            <div id="searchResults_${i}" style="font-size:13px;"></div>

            <!-- КОЛ-ВО -->
            <div style="display:flex;gap:8px;">

                <input type="number"
                       placeholder="Кол-во"
                       value="${row.qty || ""}"
                       onchange="updateQty(${i}, this.value)"
                       style="flex:1;">

                <select onchange="updateUnit(${i}, this.value)" style="flex:1;">
                    ${["шт","кг","меш","пуч","уп"].map(u => `
                        <option ${row.unit===u?"selected":""}>${u}</option>
                    `).join("")}
                </select>

            </div>

            <!-- КОММЕНТ -->
            <input type="text"
                   placeholder="Комментарий"
                   value="${row.comment || ""}"
                   onchange="updateComment(${i}, this.value)"
                   style="width:100%;">

            <button onclick="removeRow(${i})"
                    style="background:#eee;color:#000;">
                Удалить
            </button>

        </div>
    `).join("");

    initOrderHotkeys();
}

function addOrderRow() {

    orderItems.push({
        nomenclature: "",
        name: "",
        qty: "",
        unit: "шт",
        comment: ""
    });

    renderOrderItems();
}

function removeRow(i) {
    orderItems.splice(i, 1);
    renderOrderItems();
}

function updateQty(i, val) {
    orderItems[i].qty = val;
}

function updateUnit(i, val) {
    orderItems[i].unit = val;
}

function updateComment(i, val) {
    orderItems[i].comment = val;
}


/* ================= NOMENCLATURE ================= */

async function openOrderItemSelect(index) {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal-window">

            <input id="searchItem" placeholder="Поиск..." style="width:100%;padding:8px;">

            <div id="itemList" style="max-height:300px;overflow:auto;"></div>

            <button onclick="this.closest('.modal-overlay').remove()">Закрыть</button>

        </div>
    `;

    document.body.appendChild(overlay);

    const list = overlay.querySelector("#itemList");
    const search = overlay.querySelector("#searchItem");

    let data = await loadDirectoryData("nomenclature");

    function render(arr) {

        list.innerHTML = "";

        arr.forEach(i => {

            const div = document.createElement("div");
            div.className = "menu-item";
            div.innerText = i.name;

            div.onclick = () => {

                orderItems[index].name = i.name;
                orderItems[index].nomenclature = i.guid;

                overlay.remove();
                renderOrderItems();
            };

            list.appendChild(div);
        });
    }

    render(data);

    search.oninput = () => {
        const q = search.value.toLowerCase();

        render(data.filter(i =>
            i.name.toLowerCase().includes(q)
        ));
    };
}


/* ================= COUNTERPARTY ================= */

function openOrderCounterpartySelect() {
    openDirectorySelect("counterparties", "orderCounterparty");
}


/* ================= SAVE ================= */

async function saveOrder() {

    const user = JSON.parse(localStorage.getItem("user"));

    const cp = document.getElementById("orderCounterparty");

    if (!cp.dataset.guid) {
        alert("Выберите контрагента");
        return;
    }

    const order = {
        id: crypto.randomUUID(),

        created_at: new Date().toISOString(),
        send_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),

        status: "draft",
        printed: false,

        counterparty: cp.dataset.guid,
        counterparty_name: cp.value,

        delivery_date: document.getElementById("orderDate").value,
        time_from: document.getElementById("orderTimeFrom").value,
        time_to: document.getElementById("orderTimeTo").value,

        items: orderItems
    };

    await fetch("/api/save-order", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(order)
    });

    alert("Заказ сохранён");
}

function initOrderHotkeys() {

    document.onkeydown = function(e) {

        // INSERT = добавить строку
        if (e.key === "Insert") {
            e.preventDefault();
            addOrderRow();
        }

    };
}

async function searchNomenclature(index, query) {

    const container = document.getElementById("searchResults_" + index);

    if (!query || query.length < 2) {
        container.innerHTML = "";
        return;
    }

    const jwt = localStorage.getItem("jwt");

    try {

        const res = await fetch("/api/directory/nomenclature", {
            headers: { "Authorization": "Bearer " + jwt }
        });

        if (!res.ok) {
            container.innerHTML = "";
            return;
        }

        let data = await res.json();

        const filtered = data.filter(i =>
            (i.name && i.name.toLowerCase().includes(query.toLowerCase())) ||
            (i.full_name && i.full_name.toLowerCase().includes(query.toLowerCase()))
        ).slice(0, 5);

        container.innerHTML = filtered.map(i => `
            <div class="menu-item"
                 style="padding:6px;font-size:13px;"
                 onclick="selectNomenclature(${index}, '${i.guid}', '${i.name.replace(/'/g,"")}')">
                ${i.name}
            </div>
        `).join("");

    } catch (e) {
        console.error(e);
        container.innerHTML = "";
    }
}

function selectNomenclature(index, guid, name) {

    orderItems[index].nomenclature = guid;
    orderItems[index].name = name;

    renderOrderItems();
}

async function openOrderCounterpartySelect() {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal-window">

            <h3>Выбор контрагента</h3>

            <input type="text" id="orderCpSearch"
                   placeholder="Поиск..."
                   style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc;margin-bottom:10px;" />

            <div id="orderCpList" style="max-height:300px;overflow:auto;"></div>

            <button onclick="this.closest('.modal-overlay').remove()">
                Закрыть
            </button>

        </div>
    `;

    document.body.appendChild(overlay);

    const list = overlay.querySelector("#orderCpList");
    const search = overlay.querySelector("#orderCpSearch");

    const jwt = localStorage.getItem("jwt");

    try {

        const res = await fetch("/api/directory/counterparties", {
            headers: { "Authorization": "Bearer " + jwt }
        });

        if (!res.ok) {
            alert("Ошибка загрузки контрагентов");
            return;
        }

        let data = await res.json();

        function render(arr) {

            list.innerHTML = "";

            arr.forEach(i => {

                const div = document.createElement("div");
                div.className = "menu-item";

                div.innerHTML = `<strong>${i.name || "-"}</strong>`;

                div.onclick = () => {

                    const input = document.getElementById("orderCounterparty");

                    if (input) {
                        input.value = i.name || "";
                        input.dataset.guid = i.guid || i.uuid || "";
                    }

                    overlay.remove();
                };

                list.appendChild(div);
            });
        }

        render(data);

        search.oninput = () => {

            const q = search.value.toLowerCase();

            const filtered = data.filter(i =>
                (i.name && i.name.toLowerCase().includes(q)) ||
                (i.full_name && i.full_name.toLowerCase().includes(q))
            );

            render(filtered);
        };

    } catch (e) {
        console.error(e);
        alert("Ошибка загрузки");
    }
}