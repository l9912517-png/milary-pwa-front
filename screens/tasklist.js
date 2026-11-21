console.log("TASKLIST JS LOADED");


registerScreen("tasklist", function () {


    window.currentScreen = "tasklist";


    title.innerText = "Список задач";


    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px;">


            <div style="display:flex;gap:10px;">
                <button onclick="requestTaskList()">Обновить</button>
            </div>


            <div id="taskListContainer"></div>


        </div>
    `;


    loadTaskList();
});


/* ================= LOAD ================= */


function loadTaskList() {


    const user = JSON.parse(localStorage.getItem("user"));
    const url = "/files/" + user.user_id + "/tasklist.json";


    const container = document.getElementById("taskListContainer");


    container.innerHTML = "Загрузка...";


    fetch(url + "?t=" + Date.now())
    .then(r => {


        if (!r.ok) {
            container.innerHTML = "Файл не найден";
            return null;
        }


        return r.json();
    })
    .then(data => {


        if (!data) return;


        let html = "";


        // ===== UPDATED =====
        if (data.updated_at) {
            html += renderUpdatedAt(data.updated_at);
        }


        if (!data.rows || !data.rows.length) {
            container.innerHTML = html + "<div class='menu-item'>Нет задач</div>";
            return;
        }


     data.rows.forEach(row => {


    html += `
    <div class="menu-item" style="flex-direction:column;align-items:flex-start;gap:6px;">


        <div style="font-weight:600;">
            ${row.ТипЗадачи || "-"}
        </div>


        <div style="font-size:12px;color:#888;">
            ${formatTaskDate(row.ДатаСоздания)}
        </div>


        <div>👤 ${row.Пользователь || "-"}</div>


        ${row.Менеджер ? `<div>👔 ${row.Менеджер}</div>` : ""}
        ${row.Контрагент ? `<div>🏢 ${row.Контрагент}</div>` : ""}
        ${row.Номенклатура ? `<div>📦 ${row.Номенклатура}</div>` : ""}


        ${row.ИмяКонтрагента ? `<div>📛 ${row.ИмяКонтрагента}</div>` : ""}
        ${row.СтрокаПоиска ? `<div>🔍 ${row.СтрокаПоиска}</div>` : ""}


        ${(row.Дата1 || row.Дата2) ? `
            <div style="font-size:12px;color:#555;">
                📅 ${row.Дата1 || ""} — ${row.Дата2 || ""}
            </div>
        ` : ""}


    </div>
    `;
});


        container.innerHTML = html;


    })
    .catch(() => {
        container.innerHTML = "Ошибка загрузки";
    });
}

function formatTaskDate(value) {

    if (!value) {
        return "";
    }

    // Дата 1С может прийти как строка
    if (typeof value === "string") {

        // dd.MM.yyyy HH:mm:ss
        let m = value.match(
            /^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
        );

        if (m) {

            const d = new Date(
                Number(m[3]),
                Number(m[2]) - 1,
                Number(m[1]),
                Number(m[4] || 0),
                Number(m[5] || 0),
                Number(m[6] || 0)
            );

            return d.toLocaleDateString("ru-RU") + " " +
                   d.toLocaleTimeString("ru-RU", {
                       hour: "2-digit",
                       minute: "2-digit"
                   });
        }

        // yyyy-MM-dd HH:mm:ss
        m = value.match(
            /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/
        );

        if (m) {

            const d = new Date(
                Number(m[1]),
                Number(m[2]) - 1,
                Number(m[3]),
                Number(m[4] || 0),
                Number(m[5] || 0),
                Number(m[6] || 0)
            );

            return d.toLocaleDateString("ru-RU") + " " +
                   d.toLocaleTimeString("ru-RU", {
                       hour: "2-digit",
                       minute: "2-digit"
                   });
        }
    }

    // На случай timestamp / ISO
    const d = new Date(value);

    if (isNaN(d.getTime())) {
        return "Дата не определена";
    }

    return d.toLocaleDateString("ru-RU") + " " +
           d.toLocaleTimeString("ru-RU", {
               hour: "2-digit",
               minute: "2-digit"
           });
}


/* ================= REQUEST ================= */


async function requestTaskList() {

    runReport({
        type: "tasklist",
        payload: {},
        file: "tasklist.json",
        screen: "tasklist",
        text: "Формирование списка задач...",
        onDone: loadTaskList
    });
}
