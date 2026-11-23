/*
 * Новый заказ текстом. Шапка — поля формы, позиции — свободный текст.
 * Менеджер / РОП — только свои клиенты, после отправки — «Мои заказы».
 * Оператор / админ (в 1С и в «Проверке заказов») — любой контрагент, после отправки сразу карточка проверки.
 */

/*
 * Браузер 1С (старый WebKit) не умеет поля type="date" / type="time" — показывает пустой текст без подсказки.
 * Там поля текстовые: дата «дд.мм.гггг», время «чч:мм», ввод в любом разумном виде приводится к нужному.
 */
function ordInputSupports(type) {
    const el = document.createElement("input");
    el.setAttribute("type", type);
    return el.type === type;
}

/* «9», «900», «0930», «9:00», «9.00», «9-00» → «09:00»; пусто → ""; ерунда → null */
function ordParseTime(value) {
    const s = String(value || "").trim();
    if (!s) return "";
    let h, m;
    let r = s.match(/^(\d{1,2})\s*[:.,\-\s]\s*(\d{1,2})$/);
    if (r) { h = +r[1]; m = +r[2]; }
    else if ((r = s.match(/^(\d{1,2})$/))) { h = +r[1]; m = 0; }
    else if ((r = s.match(/^(\d{1,2})(\d{2})$/))) { h = +r[1]; m = +r[2]; }
    else return null;
    if (h > 23 || m > 59) return null;
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
}

/* «01.11.2026», «1.11.26», «01.11», «2026-11-01» → «2026-11-01»; пусто → ""; ерунда → null.
   Без года — ближайшая такая дата (01.01 в декабре — следующий год). */
function ordParseDate(value) {
    const s = String(value || "").trim();
    if (!s) return "";
    let y, mo, d;
    let r = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (r) { y = +r[1]; mo = +r[2]; d = +r[3]; }
    else if ((r = s.match(/^(\d{1,2})[.\/\-,\s](\d{1,2})(?:[.\/\-,\s](\d{2}|\d{4}))?\.?$/))) {
        d = +r[1]; mo = +r[2];
        if (r[3]) y = r[3].length === 2 ? 2000 + +r[3] : +r[3];
        else {
            const now = new Date();
            y = now.getFullYear();
            const guess = new Date(y, mo - 1, d);
            if (guess.getTime() < now.getTime() - 60 * 24 * 3600 * 1000) y++;   // давно прошла — следующий год
        }
    } else return null;
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    const p = n => (n < 10 ? "0" : "") + n;
    return y + "-" + p(mo) + "-" + p(d);
}

function ordDateRu(iso) {
    const r = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return r ? r[3] + "." + r[2] + "." + r[1] : String(iso || "");
}

/*
 * Дозаказ к заказу, уже созданному в 1С: клиент и день доставки — из заказа, только позиции.
 * Открывается из карточки заказа (window.ordNewAddon = заказ).
 */
function ordNewAddonScreen(parent) {
    window.currentScreen = "ord_new";
    title.innerText = "Дозаказ";
    const key = "addon_" + parent.uuid;
    const d = ORD.draft.get(key) || {};
    const back = () => { window.ordNewAddon = null; ordMyOpen(parent.uuid); };

    container.innerHTML = `
        <div class="ord-page">
            <div class="ord-card ord-addon">
                <div class="ord-addon-title">➕ Дозаказ к заказу № ${ORD.esc(parent.doc_number || "")}</div>
                <div class="ord-list-top"><b>${ORD.esc(parent.counterparty_name)} ${ORD.cashChip(parent)}</b></div>
                <div class="ord-list-meta"><span>Доставка: ${ORD.esc(ORD.fmtWhen(parent) || "как в заказе")}</span></div>
                <div class="ord-hint">Позиции добавятся в этот же заказ в 1С с отметкой «Дозаказ». Клиент и дата — как в заказе.</div>
            </div>
            <div class="ord-card">
                <label class="ord-label">Позиции дозаказа</label>
                <textarea id="ordText" class="ord-textarea" rows="10" maxlength="10000"
                          placeholder="Каждая позиция с новой строки">${ORD.esc(d.text || "")}</textarea>
            </div>
            <div class="ord-actions">
                <button type="button" class="btn-secondary" id="ordBack">Назад</button>
                <button type="button" id="ordSend" class="ord-primary">Отправить дозаказ</button>
            </div>
        </div>
    `;
    const ta = document.getElementById("ordText");
    ta.addEventListener("input", () => ORD.draft.set(key, { text: ta.value }));
    document.getElementById("ordBack").onclick = back;
    document.getElementById("ordSend").onclick = async () => {
        const text = ta.value.trim();
        if (!text) return ORD.toast("Введите позиции дозаказа", "bad");
        const btn = document.getElementById("ordSend");
        btn.disabled = true;
        try {
            await ORD.api("POST", "/orders", { parent_uuid: parent.uuid, text });
            ORD.draft.clear(key);
            ORD.toast("Дозаказ принят", "ok");
            back();
        } catch (e) {
            ORD.toast(e.message, "bad");
            btn.disabled = false;
        }
    };
    setTimeout(() => ta.focus(), 50);
}

registerScreen("ord_new", function () {

    if (window.ordNewAddon) { ordNewAddonScreen(window.ordNewAddon); return; }

    window.currentScreen = "ord_new";
    title.innerText = "Новый заказ";

    /* откуда открыли: из «Проверки заказов» — режим оператора (после отправки — карточка проверки),
       из «Моих заказов» (в т. ч. админ через «Передать заказ») — как у менеджера */
    const op = window.ordNewMode ? window.ordNewMode === "op" : ORD.isOperator();
    const draftKey = op ? "new_op" : "new";
    const backScreen = op ? "ord_review" : "ord_my";

    const d = ORD.draft.get(draftKey) || {};
    /* дата доставки — по правилу (до 19:00 сегодня, после — завтра), даже если в черновике была другая */
    const defDate = ORD.day.workDay();
    const nativeDate = ordInputSupports("date");
    const nativeTime = ordInputSupports("time");
    const textPh = window.ORD_V8
        ? "Каждая позиция с новой строки, как прислал клиент. Например: Помидоры 1 кг; Огурцы 1,5 кг; Петрушка 1 пучок"
        : "Каждая позиция с новой строки, как прислал клиент:&#10;Помидоры 1 кг&#10;Огурцы 1,5 кг&#10;Петрушка 1 пучок&#10;Кинза 200 г";

    container.innerHTML = `
        <div class="ord-page">

            <div class="ord-card">
                <div class="ord-cp-head">
                    <label class="ord-label">Контрагент</label>
                    <label class="ord-check"><input type="checkbox" id="ordCash" ${d.cp && d.cp.cash ? "checked" : ""}> Наличные</label>
                </div>
                <button type="button" id="ordCp" class="ord-select ${d.cp ? "" : "empty"}">
                    ${d.cp ? ORD.esc(d.cp.name) : "Выберите контрагента"}
                </button>

                <div class="ord-row3">
                    <div>
                        <label class="ord-label">Дата доставки</label>
                        ${nativeDate
                            ? `<input type="date" id="ordDate" class="ord-input" value="${ORD.esc(defDate)}">`
                            : `<input type="text" id="ordDate" class="ord-input" maxlength="10" placeholder="дд.мм.гггг" value="${ORD.esc(ordDateRu(defDate))}">`}
                    </div>
                    <div>
                        <label class="ord-label">С</label>
                        <input type="${nativeTime ? "time" : "text"}" id="ordFrom" class="ord-input" maxlength="5" placeholder="чч:мм" value="${ORD.esc(d.from || "")}">
                    </div>
                    <div>
                        <label class="ord-label">По</label>
                        <input type="${nativeTime ? "time" : "text"}" id="ordTo" class="ord-input" maxlength="5" placeholder="чч:мм" value="${ORD.esc(d.to || "")}">
                    </div>
                </div>

                <label class="ord-label">Комментарий для склада</label>
                <input type="text" id="ordStore" class="ord-input" maxlength="1000"
                       placeholder="Качество, упаковка…" value="${ORD.esc(d.store || "")}">

                <label class="ord-label">Комментарий для водителя</label>
                <input type="text" id="ordComment" class="ord-input" maxlength="1000"
                       placeholder="Телефон для связи, адрес, оплата…" value="${ORD.esc(d.comment || "")}">
            </div>

            <div class="ord-card">
                <label class="ord-label">Позиции заказа</label>
                <textarea id="ordText" class="ord-textarea" rows="12" maxlength="10000"
                          placeholder="${textPh}">${ORD.esc(d.text || "")}</textarea>
                <div class="ord-hint">Можно вставить сообщение клиента как есть. Сервер сам разберёт товары, количество и единицы, оператор проверит.</div>
            </div>

            <div class="ord-actions">
                <button type="button" class="btn-secondary" id="ordBack">${op ? "К списку" : "Мои заказы"}</button>
                <button type="button" id="ordSend" class="ord-primary">Отправить заказ</button>
            </div>
        </div>
    `;

    let cp = d.cp || null;

    /* текстовые дата и время (браузер 1С): при выходе из поля — привести к виду, ерунду подсветить */
    const fixField = (id, parse, show) => {
        const el = document.getElementById(id);
        if (el.type !== "text") return;
        el.addEventListener("blur", () => {
            const v = parse(el.value);
            el.classList.toggle("bad", v === null);
            if (v !== null) el.value = show ? show(v) : v;
            save();
        });
        el.addEventListener("input", () => el.classList.remove("bad"));
    };
    fixField("ordDate", ordParseDate, ordDateRu);
    fixField("ordFrom", ordParseTime);
    fixField("ordTo", ordParseTime);

    /* значения для сервера: дата «гггг-мм-дд», время «чч:мм»; ошибка — null */
    const valueOf = id => {
        const el = document.getElementById(id);
        if (id === "ordDate") return el.type === "text" ? ordParseDate(el.value) : el.value;
        return el.type === "text" ? ordParseTime(el.value) : el.value;
    };

    const save = () => ORD.draft.set(draftKey, {
        cp,
        date: document.getElementById("ordDate").value,
        from: document.getElementById("ordFrom").value,
        to: document.getElementById("ordTo").value,
        store: document.getElementById("ordStore").value,
        comment: document.getElementById("ordComment").value,
        text: document.getElementById("ordText").value
    });

    ["ordDate", "ordFrom", "ordTo", "ordStore", "ordComment", "ordText"].forEach(id =>
        document.getElementById(id).addEventListener("input", save));

    /* галочка «Наличные (Нр)»: выбор из другого списка; переключили после выбора — клиент сбрасывается */
    const cashBox = document.getElementById("ordCash");
    cashBox.onchange = () => {
        if (cp && Boolean(cp.cash) !== cashBox.checked) {
            cp = null;
            const b = document.getElementById("ordCp");
            b.textContent = "Выберите контрагента";
            b.classList.add("empty");
            save();
        }
    };

    document.getElementById("ordCp").onclick = async () => {
        const picked = await ORD.pickCounterparty({ cash: cashBox.checked });
        if (!picked) return;
        cp = { guid: picked.guid, name: picked.name, cash: cashBox.checked };
        const b = document.getElementById("ordCp");
        b.textContent = picked.name;
        b.classList.remove("empty");
        save();
    };

    document.getElementById("ordBack").onclick = () => openScreen(backScreen);

    document.getElementById("ordSend").onclick = async () => {
        const text = document.getElementById("ordText").value.trim();
        if (!cp) return ORD.toast("Выберите контрагента", "bad");
        if (!text) return ORD.toast("Введите позиции заказа", "bad");

        const date = valueOf("ordDate");
        const from = valueOf("ordFrom");
        const to = valueOf("ordTo");
        const wrong = [[date, "ordDate", "Дата доставки: например 01.11.2026"],
            [from, "ordFrom", "Время «С»: например 09:00"], [to, "ordTo", "Время «По»: например 18:30"]]
            .filter(x => x[0] === null);
        if (wrong.length) {
            wrong.forEach(x => document.getElementById(x[1]).classList.add("bad"));
            return ORD.toast(wrong[0][2], "bad");
        }

        const btn = document.getElementById("ordSend");
        btn.disabled = true;
        btn.textContent = "Отправка…";

        const body = {
                counterparty_guid: cp.guid,
                counterparty_name: cp.name,
                delivery_date: date || null,
                time_from: from || null,
                time_to: to || null,
                store_comment: document.getElementById("ordStore").value.trim(),
                comment: document.getElementById("ordComment").value.trim(),
                text
        };

        try {
            let r;
            try {
                r = await ORD.api("POST", "/orders", body);
            } catch (e) {
                /* похожий заказ на этот день уже есть — спросить; «Отправить» — повтор с force */
                const list = e.status === 409 && e.data && e.data.duplicates;
                if (!list || !list.length) throw e;
                const text = "Похоже на заказ, который уже есть у «" + cp.name + "»:\n\n" +
                    list.map(d => "• " + ORD.similarText(d)).join("\n") +
                    "\n\nВсё равно отправить?";
                if (!(await ORD.ask(text, "Отправить", "Не отправлять"))) {
                    btn.disabled = false;
                    btn.textContent = "Отправить заказ";
                    return;
                }
                body.force = true;
                r = await ORD.api("POST", "/orders", body);
            }
            ORD.draft.clear(draftKey);
            ORD.toast("Заказ принят", "ok");
            if (op && typeof ordRvOpen === "function") ordRvOpen(r.order.uuid);   // сразу в проверку
            else openScreen(backScreen);
        } catch (e) {
            ORD.toast(e.message, "bad");
            btn.disabled = false;
            btn.textContent = "Отправить заказ";
        }
    };
});
