(() => {
    "use strict";

    const root = document.createElement("div");
    root.className = "developments-control-page";

    root.innerHTML = `

        <style>
            /* =====================================================
               РАЗРАБОТКИ — оформление экрана.
               Ширину/архитектуру не меняем.
               ===================================================== */

            .developments-control-page {
                display: block !important;
                width: 100% !important;
                max-width: 100% !important;
                min-width: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                box-sizing: border-box !important;
            }

            .developments-control-page > .page {
                display: block !important;
                width: 100% !important;
                max-width: 100% !important;
                min-width: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                box-sizing: border-box !important;
            }

            .developments-control-page .page-header {
                width: 100%;
                box-sizing: border-box;
                margin-bottom: 8px !important;
            }

            .developments-control-page .menu-list {
                display: block !important;
                width: 100% !important;
                max-width: 100% !important;
                min-width: 0 !important;
                box-sizing: border-box !important;
            }

            /* ---------- МЕНЕДЖЕР ---------- */

            .developments-control-page .development-manager-block {
                display: block !important;
                width: 100% !important;
                max-width: 100% !important;
                min-width: 0 !important;
                margin: 0 0 18px 0 !important;
                box-sizing: border-box !important;
            }

            .developments-control-page .development-manager-header {
                display: flex !important;
                width: 100% !important;
                max-width: 100% !important;
                min-width: 0 !important;
                min-height: 70px;
                padding: 13px 16px !important;
                box-sizing: border-box !important;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                text-align: left;
                border-radius: 12px !important;
                cursor: pointer;
            }

            .developments-control-page .development-manager-main {
                flex: 1 1 auto;
                min-width: 0;
            }

            .developments-control-page .development-manager-name {
                font-size: 18px;
                line-height: 1.25;
                font-weight: 700;
            }

            .developments-control-page .development-manager-meta {
                margin-top: 4px;
                font-size: 14px;
                line-height: 1.25;
            }

            .developments-control-page .development-manager-content {
                display: block;
                width: 100%;
                box-sizing: border-box;
                padding-top: 8px;
            }

            /* ---------- ГРУППЫ СТАТУСОВ ---------- */

            .developments-control-page .development-status-group {
                display: block !important;
                width: 100% !important;
                max-width: 100% !important;
                min-width: 0 !important;
                margin: 0 0 10px 0 !important;
                box-sizing: border-box !important;
            }

            .developments-control-page .development-status-group-header {
                display: flex !important;
                width: 100% !important;
                max-width: 100% !important;
                min-width: 0 !important;
                min-height: 54px;
                padding: 11px 16px !important;
                box-sizing: border-box !important;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                text-align: left;
                border-radius: 12px !important;
                cursor: pointer;
                font-size: 15px;
                font-weight: 700;
            }

            .developments-control-page .development-status-group-title {
                flex: 1 1 auto;
                min-width: 0;
            }

            .developments-control-page .development-status-group-content {
                display: block;
                width: 100%;
                box-sizing: border-box;
                padding-top: 7px;
            }

            /* ---------- КАРТОЧКА РАЗРАБОТКИ ---------- */

            .developments-control-page .development-control-card {
                position: relative;
                display: block !important;
                width: 100% !important;
                max-width: 100% !important;
                min-width: 0 !important;
                margin: 0 0 8px 0 !important;
                padding: 14px 16px !important;
                box-sizing: border-box !important;
                border-radius: 12px !important;
                overflow-wrap: anywhere;
                background: rgba(255, 255, 255, 0.78);
                border: 1px solid rgba(0, 0, 0, 0.10);
            }

            .developments-control-page .development-control-title {
                display: block;
                width: 100%;
                margin: 0 0 8px 0;
                box-sizing: border-box;
                font-size: 18px;
                line-height: 1.25;
                font-weight: 700;
            }

            .developments-control-page .development-control-row {
                display: flex;
                width: 100%;
                min-width: 0;
                margin: 3px 0;
                box-sizing: border-box;
                gap: 5px;
                line-height: 1.35;
            }

            .developments-control-page .development-control-row strong {
                min-width: 0;
                overflow-wrap: anywhere;
            }

            .developments-control-page .development-control-details {
                width: 100%;
                box-sizing: border-box;
                line-height: 1.4;
            }

            .developments-control-page .development-control-actions {
                display: flex;
                flex-wrap: wrap;
                gap: 8px;
                width: 100%;
                margin-top: 10px;
                box-sizing: border-box;
            }

            .developments-control-page .development-control-actions button {
                max-width: 100%;
                box-sizing: border-box;
            }

            .developments-control-page .development-extend-button {
                max-width: 100%;
                box-sizing: border-box;
            }

            /* ---------- ПУСТЫЕ ГРУППЫ ---------- */

            .developments-control-page .development-empty {
                width: 100%;
                margin: 0;
                padding: 10px 14px;
                box-sizing: border-box;
                border-radius: 10px;
                opacity: 0.75;
            }

            /* ---------- МОБИЛЬНЫЙ ---------- */


            /* ---------- СЕМАНТИЧЕСКИЕ ЦВЕТА ---------- */

            /* Менеджер — отдельный нейтрально-синий блок */
            .developments-control-page .development-manager-header {
                background: #5B7BE0 !important;
                color: #fff !important;
            }

            .developments-control-page .development-manager-header * {
                color: inherit !important;
            }

            /* В работе — зелёный */
            .developments-control-page .development-status-group.status-active .development-status-group-header,
            .developments-control-page .development-status-group.active .development-status-group-header {
                background: var(--accent) !important;
                color: var(--accent-ink) !important;
            }

            /* Заявка на договор — оранжевый */
            .developments-control-page .development-status-group-contract .development-status-group-header {
                background: #E0A040 !important;
                color: #fff !important;
            }

            /* Закрытые / истекшие — серый */
            .developments-control-page .development-status-group-archive .development-status-group-header {
                background: rgba(255,255,255,0.16) !important;
                color: #fff !important;
            }

            .developments-control-page .development-status-group-header * {
                color: inherit !important;
            }

            /* Сами карточки — светлый нейтральный фон */
            .developments-control-page .development-control-card {
                background: var(--card) !important;
                color: var(--text) !important;
                border: 1px solid var(--card-border) !important;
            }

            .developments-control-page .development-control-card strong,
            .developments-control-page .development-control-card span,
            .developments-control-page .development-control-card div {
                color: inherit;
            }

            /* Неактивные/архивные карточки немного приглушаем */
            .developments-control-page .development-status-group-archive .development-control-card {
                background: var(--card) !important;
                color: var(--text) !important;
            }


            @media (max-width: 600px) {
                .developments-control-page,
                .developments-control-page > .page,
                .developments-control-page .menu-list,
                .developments-control-page .development-manager-block,
                .developments-control-page .development-status-group,
                .developments-control-page .development-control-card {
                    width: 100% !important;
                    max-width: 100% !important;
                }

                .developments-control-page .development-manager-header {
                    min-height: 68px;
                    padding: 12px 14px !important;
                }

                .developments-control-page .development-manager-name {
                    font-size: 18px;
                }

                .developments-control-page .development-manager-meta {
                    font-size: 13px;
                }

                .developments-control-page .development-status-group-header {
                    min-height: 52px;
                    padding: 10px 14px !important;
                }

                .developments-control-page .development-control-card {
                    padding: 13px 14px !important;
                }

                .developments-control-page .development-control-title {
                    font-size: 17px;
                }
            }

        </style>
        <div class="page">

            <div class="page-header">
                <button
                    type="button"
                    class="back-button"
                    id="developmentsControlBack"
                >
                    ← Назад
                </button>

                <button
                    type="button"
                    id="developmentsSummaryOpen"
                    style="
                        margin-left:8px;
                        background:var(--card) !important;
                        color:var(--accent) !important;
                        border:1px solid var(--accent-line) !important;
                        border-radius:8px;
                        padding:8px 12px;
                        font-weight:600;
                    "
                >
                    📊 Сводка
                </button>

            </div>

            <div
                id="developmentsControlMessage"
                class="menu-item"
                style="display:none;"
            ></div>

            <div
                id="developmentsControlManagers"
                class="menu-list"
            >
                <div class="menu-item">
                    Загрузка…
                </div>
            </div>

        </div>
    `;

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function getToken() {
        const token = localStorage.getItem("jwt");

        if (!token) {
            throw new Error("Сессия пользователя отсутствует");
        }

        return token;
    }

    async function api(url, options = {}) {
        const token = getToken();

        const headers = {
            "Authorization": "Bearer " + token
        };

        if (options.body !== undefined) {
            headers["Content-Type"] = "application/json";
        }

        const response = await fetch(url, {
            ...options,
            headers
        });

        if (response.status === 401) {
            throw new Error(
                "Сессия истекла. Войдите в систему заново."
            );
        }

        let data = null;

        try {
            data = await response.json();
        } catch (_) {
            data = null;
        }

        if (!response.ok) {
            throw new Error(
                data?.error ||
                data?.message ||
                `Ошибка запроса: ${response.status}`
            );
        }

        return data;
    }

    function showMessage(message) {
        const element = root.querySelector(
            "#developmentsControlMessage"
        );

        if (!element) {
            return;
        }

        if (!message) {
            element.style.display = "none";
            element.textContent = "";
            return;
        }

        element.style.display = "block";
        element.textContent = message;
    }

    function formatDate(value) {
        if (!value) {
            return "";
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return String(value);
        }

        return date.toLocaleDateString("ru-RU");
    }

    function formatDateTime(value) {
        if (!value) {
            return "";
        }

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) {
            return String(value);
        }

        return date.toLocaleString("ru-RU");
    }

    function getStatusText(status) {
        switch (status) {
            case "active":
                return "В работе";

            case "contract_request":
                return "Заявка на договор";

            case "closed":
                return "Закрыта";

            case "expired":
                return "Истекла";

            case "converted":
                return "Клиент заведён";

            default:
                return status || "Неизвестно";
        }
    }

    function getStatusClass(status) {
        switch (status) {
            case "active":
                return "development-status-active";

            case "contract_request":
                return "development-status-contract";

            case "closed":
                return "development-status-closed";

            case "expired":
                return "development-status-expired";

            case "converted":
                return "development-status-closed";

            default:
                return "";
        }
    }

    function daysLeft(expiresAt) {
        if (!expiresAt) {
            return null;
        }

        const expires = new Date(expiresAt);

        if (Number.isNaN(expires.getTime())) {
            return null;
        }

        const now = new Date();

        const diff =
            expires.getTime() -
            now.getTime();

        return Math.max(
            0,
            Math.ceil(diff / 86400000)
        );
    }

   function renderDevelopment(development) {

    const status = development.status;

    const left = daysLeft(
        development.expires_at
    );

    const user =
        JSON.parse(
            localStorage.getItem("user") || "{}"
        );

    const canExtend =
    user.role === "admin" ||
    user.role === "director" ||
    user.role === "rop";

    let html = `
        <div
            class="development-control-card"
            data-development-id="${escapeHtml(development.id)}"
        >

            <!-- ================= КРАТКАЯ ЧАСТЬ ================= -->

            <div class="development-control-title">
                ${escapeHtml(
                    development.display_name ||
                    "Без названия"
                )}
            </div>
    `;

    if (development.legal_name) {
        html += `
            <div class="development-control-row">
                <span>Юр. лицо:</span>
                <strong>
                    ${escapeHtml(
                        development.legal_name
                    )}
                </strong>
            </div>
        `;
    }

    if (development.inn) {
        html += `
            <div class="development-control-row">
                <span>ИНН:</span>
                <strong>
                    ${escapeHtml(
                        development.inn
                    )}
                </strong>
            </div>
        `;
    }

    if (development.address) {
        html += `
            <div class="development-control-row">
                <span>Адрес:</span>
                <strong>
                    ${escapeHtml(
                        development.address
                    )}
                </strong>
            </div>
        `;
    }

    html += `
        <div class="development-control-row">
            <span>Создана:</span>
            <strong>
                ${formatDate(
                    development.created_at
                )}
            </strong>
        </div>

        <div class="development-control-row">
            <span>Срок до:</span>
            <strong>
                ${formatDate(
                    development.expires_at
                )}
            </strong>
        </div>

        <div class="development-control-status">

            <span
                class="development-status ${getStatusClass(status)}"
            >
                ${escapeHtml(
                    getStatusText(status)
                )}
            </span>
    `;

    if (
        status === "active" &&
        left !== null
    ) {
        html += `
            <span class="development-days-left">
                Осталось дней: ${left}
            </span>
        `;
    }

    html += `
        </div>

        <!-- ================= ПОЛНАЯ КАРТОЧКА ================= -->

        <div
            class="development-control-details"
            style="display:none;"
        >

            <div class="development-control-extra">

                <div>
                    <span>ID разработки:</span>
                    <strong>
                        ${escapeHtml(
                            development.id
                        )}
                    </strong>
                </div>

                <div>
                    <span>Менеджер ID:</span>
                    <strong>
                        ${escapeHtml(
                            development.manager_user_id
                        )}
                    </strong>
                </div>
    `;

    if (development.counterparty_guid) {
        html += `
            <div>
                <span>Карточка в 1С:</span>
                <strong>
                    ${escapeHtml(
                        development.counterparty_name ||
                        development.counterparty_guid
                    )}
                </strong>
            </div>
        `;

        if (development.counterparty_last_shipment_date) {
            html += `
            <div>
                <span>Последняя отгрузка:</span>
                <strong>
                    ${escapeHtml(
                        formatDateTime(
                            development.counterparty_last_shipment_date
                        )
                    )}
                </strong>
            </div>
            `;
        } else if (development.status === "converted") {
            html += `
            <div>
                <span>Отгрузок пока не было</span>
            </div>
            `;
        }
    }

    if (development.display_name) {
        html += `
            <div>
                <span>Наименование:</span>
                <strong>
                    ${escapeHtml(
                        development.display_name
                    )}
                </strong>
            </div>
        `;
    }

    if (development.legal_name) {
        html += `
            <div>
                <span>Юр. лицо:</span>
                <strong>
                    ${escapeHtml(
                        development.legal_name
                    )}
                </strong>
            </div>
        `;
    }

    if (development.inn) {
        html += `
            <div>
                <span>ИНН:</span>
                <strong>
                    ${escapeHtml(
                        development.inn
                    )}
                </strong>
            </div>
        `;
    }

    if (development.address) {
        html += `
            <div>
                <span>Адрес:</span>
                <strong>
                    ${escapeHtml(
                        development.address
                    )}
                </strong>
            </div>
        `;
    }

    if (development.phone) {
        html += `
            <div>
                <span>Телефон:</span>
                <strong>
                    ${escapeHtml(
                        development.phone
                    )}
                </strong>
            </div>
        `;
    }

    if (development.email) {
        html += `
            <div>
                <span>Email:</span>
                <strong>
                    ${escapeHtml(
                        development.email
                    )}
                </strong>
            </div>
        `;
    }

    if (development.website) {
        html += `
            <div>
                <span>Сайт:</span>
                <strong>
                    ${escapeHtml(
                        development.website
                    )}
                </strong>
            </div>
        `;
    }

    if (development.contact_person) {
        html += `
            <div>
                <span>Контактное лицо:</span>
                <strong>
                    ${escapeHtml(
                        development.contact_person
                    )}
                </strong>
            </div>
        `;
    }

    html += `
                <div>
                    <span>Создана:</span>
                    <strong>
                        ${formatDateTime(
                            development.created_at
                        )}
                    </strong>
                </div>

                <div>
                    <span>Срок до:</span>
                    <strong>
                        ${formatDateTime(
                            development.expires_at
                        )}
                    </strong>
                </div>
    `;

    if (development.contract_request_at) {
        const overdueDays = Math.floor(
            (Date.now() - new Date(development.contract_request_at).getTime()) /
            86400000
        );
        const overdue =
            development.status === "contract_request" &&
            overdueDays >= 14;

        html += `
                <div>
                    <span>Заявка на договор:</span>
                    <strong>
                        ${formatDateTime(
                            development.contract_request_at
                        )}
                    </strong>
                </div>
        `;

        if (overdue) {
            html += `
                <div style="color:#FF8FB3;font-weight:700;">
                    ⚠️ Заявка без карточки в 1С уже ${overdueDays} дн.
                </div>
            `;
        }
    }

    if (development.closed_at) {
        html += `
                <div>
                    <span>Закрыта:</span>
                    <strong>
                        ${formatDateTime(
                            development.closed_at
                        )}
                    </strong>
                </div>
        `;
    }

    if (development.comment) {
        html += `
                <div class="development-control-comment">
                    <span>Комментарий:</span>
                    <strong>
                        ${escapeHtml(
                            development.comment
                        )}
                    </strong>
                </div>
        `;
    }

    /*
     * Продление только для admin/director
     */
    if (
        canExtend &&
        (status === "active" || status === "expired")
    ) {
        html += `
                <div class="development-control-actions">

                    <button
                        type="button"
                        class="development-extend-button"
                        data-extend-id="${escapeHtml(
                            development.id
                        )}"
                    >
                        ${status === "expired" ? "Продлить и вернуть в работу" : "Продлить разработку"}
                    </button>

                </div>
        `;
    }

    const btnStyle =
        "background:#1565c0 !important;color:#ffffff !important;" +
        "border:0;border-radius:8px;padding:10px 14px;" +
        "font-size:14px;font-weight:600;margin-right:8px;";

    if (canExtend && (status === "contract_request" || status === "active")) {
        html += `
                <div class="development-control-actions">
                    <button
                        type="button"
                        class="development-link-button"
                        style="${btnStyle}"
                        data-link-id="${escapeHtml(development.id)}"
                        data-link-name="${escapeHtml(development.display_name || "")}"
                    >
                        🔗 Привязать карточку 1С
                    </button>
                </div>
        `;
    }

    if (
        (status === "closed" || status === "expired") &&
        development.repeat_blocked_until
    ) {
        html += `
                <div style="color:#FFC680 !important;font-weight:700;margin-top:6px;">
                    ⛔ Менеджер не может взять её снова до
                    ${escapeHtml(formatDate(development.repeat_blocked_until))}
                </div>
        `;

        if (canExtend) {
            html += `
                <div class="development-control-actions">
                    <button
                        type="button"
                        class="development-allow-repeat-button"
                        style="background:#E0A040 !important;color:#ffffff !important;border:0;border-radius:8px;padding:10px 14px;font-size:14px;font-weight:600;"
                        data-allow-repeat-id="${escapeHtml(development.id)}"
                    >
                        Разрешить повтор
                    </button>
                </div>
            `;
        }
    }

    if (
        canExtend &&
        status === "converted" &&
        development.counterparty_guid
    ) {
        html += `
                <div class="development-control-actions">
                    <button
                        type="button"
                        class="development-unlink-button"
                        style="background:var(--danger) !important;color:#ffffff !important;border:0;border-radius:8px;padding:10px 14px;font-size:14px;font-weight:600;"
                        data-unlink-id="${escapeHtml(development.id)}"
                    >
                        Отвязать карточку
                    </button>
                </div>
        `;
    }

    html += `
            </div>
        </div>

    </div>
    `;

    return html;
}

   function renderManager(manager, index) {

    const developments =
        Array.isArray(manager.developments)
            ? manager.developments
            : [];

    const managerId =
        manager.id ??
        manager.user_id ??
        manager.manager_user_id ??
        index;

    const managerName =
        manager.name ||
        manager.manager_name ||
        "Менеджер";

    const active =
        developments.filter(
            item => item.status === "active"
        );

    const contract =
        developments.filter(
            item => item.status === "contract_request"
        );

    const archive =
        developments.filter(
            item =>
                item.status === "closed" ||
                item.status === "expired" ||
                item.status === "converted"
        );

    const managerCount =
        developments.length;

    function renderGroup(
        id,
        title,
        items,
        opened
    ) {

        return `
            <div class="development-status-group development-status-group-${id}">

                <button
                    type="button"
                    class="development-status-group-header"
                    data-group="${id}"
                >

                    <div class="development-status-group-title">
                        ${title}
                    </div>

                    <div class="development-status-group-count">
                        ${items.length}
                    </div>

                    <div
                        class="development-status-group-arrow"
                    ></div>

                </button>

                <div
                    class="development-status-group-content"
                    data-group-content="${id}"
                    style="display:${opened ? "block" : "none"};"
                >
                    ${
                        items.length
                            ? items
                                .map(renderDevelopment)
                                .join("")
                            : `
                                <div class="development-empty">
                                    Нет разработок
                                </div>
                            `
                    }
                </div>

            </div>
        `;
    }

    return `
        <div
            class="development-manager-block"
            data-manager-id="${escapeHtml(managerId)}"
        >

            <button
                type="button"
                class="development-manager-header"
            >

                <div class="development-manager-main">

                    <div class="development-manager-name">
                        ${escapeHtml(managerName)}
                    </div>

                    <div class="development-manager-meta">
                        Разработок: ${managerCount}
                        ${
                            active.length
                                ? ` · В работе: ${active.length}`
                                : ""
                        }
                    </div>

                </div>

                <div class="development-manager-arrow"></div>

            </button>


            <div
                class="development-manager-content"
                style="display:none;"
            >

                ${renderGroup(
                    "active",
                    "В РАБОТЕ",
                    active,
                    true
                )}

                ${renderGroup(
                    "contract",
                    "ЗАЯВКИ НА ДОГОВОР",
                    contract,
                    false
                )}

                ${renderGroup(
                    "archive",
                    "ЗАКРЫТЫЕ И ИСТЕКШИЕ",
                    archive,
                    false
                )}

            </div>

        </div>
    `;
}

function bindManagerEvents() {

    /* =========================================================
       1. РАСКРЫТИЕ / СВОРАЧИВАНИЕ МЕНЕДЖЕРА
       ========================================================= */

    root
        .querySelectorAll(
            ".development-manager-header"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                event => {

                    event.stopPropagation();

                    const block =
                        button.closest(
                            ".development-manager-block"
                        );

                    if (!block) {
                        return;
                    }

                    const content =
                        block.querySelector(
                            ".development-manager-content"
                        );

                    if (!content) {
                        return;
                    }

                    const opened =
                        content.style.display !== "none";

                    content.style.display =
                        opened
                            ? "none"
                            : "block";

                    /*
                     * Стрелку рисует CSS.
                     * Никаких символов › / ⌄ здесь не используем.
                     */
                    button.classList.toggle(
                        "opened",
                        !opened
                    );
                }
            );
        });


    /* =========================================================
       2. РАСКРЫТИЕ / СВОРАЧИВАНИЕ ГРУПП

       В работе
       Заявки на договор
       Закрытые и истекшие

       ВАЖНО:
       Группа ищется внутри конкретного менеджера,
       а не во всём root.
       ========================================================= */

    root
        .querySelectorAll(
            ".development-status-group-header"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                event => {

                    event.stopPropagation();

                    const group =
                        button.dataset.group;

                    if (!group) {
                        return;
                    }

                    /*
                     * Находим именно блок текущего менеджера.
                     */
                    const managerBlock =
                        button.closest(
                            ".development-manager-block"
                        );

                    if (!managerBlock) {
                        return;
                    }

                    /*
                     * Ищем группу только внутри
                     * текущего менеджера.
                     */
                    const content =
                        managerBlock.querySelector(
                            `[data-group-content="${group}"]`
                        );

                    if (!content) {
                        return;
                    }

                    const opened =
                        content.style.display !== "none";

                    content.style.display =
                        opened
                            ? "none"
                            : "block";

                    /*
                     * CSS по этому классу меняет
                     * направление стрелки.
                     */
                    button.classList.toggle(
                        "opened",
                        !opened
                    );
                }
            );
        });


    /* =========================================================
       3. РАСКРЫТИЕ ПОЛНОЙ КАРТОЧКИ РАЗРАБОТКИ
       ========================================================= */

    root
        .querySelectorAll(
            ".development-control-card"
        )
        .forEach(card => {

            card.addEventListener(
                "click",
                event => {

                    /*
                     * Если кликнули по кнопке продления —
                     * карточку не сворачиваем/раскрываем.
                     */
                    if (
                        event.target.closest(
                            ".development-extend-button, .development-link-button, .development-unlink-button, .development-allow-repeat-button"
                        )
                    ) {
                        return;
                    }

                    const details =
                        card.querySelector(
                            ".development-control-details"
                        );

                    if (!details) {
                        return;
                    }

                    const opened =
                        details.style.display !== "none";

                    details.style.display =
                        opened
                            ? "none"
                            : "block";
                }
            );
        });


    /* =========================================================
       4. ПРОДЛЕНИЕ РАЗРАБОТКИ

       Доступ:
       admin
       director
       rop
       ========================================================= */

    root
        .querySelectorAll(
            ".development-extend-button"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                async event => {

                    /*
                     * Не даём клику уйти в карточку.
                     */
                    event.stopPropagation();

                    const developmentId =
                        button.dataset.extendId;

                    if (!developmentId) {
                        alert(
                            "Не найден ID разработки."
                        );
                        return;
                    }


                    /* =========================
                       Ввод количества дней
                       ========================= */

                    const days =
                        prompt(
                            "На сколько дней продлить разработку?",
                            "10"
                        );

                    if (days === null) {
                        return;
                    }

                    const numberOfDays =
                        Number(
                            String(days).trim()
                        );


                    /* =========================
                       Проверка
                       ========================= */

                    if (
                        !Number.isInteger(
                            numberOfDays
                        ) ||
                        numberOfDays < 1 ||
                        numberOfDays > 365
                    ) {

                        alert(
                            "Введите целое количество дней от 1 до 365."
                        );

                        return;
                    }


                    /* =========================
                       Подтверждение
                       ========================= */

                    const confirmed =
                        confirm(
                            `Продлить разработку на ${numberOfDays} дней от даты её истечения?`
                        );

                    if (!confirmed) {
                        return;
                    }


                    /* =========================
                       Блокируем кнопку
                       ========================= */

                    const originalText =
                        button.textContent;

                    button.disabled = true;

                    button.textContent =
                        "Продление...";


                    /* =========================
                       Запрос
                       ========================= */

                    try {

                        await api(
                            `/api/developments/${developmentId}/extend`,
                            {
                                method: "POST",

                                body: JSON.stringify({
                                    days: numberOfDays
                                })
                            }
                        );


                        /* =========================
                           Обновляем список
                           ========================= */

                        await loadDevelopments();


                    } catch (error) {

                        console.error(
                            "Ошибка продления разработки:",
                            error
                        );

                        alert(
                            error.message ||
                            "Не удалось продлить разработку."
                        );

                        button.disabled = false;

                        button.textContent =
                            originalText;
                    }
                }
            );
        });


    /* =========================================================
       5. РУЧНАЯ ПРИВЯЗКА / ОТВЯЗКА КАРТОЧКИ 1С
       ========================================================= */

    root
        .querySelectorAll(".development-link-button")
        .forEach(button => {
            button.addEventListener("click", event => {
                event.stopPropagation();
                openLinkDialog(
                    button.dataset.linkId,
                    button.dataset.linkName
                );
            });
        });

    root
        .querySelectorAll(".development-allow-repeat-button")
        .forEach(button => {
            button.addEventListener("click", async event => {

                event.stopPropagation();

                if (!confirm(
                    "Разрешить менеджеру взять эту разработку снова, " +
                    "не дожидаясь конца запрета?"
                )) {
                    return;
                }

                button.disabled = true;

                try {
                    await api(
                        `/api/developments/${button.dataset.allowRepeatId}/allow-repeat`,
                        { method: "POST", body: JSON.stringify({}) }
                    );
                    await loadDevelopments();
                } catch (error) {
                    button.disabled = false;
                    alert(error.message || "Не удалось разрешить повтор.");
                }
            });
        });

    root
        .querySelectorAll(".development-unlink-button")
        .forEach(button => {
            button.addEventListener("click", async event => {

                event.stopPropagation();

                if (!confirm(
                    "Снять привязку? Разработка снова станет заявкой " +
                    "на договор, автоматически она больше не привяжется."
                )) {
                    return;
                }

                button.disabled = true;

                try {
                    await api(
                        `/api/developments/${button.dataset.unlinkId}/unlink`,
                        { method: "POST", body: JSON.stringify({}) }
                    );
                    await loadDevelopments();
                } catch (error) {
                    button.disabled = false;
                    alert(error.message || "Не удалось снять привязку.");
                }
            });
        });
}

    /* Окно выбора карточки 1С для заявки на договор. */
    function openLinkDialog(developmentId, developmentName) {

        const overlay = document.createElement("div");

        overlay.style.cssText =
            "position:fixed;inset:0;z-index:10000;" +
            "background:rgba(0,0,0,.55);display:flex;" +
            "align-items:flex-end;justify-content:center;";

        overlay.innerHTML = `
            <div style="background:var(--card) !important;color:var(--text) !important;
                        width:100%;max-width:640px;max-height:88vh;
                        border-radius:14px 14px 0 0;display:flex;
                        flex-direction:column;box-sizing:border-box;">
                <div style="padding:14px 16px 8px;font-weight:700;font-size:16px;color:var(--text) !important;">
                    Привязать карточку 1С
                    <div style="font-weight:400;font-size:13px;color:var(--text) !important;margin-top:2px;">
                        ${escapeHtml(developmentName)}
                    </div>
                </div>
                <div style="padding:0 16px 8px;display:flex;gap:8px;">
                    <input type="text" class="link-dialog-search"
                        placeholder="Название, юр. лицо или ИНН"
                        style="flex:1;padding:10px;font-size:15px;
                               border:1px solid var(--card-border);border-radius:8px;
                               background:var(--card) !important;color:var(--text) !important;">
                    <button type="button" class="link-dialog-find"
                        style="background:#5B7BE0 !important;color:#ffffff !important;
                               border:0;border-radius:8px;padding:10px 14px;font-weight:600;">
                        Найти
                    </button>
                </div>
                <div class="link-dialog-hint"
                     style="padding:0 16px 6px;font-size:12px;color:var(--text) !important;"></div>
                <div class="link-dialog-list"
                     style="overflow:auto;padding:0 16px 8px;flex:1;"></div>
                <div style="padding:8px 16px 16px;">
                    <button type="button" class="link-dialog-close"
                        style="width:100%;background:rgba(255,255,255,0.10) !important;color:var(--text) !important;
                               border:0;border-radius:8px;padding:11px;font-weight:600;">
                        Закрыть
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const input = overlay.querySelector(".link-dialog-search");
        const list = overlay.querySelector(".link-dialog-list");
        const hint = overlay.querySelector(".link-dialog-hint");

        const close = () => overlay.remove();

        overlay.querySelector(".link-dialog-close")
            .addEventListener("click", close);

        overlay.addEventListener("click", event => {
            if (event.target === overlay) close();
        });

        let items = [];

        function renderItems() {

            if (!items.length) {
                list.innerHTML =
                    `<div style="padding:14px 0;color:var(--text) !important;">
                        Ничего не найдено. Измените запрос.
                    </div>`;
                return;
            }

            list.innerHTML = items.map((item, index) => `
                <div style="border:1px solid var(--card-border);border-radius:10px;
                            padding:10px;margin-bottom:8px;
                            background:var(--card) !important;color:var(--text) !important;">
                    <div style="font-weight:700;color:var(--text) !important;">
                        ${escapeHtml(item.name)}
                    </div>
                    ${item.legal_name ? `<div style="font-size:13px;color:var(--text) !important;">${escapeHtml(item.legal_name)}</div>` : ""}
                    ${item.inn ? `<div style="font-size:13px;color:var(--text) !important;">ИНН ${escapeHtml(item.inn)}</div>` : ""}
                    <div style="font-size:13px;color:var(--text) !important;">
                        ${escapeHtml(item.address || "адрес не указан")}
                    </div>
                    <div style="font-size:12px;color:var(--text) !important;">
                        Создана в 1С: ${escapeHtml(item.created_at ? formatDate(item.created_at) : "—")};
                        последняя отгрузка: ${escapeHtml(item.last_shipment_date ? formatDate(item.last_shipment_date) : "нет")}
                    </div>
                    ${item.taken_by ? `<div style="font-size:12px;color:#FF8FB3 !important;font-weight:600;">
                        ⚠️ Уже привязана к разработке «${escapeHtml(item.taken_by.name)}»</div>` : ""}
                    <button type="button" data-pick="${index}"
                        style="margin-top:8px;background:var(--accent) !important;color:var(--accent-ink) !important;
                               border:0;border-radius:8px;padding:9px 14px;font-weight:600;">
                        Привязать эту карточку
                    </button>
                </div>
            `).join("");

            list.querySelectorAll("[data-pick]").forEach(button => {
                button.addEventListener("click", async () => {

                    const item = items[Number(button.dataset.pick)];

                    const question = item.taken_by
                        ? `Эта карточка уже привязана к другой разработке («${item.taken_by.name}»). Всё равно привязать?`
                        : `Привязать «${item.name}» к разработке «${developmentName}»?`;

                    if (!confirm(question)) {
                        return;
                    }

                    button.disabled = true;

                    try {
                        await api(
                            `/api/developments/${developmentId}/link`,
                            {
                                method: "POST",
                                body: JSON.stringify({
                                    guid: item.guid,
                                    confirm_taken: Boolean(item.taken_by)
                                })
                            }
                        );
                        close();
                        await loadDevelopments();
                    } catch (error) {
                        button.disabled = false;
                        alert(error.message || "Не удалось привязать карточку.");
                    }
                });
            });
        }

        async function load(query) {

            list.innerHTML =
                `<div style="padding:14px 0;color:var(--text) !important;">Загрузка…</div>`;

            try {
                const result = await api(
                    `/api/developments/${developmentId}/link-candidates?q=` +
                    encodeURIComponent(query)
                );
                items = Array.isArray(result?.items) ? result.items : [];
                hint.textContent = query
                    ? "Результаты поиска по 1С"
                    : "Самые похожие карточки. Если нужной нет, воспользуйтесь поиском.";
                renderItems();
            } catch (error) {
                list.innerHTML =
                    `<div style="padding:14px 0;color:#FF8FB3 !important;">${escapeHtml(error.message || "Ошибка загрузки")}</div>`;
            }
        }

        overlay.querySelector(".link-dialog-find")
            .addEventListener("click", () => load(input.value.trim()));

        input.addEventListener("keydown", event => {
            if (event.key === "Enter") load(input.value.trim());
        });

        load("");
    }

    async function loadDevelopments() {
        const container =
            root.querySelector(
                "#developmentsControlManagers"
            );

        if (!container) {
            return;
        }

        showMessage("");

        container.innerHTML = `
            <div class="menu-item">
                Загрузка разработок...
            </div>
        `;

        try {

            /*
             * Новый endpoint должен вернуть:
             *
             * {
             *   success: true,
             *   managers: [
             *     {
             *       id: 12,
             *       name: "Иванов Иван",
             *       developments: [...]
             *     }
             *   ]
             * }
             */

            const result =
                await api(
                    "/api/developments/control"
                );

            const managers =
                Array.isArray(
                    result?.managers
                )
                    ? result.managers
                    : [];

            if (!managers.length) {

                container.innerHTML = `
                    <div class="menu-item">
                        Нет доступных разработок
                    </div>
                `;

                return;
            }

            container.innerHTML =
                managers
                    .map(renderManager)
                    .join("");

            bindManagerEvents();

        } catch (error) {

            console.error(
                "Ошибка загрузки разработок:",
                error
            );

            container.innerHTML = `
                <div class="menu-item">
                    Ошибка загрузки разработок
                </div>
            `;

            showMessage(
                error.message ||
                "Не удалось загрузить разработки"
            );
        }
    }

const summaryButton =
    root.querySelector(
        "#developmentsSummaryOpen"
    );

if (summaryButton) {
    summaryButton.addEventListener(
        "click",
        () => {
            if (typeof window.openScreen === "function") {
                window.openScreen("developments_summary");
            } else if (typeof openScreen === "function") {
                openScreen("developments_summary");
            }
        }
    );
}

const backButton =
    root.querySelector(
        "#developmentsControlBack"
    );

if (backButton) {
    backButton.addEventListener(
        "click",
        () => {

            if (typeof window.showMenu === "function") {
                window.showMenu();
            } else if (typeof window.openScreen === "function") {
                window.openScreen("home");
            } else {
                history.back();
            }
        }
    );
}

registerScreen("developments_control", function() {

    window.currentScreen = "developments_control";

    title.innerText = "Разработки";

    container.innerHTML = "";

    container.appendChild(root);

    loadDevelopments();
});



return root;
})();
