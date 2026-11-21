console.log("RATING JS LOADED");

registerScreen("rating", function () {

    window.currentScreen = "rating";

    title.innerText = "Рейтинг";

    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px;">

<div style="display:flex;gap:10px;">
    <button onclick="requestRating()">Обновить рейтинг</button>
    
</div>

            <div id="ratingContainer"></div>

        </div>
    `;

    loadRating();
});


// ===== ЗАГРУЗКА JSON =====
function loadRating() {

    const user = JSON.parse(localStorage.getItem("user"));
    const url = "/files/" + user.user_id + "/rating.json";

    const container = document.getElementById("ratingContainer");

    container.innerHTML = "Загрузка...";

    fetch(url + "?t=" + Date.now())
        .then(r => {
            if (!r.ok) {
                container.innerHTML = "Нет данных";
                return null;
            }
            return r.json();
        })
        .then(data => {

            // старый формат: JSON, сохранённый как строка
            if (typeof data === "string") {
                try { data = JSON.parse(data); } catch (e) { data = null; }
            }

            if (!data || !data.blocks) {
                container.innerHTML = "Нет данных";
                return;
            }

            const updatedHtml = renderUpdatedAt(data.updated_at);

            let html = updatedHtml || "";

            data.blocks.forEach(block => {

                html += `<div class="rating-block">`;

                html += `<div class="rating-title">${escapeHtml(block.title)}</div>`;

                block.items.forEach(item => {

                    let medal = "";

                    if (item.pos === 1) medal = "🥇";
                    if (item.pos === 2) medal = "🥈";
                    if (item.pos === 3) medal = "🥉";

                    html += `
                        <div class="rating-row ${item.pos <= 3 ? 'top' : ''}">
                            <div class="rating-pos">${escapeHtml(medal || item.pos)}</div>
                            <div class="rating-name">${escapeHtml(item.name)}</div>
                            <div class="rating-value">${escapeHtml(item.percent)}%</div>
                        </div>
                    `;
                });

                html += `</div>`;
            });

            container.innerHTML = html;

        })
        .catch(() => {
            container.innerHTML = "Ошибка загрузки";
        });
}


// ===== ЗАПРОС НА 1С =====
async function requestRating() {

    const today = new Date().toISOString().split("T")[0];

    const payload = {
        date_from: today,
        date_to: today
    };

    // Новый единый механизм ожидания
    if (typeof runReport === "function") {

        runReport({
            type: "rating_report",
            payload: payload,
            file: "rating.json",
            screen: "rating",
            text: "Формирование рейтинга...",
            onDone: loadRating
        });

        return;
    }

    // Запасной путь: если у пользователя ещё старый app.js из кеша
    const jwt = localStorage.getItem("jwt");

    const response = await fetch("/api/task", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + jwt
        },
        body: JSON.stringify({
            type: "rating_report",
            payload: payload
        })
    });

    if (!response.ok) {
        alert("Ошибка отправки");
        return;
    }

    waitForReport("rating.json", "Формирование отчета...");
}
