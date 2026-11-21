/*
 * Очередь задач 1С (только админ): связь с 1С, счётчики, последние задачи,
 * «Вернуть в очередь» и «Удалить». Сервер: /api/admin/task-queue.
 * Пока экран открыт — обновляется каждые 10 секунд.
 */

const TQ_TYPES = {
    orders_report: "Заказы", sales_report: "Продажи", rating_report: "Рейтинг",
    notshipped_report: "Неотгруженные", returns_report: "Возвраты", drivers_report: "Водители",
    bank_report: "Банк", debt_report: "Дебиторка", debt_report_file: "Дебиторка (файл)",
    unblock_request: "Запрос на разблокировку", bills_files: "Счета", act_files: "Акт сверки",
    upd_files: "УПД", pricelist_files: "Прайс", pricelist_pdf_files: "Прайс в PDF", price_report: "Цены",
    pricefix_report: "Фиксации", pricefix_accept: "Проведение фиксации", payments_report: "Оплаты",
    dir_sales_report: "Продажи по менеджерам", ordersCount_report: "Количество заказов",
    cash_state_report: "Состояние ДС", finance_report: "Финансовый отчёт", writeoffs_report: "Списания",
    grossprofit_report: "Валовая прибыль", receipts_report: "Поступления", infoblock_report: "Снятые с блока",
    counterparty_control: "Контроль контрагента", counterparty_control_info: "Контроль (отчёт)",
    block_client: "Блокировка клиента", unblock_client: "Разблокировка клиента",
    approve_unblock: "Подтверждение разблокировки", reject_unblock: "Отклонение разблокировки",
    tasklist: "Список задач", app_contract: "Заявка на договор", test: "Проверка"
};

const TQ_STATUS = {
    new: { label: "Ждёт", cls: "wait" },
    processing: { label: "В работе", cls: "work" },
    done: { label: "Выполнена", cls: "done" },
    failed: { label: "Ошибка", cls: "fail" }
};

const TQ_ALERT_MS = 5 * 60 * 1000;     // 1С молчит дольше — тревога

let tqFilter = "";
let tqTimer = null;
let tqOpen = {};

registerScreen("task_queue", function () {
    window.currentScreen = "task_queue";
    window.screenBack = () => openAdminPanel();
    title.innerText = "Очередь задач 1С";
    tqOpen = {};

    const chip = (key, label) =>
        `<button type="button" class="period-btn${tqFilter === key ? " active" : ""}" onclick="tqSetFilter('${key}')">${label}</button>`;

    container.innerHTML = `
        <div class="tq-page">
            <div id="tqLink" class="tq-link"></div>
            <div id="tqCounts" class="tq-counts"></div>
            <div class="report-actions">
                <div class="period-buttons">${chip("", "Все")}${chip("new", "Ждут")}${chip("processing", "В работе")}${chip("failed", "Ошибки")}${chip("done", "Выполнены")}</div>
                ${refreshButton("tqLoad")}
            </div>
            <div id="tqList" class="tq-list"><div class="report-status">Загрузка…</div></div>
        </div>`;

    tqLoad();
    clearInterval(tqTimer);
    tqTimer = setInterval(() => {
        if (window.currentScreen !== "task_queue") { clearInterval(tqTimer); return; }
        if (document.visibilityState === "visible") tqLoad();
    }, 10000);
});

function tqSetFilter(key) {
    tqFilter = key;
    openScreen("task_queue");
}

function tqAgo(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + " с";
    const m = Math.round(s / 60);
    if (m < 60) return m + " мин";
    const h = Math.floor(m / 60);
    if (h < 48) return h + " ч " + (m % 60) + " мин";
    return Math.floor(h / 24) + " дн";
}

function tqDur(from, to) {
    if (!from || !to) return "";
    return tqAgo(new Date(to) - new Date(from));
}

function tqTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) + " " +
        d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

async function tqLoad() {
    let d;
    try {
        const res = await fetch("/api/admin/task-queue?limit=150" + (tqFilter ? "&status=" + tqFilter : ""), {
            headers: { "Authorization": "Bearer " + localStorage.getItem("jwt") }
        });
        d = await res.json();
        if (!res.ok || !d.success) throw new Error();
    } catch (e) {
        const list = document.getElementById("tqList");
        if (list) list.innerHTML = `<div class="report-status">Не удалось загрузить очередь</div>`;
        return;
    }
    if (window.currentScreen !== "task_queue") return;

    // связь с 1С
    const link = document.getElementById("tqLink");
    const now = new Date(d.now).getTime();
    if (d.last_poll_at) {
        const ago = now - new Date(d.last_poll_at).getTime();
        const bad = ago > TQ_ALERT_MS;
        link.className = "tq-link " + (bad ? "bad" : "ok");
        link.innerHTML = `<span class="tq-dot"></span>
            <span><b>1С ${bad ? "не обращалась" : "на связи"}</b> — последнее обращение ${escapeHtml(tqAgo(ago))} назад
            <small>${escapeHtml(tqTime(d.last_poll_at))}</small></span>`;
    } else {
        link.className = "tq-link bad";
        link.innerHTML = `<span class="tq-dot"></span>
            <span><b>1С не обращалась</b> с запуска сервера <small>${escapeHtml(tqTime(d.server_started_at))}</small></span>`;
    }

    // счётчики
    const c = d.counts || {};
    const tile = (n, label, cls) => `<div class="tq-count ${cls}"><b>${Number(n) || 0}</b><span>${label}</span></div>`;
    document.getElementById("tqCounts").innerHTML =
        tile(c.new, "ждут", "wait") + tile(c.processing, "в работе", "work") +
        tile(c.done_24h, "выполнено за сутки", "done") + tile(c.failed, "с ошибкой", "fail");

    // задачи
    const list = document.getElementById("tqList");
    if (!d.tasks.length) {
        list.innerHTML = `<div class="report-status">Задач нет</div>`;
        return;
    }
    list.innerHTML = d.tasks.map(t => {
        const st = TQ_STATUS[t.status] || { label: t.status, cls: "" };
        const stuck = t.status === "processing" && t.taken_at && now - new Date(t.taken_at).getTime() > 2 * 60 * 1000;
        const waitLong = t.status === "new" && now - new Date(t.created_at).getTime() > 2 * 60 * 1000;
        const timing = [
            t.taken_at ? "ждала " + tqDur(t.created_at, t.taken_at) : (t.status === "new" ? "ждёт " + tqAgo(now - new Date(t.created_at).getTime()) : ""),
            t.done_at && t.taken_at ? "выполнялась " + tqDur(t.taken_at, t.done_at) : "",
            t.status === "processing" && t.taken_at ? "в работе " + tqAgo(now - new Date(t.taken_at).getTime()) : ""
        ].filter(Boolean).join(" · ");
        const payload = Object.entries(t.payload || {}).map(([k, v]) =>
            `<div><span>${escapeHtml(k)}</span><b>${escapeHtml(typeof v === "object" ? JSON.stringify(v) : String(v))}</b></div>`).join("");
        const open = tqOpen[t.uuid];
        return `
            <div class="tq-item${stuck || waitLong ? " warn" : ""}${t.status === "failed" ? " failed" : ""}${open ? " open" : ""}" data-uuid="${escapeHtml(t.uuid)}">
                <button type="button" class="tq-item-head" onclick="tqToggle(${jsArg(t.uuid)})">
                    <span class="tq-item-main">
                        <span class="tq-item-type">${escapeHtml(TQ_TYPES[t.type] || t.type)}</span>
                        <span class="tq-item-sub">${escapeHtml(t.user_name || t.user_id || "—")} · ${escapeHtml(tqTime(t.created_at))}</span>
                        ${timing ? `<span class="tq-item-sub">${escapeHtml(timing)}${t.attempts > 1 ? " · попыток: " + Number(t.attempts) : ""}</span>` : ""}
                    </span>
                    <span class="tq-status ${st.cls}">${escapeHtml(st.label)}</span>
                </button>
                <div class="tq-item-body">
                    <div class="tq-kv">
                        <div><span>Тип</span><b>${escapeHtml(t.type)}</b></div>
                        <div><span>uuid</span><b>${escapeHtml(t.uuid)}</b></div>
                        ${payload || "<div><span>Параметры</span><b>нет</b></div>"}
                    </div>
                    <div class="tq-actions">
                        ${t.status !== "done" ? `<button type="button" class="btn-secondary" onclick="tqAction(${jsArg(t.uuid)}, 'requeue')">${iconSvg("M20 11a8 8 0 1 0-2.3 5.7 M20 4v7h-7", "btn-ico")}Вернуть в очередь</button>` : ""}
                        <button type="button" class="btn-secondary tq-del" onclick="tqAction(${jsArg(t.uuid)}, 'delete')">${iconSvg("M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14", "btn-ico")}Удалить</button>
                    </div>
                </div>
            </div>`;
    }).join("");
}

function tqToggle(uuid) {
    tqOpen[uuid] = !tqOpen[uuid];
    document.querySelectorAll(".tq-item").forEach(el => {
        if (el.dataset.uuid === uuid) el.classList.toggle("open", Boolean(tqOpen[uuid]));
    });
}

async function tqAction(uuid, action) {
    const question = action === "delete"
        ? "Удалить задачу из очереди? 1С её не выполнит."
        : "Вернуть задачу в очередь? 1С выполнит её заново.";
    if (!confirm(question)) return;
    try {
        const res = await fetch("/api/admin/task-queue/" + encodeURIComponent(uuid) + "/" + action, {
            method: "POST",
            headers: { "Authorization": "Bearer " + localStorage.getItem("jwt") }
        });
        if (!res.ok) throw new Error();
    } catch (e) {
        alert("Не получилось. Обновите экран и попробуйте ещё раз.");
    }
    tqLoad();
}
