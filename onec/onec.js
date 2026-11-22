/*
 * «1С сейчас не на связи»: когда пользователь ждёт отчёт, а 1С давно не забирала задачи,
 * на экране ожидания появляется пояснение — отчёт придёт, когда связь восстановится.
 * Сервер: GET /api/onec-status (online — 1С обращалась за последние 5 минут). Ответ кэшируется на 30 секунд.
 */

let onecCache = null;

async function onecStatus() {
    if (onecCache && Date.now() - onecCache.at < 30000) return onecCache.data;
    const jwt = localStorage.getItem("jwt");
    if (!jwt) return null;
    try {
        const r = await fetch("/api/onec-status", { headers: { "Authorization": "Bearer " + jwt } });
        if (!r.ok) return null;
        const data = await r.json();
        onecCache = { at: Date.now(), data };
        return data;
    } catch (e) {
        return null;           // нет связи с сервером — об этом скажет сам запрос
    }
}

function onecAgo(min) {
    if (min == null) return "";
    if (min < 60) return min + " мин";
    const h = Math.floor(min / 60);
    if (h < 48) return h + " ч";
    return Math.floor(h / 24) + " дн";
}

/* добавить пояснение в окно ожидания (box — .report-overlay-box) */
async function onecWarn(box) {
    const st = await onecStatus();
    if (!st || st.online || !box || !document.body.contains(box) || box.querySelector(".onec-warn")) return;
    box.insertAdjacentHTML("beforeend", `
        <div class="onec-warn" role="alert">
            <b>1С сейчас не на связи</b>
            <span>${st.minutes != null ? "Последнее обращение — " + escapeHtml(onecAgo(st.minutes)) + " назад. " : ""}Запрос сохранён — 1С выполнит его, когда связь восстановится. Если не срочно, обратитесь к администратору.</span>
        </div>`);
}
