registerScreen("control", async function () {

    window.currentScreen = "control";

    title.innerText = "Контроль";

    const jwt = localStorage.getItem("jwt");
    const user = JSON.parse(localStorage.getItem("user"));

    let listHtml = `<div class="menu-item">Нет данных</div>`;
    let updatedHtml = "";

    // ===== ЗАГРУЗКА СПИСКА =====
    try {

        const res = await fetch(`/files/${user.user_id}/control.json?t=` + Date.now(), {
            headers: { "Authorization": "Bearer " + jwt }
        });

        if (res.ok) {

            const data = await res.json();

            if (data && typeof data === "object") {

                // дата обновления
                if (data.updated_at) {
                    updatedHtml = `
                        <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">
                            Обновлено: ${escapeHtml(data.updated_at)}
                        </div>
                    `;
                }

                // список
                if (Array.isArray(data.items) && data.items.length) {

                    listHtml = data.items.map(i => `
                        <div class="menu-item" style="flex-direction:column;align-items:flex-start;">
                            <div><strong>${escapeHtml(i.name || "-")}</strong></div>
                            <div style="font-size:12px;color:var(--muted);">
                                До: ${escapeHtml(i.date_to || "-")}
                            </div>
                        </div>
                    `).join("");
                }

            }

        }

    } catch (e) {
        console.error(e);
    }

    // ===== UI =====

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px;">

            <!-- ВЫБОР -->

            <div style="
                display:flex;
                flex-direction:column;
                gap:10px;
                padding:12px;
                border-radius:12px;
                background:var(--card);
            ">

                <label>Контрагент</label>

                <input type="text"
                       id="controlCounterparty"
                       placeholder="Выберите контрагента"
                       readonly
                       onclick="openControlCounterpartySelect()"
                       style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--card-border);">

                <button onclick="controlClient()" style="background:var(--accent);">
                    Контроль
                </button>

                <button onclick="refreshControl()" class="btn-secondary">
                    Обновить
                </button>

            </div>

            <!-- СПИСОК -->

            <div>
                <div style="font-weight:600;margin-bottom:6px;">
                    Контроль контрагентов
                </div>

                ${updatedHtml}

                ${listHtml}
            </div>


        </div>
    `;
});


/* ================= SELECT COUNTERPARTY ================= */

async function openControlCounterpartySelect() {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal-window">

            <h3>Выбор контрагента</h3>

            <input type="text" id="controlCpSearch"
                   placeholder="Поиск..."
                   style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--card-border);margin-bottom:10px;" />

            <div id="controlCpList" style="max-height:300px;overflow:auto;"></div>

            <button onclick="this.closest('.modal-overlay').remove()">
                Закрыть
            </button>

        </div>
    `;

    document.body.appendChild(overlay);

    const list = overlay.querySelector("#controlCpList");
    const search = overlay.querySelector("#controlCpSearch");

    const jwt = localStorage.getItem("jwt");
    const user = JSON.parse(localStorage.getItem("user"));

    try {

        const res = await fetch("/api/directory/counterparties", {
            headers: { "Authorization": "Bearer " + jwt }
        });

        let data = await res.json();

        if (!Array.isArray(data)) {
            data = Array.isArray(data.data) ? data.data : Object.values(data);
        }

        data = filterCounterpartiesByRole(data, user);

        function render(arr) {

            list.innerHTML = "";

            arr.forEach(c => {

                const div = document.createElement("div");
                div.className = "menu-item";

                div.innerHTML = `<strong>${escapeHtml(c.name)}</strong>`;

                div.onclick = () => {

                    const input = document.getElementById("controlCounterparty");

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

            render(data.filter(c =>
                c.name && c.name.toLowerCase().includes(q)
            ));
        };

    } catch (e) {
        console.error(e);
        alert("Ошибка загрузки");
    }
}


/* ================= TASKS ================= */

async function controlClient() {

    const input = document.getElementById("controlCounterparty");

    if (!input || !input.dataset.guid) {
        alert("Выберите контрагента");
        return;
    }

    try {

        await sendTask("counterparty_control", {
            counterparty: input.dataset.guid
        });

    } catch (e) {
        console.error(e);
        alert("Ошибка");
    }
}


async function refreshControl() {

    try {

        await sendTask("counterparty_control_info", {});

    } catch (e) {
        console.error(e);
        alert("Ошибка");
    }
}

function filterCounterpartiesByRole(data, user) {

    if (!user || !user.role) return data;

    if (user.role === "admin" || user.role === "director") return data;

    if (user.role === "manager") {
        return data.filter(c => c.manager_uuid === user.user_id);
    }

    if (user.role === "rop") {
        return data.filter(c => c.director_uuid === user.user_id);
    }

    return [];
}
