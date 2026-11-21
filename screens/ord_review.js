/*
 * Проверка заказов (оператор, админ): список заказов и карточка, где исходный текст стоит
 * рядом со строками разбора. Пустые и сомнительные строки подсвечены.
 */

window.ordRv = window.ordRv || { tab: "processed", order: null, lines: [], units: [], dirty: false };

registerScreen("ord_review", function () {

    /* открыли экран (из меню, в 1С при запуске) — день по правилу; вернулись из карточки — тот же день */
    if (window.currentScreen !== "ord_review_card") ORD.day.reset("review");

    window.currentScreen = "ord_review";
    title.innerText = "Проверка заказов";

    /* «Разбор и ошибки» видна, только когда в ней что-то есть (обычно заказ разбирается за секунды) */
    const tabs = [
        ["new,processing,error", "Разбор и ошибки"],
        ["processed", "Ждёт проверки"],
        ["confirmed", "Подтверждённые"],
        ["created", "Созданы в 1С"],
        ["", "Все"]
    ];
    if (!tabs.some(t => t[0] === ordRv.tab)) ordRv.tab = "processed";

    container.innerHTML = `
        <div class="ord-page wide">
            <div class="ord-actions top">
                <button type="button" class="ord-primary" onclick="window.ordNewMode='op';openScreen('ord_new')">+ Новый заказ</button>
            </div>
            ${ORD.day.html("review")}
            <div class="ord-tabs">
                ${tabs.map(([k, t]) => `<button type="button" class="ord-tab ${ordRv.tab === k ? "active" : ""} ${k === "new,processing,error" ? "ord-tab-parse" + (ordRv.tab === k ? "" : " hidden") : ""}"
                    data-tab="${k}">${t}<span class="ord-tab-n" data-n="${k}"></span></button>`).join("")}
            </div>
            <div id="ordRvList"></div>
        </div>
    `;

    ORD.day.bind(container, "review", () => ordRvLoad());

    container.querySelectorAll(".ord-tab").forEach(b => {
        b.onclick = () => {
            ordRv.tab = b.dataset.tab;
            container.querySelectorAll(".ord-tab").forEach(x => x.classList.toggle("active", x === b));
            ordRvLoad();
        };
    });

    ordRvLoad();
    ORD.poll("ord_review", () => ordRvLoad(true), 10000);
});

async function ordRvLoad(quiet) {
    const box = document.getElementById("ordRvList");
    if (!box) return;
    if (!quiet) ordSetHtml(box, `<div class="ord-empty">Загрузка…</div>`);

    const q = (ordRv.tab ? "?status=" + encodeURIComponent(ordRv.tab) : "?state=all") +
        "&limit=500&date=" + ORD.day.get("review");

    try {
        const r = await ORD.api("GET", "/orders" + q);

        /* счётчики на вкладках за выбранный день */
        const c = r.counts || {};
        const sum = keys => keys.split(",").reduce((a, k) => a + (c[k] || 0), 0);
        document.querySelectorAll(".ord-tab-n").forEach(el => {
            const k = el.dataset.n;
            const n = k ? sum(k) : Object.values(c).reduce((a, b) => a + b, 0);
            el.textContent = n ? " " + n : "";
        });
        /* «Разбор и ошибки»: пусто — вкладки нет; есть ошибки — красная */
        const parse = document.querySelector(".ord-tab-parse");
        if (parse) {
            const n = sum("new,processing,error");
            parse.classList.toggle("hidden", !n && ordRv.tab !== "new,processing,error");
            parse.classList.toggle("bad", (c.error || 0) > 0);
        }

        if (!r.orders.length) {
            ordSetHtml(box, `<div class="ord-empty">Заказов с доставкой на этот день нет</div>`);
            return;
        }

        /* «Ждёт проверки», «Разбор и ошибки», «Подтверждённые» — первым пришёл, первым обработан: старые сверху, видно, сколько ждут.
           «Подтверждённые» и «Все» — новые сверху. */
        const fifo = ordRv.tab === "processed" || ordRv.tab === "new,processing,error" || ordRv.tab === "confirmed";
        const orders = fifo ? r.orders.slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1)) : r.orders;
        const nowMs = Date.now();
        const waitMin = o => Math.max(0, Math.floor((nowMs - Date.parse(o.created_at)) / 60000));
        const waitText = m => m < 60 ? m + " мин" : Math.floor(m / 60) + " ч " + (m % 60) + " мин";

        ordSetHtml(box, orders.map(o => {
            const waiting = fifo && ["new", "processing", "processed"].includes(o.status) ? waitMin(o) : null;
            const late = waiting !== null && waiting >= 30;
            return `
            <div class="ord-card ord-list-item ${late ? "late" : ""} ${o.parent_uuid ? "ord-addon" : ""}" onclick="ordRvOpen('${ORD.esc(o.uuid)}')">
                ${ORD.addonChip(o)}
                <div class="ord-list-top">
                    <b>${ORD.esc(o.counterparty_name || "—")} ${ORD.cashChip(o)}</b>
                    <span>
                        ${o.similar ? `<span class="ord-chip warn" title="Тот же клиент и день, позиции совпадают">похож на другой</span>` : ""}
                        ${o.lines_empty ? `<span class="ord-chip bad">без товара: ${o.lines_empty}</span>` : ""}
                        ${o.hold_name && o.hold_by !== ORD.user().user_id ? (o.hold_kind === "edit"
                            ? `<span class="ord-chip mgr" title="Менеджер правит позиции — подождите">✏️ правит ${ORD.esc(o.hold_name)}</span>`
                            : `<span class="ord-chip info" title="Карточка открыта у оператора">🔒 ${ORD.esc(o.hold_name)}</span>`) : ""}
                        ${ORD.orderChip(o)}
                    </span>
                </div>
                <div class="ord-list-meta">
                    <span>${ORD.esc(o.author_name)}</span>
                    <span>${ORD.esc(ORD.fmtWhen(o) || "без даты")}</span>
                    <span>${o.lines_total ? o.lines_total + " поз." : ""}</span>
                    <span>${ORD.esc(ORD.fmtDate(o.created_at))} ${ORD.esc(ORD.fmtTime(o.created_at))}</span>
                    ${waiting !== null ? `<span class="ord-wait ${late ? "late" : ""}">ждёт ${waitText(waiting)}</span>` : ""}
                </div>
            </div>`;
        }).join(""));
    } catch (e) {
        if (!quiet) ordSetHtml(box, `<div class="ord-empty bad">${ORD.esc(e.message)}</div>`);
    }
}

/* ---------------- карточка ---------------- */

async function ordRvOpen(uuid) {
    if (ordRv.dirty && ordRv.order && ordRv.order.uuid !== uuid &&
        !(await ORD.ask("Есть несохранённые правки. Уйти без сохранения?", "Уйти", "Остаться"))) return;

    if (ordRv.order && ordRv.order.uuid !== uuid) ordRvUnhold(ordRv.order.uuid);   // ушёл из прежнего заказа

    window.currentScreen = "ord_review_card";
    title.innerText = "Проверка заказа";
    container.innerHTML = `<div class="ord-page wide"><div class="ord-empty">Загрузка…</div></div>`;

    try {
        ordRvSet(await ORD.api("GET", "/orders/" + encodeURIComponent(uuid)));
    } catch (e) {
        container.innerHTML = `<div class="ord-page"><div class="ord-empty bad">${ORD.esc(e.message)}</div>
            <button class="btn-secondary" onclick="openScreen('ord_review')">К списку</button></div>`;
        return;
    }
    ordRvRender();
}

function ordRvSet(card) {
    ordRv.order = card.order;
    ordRv.units = card.units || [];
    ordRv.canEdit = card.can_edit;
    ordRv.canConfirm = card.can_confirm;
    ordRv.lines = card.lines.map(l => Object.assign({}, l));
    ordRv.similar = card.similar || [];
    ordRv.hold = card.hold || null;
    ordRv.dirty = false;
}

/* ---------------- занятость: заказ за оператором, пока карточка открыта ---------------- */

function ordRvBusy() {
    return ordRv.order && ordRv.order.status === "processed" && ordRv.hold && !ordRv.hold.mine;
}

function ordRvUnhold(uuid) {
    ORD.api("POST", "/orders/" + encodeURIComponent(uuid) + "/unhold").catch(() => {});
}

/* Свой заказ — продлеваем раз в 30 с; чужой — раз в 15 с проверяем, не освободился ли (тогда он станет нашим) */
function ordRvHeartbeat(uuid) {
    if (ordRv.beat && ordRv.beat.uuid === uuid) return;
    const b = { uuid };
    ordRv.beat = b;

    const step = async () => {
        if (ordRv.beat !== b) return;
        const here = window.currentScreen === "ord_review_card" && ordRv.order && ordRv.order.uuid === uuid &&
            ordRv.order.status === "processed";
        if (!here) { ordRv.beat = null; return; }
        const wasMine = !ordRvBusy();
        try {
            const r = await ORD.api("POST", "/orders/" + encodeURIComponent(uuid) + "/hold");
            if (ordRv.beat !== b) return;
            const mine = Boolean(r.hold && r.hold.mine);
            if (r.status !== "processed" || mine !== wasMine) {
                ordRv.beat = null;
                if (wasMine && !mine && r.hold) ORD.toast("Заказ забрал " + r.hold.name + (ordRv.dirty ? " — ваши правки не сохранены" : ""), "bad");
                if (!wasMine && mine) ORD.toast("Заказ освободился — можно проверять", "ok");
                ordRv.dirty = false;
                ordRvOpen(uuid);
                return;
            }
        } catch (_) { /* связь пропала — попробуем ещё раз */ }
        setTimeout(step, wasMine ? 30000 : 15000);
    };
    setTimeout(step, ordRvBusy() ? 15000 : 30000);
}


function ordRvRender() {
    const o = ordRv.order;
    const edit = ordRv.canEdit;
    const waiting = ["new", "processing"].includes(o.status);
    const empty = ordRv.lines.filter(l => !l.item_guid).length;
    const doubt = ordRv.lines.filter(l => l.item_guid && l.match_source === "llm").length;

    container.innerHTML = `
        <div class="ord-page wide">

            <div class="ord-card ${o.parent_uuid ? "ord-addon" : ""}">
                ${o.parent_uuid ? `<div class="ord-addon-title">➕ Дозаказ к заказу № ${ORD.esc(o.parent_doc_number || "")}
                    <span>— строки добавятся в этот заказ в 1С с отметкой «Дозаказ»</span></div>` : ""}
                <div class="ord-list-top">
                    <b class="ord-big">${ORD.esc(o.counterparty_name)} ${ORD.cashChip(o)}</b>
                    ${ORD.orderChip(o)}
                </div>
                <div class="ord-list-meta">
                    <span>Менеджер: ${ORD.esc(o.author_name)}</span>
                    <span>Доставка: ${ORD.esc(ORD.fmtWhen(o) || "не указана")}</span>
                    <span>Отправлен ${ORD.esc(ORD.fmtDate(o.created_at))} ${ORD.esc(ORD.fmtTime(o.created_at))}</span>
                    ${o.doc_number ? `<span><b>Заказ в 1С № ${ORD.esc(o.doc_number)}</b></span>` : ""}
                </div>
                ${o.store_comment ? `<div class="ord-order-comment"><b>Для склада:</b> ${ORD.esc(o.store_comment)}</div>` : ""}
                ${o.comment ? `<div class="ord-order-comment"><b>Для водителя:</b> ${ORD.esc(o.comment)}</div>` : ""}
                ${ordRv.similar.length ? `<div class="ord-note warn ord-similar">Похоже на ${ordRv.similar.length > 1 ? "другие заказы" : "другой заказ"} этого клиента на этот день:
                    ${ordRv.similar.map(d => `<div><a onclick="ordRvOpen('${ORD.esc(d.uuid)}')">${ORD.esc(ORD.similarText(d))}</a></div>`).join("")}
                </div>` : ""}
                ${ordRvBusy() && ordRv.hold.kind === "edit" ? `<div class="ord-note ord-busy">✏️ Заказ сейчас правит менеджер <b>${ORD.esc(ordRv.hold.name)}</b> — можно только смотреть.
                    Откроется для проверки сам, как только менеджер закончит.</div>` : ""}
                ${ordRvBusy() && ordRv.hold.kind !== "edit" ? `<div class="ord-note ord-busy">🔒 Заказ проверяет <b>${ORD.esc(ordRv.hold.name)}</b> — можно только смотреть.
                    Освободится сам, как только оператор уйдёт из заказа.
                    <button type="button" class="btn-secondary" id="ordRvTake">Забрать себе</button></div>` : ""}
                ${o.status === "confirmed" && o.block_reason ? `<div class="ord-note ord-blocked">⛔ <b>${ORD.esc(o.block_reason)}.</b>
                    Заказ в 1С не создан. Когда блокировку снимут, нажмите «Создать заказ в 1С».</div>` : ""}
                ${o.error_text ? `<div class="ord-note warn">${ORD.esc(o.error_text)}</div>` : ""}
                ${waiting ? `<div class="ord-note">Заказ разбирается…</div>` : ""}
            </div>

            <div class="ord-split">
                <div class="ord-card ord-src">
                    <div class="ord-card-title">Как прислал менеджер</div>
                    <pre class="ord-src-text">${ORD.esc(o.raw_text)}</pre>
                    ${["processed", "error"].includes(o.status) && !ordRvBusy() ? `<button type="button" class="btn-secondary" id="ordRvRe">Разобрать заново</button>` : ""}
                </div>

                <div class="ord-card ord-lines-card">
                    <div class="ord-card-title">
                        Строки заказа: ${ordRv.lines.length}
                        ${empty ? `<span class="ord-count"><span class="ord-dot bad"></span>без товара: ${empty}</span>` : ""}
                        ${doubt ? `<span class="ord-count"><span class="ord-dot warn"></span>проверить: ${doubt}</span>` : ""}
                        <span class="ord-legend">
                            <span><span class="ord-dot ok"></span>совпало</span>
                            <span><span class="ord-dot warn"></span>проверить</span>
                            <span><span class="ord-dot info"></span>вручную</span>
                            <span><span class="ord-dot mgr"></span>менеджер</span>
                            <span><span class="ord-dot bad"></span>не найден</span>
                        </span>
                    </div>
                    <div class="ord-lines-head">
                        <span></span><span>Товар</span><span>Кол-во</span><span>Ед.</span><span>Комментарий</span><span></span>
                    </div>
                    <div id="ordRvLines">${ordRv.lines.map((l, i) => ordRvLineHtml(l, i, edit)).join("")}</div>
                    ${edit ? `<button type="button" class="btn-secondary ord-add" id="ordRvAdd">+ Добавить строку</button>` : ""}
                </div>
            </div>

            <div class="ord-actions sticky">
                <button type="button" class="btn-secondary" id="ordRvBack">К списку</button>
                ${edit ? `<button type="button" class="btn-secondary" id="ordRvSave">Сохранить</button>` : ""}
                ${(o.status === "processed" || o.status === "error") && !ordRvBusy() ? `<button type="button" class="ord-danger" id="ordRvCancel">Отменить</button>` : ""}
                ${ordRv.canConfirm ? `<button type="button" class="ord-primary" id="ordRvConfirm">${window.ORD_V8 ? "Подтвердить и создать в 1С" : "Подтвердить заказ"}</button>` : ""}
                ${window.ORD_V8 && o.status === "confirmed" && !o.lock_by ? `<a class="ord-link-btn" href="v8:ord/create/${ORD.esc(o.uuid)}">Создать заказ в 1С</a>` : ""}
                ${o.status === "confirmed" && o.lock_by ? `<span class="ord-chip wait">Открыт в 1С: ${ORD.esc(o.lock_by)}</span>` : ""}
                ${window.ORD_V8 && o.status === "confirmed" ? `<a class="ord-link-btn secondary" id="ordRvFind" href="v8:ord/find/${ORD.esc(o.uuid)}"
                    title="Документ записан, а номер сюда не пришёл — найти его в 1С и связать с заказом">Найти созданный в 1С</a>` : ""}
                ${window.ORD_V8 && o.status === "created" && o.doc_guid ? `<a class="ord-link-btn" href="v8:Документ.ЗаказПокупателя/${ORD.esc(o.doc_guid)}">Открыть заказ № ${ORD.esc(o.doc_number)}</a>` : ""}
            </div>
        </div>
    `;

    ordRvBind();

    /* ждём разбора (или, в 1С, номера созданного документа) — тихо, без перерисовки, пока ничего не изменилось */
    if (waiting || (window.ORD_V8 && o.status === "confirmed")) ordRvWatch(o.uuid, o.status);
    if (o.status === "processed") ordRvHeartbeat(o.uuid);
}

/*
 * Тихая проверка карточки: каждые 4 с запрашиваем заказ и перерисовываем экран,
 * только если изменился статус или номер документа. Ждём не больше 2 минут
 * (дальше — кнопкой «Создать заказ в 1С» или открыв заказ заново).
 */
function ordRvWatch(uuid, status) {
    if (ordRv.watch && ordRv.watch.uuid === uuid) return;      // уже следим за этим заказом
    /* подтверждён — ждём номер документа дольше: оператор может разбираться с предупреждениями 1С */
    const w = { uuid, status, until: Date.now() + (status === "confirmed" ? 30 : 2) * 60 * 1000 };
    ordRv.watch = w;

    const step = async () => {
        if (ordRv.watch !== w) return;
        const still = window.currentScreen === "ord_review_card" && ordRv.order && ordRv.order.uuid === uuid;
        if (!still || Date.now() > w.until) { ordRv.watch = null; return; }

        try {
            const card = await ORD.api("GET", "/orders/" + encodeURIComponent(uuid));
            if (ordRv.watch !== w) return;
            const now = window.currentScreen === "ord_review_card" && ordRv.order && ordRv.order.uuid === uuid;
            if (!now) { ordRv.watch = null; return; }
            if (card.order.status !== ordRv.order.status || card.order.doc_number !== ordRv.order.doc_number ||
                card.order.lock_by !== ordRv.order.lock_by) {
                if (ordRv.dirty) { ordRv.watch = null; return; }   // не затираем несохранённые правки
                ordRv.watch = null;
                ordRvSet(card);
                ordRvRender();
                return;
            }
        } catch (_) { /* связь пропала — попробуем ещё раз */ }

        setTimeout(step, 4000);
    };
    setTimeout(step, 4000);
}

function ordRvLineHtml(l, i, edit) {
    const units = ordRv.units.map(u => `<option ${u === l.unit ? "selected" : ""}>${ORD.esc(u)}</option>`).join("");

    return `
        <div class="ord-line" data-i="${i}">
            ${ORD.matchDot(l.item_guid ? l.match_source : "none")}
            <div class="ord-line-item">
                <button type="button" class="ord-item-btn ${l.item_guid ? "" : "empty"}" data-act="pick" ${edit ? "" : "disabled"}>
                    ${l.item_guid ? ORD.esc(l.item_name) : "Выберите товар"}
                </button>
                <div class="ord-line-src">
                    ${l.item_guid ? ORD.stockText(l.item_stock, l.item_unit, l.qty, l.unit) : ""}
                    ${l.match_source === "added" ? "<b>добавил менеджер</b>"
                        : (l.match_source === "manager" ? "<b>товар выбрал менеджер</b> · " : "") + (l.source_text ? ORD.esc(l.source_text) : "<i>добавлена вручную</i>")}
                </div>
            </div>
            <input class="ord-input ord-qty" data-f="qty" inputmode="decimal" value="${ORD.esc(ORD.fmtQty(l.qty))}" ${edit ? "" : "disabled"} aria-label="Количество">
            <select class="ord-input ord-unit" data-f="unit" ${edit ? "" : "disabled"} aria-label="Единица">
                ${l.unit ? "" : `<option value="" selected>—</option>`}${units}
            </select>
            <input class="ord-input ord-comment" data-f="comment" value="${ORD.esc(l.comment)}" placeholder="—" maxlength="1000" ${edit ? "" : "disabled"} aria-label="Комментарий">
            ${edit ? `<button type="button" class="ord-del" data-act="del" title="Удалить строку" aria-label="Удалить строку">✕</button>` : "<span></span>"}
        </div>
    `;
}

function ordRvBind() {
    const uuid = ordRv.order.uuid;
    const linesBox = document.getElementById("ordRvLines");

    linesBox.addEventListener("input", e => {
        const row = e.target.closest(".ord-line");
        const f = e.target.dataset.f;
        if (!row || !f) return;
        const l = ordRv.lines[Number(row.dataset.i)];
        l[f] = e.target.value;
        ordRv.dirty = true;
    });

    linesBox.addEventListener("change", e => {
        const row = e.target.closest(".ord-line");
        if (row && e.target.dataset.f === "unit") {
            ordRv.lines[Number(row.dataset.i)].unit = e.target.value;
            ordRv.dirty = true;
        }
    });

    linesBox.addEventListener("click", async e => {
        const btn = e.target.closest("[data-act]");
        if (!btn || btn.disabled) return;
        const i = Number(btn.closest(".ord-line").dataset.i);

        if (btn.dataset.act === "del") {
            ordRv.lines.splice(i, 1);
            ordRv.dirty = true;
            ordRvRender();
            return;
        }

        if (btn.dataset.act === "pick") {
            const item = await ordRvPickItem(ordRv.lines[i]);
            if (!item) return;
            const l = ordRv.lines[i];
            if (l.item_guid !== item.guid) {
                l.item_guid = item.guid;
                l.item_name = item.name;
                l.item_stock = item.stock;
                l.item_unit = item.unit;
                l.match_source = "manual";
                if (!l.unit && item.unit) l.unit = item.unit;
                ordRv.dirty = true;
            }
            ordRvRender();
        }
    });

    const add = document.getElementById("ordRvAdd");
    if (add) add.onclick = () => {
        ordRv.lines.push({ id: null, item_guid: null, item_name: null, qty: "", unit: "", comment: "", source_text: "", match_source: "manual", candidates: [] });
        ordRv.dirty = true;
        ordRvRender();
    };

    document.getElementById("ordRvBack").onclick = async () => {
        if (ordRv.dirty && !(await ORD.ask("Есть несохранённые правки. Уйти без сохранения?", "Уйти", "Остаться"))) return;
        ordRv.dirty = false;
        if (ordRv.order && ordRv.order.status === "processed" && !ordRvBusy()) ordRvUnhold(uuid);
        ordRv.beat = null;
        openScreen("ord_review");
    };

    /* «Найти созданный в 1С» — ссылку обрабатывает 1С; здесь только снова ждём номер документа */
    const find = document.getElementById("ordRvFind");
    if (find) find.addEventListener("click", () => { ordRv.watch = null; ordRvWatch(uuid, "confirmed"); });

    const take = document.getElementById("ordRvTake");
    if (take) take.onclick = async () => {
        if (!(await ORD.ask("Забрать заказ у " + ordRv.hold.name + "? Если он сейчас правит строки, его несохранённые правки пропадут.",
            "Забрать себе", "Нет"))) return;
        try {
            await ORD.api("POST", "/orders/" + encodeURIComponent(uuid) + "/hold", { take: true });
            ordRv.beat = null;
            ordRvOpen(uuid);
        } catch (e) { ORD.toast(e.message, "bad"); }
    };

    const saveBtn = document.getElementById("ordRvSave");
    if (saveBtn) saveBtn.onclick = async () => {
        if (await ordRvSave()) ORD.toast("Сохранено", "ok");
    };

    const confirmBtn = document.getElementById("ordRvConfirm");
    if (confirmBtn) confirmBtn.onclick = async () => {
        const empty = ordRv.lines.filter(l => !l.item_guid).length;
        if (empty) return ORD.toast("Не выбран товар в строках: " + empty, "bad");
        const noQty = ordRv.lines.filter(l => !(Number(String(l.qty).replace(",", ".")) > 0)).length;
        if (noQty) return ORD.toast("Не указано количество в строках: " + noQty, "bad");

        confirmBtn.disabled = true;
        try {
            if (ordRv.dirty && !(await ordRvSave())) return;
            ordRvSet(await ORD.api("POST", "/orders/" + encodeURIComponent(uuid) + "/confirm"));
            ORD.toast(window.ORD_V8 ? "Подтверждён, создаю заказ в 1С…" : "Заказ подтверждён", "ok");
            ordRvRender();
            ORD.v8("v8:ord/create/" + uuid);      // в 1С: создать «Заказ покупателя» (PWA_Заказы.СоздатьЗаказИзPWA)
        } catch (e) {
            ORD.toast(e.message, "bad");
        } finally {
            confirmBtn.disabled = false;
        }
    };

    const cancelBtn = document.getElementById("ordRvCancel");
    if (cancelBtn) cancelBtn.onclick = async () => {
        if (!(await ORD.ask("Отменить заказ?", "Отменить заказ", "Нет"))) return;
        try {
            ordRvSet(await ORD.api("POST", "/orders/" + encodeURIComponent(uuid) + "/cancel"));
            ORD.toast("Заказ отменён", "ok");
            ordRvRender();
        } catch (e) { ORD.toast(e.message, "bad"); }
    };

    const re = document.getElementById("ordRvRe");
    if (re) re.onclick = async () => {
        if (!(await ORD.ask("Разобрать заказ заново? Правки строк пропадут.", "Разобрать заново", "Нет"))) return;
        try {
            ordRvSet(await ORD.api("POST", "/orders/" + encodeURIComponent(uuid) + "/reprocess"));
            ordRvRender();
        } catch (e) { ORD.toast(e.message, "bad"); }
    };
}

async function ordRvSave() {
    const body = {
        lines_version: ordRv.order.lines_version,     // строки изменил кто-то другой — сервер не даст затереть
        lines: ordRv.lines.map(l => ({
            id: l.id || undefined,
            item_guid: l.item_guid || null,
            qty: l.qty === "" || l.qty === null ? null : String(l.qty).replace(",", "."),
            unit: l.unit || null,
            comment: l.comment || "",
            source_text: l.source_text || "",
            parsed_name: l.parsed_name || ""
        }))
    };
    try {
        ordRvSet(await ORD.api("POST", "/orders/" + encodeURIComponent(ordRv.order.uuid) + "/lines", body));
        ordRvRender();
        return true;
    } catch (e) {
        if (e.status === 409 && /изменил/.test(e.message)) {
            /* строки уже поменял другой оператор — показать его вариант */
            if (await ORD.ask(e.message + "\n\nОткрыть заказ заново?", "Открыть заново", "Остаться")) {
                ordRv.dirty = false;
                ordRvOpen(ordRv.order.uuid);
            }
            return false;
        }
        ORD.toast(e.message, "bad");
        return false;
    }
}

/* Выбор товара: сначала варианты разбора, ниже — поиск по справочнику. */
function ordRvPickItem(line) {
    return new Promise(resolve => {
        const m = ORD.modal(`
            <div class="ord-modal-head">
                <b>Товар</b>
                <button class="ord-x" type="button" aria-label="Закрыть">✕</button>
            </div>
            ${line.source_text ? `<div class="ord-hint">В заказе: <b>${ORD.esc(line.source_text)}</b></div>` : ""}
            <input class="ord-input" type="search" placeholder="Поиск по справочнику…" autocomplete="off"
                   value="${ORD.esc(line.parsed_name || "")}">
            <div class="ord-pick-list"></div>
        `);
        const input = m.el.querySelector("input");
        const box = m.el.querySelector(".ord-pick-list");
        let shown = [];
        let seq = 0;

        const finish = v => { m.close(); resolve(v); };
        m.el.querySelector(".ord-x").onclick = () => finish(null);

        function render(list, note) {
            shown = list;
            box.innerHTML = (note ? `<div class="ord-pick-note">${ORD.esc(note)}</div>` : "") + (list.length
                ? list.map((it, i) => `
                    <div class="ord-pick ${it.guid === line.item_guid ? "current" : ""}" data-i="${i}">
                        <span>${ORD.esc(it.name)}</span>
                        <small>${it.unit ? ORD.esc(it.unit) : ""}${it.n ? " · брал " + it.n + " раз" : ""} ${ORD.stockText(it.stock, it.unit)}</small>
                    </div>`).join("")
                : `<div class="ord-empty">Ничего не найдено</div>`);
            box.querySelectorAll(".ord-pick").forEach(el => {
                el.onclick = () => finish(shown[Number(el.dataset.i)]);
            });
        }

        async function search() {
            const q = input.value.trim();
            const my = ++seq;
            if (q.length < 2) {
                render(line.candidates || [], line.candidates && line.candidates.length ? "Варианты разбора" : "");
                return;
            }
            try {
                const r = await ORD.api("GET", "/items?q=" + encodeURIComponent(q) + "&cp=" + encodeURIComponent(ordRv.order.counterparty_guid));
                if (my !== seq) return;
                render(r.items, "");
            } catch (e) {
                if (my === seq) box.innerHTML = `<div class="ord-empty bad">${ORD.esc(e.message)}</div>`;
            }
        }

        let timer = null;
        input.oninput = () => { clearTimeout(timer); timer = setTimeout(search, 250); };

        if (line.candidates && line.candidates.length) render(line.candidates, "Варианты разбора");
        else search();

        setTimeout(() => { input.focus(); input.select(); }, 50);
    });
}
