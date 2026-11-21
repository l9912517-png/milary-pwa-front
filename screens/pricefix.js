console.log("PRICEFIX JS LOADED");

let priceFixInterval = null;
registerScreen("pricefix", function () {

    window.currentScreen = "pricefix";

    title.innerText = "Фиксация цен";

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px;">

            <div style="display:flex;gap:10px;">
                <button type="button" class="btn-wide" onclick="openPriceFixForm()">${iconSvg(ICON_REPORT)}Получить фиксации</button>${refreshButton("loadPriceFix")}
            </div>

            <div id="priceFixContainer"></div>

        </div>
    `;

    loadPriceFix();
});

function loadPriceFix() {

    const user = JSON.parse(localStorage.getItem("user"));
    const url = "/files/" + user.user_id + "/pricefix.json";

    const container = document.getElementById("priceFixContainer");

    container.innerHTML = "Загрузка…";

    fetch(url + "?t=" + Date.now())
    .then(r => {
        if (!r.ok) {
            container.innerHTML = reportEmptyHtml("Получить фиксации");
            return null;
        }
        return r.json();
    })
    .then(data => {
        if (!data) return;
        const updatedHtml = renderUpdatedAt(data.updated_at);

        if (!data.rows) {
            container.innerHTML = "Нет данных";
            return;
        }

        let html = updatedHtml || "";

        data.rows.forEach(row => {

            const values = row.values || [];

html += `
<div class="order-card" onclick="openPriceFixDetail(${jsArg(row.detail)})">

    <div class="order-row">
        <span class="label">Проведен:</span>
        <span class="value" style="color:${values[0] === "Да" ? "var(--accent)" : "#FF8FB3"};">
            ${escapeHtml(values[0] || "-")}
        </span>
    </div>

    <div class="order-row">
        <span class="label">Контрагент:</span>
        <span class="value">${escapeHtml(values[1] || "-")}</span>
    </div>

    <div class="order-row">
        <span class="label">Номер:</span>
        <span class="value">№ ${escapeHtml(values[2] || "-")}</span>
    </div>

    <div class="order-row">
        <span class="label">Дата:</span>
        <span class="value">${escapeHtml(values[3] || "-")}</span>
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

function openPriceFixDetail(url) {

    navEnter("pricefix:detail:" + url, () => openPriceFixDetail(url));

    fetch(url + "?t=" + Date.now())
        .then(r => {
            if (!r.ok) throw new Error("Ошибка загрузки");
            return r.json();
        })
        .then(data => {

            title.innerText = data.meta?.title || "Фиксация";

            let html = `
                <div style="display:flex;flex-direction:column;gap:12px;">
            `;

            // ===== ШАПКА =====
            
if (data.fields && data.fields.length) {

    const user = JSON.parse(localStorage.getItem("user"));
    const role = user?.role;

    // 🔥 GUID из URL (последняя часть файла)
    const fileName = url.split("/").pop();
const guid = fileName.replace("pricefix_", "").replace(".json", "");

    // 🔥 определяем проведен ли документ
    let isDone = false;

    const prov = data.fields.find(f => f[0] === "Проведен");
    if (prov && prov[1] === "Да") {
        isDone = true;
    }

    html += `<div class="order-card">`;

    data.fields.forEach(f => {
        html += `
            <div class="order-row">
                <span class="label">${escapeHtml(f[0])}</span>
                <span class="value">${escapeHtml(f[1] || "-")}</span>
            </div>
        `;
    });

    // ===== КНОПКА =====
    if (!isDone && ["admin","director","rop"].includes(role)) {

        html += `
            <button onclick="acceptPriceFix(${jsArg(guid)})"
                    style="margin-top:10px;width:100%;">
                Провести
            </button>
        `;
    }

    html += `</div>`;
}

            // ===== ТАБЛИЦА =====
            if (data.lines && data.lines.length > 0 && data.line_columns) {

                html += `<div class="table-scroll">`;

                // ===== ШАПКА ТАБЛИЦЫ =====
                html += `<div class="table-grid table-head" style="
                    grid-template-columns: 40% 15% 15% 15% 15%;
                ">`;

                data.line_columns.forEach(col => {

                    if (col === "ЦенаПрайса") col = "По прайсу";

                    html += `<div>${escapeHtml(col)}</div>`;
                });

                html += `</div>`;

                // ===== СТРОКИ =====
                data.lines.forEach((line, index) => {

                    const bg = index % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent";

                    html += `<div class="table-grid" style="
                        grid-template-columns: 40% 15% 15% 15% 15%;
                        background:${bg};
                    ">`;

                    data.line_columns.forEach((col, i) => {

                        let value = line[i] || "-";

                        html += `<div style="
                            word-break: break-word;
                            white-space: normal;
                            padding:4px;
                        ">${escapeHtml(value)}</div>`;
                    });

                    html += `</div>`;
                });

                html += `</div>`;
            }

            html += `
                <button type="button" onclick="headerBack()" class="btn-secondary"
                        style="margin-top:10px;">
                    Назад
                </button>
            </div>`;

            container.innerHTML = html;

        })
        .catch(() => {
            container.innerHTML = "Ошибка загрузки";
        });
}

window.openPriceFixForm = function () {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal-window">

            <h3>Фильтр</h3>

            <label>Менеджер</label>
            <input type="text"
                   id="priceFixManager"
                   placeholder="Выберите менеджера"
                   readonly
                   onclick="openDirectorySelect('managers','priceFixManager')">

            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="closePriceFixForm()">Отмена</button>
                <button type="button" class="btn-primary-wide" onclick="requestPriceFix()">Получить</button>
            </div>

        </div>
    `;

    document.body.appendChild(overlay);
};

async function requestPriceFix() {

    const manager = document.querySelector("#priceFixManager");

    const payload = {
        manager: (manager?.dataset?.guid && manager.dataset.guid !== "undefined")
            ? manager.dataset.guid
            : ""
    };

    closePriceFixForm();

    runReport({
        type: "pricefix_report",
        payload: payload,
        file: "pricefix.json",
        screen: "pricefix",
        text: "Формирование фиксаций...",
        onDone: loadPriceFix
    });
}


function closePriceFixForm() {
    const modal = document.querySelector(".modal-overlay");
    if (modal) modal.remove();
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

function renderDirectoryList(data, container, targetInputId) {

    if (!data || data.length === 0) {
        container.innerHTML = `<div class="menu-item">Нет данных</div>`;
        return;
    }

    container.innerHTML = "";

    data.forEach(item => {

        const div = document.createElement("div");
        div.className = "menu-item";

        div.innerHTML = `<strong>${escapeHtml(item.name || "-")}</strong>`;

        div.onclick = function () {

            const guid = item.guid || item.uuid || "";

            const input = document.getElementById(targetInputId);

            if (input) {
                input.value = item.name || "";
                input.dataset.guid = guid;
            }

            // ✅ правильное закрытие текущей модалки
            const overlay = div.closest(".modal-overlay");
            if (overlay) overlay.remove();
        };

        container.appendChild(div);
    });
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

function waitPriceFixUpdate() {

    const user = JSON.parse(localStorage.getItem("user"));
    const url = "/files/" + user.user_id + "/pricefix.json";

    if (priceFixInterval) {
        clearInterval(priceFixInterval);
    }

    let lastText = null;

    priceFixInterval = setInterval(async () => {

        try {

            const res = await fetch(url + "?t=" + Date.now());

            if (!res.ok) return;

            const text = await res.text();

            // 🔥 первое чтение
            if (lastText === null) {
                lastText = text;
                return;
            }

            // 🔥 файл изменился
            if (text !== lastText) {

                clearInterval(priceFixInterval);
                priceFixInterval = null;

                console.log("PRICEFIX UPDATED");

                loadPriceFix(); // 🔥 вот ключ

            }

        } catch (e) {}

    }, 3000);
}

async function acceptPriceFix(guid) {

    const jwt = localStorage.getItem("jwt");

    const response = await fetch("/api/task", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + jwt
        },
        body: JSON.stringify({
            type: "pricefix_accept",
            payload: { guid_fix: guid }
        })
    });

    if (!response.ok) {
        alert("Ошибка проведения");
        return;
    }

    alert("Отправлено на проведение");

    
    waitPriceFixUpdate();
}