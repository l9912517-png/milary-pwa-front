console.log("DRIVERS JS LOADED");

registerScreen("drivers", function () {

    window.currentScreen = "drivers";

    title.innerText = "Водители";

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px;">

            <div style="display:flex;gap:10px;">
                <button onclick="openDriversForm()">Обновить данные</button>
                
            </div>

            <div id="driversHeader" style="font-weight:600;"></div>
            <div id="driversContainer"></div>

        </div>
    `;

    loadDrivers();
});


function openDriversForm() {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal-window">

            <h3>Параметры</h3>

            <label>Дата</label>
            <input type="date" id="driversDate">

            <label>Менеджер</label>
            <input type="text"
                   id="driversManager"
                   placeholder="Выберите менеджера">

            <div class="modal-actions">
                <button onclick="requestDrivers()">Обновить</button>
                <button onclick="this.closest('.modal-overlay').remove()">Отмена</button>
            </div>

        </div>
    `;

    document.body.appendChild(overlay);

    // дата по умолчанию
    const d = new Date().toISOString().split("T")[0];
    document.getElementById("driversDate").value = d;

    const user = JSON.parse(localStorage.getItem("user"));
    const input = document.getElementById("driversManager");

    // ✅ безопасный вызов выбора
    input.onclick = function () {

        console.log("CLICK OK");

        if (window.openDirectorySelect) {
            window.openDirectorySelect("managers", "driversManager");
        } else {
            console.error("openDirectorySelect не найден");
            alert("Справочник не загружен");
        }
    };

    // ✅ если менеджер — автоподстановка и блок
    if (user && user.role === "manager") {

        input.value = user.name || "";
        input.dataset.guid = user.user_id || "";

        input.onclick = null;
        input.style.background = "#eee";
    }
}


async function requestDrivers() {

    const date = document.getElementById("driversDate")?.value;

    if (!date) {
        alert("Выберите дату");
        return;
    }

    const managerGuidInput = document.getElementById("driversManager");

    const managerGuid =
        (managerGuidInput?.dataset?.guid && managerGuidInput.dataset.guid !== "undefined")
            ? managerGuidInput.dataset.guid
            : (managerGuidInput?.dataset?.uuid || "");

    if (!managerGuid) {
        alert("Выберите менеджера");
        return;
    }

    const payload = {
        date_from: date,
        date_to: date,
        manager: managerGuid
    };

    const modal = document.querySelector(".modal-overlay");
    if (modal) modal.remove();

    runReport({
        type: "drivers_report",
        payload: payload,
        file: "drivers.json",
        screen: "drivers",
        text: "Формирование водителей...",
        onDone: loadDrivers
    });
}

function loadDrivers() {

    const user = JSON.parse(localStorage.getItem("user"));
    const url = "/files/" + user.user_id + "/drivers.json";

    const header = document.getElementById("driversHeader");
    const container = document.getElementById("driversContainer");

    header.innerText = "Загрузка...";
    container.innerHTML = "";

    fetch(url + "?t=" + Date.now())
        .then(r => {
            if (!r.ok) {
                header.innerText = "Файл не найден";
                return null;
            }
            return r.json();
        })
.then(data => {
            
    if (!data || !data.data) {
        header.innerText = "Нет данных";
        return;
    }

    // ✅ ВСЕГДА объявляем
    const updatedHtml = renderUpdatedAt(data.updated_at);

    header.innerText = "";

    let html = `
        ${updatedHtml}
        <div style="display:flex;flex-direction:column;gap:14px;">
    `;

    data.data.forEach(client => {

        html += `
        <div style="
            background:#f4f4f4;
            border-radius:12px;
            padding:10px;
            box-shadow:0 2px 6px rgba(0,0,0,0.08);
        ">

            <div style="
                font-weight:700;
                font-size:16px;
                margin-bottom:8px;
            ">
                ${client.name}
            </div>
        `;

        (client.trips || []).forEach(trip => {

            const car = trip.car || "";
            const phone = trip.phone || "";

            html += `
            <div style="
                background:#fff;
                border-radius:10px;
                padding:8px;
                margin-bottom:8px;
                box-shadow:0 1px 3px rgba(0,0,0,0.06);
            ">

                <div style="
                    font-weight:600;
                    font-size:14px;
                    margin-bottom:4px;
                ">
                    🚚 Ходка №${trip.trip}
                </div>

                <div style="margin-bottom:4px;">
                    👤 ${trip.driver}
                </div>

                <div style="font-size:13px;color:#555;">
                    ${car}
                </div>

                ${phone ? `
                <div style="margin-top:6px;">
                    <a href="tel:${phone}" style="
                        display:inline-block;
                        padding:4px 10px;
                        background:#2a7cff;
                        color:#fff;
                        border-radius:6px;
                        text-decoration:none;
                        font-size:13px;
                    ">
                        📞 ${phone}
                    </a>
                </div>
                ` : ""}

            </div>
            `;
        });

        html += `</div>`;
    });

    html += `</div>`;

    container.innerHTML = html;

})
        .catch(() => {
            header.innerText = "Ошибка загрузки";
        });
}

// ===============================
// ВЫБОР ИЗ СПРАВОЧНИКА
// ===============================

window.openDirectorySelect = async function(type, targetInputId) {

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
};

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