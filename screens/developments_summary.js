(() => {
    "use strict";

    /*
     * Сводка по разработкам: что произошло с разработками менеджеров.
     * Доступна admin / director / rop.
     *   - период и менеджер;
     *   - счётчики-вкладки: клиент заведён, заявки, истекли, закрыты, дубли;
     *   - список разработок с датами и результатом.
     */

    const root = document.createElement("div");
    root.className = "dev-summary-page";

    root.innerHTML = `
        <style>
            .dev-summary-page { padding: 0 0 24px 0; box-sizing: border-box; }
            .dev-summary-page * { box-sizing: border-box; }

            /* Цвет текста и фон кнопок заданы явно, чтобы не зависеть
               от общих стилей приложения. */
            .dev-summary-page .ds-btn {
                background: #ffffff !important;
                color: #1b4d20 !important;
                border: 1px solid #9cc3a1 !important;
                border-radius: 999px;
                padding: 8px 14px;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
            }
            .dev-summary-page .ds-btn.is-on {
                background: #2e7d32 !important;
                color: #ffffff !important;
                border-color: #2e7d32 !important;
            }

            .dev-summary-page .ds-card {
                background: #ffffff;
                color: #1f2a1f;
                border-radius: 12px;
                box-shadow: 0 1px 4px rgba(0,0,0,.12);
                padding: 12px;
                margin-bottom: 10px;
            }

            .dev-summary-page .ds-row {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
            }

            .dev-summary-page select {
                width: 100%;
                font-size: 16px;
                padding: 10px;
                border-radius: 10px;
                border: 1px solid #9cc3a1;
                background: #ffffff;
                color: #1f2a1f;
                margin-top: 10px;
            }

            .dev-summary-page .ds-tabs {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 6px;
                margin-top: 10px;
            }
            .dev-summary-page .ds-tab {
                background: #f2f7f3 !important;
                color: #1f2a1f !important;
                border: 2px solid transparent !important;
                border-radius: 10px;
                padding: 8px 2px;
                text-align: center;
                cursor: pointer;
            }
            .dev-summary-page .ds-tab b {
                display: block;
                font-size: 20px;
                color: inherit;
            }
            .dev-summary-page .ds-tab span {
                font-size: 11px;
                color: inherit;
            }
            .dev-summary-page .ds-tab.is-on {
                background: #e1f1e3 !important;
                border-color: #2e7d32 !important;
            }

            .dev-summary-page .ds-meta {
                margin-top: 10px;
                font-size: 13px;
                color: #4a574a !important;
            }

            .dev-summary-page .ds-item-title {
                font-weight: 700;
                font-size: 16px;
                color: #1f2a1f !important;
            }
            .dev-summary-page .ds-badge {
                display: inline-block;
                padding: 3px 9px;
                border-radius: 999px;
                font-size: 12px;
                font-weight: 700;
                margin-left: 6px;
                vertical-align: middle;
            }
            .dev-summary-page .ds-line {
                font-size: 13px;
                color: #3b473b !important;
                margin-top: 4px;
            }
            .dev-summary-page .ds-empty {
                text-align: center;
                color: #4a574a;
                padding: 18px 8px;
            }
        </style>

        <div class="page">
            <div class="page-header">
                <button type="button" class="back-button" id="dsBack">← Назад</button>
            </div>

            <div class="ds-card">
                <div class="ds-row" id="dsPeriods"></div>
                <select id="dsManager"></select>

                <div class="ds-tabs" id="dsTabs"></div>
                <div class="ds-meta" id="dsMeta"></div>
            </div>

            <div id="dsList"></div>
        </div>
    `;

    const PERIODS = [
        [7, "7 дней"],
        [30, "30 дней"],
        [90, "90 дней"],
        [0, "Всё время"]
    ];

    const OUTCOMES = {
        converted: {
            label: "Клиент заведён",
            short: "заведён в 1С",
            color: "#0d47a1",
            background: "#bbdefb"
        },
        contract_request: {
            label: "Подана заявка на договор",
            short: "ждут карточку",
            color: "#7a4300",
            background: "#ffe0b2"
        },
        waiting_card: {
            label: "Ждёт карточку в 1С",
            short: "ждут карточку",
            color: "#7a4300",
            background: "#ffe0b2"
        },
        expired: {
            label: "Срок истёк",
            short: "истекли",
            color: "#7f1d1d",
            background: "#ffcdd2"
        },
        closed: {
            label: "Закрыта вручную",
            short: "закрыты",
            color: "#333333",
            background: "#e0e0e0"
        },
        duplicate_confirmed: {
            label: "Подтверждён дубль",
            short: "дубли",
            color: "#6a1b9a",
            background: "#e1bee7"
        },
        reactivated: {
            label: "Возобновлена",
            short: "возобновлены",
            color: "#1b5e20",
            background: "#c8e6c9"
        }
    };

    const TAB_ORDER = [
        ["converted", "converted"],
        ["contract_request", "waiting_requests"],
        ["expired", "expired"],
        ["closed", "closed"],
        ["duplicate_confirmed", "duplicates_confirmed"],
        ["all", null]
    ];

    const state = {
        days: 30,
        managerId: "",
        outcome: "converted",
        summary: null
    };

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function formatDate(value) {
        const d = new Date(value);
        if (!value || Number.isNaN(d.getTime())) return String(value || "");
        return d.toLocaleDateString("ru-RU");
    }

    async function api(url) {
        const token = localStorage.getItem("jwt");
        if (!token) throw new Error("Сессия пользователя отсутствует");

        const response = await fetch(url, {
            headers: { "Authorization": "Bearer " + token }
        });

        if (response.status === 401) {
            throw new Error("Сессия истекла. Войдите в систему заново.");
        }

        let data = null;
        try { data = await response.json(); } catch (_) { data = null; }

        if (!response.ok) {
            throw new Error(data?.message || data?.error || `Ошибка запроса: ${response.status}`);
        }
        return data;
    }

    function currentRow() {
        const s = state.summary;
        if (!s) return null;
        if (!state.managerId) return s.total || null;
        return (s.managers || []).find(m => String(m.manager_id) === String(state.managerId)) || null;
    }

    function renderControls() {

        root.querySelector("#dsPeriods").innerHTML = PERIODS.map(([days, label]) => `
            <button type="button" class="ds-btn${days === state.days ? " is-on" : ""}"
                    data-days="${days}">${escapeHtml(label)}</button>
        `).join("");

        const managers = state.summary?.managers || [];
        const select = root.querySelector("#dsManager");

        select.innerHTML =
            `<option value="">Все менеджеры</option>` +
            managers.map(m => `
                <option value="${escapeHtml(m.manager_id)}"
                    ${String(m.manager_id) === String(state.managerId) ? "selected" : ""}>
                    ${escapeHtml(m.manager_name)}
                </option>
            `).join("");

        const row = currentRow() || {};

        root.querySelector("#dsTabs").innerHTML = TAB_ORDER.map(([key, field]) => {
            const info = OUTCOMES[key];
            const count = field ? (row[field] ?? 0) : "";
            const label = key === "all" ? "Все события" : info.short;
            return `
                <div class="ds-tab${state.outcome === key ? " is-on" : ""}" data-outcome="${key}">
                    <b>${escapeHtml(count === "" ? "•••" : count)}</b>
                    <span>${escapeHtml(label)}</span>
                </div>
            `;
        }).join("");

        const pct = row.conversion_percent === null || row.conversion_percent === undefined
            ? "—" : row.conversion_percent + "%";
        const avg = row.avg_days_to_convert === null || row.avg_days_to_convert === undefined
            ? "—" : row.avg_days_to_convert + " дн.";

        root.querySelector("#dsMeta").innerHTML = `
            Создано: <b>${escapeHtml(row.created ?? 0)}</b> ·
            в работе сейчас: <b>${escapeHtml(row.active_now ?? 0)}</b> ·
            дошли до клиента: <b>${escapeHtml(pct)}</b> ·
            до заведения в среднем: <b>${escapeHtml(avg)}</b>
            ${row.overdue_requests ? `<br><span style="color:#b00000;font-weight:700;">
                ⚠️ Заявок без карточки в 1С (14+ дней): ${escapeHtml(row.overdue_requests)}</span>` : ""}
        `;

        root.querySelectorAll("[data-days]").forEach(button => {
            button.addEventListener("click", () => {
                state.days = Number(button.dataset.days);
                loadAll();
            });
        });

        root.querySelectorAll("[data-outcome]").forEach(tab => {
            tab.addEventListener("click", () => {
                state.outcome = tab.dataset.outcome;
                renderControls();
                loadList();
            });
        });
    }

    function renderItem(item) {

        const info = OUTCOMES[item.action] || {
            label: item.action, color: "#333", background: "#e0e0e0"
        };

        const lines = [];

        if (!state.managerId) {
            lines.push(`Менеджер: <b>${escapeHtml(item.manager_name)}</b>`);
        }

        if (item.address) {
            lines.push(escapeHtml(item.address));
        }

        const days = item.days_in_work === null || item.days_in_work === undefined
            ? "" : ` (${Math.round(item.days_in_work)} дн. с создания)`;

        if (item.action === "waiting_card") {
            const days = item.waiting_days === null || item.waiting_days === undefined
                ? "" : Math.floor(item.waiting_days);
            lines.push(
                `Создана ${escapeHtml(formatDate(item.development_created_at))}, ` +
                `заявка подана ${escapeHtml(formatDate(item.event_at))}`
            );
            lines.push(
                item.overdue
                    ? `<span style="color:#b00000;font-weight:700;">⚠️ Карточки в 1С нет уже ${escapeHtml(days)} дн.</span>`
                    : `Карточки в 1С пока нет${days !== "" ? ` (${escapeHtml(days)} дн.)` : ""}`
            );
        } else lines.push(
            `Создана ${escapeHtml(formatDate(item.development_created_at))} → ` +
            `${escapeHtml(info.label.toLowerCase())} ${escapeHtml(formatDate(item.event_at))}${escapeHtml(days)}`
        );

        if (item.action === "closed" && item.close_comment) {
            lines.push(`Причина: ${escapeHtml(item.close_comment)}`);
        }

        if (item.action === "converted" || item.counterparty_name) {
            if (item.counterparty_name) {
                lines.push(
                    `Карточка в 1С: <b>${escapeHtml(item.counterparty_name)}</b>` +
                    (item.last_shipment_date
                        ? ` · последняя отгрузка ${escapeHtml(formatDate(item.last_shipment_date))}`
                        : " · отгрузок пока не было")
                );
            }
        }

        if (item.action === "duplicate_confirmed" && item.matches.length) {
            lines.push(
                "Похоже на: " +
                item.matches.map(m =>
                    `${escapeHtml(m.name || "")}${m.address ? " (" + escapeHtml(m.address) + ")" : ""}`
                ).join("; ")
            );
        }

        return `
            <div class="ds-card">
                <div class="ds-item-title">
                    ${escapeHtml(item.name || "Без названия")}
                    <span class="ds-badge"
                          style="background:${info.background};color:${info.color};">
                        ${escapeHtml(info.label)}
                    </span>
                </div>
                ${lines.map(l => `<div class="ds-line">${l}</div>`).join("")}
            </div>
        `;
    }

    async function loadList() {

        const box = root.querySelector("#dsList");
        box.innerHTML = `<div class="ds-empty">Загрузка...</div>`;

        try {

            const query = new URLSearchParams({
                days: String(state.days),
                outcome: state.outcome
            });
            if (state.managerId) query.set("manager_id", state.managerId);

            const result = await api("/api/developments/outcomes?" + query.toString());
            const items = Array.isArray(result?.items) ? result.items : [];

            box.innerHTML = items.length
                ? items.map(renderItem).join("")
                : `<div class="ds-card ds-empty">За выбранный период ничего нет</div>`;

        } catch (error) {
            box.innerHTML = `<div class="ds-card ds-empty" style="color:#b00000;">
                ${escapeHtml(error.message || "Не удалось загрузить")}</div>`;
        }
    }

    async function loadAll() {

        try {
            state.summary = await api("/api/developments/summary?days=" + state.days);
        } catch (error) {
            root.querySelector("#dsList").innerHTML = `<div class="ds-card ds-empty" style="color:#b00000;">
                ${escapeHtml(error.message || "Сводка недоступна")}</div>`;
            return;
        }

        // выбранного менеджера может не быть в новом периоде
        if (
            state.managerId &&
            !(state.summary.managers || []).some(m => String(m.manager_id) === String(state.managerId))
        ) {
            state.managerId = "";
        }

        renderControls();
        loadList();
    }

    root.querySelector("#dsManager").addEventListener("change", event => {
        state.managerId = event.target.value;
        renderControls();
        loadList();
    });

    root.querySelector("#dsBack").addEventListener("click", () => {
        if (typeof window.openScreen === "function") {
            window.openScreen("developments_control");
        } else if (typeof openScreen === "function") {
            openScreen("developments_control");
        } else {
            history.back();
        }
    });

    registerScreen("developments_summary", function () {

        window.currentScreen = "developments_summary";

        title.innerText = "Сводка по разработкам";

        container.innerHTML = "";
        container.appendChild(root);

        loadAll();
    });

    return root;
})();
