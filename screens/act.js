let actInterval = null;

registerScreen("act", async function () {

    window.currentScreen = "act";

    title.innerText = "Акт сверки";

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
    const actFiles = files
        .filter(f => f.name && f.name.toLowerCase().includes("act"))
        .map(f => ({
            type: "file",
            date: new Date(f.mtime),
            text: f.name
        }));

    // ===== HISTORY =====
    let history = JSON.parse(localStorage.getItem("act_history") || "[]");

    const historyItems = history.map(h => ({
        type: "request",
        date: new Date(h.date),
        text: `Запрос акта: ${escapeHtml(h.counterparty_name)}
${escapeHtml(h.date_from)} - ${escapeHtml(h.date_to)}`
    }));

    // ===== ОБЪЕДИНЯЕМ =====
    let combined = [...actFiles, ...historyItems];

    combined.sort((a, b) => b.date - a.date);

    let html = "";

    if (!combined.length) {

        html = `<div class="menu-item">Нет данных</div>`;

    } else {

        html = combined.slice(0, 30).map(item => {

            if (item.type === "request") {

                return `
                    <div class="menu-item" style="flex-direction:column;align-items:flex-start;">
                        
                        <span style="font-weight:600;white-space:pre-line;">
                            ${item.text}
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
                       id="actCounterparty"
                       placeholder="Выберите контрагента"
                       readonly
                       style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--card-border);"
                       onclick="openActCounterpartySelect()">

                <label>Период с</label>
                <input type="date" id="actDateFrom"
                       style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--card-border);">

                <label>Период по</label>
                <input type="date" id="actDateTo"
                       style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--card-border);">
                <label style="display:flex;align-items:center;gap:8px;margin-top:10px;">
    <input type="checkbox" id="actForINN">
    <span>По ИНН</span>
</label>
                <button onclick="requestAct()" style="width:100%;">
                    Получить акт сверки
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

/* ================= SELECT COUNTERPARTY ================= */

async function openActCounterpartySelect() {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal-window">

            <h3>Выбор контрагента</h3>

            <input type="text" id="actSearch"
                   placeholder="Поиск..."
                   style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--card-border);margin-bottom:10px;" />

            <div id="actList" style="max-height:300px;overflow:auto;"></div>

            <button onclick="this.closest('.modal-overlay').remove()">
                Закрыть
            </button>

        </div>
    `;

    document.body.appendChild(overlay);

    const list = overlay.querySelector("#actList");
    const search = overlay.querySelector("#actSearch");

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

                    const input = document.getElementById("actCounterparty");

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

let actRequestInProgress = false;

async function requestAct() {

    if (actRequestInProgress) {
        return;
    }

    actRequestInProgress = true;

    try {

        const cp = document.getElementById("actCounterparty");
        const dateFrom = document.getElementById("actDateFrom").value;
        const dateTo = document.getElementById("actDateTo").value;

        if (!cp || !cp.dataset.guid) {
            alert("Выберите контрагента");
            actRequestInProgress = false;
            return;
        }

        if (!dateFrom || !dateTo) {
            alert("Выберите период");
            actRequestInProgress = false;
            return;
        }

      const payload = {
    counterparty: cp.dataset.guid,
    date_from: dateFrom,
    date_to: dateTo,
    for_INN: document.getElementById("actForINN")?.checked === true
};

        await sendTask("act_files", payload);

        // ===== история =====
        let history = JSON.parse(localStorage.getItem("act_history") || "[]");

        history.unshift({
            date: new Date().toISOString(),
            counterparty_name: cp.value,
            date_from: dateFrom,
            date_to: dateTo
        });

        history = history.slice(0, 30);

        localStorage.setItem("act_history", JSON.stringify(history));

    } catch (e) {

        console.error(e);
        alert("Ошибка отправки");

    } finally {

        setTimeout(() => {
            actRequestInProgress = false;
        }, 1000);
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