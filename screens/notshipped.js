console.log("NOTSHIPPED JS LOADED");


registerScreen("notshipped", function () {


    window.currentScreen = "notshipped";


    title.innerText = "Неотгруженные";


    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px;">


            <div style="display:flex;gap:10px;">
                <button type="button" class="btn-wide" onclick="openNotshippedForm()">${iconSvg(ICON_REPORT)}Получить неотгруженные</button>${refreshButton("loadNotShipped")}
               
            </div>


            <div id="notshippedContainer"></div>


        </div>
    `;


    loadNotshipped();
});


// ================= ЗАГРУЗКА =================


function loadNotshipped() {


    const user = JSON.parse(localStorage.getItem("user"));
    const url = "/files/" + user.user_id + "/notshipped.json";


    const container = document.getElementById("notshippedContainer");


    container.innerHTML = "Загрузка…";


    fetch(url + "?t=" + Date.now())
        .then(r => {
            if (!r.ok) {
                container.innerHTML = reportEmptyHtml("Получить неотгруженные");
                return null;
            }
            return r.json();
        })
        .then(data => {


            if (!data || !data.blocks) {
                container.innerHTML = "Нет данных";
                return;
            }
            const updatedHtml = renderUpdatedAt(data.updated_at);
            let html = updatedHtml || "";


            data.blocks.forEach(block => {


                html += `<div class="report-table">`;
                html += `<div class="report-head"><div>${escapeHtml(block.title)}</div></div>`;


                block.groups.forEach(group => {


                    html += `
                        <div class="report-row manager">
                            <div><b>${escapeHtml(group.name)}</b></div>
                            <div></div>
                        </div>
                    `;


                    group.rows.forEach(row => {


                        html += `
                           <div class="report-row child">


    <div>
        ${escapeHtml(row.date)} | ${escapeHtml(row.counterparty || row.product)}
    </div>
    <div class="report-sum">
        <span style="color:var(--accent);">${escapeHtml(row.qty || 0)}</span>
        /
        <span style="color:#FF8FB3;">${escapeHtml(row.ordered || 0)}</span>
    </div>
</div>
                        `;
                    });


                });


                html += `</div>`;
            });


            container.innerHTML = html;


        })
        .catch(() => {
            container.innerHTML = "Ошибка загрузки";
        });
}


// ================= ФОРМА =================


window.openNotshippedForm = function () {


    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";


    const today = new Date().toISOString().split("T")[0];


    overlay.innerHTML = `
        <div class="modal-window">


            <h3>Параметры отчёта</h3>


            <label>Дата</label>
            <input type="date" id="notshippedDate" value="${today}">


            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="closeNotshippedForm()">Отмена</button>
                <button type="button" class="btn-primary-wide" onclick="requestNotshipped()">Получить</button>
            </div>


        </div>
    `;


    document.body.appendChild(overlay);
};


function closeNotshippedForm() {
    const modal = document.querySelector(".modal-overlay");
    if (modal) modal.remove();
}


// ================= ЗАПРОС =================


async function requestNotshipped() {

    const date = document.getElementById("notshippedDate").value;

    if (!date) {
        alert("Выберите дату");
        return;
    }

    const payload = {
        date_from: date,
        date_to: date
    };

    closeNotshippedForm();

    runReport({
        type: "notshipped_report",
        payload: payload,
        file: "notshipped.json",
        screen: "notshipped",
        text: "Формирование неотгруженных...",
        onDone: loadNotshipped
    });
}
