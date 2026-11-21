let updInterval = null;

registerScreen("upd", async function () {

    window.currentScreen = "upd";

    title.innerText = "УПД";

    const jwt = localStorage.getItem("jwt");

    let files = [];

    try {

        const res = await fetch("/api/files", {
            headers: { "Authorization": "Bearer " + jwt }
        });

        if (res.ok) {
            files = await res.json();
        }

    } catch (e) {
        console.error(e);
    }

    // ===== ФАЙЛЫ =====
    const updFiles = files
        .filter(f => f.name && f.name.toLowerCase().includes("upd"))
        .map(f => ({
            type: "file",
            date: new Date(f.mtime),
            text: f.name
        }));

    // ===== HISTORY =====
    let history = JSON.parse(localStorage.getItem("upd_history") || "[]");

    const historyItems = history.map(h => ({
        type: "request",
        date: new Date(h.date),
        text: "Запрос УПД: " + h.counterparty_name
    }));

    // ===== ОБЪЕДИНЯЕМ =====
    let combined = [...updFiles, ...historyItems];

    combined.sort((a, b) => b.date - a.date);

    let html = "";

    if (!combined.length) {

        html = `<div class="menu-item">Нет данных</div>`;

    } else {

        html = combined.slice(0, 30).map(item => {

            if (item.type === "request") {

                return `
                    <div class="menu-item" style="flex-direction:column;align-items:flex-start;">
                        
                        <span style="font-weight:600;">
                            ${item.text}
                        </span>

                        <span style="font-size:12px;color:#888;">
                            ${formatDate(item.date)}
                        </span>

                    </div>
                `;
            }

            if (item.type === "file") {

                return `
                    <div class="menu-item" style="flex-direction:column;align-items:flex-start;">
                        
                        <span style="color:#4CAF50;">
                            ${item.text}
                        </span>

                        <span style="font-size:12px;color:#888;">
                            ${formatDate(item.date)}
                        </span>

                    </div>
                `;
            }

        }).join("");
    }
    

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px;">

            <div class="menu-item" style="flex-direction:column;align-items:flex-start;gap:10px;">

                <label>Период с</label>
                <input type="date"
                       id="updDateFrom"
                       style="width:100%;padding:10px;border-radius:10px;border:1px solid #ccc;">

                <label>Период по</label>
                <input type="date"
                       id="updDateTo"
                       style="width:100%;padding:10px;border-radius:10px;border:1px solid #ccc;">

                <div style="font-size:12px;color:#777;">
                    * если хоть одна дата не заполнена, будут отправлены все неоплаченные накладные
                </div>

                <label>Контрагент</label>

                <input type="text"
                       id="updCounterparty"
                       placeholder="Выберите контрагента"
                       readonly
                       style="width:100%;padding:10px;border-radius:10px;border:1px solid #ccc;"
                       onclick="openUpdCounterpartySelect()">

                <button onclick="requestUpd()" style="width:100%;">
                    Получить УПД
                </button>

            </div>

            <div>
                <div style="font-weight:600;margin-bottom:6px;">
                    История
                </div>

                ${html}
            </div>

            <button onclick="showMenu()" style="background:#ccc;color:#000;">
                Назад
            </button>

        </div>
    `;
});

/* ================= SELECT COUNTERPARTY (UPD ONLY) ================= */

async function openUpdCounterpartySelect() {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal-window">

            <h3>Выбор контрагента</h3>

            <input type="text" id="updSearch"
                   placeholder="Поиск..."
                   style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc;margin-bottom:10px;" />

            <div id="updList" style="max-height:300px;overflow:auto;"></div>

            <button onclick="this.closest('.modal-overlay').remove()">
                Закрыть
            </button>

        </div>
    `;

    document.body.appendChild(overlay);

    const list = overlay.querySelector("#updList");
    const search = overlay.querySelector("#updSearch");

    const jwt = localStorage.getItem("jwt");
    const user = JSON.parse(localStorage.getItem("user"));

    try {

        const res = await fetch("/api/directory/counterparties", {
            headers: { "Authorization": "Bearer " + jwt }
        });

        if (!res.ok) {
            alert("Ошибка загрузки контрагентов");
            return;
        }

        let data = await res.json();

        data = filterCounterpartiesByRole(data, user);

        function render(arr) {

            list.innerHTML = "";

            arr.forEach(c => {

                const div = document.createElement("div");
                div.className = "menu-item";

                div.innerHTML = `<strong>${c.name}</strong>`;

                div.onclick = () => {

                    const input = document.getElementById("updCounterparty");

                    if (!input) return;

                    input.value = c.name;
                    input.dataset.guid = c.guid;

                    overlay.remove();
                };

                list.appendChild(div);
            });
        }

        render(data);

        search.oninput = () => {

            const q = search.value.toLowerCase();

            const filtered = data.filter(c =>
                (c.name && c.name.toLowerCase().includes(q)) ||
                (c.full_name && c.full_name.toLowerCase().includes(q))
            );

            render(filtered);
        };

    } catch (e) {
        console.error(e);
        alert("Ошибка загрузки");
    }
}

/* ================= REQUEST ================= */

let updRequestInProgress = false;

async function requestUpd() {

    if (updRequestInProgress) {
        return;
    }

    updRequestInProgress = true;

    try {

        const input = document.getElementById("updCounterparty");

        if (!input || !input.dataset.guid) {
            alert("Выберите контрагента");
            updRequestInProgress = false;
            return;
        }

        // 🔥 даты
        const dateFrom = document.getElementById("updDateFrom")?.value || "";
        const dateTo = document.getElementById("updDateTo")?.value || "";

        const payload = {
            counterparty: input.dataset.guid,
            date_from: dateFrom,
            date_to: dateTo
        };

        await sendTask("upd_files", payload);

        // 🔥 сохраняем историю
        let history = JSON.parse(localStorage.getItem("upd_history") || "[]");

        history.unshift({
            date: new Date().toISOString(),
            counterparty_name: input.value
        });

        history = history.slice(0, 30);

        localStorage.setItem("upd_history", JSON.stringify(history));

    } catch (e) {

        console.error(e);
        alert("Ошибка отправки");

    } finally {

        setTimeout(() => {
            updRequestInProgress = false;
        }, 1000);
    }
}

function filterCounterpartiesByRole(data, user) {

    if (!user || !user.role) return data;

    if (user.role === "admin" || user.role === "director") {
        return data;
    }

    if (user.role === "manager") {
        return data.filter(c => c.manager_uuid === user.user_id);
    }

    if (user.role === "rop") {
        return data.filter(c => c.director_uuid === user.user_id);
    }

    return [];
}
