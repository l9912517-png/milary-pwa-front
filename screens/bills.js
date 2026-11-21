
let billsInterval = null;

registerScreen("bills", async function () {

    window.currentScreen = "bills";

    title.innerText = "Счета";

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
    const billFiles = files
        .filter(f => f.name && f.name.toLowerCase().includes("bill"))
        .map(f => ({
            type: "file",
            date: new Date(f.mtime),
            text: f.name
        }));

    // ===== HISTORY =====
    let history = JSON.parse(localStorage.getItem("bills_history") || "[]");

    const historyItems = history.map(h => ({
        type: "request",
        date: new Date(h.date),
        text: "Запрос счетов: " + h.counterparty_name
    }));

    // ===== ОБЪЕДИНЯЕМ =====
    let combined = [...billFiles, ...historyItems];

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
                            ${escapeHtml(item.text)}
                        </span>

                        <span style="font-size:12px;color:var(--muted);">
                            ${formatDate(item.date)}
                        </span>

                    </div>
                `;
            }

            if (item.type === "file") {

                return docFileRowHtml(item.text, item.date);
            }

        }).join("");
    }

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px;">

            <div class="menu-item" style="flex-direction:column;align-items:flex-start;gap:10px;">

                <label>Период с</label>
                <input type="date"
                       id="billsDateFrom"
                       style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--card-border);">

                <label>Период по</label>
                <input type="date"
                       id="billsDateTo"
                       style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--card-border);">

                <div style="font-size:12px;color:var(--muted);">
                    * если хоть одна дата не заполнена, будут отправлены все неоплаченные счета
                </div>

                <label>Контрагент</label>

                <input type="text"
                       id="billsCounterparty"
                       placeholder="Выберите контрагента"
                       readonly
                       style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--card-border);"
                       onclick="openBillsCounterpartySelect()">

                <button onclick="requestBills()" style="width:100%;">
                    Получить счета
                </button>

            </div>

            <div>
                <div style="font-weight:600;margin-bottom:6px;">
                    История
                </div>

                ${html}
            </div>


        </div>
    `;
});

/* ================= SELECT COUNTERPARTY (BILLS ONLY) ================= */

async function openBillsCounterpartySelect() {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal-window">

            <h3>Выбор контрагента</h3>

            <input type="text" id="billsSearch"
                   placeholder="Поиск…"
                   style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--card-border);margin-bottom:10px;" />

            <div id="billsList" style="max-height:300px;overflow:auto;"></div>

            <button onclick="this.closest('.modal-overlay').remove()">
                Закрыть
            </button>

        </div>
    `;

    document.body.appendChild(overlay);

    const list = overlay.querySelector("#billsList");
    const search = overlay.querySelector("#billsSearch");

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

                div.innerHTML = `<strong>${escapeHtml(c.name)}</strong>`;

                div.onclick = () => {

                    const input = document.getElementById("billsCounterparty");

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
function filterCounterpartiesByRole(data, user) {

    if (!user || !user.role) return data;

    // 🔥 admin и director — без ограничений
    if (user.role === "admin" || user.role === "director") {
        return data;
    }

    // 🔥 manager — только свои
    if (user.role === "manager") {
        return data.filter(c => c.manager_uuid === user.user_id);
    }

    // 🔥 rop — по руководителю
    if (user.role === "rop") {
        return data.filter(c => c.director_uuid === user.user_id);
    }

    // остальные роли — пусто (на всякий случай)
    return [];
}


/* ================= REQUEST ================= */

let billsRequestInProgress = false;

async function requestBills() {

    if (billsRequestInProgress) {
        return;
    }

    billsRequestInProgress = true;

    try {

        const input = document.getElementById("billsCounterparty");

        if (!input || !input.dataset.guid) {
            alert("Выберите контрагента");
            billsRequestInProgress = false;
            return;
        }

        // 🔥 даты
        const dateFrom = document.getElementById("billsDateFrom")?.value || "";
        const dateTo = document.getElementById("billsDateTo")?.value || "";

        const payload = {
            counterparty: input.dataset.guid,
            date_from: dateFrom,
            date_to: dateTo
        };

        await sendTask("bills_files", payload);

        // 🔥 сохраняем историю
        let history = JSON.parse(localStorage.getItem("bills_history") || "[]");

        history.unshift({
            date: new Date().toISOString(),
            counterparty_name: input.value
        });

        history = history.slice(0, 30);

        localStorage.setItem("bills_history", JSON.stringify(history));

    } catch (e) {

        console.error(e);
        alert("Ошибка отправки");

    } finally {

        setTimeout(() => {
            billsRequestInProgress = false;
        }, 1000);
    }
}