/* Мои заказы текстом (менеджер): список со статусами и просмотр разбора. */

registerScreen("ord_my", function () {

    /* открыли экран (из меню, после отправки заказа) — день по правилу; вернулись из карточки — тот же день */
    if (window.currentScreen !== "ord_my_card") ORD.day.reset("my");

    window.currentScreen = "ord_my";
    title.innerText = "Мои заказы";

    container.innerHTML = `
        <div class="ord-page">
            <div class="ord-actions top">
                <button type="button" class="ord-primary" onclick="window.ordNewMode='my';openScreen('ord_new')">+ Новый заказ</button>
                <button type="button" class="btn-secondary" onclick="ordMyLoad()">Обновить</button>
            </div>
            ${ORD.day.html("my")}
            <div id="ordMyList"></div>
        </div>
    `;

    ORD.day.bind(container, "my", () => ordMyLoad());

    ordMyLoad();
    ORD.poll("ord_my", () => {
        if (document.querySelector("#ordMyList .ord-chip.wait")) ordMyLoad(true);
    }, 5000);
});

async function ordMyLoad(quiet) {
    const box = document.getElementById("ordMyList");
    if (!box) return;
    if (!quiet) ordSetHtml(box, `<div class="ord-empty">Загрузка…</div>`);

    try {
        const r = await ORD.api("GET", "/orders?view=mine&state=all&limit=500&date=" + ORD.day.get("my"));
        if (!r.orders.length) {
            ordSetHtml(box, `<div class="ord-empty">Заказов с доставкой на этот день нет</div>`);
            return;
        }
        ordSetHtml(box, r.orders.map(o => `
            <div class="ord-card ord-list-item ${o.parent_uuid ? "ord-addon" : ""}" onclick="ordMyOpen('${ORD.esc(o.uuid)}')">
                ${ORD.addonChip(o)}
                <div class="ord-list-top">
                    <b>${ORD.esc(o.counterparty_name || "—")} ${ORD.cashChip(o)}</b>
                    ${ORD.orderChip(o)}
                </div>
                <div class="ord-list-meta">
                    <span>${ORD.esc(ORD.fmtWhen(o) || "без даты")}</span>
                    <span>${o.lines_total ? o.lines_total + " поз." : ""}</span>
                    <span>отправлен ${ORD.esc(ORD.fmtDate(o.created_at))} ${ORD.esc(ORD.fmtTime(o.created_at))}</span>
                    ${o.doc_number ? `<span><b>№ ${ORD.esc(o.doc_number)}</b></span>` : ""}
                </div>
            </div>
        `).join(""));
    } catch (e) {
        if (!quiet) ordSetHtml(box, `<div class="ord-empty bad">${ORD.esc(e.message)}</div>`);
    }
}

async function ordMyOpen(uuid) {
    window.currentScreen = "ord_my_card";
    window.ordMyCardUuid = uuid;
    title.innerText = "Заказ";
    container.innerHTML = `<div class="ord-page"><div class="ord-empty">Загрузка…</div></div>`;

    let card;
    try {
        card = await ORD.api("GET", "/orders/" + encodeURIComponent(uuid) + "?view=mine");
    } catch (e) {
        container.innerHTML = `<div class="ord-page"><div class="ord-empty bad">${ORD.esc(e.message)}</div>
            <button class="btn-secondary" onclick="openScreen('ord_my')">Назад</button></div>`;
        return;
    }

    const o = card.order;
    const waiting = ["new", "processing"].includes(o.status);
    const canChange = ["processed", "error"].includes(o.status);
    const me = ORD.user().user_id;
    const canAdd = Boolean(card.can_manager_edit);     // «Ждёт проверки»: оператор ещё не открывал — можно править
    const takenByOperator = o.status === "processed" && Boolean(o.review_name || (o.hold_by && o.hold_by !== me));   // отменить — только через оператора

    const lines = card.lines.map(l => `
        <div class="ord-view-line ${l.item_guid ? "" : "missing"}">
            <div class="ord-view-name">${l.item_guid ? ORD.esc(l.item_name) : "<i>товар не найден</i>"}</div>
            <div class="ord-view-qty">${ORD.esc(ORD.fmtQty(l.qty))} ${ORD.esc(l.unit || "")}</div>
            <div class="ord-view-src">${l.match_source === "added" ? "<b>добавлено вами из справочника</b>"
                : (l.match_source === "manager" ? "<b>товар выбран вами</b> · " : "") + ORD.esc(l.source_text)}${l.comment ? " · <b>" + ORD.esc(l.comment) + "</b>" : ""}</div>
        </div>
    `).join("");

    container.innerHTML = `
        <div class="ord-page">
            <div class="ord-card ${o.parent_uuid ? "ord-addon" : ""}">
                ${ORD.addonChip(o)}
                <div class="ord-list-top"><b>${ORD.esc(o.counterparty_name)}</b>${ORD.orderChip(o)}</div>
                <div class="ord-list-meta">
                    <span>${ORD.esc(ORD.fmtWhen(o) || "без даты")}</span>
                    ${o.store_comment ? `<span>Складу: ${ORD.esc(o.store_comment)}</span>` : ""}
                    ${o.comment ? `<span>Водителю: ${ORD.esc(o.comment)}</span>` : ""}
                    ${o.doc_number ? `<span><b>Заказ в 1С № ${ORD.esc(o.doc_number)}</b></span>` : ""}
                </div>
                ${o.status === "processed" ? `<div class="ord-hint">${takenByOperator
                    ? "Заказ проверяет оператор " + ORD.esc(o.review_name || o.hold_name || "") + ". Чтобы отменить или изменить заказ — напишите ему."
                    : "Заказ ждёт, когда его откроет оператор."}</div>` : ""}
                ${waiting ? `<div class="ord-hint">Заказ разбирается, обычно это несколько секунд.</div>` : ""}
                ${o.status === "confirmed" && o.block_reason ? `<div class="ord-note ord-blocked">⛔ <b>${ORD.esc(o.block_reason)}.</b>
                    Заказ в 1С не создан. Снимите блокировку клиента — оператор создаст заказ.</div>` : ""}
            </div>

            ${card.can_addon || (card.addons || []).length ? `<div class="ord-card">
                ${(card.addons || []).length ? `<div class="ord-card-title">Дозаказы</div>
                    ${card.addons.map(a => `<div class="ord-addon-row" onclick="ordMyOpen('${ORD.esc(a.uuid)}')">
                        ${ORD.esc(ORD.fmtDate(a.created_at))} ${ORD.esc(ORD.fmtTime(a.created_at))} ${ORD.statusChip(a.status)}</div>`).join("")}` : ""}
                ${card.can_addon ? `<button type="button" class="ord-primary ord-add" id="ordMyAddon">➕ Дозаказ</button>
                    <div class="ord-hint">Добавить позиции в этот заказ — пока не прошла дата доставки</div>` : ""}
            </div>` : ""}

            ${card.lines.length || canAdd ? `<div class="ord-card">${lines}
                ${canAdd ? `<div class="ord-actions top ord-my-edit-btns">
                        <button type="button" class="btn-secondary" id="ordMyEdit">✏️ Изменить позиции</button>
                        <button type="button" class="btn-secondary" id="ordMyAdd">+ Добавить позицию</button>
                    </div>
                    <div class="ord-hint">Можно, пока заказ не открыл оператор</div>` : ""}</div>` : ""}

            <details class="ord-card ord-raw" ${card.lines.length ? "" : "open"}>
                <summary>Текст заказа</summary>
                <textarea id="ordMyText" class="ord-textarea" rows="8" ${canChange ? "" : "readonly"}>${ORD.esc(o.raw_text)}</textarea>
                ${canChange ? `<button type="button" class="btn-secondary" id="ordMyRe">Исправить текст и разобрать заново</button>` : ""}
            </details>

            <div class="ord-actions">
                <button type="button" class="btn-secondary" onclick="openScreen('ord_my')">Назад</button>
                ${!["confirmed", "created", "cancelled"].includes(o.status) && !takenByOperator ? `<button type="button" class="ord-danger" id="ordMyCancel">Отменить заказ</button>` : ""}
            </div>
        </div>
    `;

    const add = document.getElementById("ordMyAdd");
    if (add) add.onclick = () => ordMyAddLine(o, card.units || []);
    const addon = document.getElementById("ordMyAddon");
    if (addon) addon.onclick = () => { window.ordNewAddon = o; openScreen("ord_new"); };

    const ed = document.getElementById("ordMyEdit");
    if (ed) ed.onclick = () => ordMyEdit(uuid);

    const re = document.getElementById("ordMyRe");
    if (re) re.onclick = async () => {
        try {
            await ORD.api("POST", "/orders/" + encodeURIComponent(uuid) + "/reprocess", { text: document.getElementById("ordMyText").value });
            ORD.toast("Отправлено на разбор", "ok");
            ordMyOpen(uuid);
        } catch (e) { ORD.toast(e.message, "bad"); }
    };

    const cancel = document.getElementById("ordMyCancel");
    if (cancel) cancel.onclick = async () => {
        if (!(await ORD.ask("Отменить заказ?", "Отменить заказ", "Нет"))) return;
        try {
            await ORD.api("POST", "/orders/" + encodeURIComponent(uuid) + "/cancel");
            ORD.toast("Заказ отменён", "ok");
            openScreen("ord_my");
        } catch (e) { ORD.toast(e.message, "bad"); }
    };

    if (waiting) {
        /* тихо ждём окончания разбора: перерисовываем, только когда статус сменился */
        const check = async () => {
            if (window.currentScreen !== "ord_my_card" || window.ordMyCardUuid !== uuid) return;
            try {
                const c = await ORD.api("GET", "/orders/" + encodeURIComponent(uuid) + "?view=mine");
                if (window.currentScreen !== "ord_my_card" || window.ordMyCardUuid !== uuid) return;
                if (c.order.status !== o.status) { ordMyOpen(uuid); return; }
            } catch (_) { /* попробуем ещё раз */ }
            setTimeout(check, 4000);
        };
        setTimeout(check, 4000);
    }
}

/* Добавить позицию из справочника (пока заказ «Ждёт проверки») */
function ordMyAddLine(o, units) {
    const m = ORD.modal(`
        <div class="ord-modal-head">
            <b>Добавить позицию</b>
            <button class="ord-x" type="button" aria-label="Закрыть">✕</button>
        </div>
        <input class="ord-input" type="search" placeholder="Поиск по справочнику…" autocomplete="off">
        <div class="ord-pick-list"><div class="ord-empty">Начните вводить название</div></div>
        <div class="ord-add-form hidden">
            <div class="ord-add-name"></div>
            <div class="ord-row3">
                <div><label class="ord-label">Количество</label>
                    <input class="ord-input" id="ordAddQty" inputmode="decimal" placeholder="0"></div>
                <div><label class="ord-label">Единица</label>
                    <select class="ord-input" id="ordAddUnit">${units.map(u => `<option>${ORD.esc(u)}</option>`).join("")}</select></div>
                <div></div>
            </div>
            <label class="ord-label">Комментарий</label>
            <input class="ord-input" id="ordAddComment" maxlength="1000" placeholder="—">
            <div class="ord-actions">
                <button type="button" class="btn-secondary" data-a="back">Другой товар</button>
                <button type="button" class="ord-primary" data-a="add">Добавить</button>
            </div>
        </div>
    `);
    const el = m.el;
    const input = el.querySelector('input[type="search"]');
    const box = el.querySelector(".ord-pick-list");
    const form = el.querySelector(".ord-add-form");
    let shown = [], picked = null, seq = 0, timer = null;

    el.querySelector(".ord-x").onclick = () => m.close();

    function choose(it) {
        picked = it;
        el.querySelector(".ord-add-name").innerHTML = `<b>${ORD.esc(it.name)}</b> ${ORD.stockText(it.stock, it.unit)}`;
        const sel = el.querySelector("#ordAddUnit");
        if (it.unit && units.indexOf(it.unit) >= 0) sel.value = it.unit;
        input.classList.add("hidden");
        box.classList.add("hidden");
        form.classList.remove("hidden");
        setTimeout(() => el.querySelector("#ordAddQty").focus(), 50);
    }

    async function search() {
        const q = input.value.trim();
        const my = ++seq;
        if (q.length < 2) { box.innerHTML = `<div class="ord-empty">Начните вводить название</div>`; return; }
        try {
            const r = await ORD.api("GET", "/items?q=" + encodeURIComponent(q) + "&cp=" + encodeURIComponent(o.counterparty_guid));
            if (my !== seq) return;
            shown = r.items;
            box.innerHTML = shown.length ? shown.map((it, i) => `
                <div class="ord-pick" data-i="${i}">
                    <span>${ORD.esc(it.name)}</span>
                    <small>${it.unit ? ORD.esc(it.unit) : ""}${it.n ? " · брал " + it.n + " раз" : ""} ${ORD.stockText(it.stock, it.unit)}</small>
                </div>`).join("") : `<div class="ord-empty">Ничего не найдено</div>`;
            box.querySelectorAll(".ord-pick").forEach(p => { p.onclick = () => choose(shown[Number(p.dataset.i)]); });
        } catch (e) {
            if (my === seq) box.innerHTML = `<div class="ord-empty bad">${ORD.esc(e.message)}</div>`;
        }
    }
    input.oninput = () => { clearTimeout(timer); timer = setTimeout(search, 250); };
    setTimeout(() => input.focus(), 50);

    el.querySelector('[data-a="back"]').onclick = () => {
        picked = null;
        form.classList.add("hidden");
        input.classList.remove("hidden");
        box.classList.remove("hidden");
        input.focus();
    };

    el.querySelector('[data-a="add"]').onclick = async () => {
        const qty = el.querySelector("#ordAddQty").value.trim().replace(",", ".");
        if (!(Number(qty) > 0)) return ORD.toast("Укажите количество", "bad");
        const btn = el.querySelector('[data-a="add"]');
        btn.disabled = true;
        try {
            await ORD.api("POST", "/orders/" + encodeURIComponent(o.uuid) + "/add-line", {
                item_guid: picked.guid, qty, unit: el.querySelector("#ordAddUnit").value,
                comment: el.querySelector("#ordAddComment").value.trim()
            });
            m.close();
            ORD.toast("Позиция добавлена", "ok");
        } catch (e) {
            ORD.toast(e.message, "bad");
            if (e.status === 409) m.close();      // оператор уже открыл заказ — показать актуальное
            else { btn.disabled = false; return; }
        }
        ordMyOpen(o.uuid);
    };
}

/* ---------------- правка позиций менеджером (пока оператор не открыл заказ) ---------------- */

/* Выбор товара из справочника — окно поиска. Возвращает Promise<товар | null> */
function ordMyPickItem(o, query) {
    return new Promise(resolve => {
        const m = ORD.modal(`
            <div class="ord-modal-head"><b>Товар</b><button class="ord-x" type="button" aria-label="Закрыть">✕</button></div>
            <input class="ord-input" type="search" placeholder="Поиск по справочнику…" autocomplete="off" value="${ORD.esc(query || "")}">
            <div class="ord-pick-list"><div class="ord-empty">Начните вводить название</div></div>
        `);
        const input = m.el.querySelector("input");
        const box = m.el.querySelector(".ord-pick-list");
        let shown = [], seq = 0, timer = null, done = false;
        const finish = v => { if (done) return; done = true; m.close(); resolve(v); };
        m.el.querySelector(".ord-x").onclick = () => finish(null);
        m.el.parentNode.addEventListener("click", e => { if (e.target === m.el.parentNode) finish(null); });

        async function search() {
            const q = input.value.trim();
            const my = ++seq;
            if (q.length < 2) { box.innerHTML = `<div class="ord-empty">Начните вводить название</div>`; return; }
            try {
                const r = await ORD.api("GET", "/items?q=" + encodeURIComponent(q) + "&cp=" + encodeURIComponent(o.counterparty_guid));
                if (my !== seq) return;
                shown = r.items;
                box.innerHTML = shown.length ? shown.map((it, i) => `
                    <div class="ord-pick" data-i="${i}">
                        <span>${ORD.esc(it.name)}</span>
                        <small>${it.unit ? ORD.esc(it.unit) : ""}${it.n ? " · брал " + it.n + " раз" : ""} ${ORD.stockText(it.stock, it.unit)}</small>
                    </div>`).join("") : `<div class="ord-empty">Ничего не найдено</div>`;
                box.querySelectorAll(".ord-pick").forEach(p => { p.onclick = () => finish(shown[Number(p.dataset.i)]); });
            } catch (e) {
                if (my === seq) box.innerHTML = `<div class="ord-empty bad">${ORD.esc(e.message)}</div>`;
            }
        }
        input.oninput = () => { clearTimeout(timer); timer = setTimeout(search, 250); };
        if (input.value.trim().length >= 2) search();
        setTimeout(() => { input.focus(); input.select(); }, 50);
    });
}

/* Режим правки: заказ закреплён за менеджером (оператор ждёт), карточка продлевает раз в 30 с */
async function ordMyEdit(uuid) {
    let card;
    try {
        await ORD.api("POST", "/orders/" + encodeURIComponent(uuid) + "/edit-hold");
        card = await ORD.api("GET", "/orders/" + encodeURIComponent(uuid) + "?view=mine");
    } catch (e) {
        ORD.toast(e.message, "bad");
        ordMyOpen(uuid);
        return;
    }
    window.currentScreen = "ord_my_edit";
    window.ordMyCardUuid = uuid;
    window.ordMyEd = { uuid, order: card.order, units: card.units || [], version: card.order.lines_version,
        lines: card.lines.map(l => Object.assign({}, l)), dirty: false };
    ordMyEditRender();

    const beat = async () => {
        if (window.currentScreen !== "ord_my_edit" || !window.ordMyEd || window.ordMyEd.uuid !== uuid) return;
        try {
            await ORD.api("POST", "/orders/" + encodeURIComponent(uuid) + "/edit-hold");
        } catch (e) {
            if (window.currentScreen !== "ord_my_edit") return;
            ORD.toast(e.message, "bad");
            window.ordMyEd = null;
            ordMyOpen(uuid);
            return;
        }
        setTimeout(beat, 30000);
    };
    setTimeout(beat, 30000);
}

function ordMyEditRender() {
    const ed = window.ordMyEd;
    title.innerText = "Изменить позиции";
    const unitOpts = cur => (cur ? "" : `<option value="" selected>—</option>`) +
        ed.units.map(u => `<option ${u === cur ? "selected" : ""}>${ORD.esc(u)}</option>`).join("");

    container.innerHTML = `
        <div class="ord-page">
            <div class="ord-card">
                <div class="ord-list-top"><b>${ORD.esc(ed.order.counterparty_name)} ${ORD.cashChip(ed.order)}</b></div>
                <div class="ord-hint">Пока вы правите, оператор заказ не откроет. Сохраните, когда закончите.</div>
            </div>
            <div class="ord-card" id="ordMyEdLines">
                ${ed.lines.map((l, i) => `
                    <div class="ord-my-ed-line" data-i="${i}">
                        <div class="ord-my-ed-top">
                            ${ORD.matchDot(l.item_guid ? l.match_source : "none")}
                            <button type="button" class="ord-item-btn ${l.item_guid ? "" : "empty"}" data-act="pick">${l.item_guid ? ORD.esc(l.item_name) : "Выберите товар"}</button>
                            <button type="button" class="ord-del" data-act="del" aria-label="Удалить строку">✕</button>
                        </div>
                        ${l.source_text ? `<div class="ord-view-src">${ORD.esc(l.source_text)}</div>` : ""}
                        <div class="ord-my-ed-fields">
                            <input class="ord-input" data-f="qty" inputmode="decimal" placeholder="Кол-во" value="${ORD.esc(ORD.fmtQty(l.qty))}">
                            <select class="ord-input" data-f="unit">${unitOpts(l.unit)}</select>
                            <input class="ord-input" data-f="comment" placeholder="Комментарий" maxlength="1000" value="${ORD.esc(l.comment || "")}">
                        </div>
                    </div>`).join("") || `<div class="ord-empty">Строк нет</div>`}
                <button type="button" class="btn-secondary ord-add" id="ordMyEdAdd">+ Добавить позицию</button>
            </div>
            <div class="ord-actions sticky">
                <button type="button" class="btn-secondary" id="ordMyEdCancel">Отмена</button>
                <button type="button" class="ord-primary" id="ordMyEdSave">Сохранить</button>
            </div>
        </div>
    `;

    const box = document.getElementById("ordMyEdLines");
    box.addEventListener("input", e => {
        const row = e.target.closest(".ord-my-ed-line");
        if (!row || !e.target.dataset.f) return;
        ed.lines[Number(row.dataset.i)][e.target.dataset.f] = e.target.value;
        ed.dirty = true;
    });
    box.addEventListener("change", e => {
        const row = e.target.closest(".ord-my-ed-line");
        if (!row || e.target.dataset.f !== "unit") return;
        ed.lines[Number(row.dataset.i)].unit = e.target.value;
        ed.dirty = true;
    });
    box.addEventListener("click", async e => {
        const btn = e.target.closest("[data-act]");
        if (!btn) return;
        const i = Number(btn.closest(".ord-my-ed-line").dataset.i);
        if (btn.dataset.act === "del") {
            ed.lines.splice(i, 1);
            ed.dirty = true;
            ordMyEditRender();
            return;
        }
        const l = ed.lines[i];
        const it = await ordMyPickItem(ed.order, l.parsed_name || l.item_name || "");
        if (!it || it.guid === l.item_guid) return;
        Object.assign(l, { item_guid: it.guid, item_name: it.name, match_source: "manager" });
        if (!l.unit && it.unit) l.unit = it.unit;
        ed.dirty = true;
        ordMyEditRender();
    });

    document.getElementById("ordMyEdAdd").onclick = async () => {
        const it = await ordMyPickItem(ed.order, "");
        if (!it) return;
        ed.lines.push({ id: null, item_guid: it.guid, item_name: it.name, qty: "", unit: it.unit || "", comment: "",
            source_text: "", match_source: "added" });
        ed.dirty = true;
        ordMyEditRender();
        const rows = document.querySelectorAll(".ord-my-ed-line");
        const q = rows[rows.length - 1] && rows[rows.length - 1].querySelector('[data-f="qty"]');
        if (q) q.focus();
    };

    const leave = async () => {
        ORD.api("POST", "/orders/" + encodeURIComponent(ed.uuid) + "/unhold").catch(() => {});
        const uuid = ed.uuid;
        window.ordMyEd = null;
        ordMyOpen(uuid);
    };

    document.getElementById("ordMyEdCancel").onclick = async () => {
        if (ed.dirty && !(await ORD.ask("Выйти без сохранения? Правки пропадут.", "Выйти", "Остаться"))) return;
        leave();
    };

    document.getElementById("ordMyEdSave").onclick = async () => {
        const bad = ed.lines.findIndex(l => !l.item_guid || !(Number(String(l.qty).replace(",", ".")) > 0));
        if (bad >= 0) return ORD.toast("Строка " + (bad + 1) + ": выберите товар и укажите количество", "bad");
        const btn = document.getElementById("ordMyEdSave");
        btn.disabled = true;
        try {
            await ORD.api("POST", "/orders/" + encodeURIComponent(ed.uuid) + "/lines", {
                lines_version: ed.version,
                lines: ed.lines.map(l => ({
                    id: l.id || undefined, item_guid: l.item_guid, qty: String(l.qty).replace(",", "."),
                    unit: l.unit || null, comment: l.comment || "", source_text: l.source_text || "", parsed_name: l.parsed_name || ""
                }))
            });
            ORD.toast("Сохранено", "ok");
            leave();
        } catch (e) {
            ORD.toast(e.message, "bad");
            btn.disabled = false;
        }
    };
}
