/*
 * «Информация по заказам» (админ, директор): вход в проверку заказов и статистику.
 * Директору доступна только статистика — экран сразу открывает её.
 */

registerScreen("ord_info", function () {

    const role = String(ORD.user().role || "");
    const canReview = ORD.isOperator();

    if (!canReview) {
        openScreen("ord_stats");
        return;
    }

    window.currentScreen = "ord_info";
    title.innerText = "Информация по заказам";

    container.innerHTML = `
        <div class="ord-page">
            <div class="ost-entry-grid">
                <button type="button" class="ost-entry" onclick="openScreen('ord_review')">
                    <span class="ost-entry-icon">✅</span>
                    <span class="ost-entry-title">Проверка заказов</span>
                    <span class="ost-entry-text">Разобранные заказы: проверить строки, подтвердить и создать в 1С</span>
                    <span class="ost-entry-n" id="ostInfoReview"></span>
                </button>
                <button type="button" class="ost-entry" onclick="openScreen('ord_stats')">
                    <span class="ost-entry-icon">📊</span>
                    <span class="ost-entry-title">Статистика по заказам</span>
                    <span class="ost-entry-text">Сколько отправили, сколько в работе и создано в 1С — по менеджерам и операторам</span>
                    <span class="ost-entry-n" id="ostInfoStats"></span>
                </button>
            </div>
        </div>
    `;

    /* короткая сводка на плитках — за рабочий день */
    const day = ORD.day.workDay();
    ORD.api("GET", "/orders?status=processed&limit=500&date=" + day).then(r => {
        const el = document.getElementById("ostInfoReview");
        if (el) el.textContent = r.orders.length ? "Ждут проверки: " + r.orders.length : "Все проверены";
    }).catch(() => {});
    if (role === "admin" || role === "director") {
        ORD.api("GET", "/stats?from=" + day + "&to=" + day).then(r => {
            const el = document.getElementById("ostInfoStats");
            if (el) el.textContent = ORD.fmtDate(day) + ": отправлено " + r.totals.total + " · в работе " + r.totals.in_work;
        }).catch(() => {});
    }
});
