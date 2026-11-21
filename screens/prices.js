let pricesInterval = null;

registerScreen("prices", async function () {

    window.currentScreen = "prices";

    title.innerText = "Цены";

    const jwt = localStorage.getItem("jwt");
    const user = JSON.parse(localStorage.getItem("user"));

    let resultHtml = `<div class="menu-item">Нет данных</div>`;

    try {

        const url = `/files/${user.user_id}/prices.json`;

        const res = await fetch(url + "?t=" + Date.now(), {
            headers: { "Authorization": "Bearer " + jwt }
        });

        if (res.ok) {

            const data = await res.json();

            let list = [];

            if (Array.isArray(data)) {
                list = data;
            } else if (Array.isArray(data.data)) {
                list = data.data;
            } else {
                list = Object.values(data);
            }

            if (list.length) {

                list = list.slice().reverse();

                resultHtml = list.map(block => {

                    const header = `
Контрагент: ${escapeHtml(block.counterparty || "")}
Дата: ${escapeHtml(block.date)}
`;

                    const rows = (block.items || []).map(i =>
                        `${escapeHtml(i.name)} | ${escapeHtml(i.price)} | ${escapeHtml(i.total)}`
                    ).join("\n");

                    return `
<div class="menu-item" style="flex-direction:column;align-items:flex-start;">
    <pre style="margin:0;white-space:pre-wrap;font-family:monospace;">
${header}
${rows}
    </pre>
</div>
`;
                }).join("");
            }

        } else {
            resultHtml = `<div class="menu-item">Цены ещё не получены. Нажмите «Получить цены».</div>`;
        }

    } catch (e) {
        console.error(e);
        resultHtml = `<div class="menu-item">Ошибка загрузки</div>`;
    }

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px;">

            <div class="menu-item" style="flex-direction:column;align-items:flex-start;gap:10px;">

                <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
                    <label>Контрагент</label>
                    <label style="display:flex;align-items:center;gap:6px;font-size:14px;cursor:pointer;">
                        <input type="checkbox" id="pricesCash" onchange="pricesCashChanged()"> Наличные (Нр)
                    </label>
                </div>

                <input type="text"
                       id="pricesCounterparty"
                       placeholder="Выберите контрагента"
                       readonly
                       onclick="openPricesCounterpartySelect()"
                       style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--card-border);">

                <label>Номенклатура</label>

                <input type="text"
       id="pricesItem"
       placeholder="Выберите номенклатуру"
       readonly
       onclick="openNomenclatureSelect('pricesItem')"
                       style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--card-border);">

                <label>Поиск</label>

                <input type="text"
                       id="pricesSearch"
                       placeholder="Введите часть названия"
                       style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--card-border);">

                <button onclick="requestPrices()" style="width:100%;">
                    Получить цены
                </button>

            </div>

            <div>
                <div style="font-weight:600;margin-bottom:6px;">
                    Результат
                </div>

                <div id="pricesResult">
    ${resultHtml}
</div>
            </div>


        </div>
    `;
});

/* ================= НАЛИЧНЫЕ (НР) ================= */

/* Галочка «Наличные (Нр)»: выбор клиента из cash_counterparties.data (выгрузка 1С «ВыгрузитьНаличныхКонтрагентовНаVPS»).
   Переключили после выбора — клиент сбрасывается, чтобы не запросить цену по клиенту из другого списка. */
function pricesCashChanged() {
    const input = document.getElementById("pricesCounterparty");
    if (!input) return;
    input.value = "";
    delete input.dataset.guid;
}

/* ================= SELECT COUNTERPARTY ================= */

async function openPricesCounterpartySelect() {

    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    overlay.innerHTML = `
        <div class="modal-window">

            <h3>Выбор контрагента</h3>

            <input type="text" id="pricesCpSearch"
                   placeholder="Поиск…"
                   style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--card-border);margin-bottom:10px;" />

            <div id="pricesCpList" style="max-height:300px;overflow:auto;"></div>

            <button onclick="this.closest('.modal-overlay').remove()">
                Закрыть
            </button>

        </div>
    `;

    document.body.appendChild(overlay);

    const list = overlay.querySelector("#pricesCpList");
    const search = overlay.querySelector("#pricesCpSearch");

    const jwt = localStorage.getItem("jwt");
    const user = JSON.parse(localStorage.getItem("user"));

    const cashBox = document.getElementById("pricesCash");
    const cash = Boolean(cashBox && cashBox.checked);
    overlay.querySelector("h3").textContent = cash ? "Выбор контрагента (наличные, Нр)" : "Выбор контрагента";

    try {

        const res = await fetch("/api/directory/" + (cash ? "cash_counterparties" : "counterparties"), {
            headers: { "Authorization": "Bearer " + jwt }
        });

        let data = await res.json();

        data = filterCounterpartiesByRole(Array.isArray(data) ? data : [], user);

        const emptyText = data.length
            ? "Ничего не найдено"
            : (cash ? "Клиентов с наличным расчётом нет (или файл ещё не выгружен из 1С)" : "Клиентов нет");

        function render(arr) {

            list.innerHTML = "";

            arr.forEach(c => {

                const div = document.createElement("div");
                div.className = "menu-item";

                div.innerHTML = `<strong>${escapeHtml(c.name)}</strong>`;

                div.onclick = () => {

                    const input = document.getElementById("pricesCounterparty");

                    input.value = c.name;
                    input.dataset.guid = c.guid;

                    overlay.remove();
                };

                list.appendChild(div);
            });

            if (!arr.length) {
                list.innerHTML = `<div class="menu-item">${emptyText}</div>`;
            }
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


/* ================= FILTER ================= */

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


/* ================= REQUEST ================= */

let pricesRequestInProgress = false;

async function requestPrices() {

    const cp = document.getElementById("pricesCounterparty");
    const item = document.getElementById("pricesItem");
    const search = document.getElementById("pricesSearch");

    if (!cp || !cp.dataset.guid) {
        alert("Выберите контрагента");
        return;
    }

    const payload = {
        counterparty: cp.dataset.guid
    };

    // если выбрана номенклатура — используем GUID, иначе поиск по строке
    if (item && item.dataset.guid) {
        payload.nomenclature = item.dataset.guid;
    } else if (search && search.value) {
        payload.query = search.value;
    }

    runReport({
        type: "price_report",
        payload: payload,
        file: "prices.json",
        screen: "prices",
        text: "Формирование цен...",
        onDone: loadPrices
    });
}

async function loadPrices() {

    const jwt = localStorage.getItem("jwt");
    const user = JSON.parse(localStorage.getItem("user"));

    const url = `/files/${user.user_id}/prices.json`;

    try {

        const res = await fetch(url + "?t=" + Date.now(), {
            headers: { "Authorization": "Bearer " + jwt }
        });

        if (!res.ok) return;

        const data = await res.json();

        let list = [];

        if (Array.isArray(data)) list = data;
        else if (Array.isArray(data.data)) list = data.data;
        else list = Object.values(data);

        if (!list.length) return;

        list = list.slice().reverse();

        const html = list.map(block => {

            const header = `
Контрагент: ${escapeHtml(block.counterparty || "")}
Дата: ${escapeHtml(block.date)}
`;

            const rows = (block.items || []).map(i =>
                `${escapeHtml(i.name)} | ${escapeHtml(i.price)} | ${escapeHtml(i.total)}`
            ).join("\n");

            return `
<div class="menu-item" style="flex-direction:column;align-items:flex-start;">
    <pre style="margin:0;white-space:pre-wrap;font-family:monospace;">
${header}
${rows}
    </pre>
</div>
`;
        }).join("");

        // 🔥 перерисовываем только результат
        const block = document.querySelector("#pricesResult");

        if (block) block.innerHTML = html;

    } catch (e) {
        console.error(e);
    }
}
