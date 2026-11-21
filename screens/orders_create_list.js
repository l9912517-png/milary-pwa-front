console.log("ORDERS LIST JS LOADED");

registerScreen("orders_create_list", function () {

    window.currentScreen = "orders_create_list";

    title.innerText = "Мои заказы";

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px;">

            <div style="display:flex;gap:10px;">
                <button onclick="openScreen('order_create')">+ Новый заказ</button>
                <button onclick="loadOrdersList()">Обновить</button>
            </div>

            <div id="ordersListContainer"></div>

        </div>
    `;

    loadOrdersList();
});


/* ================= LOAD ================= */

function loadOrdersList() {

    const user = JSON.parse(localStorage.getItem("user"));
    const url = "/files/" + user.user_id + "/orders.json";

    const container = document.getElementById("ordersListContainer");

    container.innerHTML = "Загрузка...";

    fetch(url + "?t=" + Date.now())
    .then(r => {

        if (!r.ok) {
            container.innerHTML = "Нет заказов";
            return null;
        }

        return r.json();
    })
    .then(data => {

        if (!data || !data.length) {
            container.innerHTML = "<div class='menu-item'>Нет заказов</div>";
            return;
        }

        let html = "";

        data.slice().reverse().forEach(order => {

            const status = getOrderStatus(order);

            html += `
            <div class="order-card" onclick="openOrder('${order.id}')">

                <div class="order-row">
                    <span class="label">Контрагент:</span>
                    <span class="value">${order.counterparty_name || "-"}</span>
                </div>

                <div class="order-row">
                    <span class="label">Дата:</span>
                    <span class="value">${order.delivery_date || "-"}</span>
                </div>

                <div class="order-row">
                    <span class="label">Время:</span>
                    <span class="value">
                        ${order.time_from || "-"} - ${order.time_to || "-"}
                    </span>
                </div>

                <div class="order-row">
                    <span class="label">Статус:</span>
                    <span class="value">${status}</span>
                </div>

            </div>
            `;
        });

        container.innerHTML = html;

    })
    .catch(() => {
        container.innerHTML = "Ошибка загрузки";
    });
}


/* ================= STATUS ================= */

function getOrderStatus(order) {

    if (order.printed) {
        return "🟢 Напечатан";
    }

    const now = new Date();
    const sendAt = new Date(order.send_at);

    if (now < sendAt) {

        const diff = Math.floor((sendAt - now) / 60000);

        return `🟡 Черновик (${diff} мин)`;
    }

    return "🟠 Отправлен";
}


/* ================= OPEN ================= */

function openOrder(id) {

    const user = JSON.parse(localStorage.getItem("user"));

    fetch(`/files/${user.user_id}/orders.json?t=` + Date.now())
    .then(r => r.json())
    .then(data => {

        const order = data.find(o => o.id === id);

        if (!order) return;

        // если уже отправлен — только просмотр
        if (order.printed || new Date() >= new Date(order.send_at)) {
            showOrderView(order);
        } else {
            editOrder(order);
        }
    });
}


/* ================= VIEW ================= */

function showOrderView(order) {

    title.innerText = "Заказ";

    let html = `
        <div style="display:flex;flex-direction:column;gap:10px;">
    `;

    html += `
        <div class="menu-item">
            ${order.counterparty_name}
        </div>
    `;

    order.items.forEach(i => {

        html += `
        <div class="order-line">
            <div class="order-line-row">
                <span>${i.name}</span>
                <span>${i.qty} ${i.unit}</span>
            </div>
            <div class="order-line-row">
                <span>${i.comment || ""}</span>
            </div>
        </div>
        `;
    });

    html += `
        <button onclick="openScreen('orders_create_list')" 
                style="background:#ccc;color:#000;">
            Назад
        </button>
    `;

    container.innerHTML = html;
}


/* ================= EDIT ================= */

function editOrder(order) {

    // 🔥 прокидываем в создание
    window.editingOrder = order;

    openScreen("order_create");
}
