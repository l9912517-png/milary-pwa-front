let pricelistInterval = null;

registerScreen("pricelist", async function () {

    window.currentScreen = "pricelist";

    title.innerText = "Прайс";

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
    const priceFiles = files
        .filter(f => f.name && f.name.toLowerCase().includes("price"))
        .map(f => ({
            type: "file",
            date: new Date(f.mtime),
            text: f.name
        }));

    // ===== HISTORY =====
    let history = JSON.parse(localStorage.getItem("pricelist_history") || "[]");

    const historyItems = history.map(h => ({
        type: "request",
        date: new Date(h.date),
        text: (h.pdf ? "Запрос прайса PDF: " : "Запрос прайса: ") + h.counterparty_name
    }));

    // ===== ОБЪЕДИНЯЕМ =====
    let combined = [...priceFiles, ...historyItems];

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

                return `
                    <div class="menu-item" style="flex-direction:column;align-items:flex-start;">
                        
                        <span style="color:var(--accent);">
                            ${escapeHtml(item.text)}
                        </span>

                        <span style="font-size:12px;color:var(--muted);">
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

                <label>Контрагент</label>

                <input type="text"
                       id="pricelistCounterparty"
                       placeholder="Выберите контрагента"
                       readonly
                       style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--card-border);"
                       onclick="openPricelistCounterpartySelect()">

                <label>Дата</label>

                <input type="date"
                       id="pricelistDate"
                       style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--card-border);">

                <button onclick="requestPricelist()" style="width:100%;">
                    Получить прайс
                </button>

                <button onclick="requestPricelist('pricelist_pdf_files')"
                        style="width:100%;margin-top:6px;background:var(--card);color:var(--accent);border:2px solid var(--accent-line);">
                    Получить красивый прайс PDF
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

    // ===== СЕГОДНЯШНЯЯ ДАТА =====
    const dateInput = document.getElementById("pricelistDate");
    if (dateInput) {
        const today = new Date().toISOString().split("T")[0];
        dateInput.value = today;
    }

});


/* ================= SELECT COUNTERPARTY ================= */

async function openPricelistCounterpartySelect() {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal-window">

            <h3>Выбор контрагента</h3>

            <input type="text" id="pricelistSearch"
                   placeholder="Поиск..."
                   style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--card-border);margin-bottom:10px;" />

            <div id="pricelistList" style="max-height:300px;overflow:auto;"></div>

            <button onclick="this.closest('.modal-overlay').remove()">
                Закрыть
            </button>

        </div>
    `;

    document.body.appendChild(overlay);

    const list = overlay.querySelector("#pricelistList");
    const search = overlay.querySelector("#pricelistSearch");

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

                    const input = document.getElementById("pricelistCounterparty");

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


/* ================= FILTER ================= */

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


/* ================= REQUEST ================= */

let pricelistRequestInProgress = false;

/* type: pricelist_files — обычный прайс, pricelist_pdf_files — красивый прайс PDF */
async function requestPricelist(type) {

    const taskType = type === "pricelist_pdf_files" ? "pricelist_pdf_files" : "pricelist_files";

    if (pricelistRequestInProgress) {
        return;
    }

    pricelistRequestInProgress = true;

    try {

        const input = document.getElementById("pricelistCounterparty");
        const dateInput = document.getElementById("pricelistDate");

        if (!input || !input.dataset.guid) {
            alert("Выберите контрагента");
            pricelistRequestInProgress = false;
            return;
        }

        if (!dateInput || !dateInput.value) {
            alert("Выберите дату");
            pricelistRequestInProgress = false;
            return;
        }

        const payload = {
            counterparty: input.dataset.guid,
            date_from: dateInput.value,
            date_to: dateInput.value
        };

        await sendTask(taskType, payload);

        let history = JSON.parse(localStorage.getItem("pricelist_history") || "[]");

        history.unshift({
            date: new Date().toISOString(),
            counterparty_name: input.value,
            request_date: dateInput.value,
            pdf: taskType === "pricelist_pdf_files"
        });

        history = history.slice(0, 30);

        localStorage.setItem("pricelist_history", JSON.stringify(history));

    } catch (e) {

        console.error(e);
        alert("Ошибка отправки");

    } finally {

        setTimeout(() => {
            pricelistRequestInProgress = false;
        }, 1000);
    }
}