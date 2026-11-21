console.log("RETURNS JS LOADED");

registerScreen("returns", function () {

    window.currentScreen = "returns";

    title.innerText = "Возвраты";

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px;">

            <div style="display:flex;gap:10px;">
                <button onclick="openReturnsForm()">Получить возвраты</button>
            </div>

            <div id="returnsHeader" style="font-weight:600;"></div>
            <div id="returnsContainer"></div>

        </div>
    `;

    loadReturns();
});

async function loadReturns() {

    const user = JSON.parse(localStorage.getItem("user"));
    const url = "/files/" + user.user_id + "/returns.json";

    const header = document.getElementById("returnsHeader");
    const container = document.getElementById("returnsContainer");

    header.innerText = "Загрузка...";
    container.innerHTML = "";

    try {

        const res = await fetch(url + "?t=" + Date.now());

        console.log("STATUS:", res.status);

        if (!res.ok) {
            header.innerText = "Ошибка загрузки (" + res.status + ")";
            return;
        }

        let text = await res.text();

        if (!text) {
            header.innerText = "Нет данных";
            return;
        }

        let data;

        try {

            text = text.trim();

            if (text.startsWith('"')) {
                text = JSON.parse(text);
            }

            text = text.replace(/\u00A0/g, ' ');
            text = text.replace(/\u202F/g, ' ');

            data = JSON.parse(text);

        } catch (e) {

            console.error("JSON RAW:", text);
            console.error("JSON ERROR:", e);

            header.innerText = "Ошибка JSON";
            return;
        }

        if (!data || !Array.isArray(data.rows)) {
            header.innerText = "Нет данных";
            return;
        }

        header.innerText = data.updated_at
            ? "Обновлено: " + data.updated_at
            : "Актуально";


let currentClient = "";

let html = `
<div style="
    background:#f4f4f4;
    padding:10px;
    border-radius:10px;
    font-size:13px;
">
`;

data.rows.forEach(row => {

    if (!row.Номенклатура) {

        currentClient = row.Контрагент || "";

        html += `
            <div style="
                background:#dcdcdc;
                padding:6px 8px;
                font-weight:600;
                margin-top:10px;
                border-radius:6px;
            ">
                ${currentClient}
            </div>
        `;

        return;
    }

    function formatDate(d) {
        if (!d) return "";
        const p = d.split("-");
        return p[2] + "-" + p[1] + "-" + p[0].slice(2);
    }

    html += `
        <div style="
            padding:6px 8px;
            border-bottom:1px solid #ddd;
        ">

            <!-- строка 1 -->
            <div style="
                display:flex;
                justify-content:space-between;
                gap:10px;
                font-weight:600;
            ">
                <div>${formatDate(row.ДатаВозврата)}</div>
                <div>${formatMoney(row.Сумма || 0)} руб</div>
            </div>

            <!-- строка 2 -->
            <div style="
                margin-top:2px;
                word-break:break-word;
            ">
                ${row.Номенклатура || ""}
            </div>

            <!-- строка 3 -->
            <div style="
                color:#555;
                font-size:12px;
            ">
                ${row.Количество || ""} ${row.ЕдИзм || ""}
            </div>

            <!-- строка 4 -->
            <div style="
                color:#a94442;
                font-size:12px;
            ">
                ${row.Причина || ""}
            </div>

        </div>
    `;
});

html += `</div>`;

container.innerHTML = html;


    } catch (e) {

        console.error("LOAD RETURNS ERROR:", e);
        header.innerText = "Ошибка загрузки";
    }
}

window.openReturnsForm = function () {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal-window">

            <h3>Параметры</h3>

            <label>Дата с</label>
            <input type="date" id="dateFrom">

            <label>Дата по</label>
            <input type="date" id="dateTo">

            <label>Менеджер</label>
            <input type="text"
                   id="returnsManager"
                   placeholder="Выберите менеджера"
                   readonly
                   onclick="openDirectorySelect('managers','returnsManager')">

            <div class="modal-actions">
                <button onclick="requestReturns()">Обновить</button>
                <button onclick="this.closest('.modal-overlay').remove()">Отмена</button>
            </div>

        </div>
    `;

    document.body.appendChild(overlay);

    const today = new Date().toISOString().split("T")[0];

    document.getElementById("dateFrom").value = today;
    document.getElementById("dateTo").value = today;
    const user = JSON.parse(localStorage.getItem("user"));
const input = document.getElementById("returnsManager");

// ===== ЕСЛИ МЕНЕДЖЕР =====
if (user.role === "manager") {

    input.value = user.name || "";
    input.dataset.guid = user.user_id || "";

    // блокируем выбор
    input.removeAttribute("onclick");
    input.style.background = "#eee";
}
};

async function requestReturns() {

    const dateFrom = document.getElementById("dateFrom").value;
    const dateTo = document.getElementById("dateTo").value;

    if (!dateFrom || !dateTo) {
        alert("Выберите даты");
        return;
    }

    const managerInput = document.getElementById("returnsManager");

    const payload = {
        date_from: dateFrom,
        date_to: dateTo,
        manager: managerInput?.dataset?.guid || ""
    };

    const modal = document.querySelector(".modal-overlay");
    if (modal) modal.remove();

    runReport({
        type: "returns_report",
        payload: payload,
        file: "returns.json",
        screen: "returns",
        text: "Формирование возвратов...",
        onDone: loadReturns
    });
}


// === DIRECTORY ===

async function openDirectorySelect(type, targetInputId) {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal-window">

            <h3>Выбор</h3>

            <input type="text" id="searchInput"
                   placeholder="Поиск..."
                   style="width:100%;padding:8px;border-radius:8px;border:1px solid #ccc;" />

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

    // 🔥 ROP / ADMIN / DIRECTOR — ВИДЯТ ВСЕХ
    if (user.role === "admin" || user.role === "director" || user.role === "rop") {
        return data;
    }

    // 🔥 ОСТАЛЬНЫЕ — ТОЛЬКО СВОИХ
    return data.filter(item =>
        item.manager_uuid === user.user_id ||
        item.director_uuid === user.user_id ||
        item.uuid === user.user_id
    );
}

function renderDirectoryList(data, container, targetInputId) {

    container.innerHTML = "";

    data.forEach(item => {

        const div = document.createElement("div");
        div.className = "menu-item";

        div.innerHTML = `<span>${item.name}</span>`;

        div.onclick = function() {

            const input = document.getElementById(targetInputId);

            input.value = item.name;
            input.dataset.guid = item.guid || item.uuid || "";

            document.querySelector(".modal-overlay:last-of-type").remove();
        };

        container.appendChild(div);

    });
}

function formatMoney(val) {

    if (!val) return "0";

    val = String(val)
        .replace(/\u00A0/g, '')
        .replace(/\u202F/g, '')
        .replace(/\s/g, '')
        .replace(',', '.')
        .replace(/[^\d.-]/g, '');

    let num = Number(val);

    if (isNaN(num)) num = 0;

    return num.toLocaleString("ru-RU", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
}