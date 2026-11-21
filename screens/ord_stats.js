/*
 * Статистика по заказам (директор, админ; РОП — по своим менеджерам). Данные — GET /api/ord/stats.
 * Период по дню заказа (дата доставки). При открытии: до 19:00 — «Сегодня», после — «Завтра»
 * (после 17:00 заказы идут на завтра, ночью их собирают).
 */

window.ordSt = window.ordSt || { preset: "day", from: null, to: null, sort: { key: "total", dir: -1 }, data: null };

const OST_PHASE = {
    sent: { text: "Отправлен", cls: "wait", color: "#c9b458" },
    waiting: { text: "Ждёт проверки", cls: "warn", color: "#e0a030" },
    reviewing: { text: "На проверке", cls: "check", color: "#4a7fc1" },
    confirmed: { text: "Подтверждён", cls: "info", color: "#8a73c9" },
    created: { text: "Создан в 1С", cls: "ok", color: "#3f8f3a" },
    cancelled: { text: "Отменён", cls: "off", color: "#b5b5b5" },
    error: { text: "Ошибка", cls: "bad", color: "#c0392b" }
};

/* сегодня по часам устройства (YYYY-MM-DD) */
function ostToday() {
    const d = new Date();
    const p = n => (n < 10 ? "0" : "") + n;
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

function ostPeriod(preset) {
    const t = ostToday();
    const w = ORD.day.workDay();          // до 19:00 — сегодня, после — завтра: конец «7 / 30 дней»
    switch (preset) {
        case "yday": return { from: ORD.shiftDay(t, -1), to: ORD.shiftDay(t, -1) };
        case "tom": return { from: ORD.shiftDay(t, 1), to: ORD.shiftDay(t, 1) };
        case "week": return { from: ORD.shiftDay(w, -6), to: w };
        case "month": return { from: ORD.shiftDay(w, -29), to: w };
        case "custom": return { from: ordSt.from || w, to: ordSt.to || w };
        default: return { from: t, to: t };
    }
}

function ostMin(m) {
    if (m === null || m === undefined) return "—";
    if (m < 60) return m + " мин";
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (h < 24) return h + " ч" + (r ? " " + r + " мин" : "");
    const d = Math.floor(h / 24);
    return d + " д " + (h % 24) + " ч";
}

function ostPct(a, b) {
    return b ? Math.round(a * 100 / b) : 0;
}

registerScreen("ord_stats", function () {

    window.currentScreen = "ord_stats";
    title.innerText = "Статистика по заказам";

    /* открыли экран — до 19:00 «Сегодня», после — «Завтра» (свои даты — только пока экран открыт) */
    ordSt.preset = new Date().getHours() >= 19 ? "tom" : "today";
    const w = ORD.day.workDay();

    const presets = [
        ["yday", "Вчера"],
        ["today", "Сегодня"],
        ["tom", "Завтра"],
        ["week", "7 дней"],
        ["month", "30 дней"],
        ["custom", "Период"]
    ];

    container.innerHTML = `
        <div class="ord-page wide ost">
            <div class="ost-bar">
                <div class="ord-tabs" id="ostPresets">
                    ${presets.map(([k, t]) => `<button type="button" class="ord-tab ${k === ordSt.preset ? "active" : ""}" data-p="${k}">${t}</button>`).join("")}
                </div>
                <div class="ost-custom hidden" id="ostCustom">
                    <input type="date" class="ord-input" id="ostFrom" aria-label="С">
                    <span>—</span>
                    <input type="date" class="ord-input" id="ostTo" aria-label="По">
                </div>
                <div class="ost-period" id="ostPeriodText"></div>
            </div>
            <div id="ostBody"><div class="ord-empty">Загрузка…</div></div>
        </div>
    `;

    const custom = document.getElementById("ostCustom");
    container.querySelectorAll("#ostPresets .ord-tab").forEach(b => {
        b.onclick = () => {
            ordSt.preset = b.dataset.p;
            container.querySelectorAll("#ostPresets .ord-tab").forEach(x => x.classList.toggle("active", x === b));
            if (ordSt.preset === "custom") {
                const p = { from: ordSt.from || ORD.shiftDay(w, -6), to: ordSt.to || w };
                document.getElementById("ostFrom").value = p.from;
                document.getElementById("ostTo").value = p.to;
                ordSt.from = p.from; ordSt.to = p.to;
            }
            custom.classList.toggle("hidden", ordSt.preset !== "custom");
            ostLoad();
        };
    });
    ["ostFrom", "ostTo"].forEach(id => {
        document.getElementById(id).onchange = () => {
            ordSt.from = document.getElementById("ostFrom").value;
            ordSt.to = document.getElementById("ostTo").value;
            if (ordSt.from && ordSt.to && ordSt.to < ordSt.from) {
                const t = ordSt.from; ordSt.from = ordSt.to; ordSt.to = t;
                document.getElementById("ostFrom").value = ordSt.from;
                document.getElementById("ostTo").value = ordSt.to;
            }
            ostLoad();
        };
    });

    ostLoad();
    ORD.poll("ord_stats", () => ostLoad(true), 60000);
});

async function ostLoad(quiet) {
    const body = document.getElementById("ostBody");
    if (!body) return;
    const p = ostPeriod(ordSt.preset);
    const pt = document.getElementById("ostPeriodText");
    if (pt) pt.textContent = p.from === p.to ? "Доставка " + ORD.fmtDate(p.from) : ORD.fmtDate(p.from) + " — " + ORD.fmtDate(p.to);
    if (!quiet) ordSetHtml(body, `<div class="ord-empty">Загрузка…</div>`);

    try {
        const r = await ORD.api("GET", "/stats?from=" + p.from + "&to=" + p.to);
        ordSt.data = r;
        if (pt && r.scope) pt.textContent += " · ваши менеджеры: " + r.scope.team;     // РОП — только своя команда
        ordSetHtml(body, ostRender(r));
        ostBind(body, r);
    } catch (e) {
        if (!quiet) ordSetHtml(body, `<div class="ord-empty bad">${ORD.esc(e.message)}</div>`);
    }
}

function ostRender(r) {
    const t = r.totals;
    if (!t.total) {
        return `<div class="ord-card"><div class="ord-empty">За этот период заказов нет</div></div>`;
    }

    const phases = ["sent", "waiting", "reviewing", "confirmed", "created", "cancelled", "error"];
    const pipe = phases.filter(k => t[k]).map(k =>
        `<span class="ost-pipe-seg" style="width:${t[k] * 100 / t.total}%;background:${OST_PHASE[k].color}" title="${OST_PHASE[k].text}: ${t[k]}"></span>`
    ).join("");
    const legend = phases.filter(k => t[k]).map(k =>
        `<button type="button" class="ost-leg" data-phase="${k}"><i style="background:${OST_PHASE[k].color}"></i>${OST_PHASE[k].text} <b>${t[k]}</b></button>`
    ).join("");

    const tile = (label, value, sub, cls, phase) => `
        <button type="button" class="ost-tile ${cls || ""}" ${phase ? `data-phase="${phase}"` : "disabled"}>
            <span class="ost-tile-label">${label}</span>
            <span class="ost-tile-value">${value}</span>
            <span class="ost-tile-sub">${sub || "&nbsp;"}</span>
        </button>`;

    const workParts = [
        t.sent ? "отправлены " + t.sent : "",
        t.waiting ? "ждут " + t.waiting : "",
        t.reviewing ? "на проверке " + t.reviewing : "",
        t.confirmed ? "подтверждены " + t.confirmed : "",
        t.blocked ? "⛔ клиент заблокирован " + t.blocked : ""
    ].filter(Boolean).join(" · ");

    const times = r.times;
    const timeRow = (label, s, hint) => `
        <div class="ost-time">
            <div class="ost-time-label">${label}<small>${hint}</small></div>
            <div class="ost-time-value">${s ? ostMin(s.avg) : "—"}</div>
            <div class="ost-time-sub">${s ? "медиана " + ostMin(s.median) + " · заказов " + s.n : "нет данных"}</div>
        </div>`;

    const stale = r.stale.length ? `
        <div class="ord-card ost-alert">
            <div class="ord-card-title">⏰ Долго ждут оператора — больше ${r.stale_minutes} мин: ${r.stale.length}</div>
            <div class="ost-stale">
                ${r.stale.slice(0, 12).map(s => `
                    <div><b>${ORD.esc(s.counterparty_name)}</b> <span>${ORD.esc(s.author_name)}</span> <span class="ord-chip warn small">${ostMin(s.minutes)}</span></div>
                `).join("")}
                ${r.stale.length > 12 ? `<div class="ost-muted">и ещё ${r.stale.length - 12}</div>` : ""}
            </div>
        </div>` : "";

    const L = r.lines;
    const lines = L.total ? `
        <div class="ord-card">
            <div class="ord-card-title">Подбор товара <span class="ost-muted">${L.total} строк в ${L.orders} подтверждённых заказах</span></div>
            <div class="ost-pipe">
                <span class="ost-pipe-seg" style="width:${L.auto * 100 / L.total}%;background:var(--accent)"></span>
                <span class="ost-pipe-seg" style="width:${L.llm * 100 / L.total}%;background:#E0A040"></span>
                <span class="ost-pipe-seg" style="width:${L.manual * 100 / L.total}%;background:#5B7BE0"></span>
                <span class="ost-pipe-seg" style="width:${(L.manager || 0) * 100 / L.total}%;background:var(--brand)"></span>
            </div>
            <div class="ost-legend">
                <span class="ost-leg"><i style="background:var(--accent)"></i>Сами (синонимы, история) <b>${ostPct(L.auto, L.total)}%</b></span>
                <span class="ost-leg"><i style="background:#E0A040"></i>Нейросеть <b>${ostPct(L.llm, L.total)}%</b></span>
                <span class="ost-leg"><i style="background:#5B7BE0"></i>Оператор вручную <b>${ostPct(L.manual, L.total)}%</b></span>
                <span class="ost-leg"><i style="background:var(--brand)"></i>Менеджер <b>${ostPct(L.manager || 0, L.total)}%</b></span>
            </div>
        </div>` : "";

    const days = r.days.length > 1 ? ostDays(r.days) : "";

    return `
        <div class="ost-tiles">
            ${tile("Отправлено", t.total, t.cancelled ? "из них отменено " + t.cancelled : "заказов", "", "all")}
            ${tile("В работе", t.in_work, workParts || "всё обработано", t.in_work ? "warn" : "", "in_work")}
            ${tile("Создано в 1С", t.created, ostPct(t.created, t.total) + "% от отправленных", "ok", "created")}
            ${tile("Отменено / ошибки", t.cancelled + t.error, t.error ? "ошибок разбора " + t.error : "&nbsp;", "", "cancelled,error")}
        </div>

        ${stale}

        <div class="ord-card">
            <div class="ord-card-title">Где сейчас заказы</div>
            <div class="ost-pipe big">${pipe}</div>
            <div class="ost-legend">${legend}</div>
            ${r.reviewing.length ? `<div class="ost-now">Сейчас на проверке: ${r.reviewing.map(x => `<span class="ord-chip check small">${ORD.esc(x.name)} · ${x.n}</span>`).join(" ")}</div>` : ""}
        </div>

        <div class="ord-card">
            <div class="ord-card-title">Время</div>
            <div class="ost-times">
                ${timeRow("Ждал оператора", times.to_review, "от отправки до открытия")}
                ${timeRow("Проверка", times.review_to_confirm, "от открытия до подтверждения")}
                ${timeRow("До документа в 1С", times.to_doc, "от отправки до записи")}
            </div>
        </div>

        ${days}

        <div class="ord-card">
            <div class="ord-card-title">По менеджерам <span class="ost-muted">нажмите на строку — заказы менеджера</span></div>
            <div class="ost-table-wrap">${ostManagers(r.managers)}</div>
        </div>

        <div class="ord-card">
            <div class="ord-card-title">По операторам <span class="ost-muted">кто подтвердил заказ</span></div>
            ${r.operators.length ? `<div class="ost-table-wrap"><table class="ost-table">
                <thead><tr><th>Оператор</th><th>Подтвердил</th><th>Создано в 1С</th><th>Позиций</th><th>Проверка, в среднем</th></tr></thead>
                <tbody>${r.operators.map(o => `
                    <tr><td>${ORD.esc(o.name)}</td><td>${o.confirmed}</td><td>${o.created}</td><td>${o.lines}</td>
                    <td>${o.review_to_confirm ? ostMin(o.review_to_confirm.avg) : "—"}</td></tr>`).join("")}
                </tbody></table></div>` : `<div class="ost-muted">Пока никто не подтверждал заказы за этот период</div>`}
        </div>

        ${lines}

        <div class="ost-muted ost-foot">Обновлено ${ORD.esc(ORD.fmtTime(r.generated_at))} · обновляется раз в минуту</div>
    `;
}

function ostDays(days) {
    const max = Math.max(1, ...days.map(d => d.total));
    return `
        <div class="ord-card">
            <div class="ord-card-title">По дням <span class="ost-legend inline"><span class="ost-leg"><i style="background:rgba(255,255,255,0.10)"></i>отправлено</span><span class="ost-leg"><i style="background:var(--accent)"></i>создано в 1С</span></span></div>
            <div class="ost-days">
                ${days.map(d => `
                    <div class="ost-day" title="${ORD.fmtDate(d.day)}: отправлено ${d.total}, создано ${d.created}">
                        <div class="ost-day-n">${d.total || ""}</div>
                        <div class="ost-day-bar">
                            <span class="ost-day-all" style="height:${d.total * 100 / max}%"></span>
                            <span class="ost-day-ok" style="height:${d.created * 100 / max}%"></span>
                        </div>
                        <div class="ost-day-d">${ORD.fmtDate(d.day).slice(0, 5)}</div>
                    </div>`).join("")}
            </div>
        </div>`;
}

function ostManagers(list) {
    const s = ordSt.sort;
    const val = (m, k) => k === "to_doc" ? (m.to_doc ? m.to_doc.avg : -1) : k === "name" ? m.name : m[k];
    const rows = list.slice().sort((a, b) => {
        const x = val(a, s.key), y = val(b, s.key);
        if (typeof x === "string") return s.dir * x.localeCompare(y, "ru");
        return s.dir * (x - y);
    });
    const th = (k, t) => `<th data-sort="${k}" class="${s.key === k ? "sorted" : ""}">${t}${s.key === k ? (s.dir < 0 ? " ↓" : " ↑") : ""}</th>`;
    return `<table class="ost-table click">
        <thead><tr>
            ${th("name", "Менеджер")}${th("total", "Отправлено")}${th("in_work", "В работе")}${th("created", "Создано в 1С")}
            ${th("cancelled", "Отменено")}${th("lines", "Позиций")}${th("to_doc", "До 1С, в среднем")}
        </tr></thead>
        <tbody>${rows.map(m => `
            <tr data-author="${ORD.esc(m.author_id)}" data-name="${ORD.esc(m.name)}">
                <td><b>${ORD.esc(m.name)}</b>
                    <div class="ost-mini"><span style="width:${ostPct(m.created, m.total)}%"></span></div></td>
                <td>${m.total}</td>
                <td>${m.in_work ? `<span class="ord-chip warn small">${m.in_work}</span>` : "0"}</td>
                <td>${m.created} <span class="ost-muted">${ostPct(m.created, m.total)}%</span></td>
                <td>${m.cancelled || 0}</td>
                <td>${m.lines}</td>
                <td>${m.to_doc ? ostMin(m.to_doc.avg) : "—"}</td>
            </tr>`).join("")}
        </tbody></table>`;
}

function ostBind(body, r) {
    body.querySelectorAll(".ost-table th[data-sort]").forEach(th => {
        th.onclick = () => {
            const k = th.dataset.sort;
            ordSt.sort = { key: k, dir: ordSt.sort.key === k ? -ordSt.sort.dir : (k === "name" ? 1 : -1) };
            const wrap = th.closest(".ost-table-wrap");
            wrap.innerHTML = ostManagers(r.managers);
            ostBind(body, r);
        };
    });
    body.querySelectorAll(".ost-table.click tbody tr").forEach(tr => {
        tr.onclick = () => ostOrders({ author: tr.dataset.author }, tr.dataset.name);
    });
    body.querySelectorAll("[data-phase]").forEach(el => {
        el.onclick = () => {
            const ph = el.dataset.phase;
            const names = { all: "Все заказы", in_work: "В работе", created: "Создано в 1С", "cancelled,error": "Отменено и ошибки" };
            ostOrders(ph === "all" ? {} : { phase: ph }, names[ph] || (OST_PHASE[ph] || {}).text || "");
        };
    });
}

/* Заказы за период (менеджер или этап) — окном, только просмотр */
async function ostOrders(filter, caption) {
    const p = ostPeriod(ordSt.preset);
    const q = "/stats/orders?from=" + p.from + "&to=" + p.to +
        (filter.author ? "&author=" + encodeURIComponent(filter.author) : "") +
        (filter.phase ? "&phase=" + encodeURIComponent(filter.phase) : "");
    const m = ORD.modal(`
        <div class="ord-modal-head"><b>${ORD.esc(caption)}</b><button class="ord-x" type="button" aria-label="Закрыть">✕</button></div>
        <div class="ost-orders"><div class="ord-empty">Загрузка…</div></div>
    `);
    m.el.querySelector(".ord-x").onclick = () => m.close();
    m.el.parentNode.addEventListener("click", e => { if (e.target === m.el.parentNode) m.close(); });
    const box = m.el.querySelector(".ost-orders");
    try {
        const r = await ORD.api("GET", q);
        box.innerHTML = r.orders.length ? r.orders.map(o => {
            const ph = OST_PHASE[o.phase] || { text: o.phase, cls: "off" };
            const who = o.block_reason ? " · ⛔ клиент заблокирован" : o.phase === "reviewing" && o.review_name ? " · " + o.review_name
                : o.phase === "created" && o.doc_number ? " · № " + o.doc_number : "";
            return `<div class="ost-order">
                <div class="ost-order-top"><b>${ORD.esc(o.counterparty_name)}</b><span class="ord-chip ${ph.cls} small">${ORD.esc(ph.text + who)}</span></div>
                <div class="ost-muted">${filter.author ? "" : ORD.esc(o.author_name) + " · "}отправлен ${ORD.esc(ORD.fmtDate(o.created_at))} ${ORD.esc(ORD.fmtTime(o.created_at))}${o.lines_total ? " · " + o.lines_total + " поз." : ""}${o.confirmed_name ? " · подтвердил " + ORD.esc(o.confirmed_name) : ""}</div>
            </div>`;
        }).join("") : `<div class="ord-empty">Заказов нет</div>`;
    } catch (e) {
        box.innerHTML = `<div class="ord-empty bad">${ORD.esc(e.message)}</div>`;
    }
}
