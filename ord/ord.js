/*
 * Заказ текстом — общие функции экранов ord_new, ord_my, ord_review.
 * API сервера: /api/ord (модуль orders/ бэкенда).
 *
 * Работает и в PWA, и в браузере 1С (рабочее место оператора, /pwa/ord/embed/):
 * без fetch, ?., ??, alert/confirm/prompt — в 1С их нет или окно прячется и 1С зависает.
 * В 1С вход и пользователь — в памяти (ORD.setSession), а не в localStorage.
 */

(function () {
    "use strict";

    const API = "/api/ord";

    const STATUS = {
        new: { text: "Отправлен", cls: "wait" },
        processing: { text: "Отправлен", cls: "wait" },
        processed: { text: "Ждёт проверки", cls: "warn" },
        confirmed: { text: "Подтверждён", cls: "ok" },
        created: { text: "Создан в 1С", cls: "ok" },
        cancelled: { text: "Отменён", cls: "off" },
        error: { text: "Ошибка разбора", cls: "bad" }
    };

    const MATCH = {
        alias_cp: { text: "как раньше", cls: "ok", hint: "Этот клиент уже заказывал так" },
        alias: { text: "знакомый", cls: "ok", hint: "Так пишут и другие клиенты" },
        history: { text: "из истории", cls: "ok", hint: "Клиент берёт этот товар" },
        fuzzy: { text: "точно", cls: "ok", hint: "Название совпало" },
        llm: { text: "проверьте", cls: "warn", hint: "Товар выбрала нейросеть" },
        manual: { text: "вручную", cls: "info", hint: "Выбрано вручную" },
        added: { text: "добавил менеджер", cls: "mgr", hint: "Менеджер добавил позицию из справочника" },
        manager: { text: "менеджер", cls: "mgr", hint: "Товар выбрал менеджер" },
        none: { text: "не найден", cls: "bad", hint: "Выберите товар" }
    };

    function esc(value) {
        return String(value === null || value === undefined ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /* Сеанс: в PWA — localStorage, в 1С — память страницы (setSession). */
    let session = null;          // { jwt, user, onAuthError }

    function setSession(s) {
        session = s;
    }

    function token() {
        if (session) return session.jwt || "";
        try { return localStorage.getItem("jwt") || ""; } catch (_) { return ""; }
    }

    function authError() {
        if (session) { if (session.onAuthError) session.onAuthError(); return; }
        if (typeof logout === "function") logout();
    }

    /* GET/POST через XMLHttpRequest → { status, data } */
    function http(method, url, body) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open(method, url, true);
            xhr.setRequestHeader("Authorization", "Bearer " + token());
            if (body !== undefined) xhr.setRequestHeader("Content-Type", "application/json");
            xhr.onload = () => {
                let data = null;
                try { data = JSON.parse(xhr.responseText); } catch (_) { /* не JSON */ }
                resolve({ status: xhr.status, data });
            };
            xhr.onerror = () => reject(new Error("Нет связи с сервером"));
            xhr.ontimeout = () => reject(new Error("Сервер не отвечает"));
            xhr.timeout = 60000;
            xhr.send(body !== undefined ? JSON.stringify(body) : null);
        });
    }

    async function api(method, path, body) {
        const r = await http(method, API + path, body);

        if (r.status === 401) {
            authError();
            throw new Error("Войдите заново");
        }

        const data = r.data;
        if (r.status < 200 || r.status >= 300 || !data || data.success === false) {
            const e = new Error((data && data.message) || ("Ошибка " + r.status));
            e.status = r.status;
            e.data = data;          // например, duplicates при 409 «похоже на заказ, который уже есть»
            throw e;
        }
        return data;
    }

    function user() {
        if (session) return session.user || {};
        try { return JSON.parse(localStorage.getItem("user")) || {}; } catch (_) { return {}; }
    }

    function isOperator() {
        return ["admin", "operator", "staff"].includes(String(user().role || "").toLowerCase());   // staff — офис IDF, только из 1С
    }

    function toast(text, kind) {
        const el = document.createElement("div");
        el.className = "ord-toast " + (kind || "");
        el.textContent = text;
        document.body.appendChild(el);
        setTimeout(() => el.classList.add("show"), 10);
        setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 300); }, 3200);
    }

    /* дозаказ: строка над карточкой в списке */
    function addonChip(o) {
        return o && o.parent_uuid ? `<div class="ord-addon-mark">➕ Дозаказ к № ${esc(o.parent_doc_number || "")}</div>` : "";
    }

    /* «нал» у заказа на контрагента с наличным расчётом */
    function cashChip(o) {
        return o && o.cash ? `<span class="ord-chip warn small" title="Наличный расчёт">нал</span>` : "";
    }

    function statusChip(status) {
        const s = STATUS[status] || { text: status, cls: "off" };
        return `<span class="ord-chip ${s.cls}">${esc(s.text)}</span>`;
    }

    /* Статус заказа с тем, у кого он: «На проверке · Иванова», «Создан в 1С · № Ф…» */
    function orderChip(o) {
        if (o.status === "created" && o.parent_uuid) {
            return `<span class="ord-chip ok">Добавлен в № ${esc(o.doc_number || o.parent_doc_number || "")}</span>`;
        }
        if (o.status === "confirmed" && o.block_reason) {
            return `<span class="ord-chip bad" title="${esc(o.block_reason)}">⛔ Клиент заблокирован</span>`;
        }
        if (o.status === "processed" && o.review_name) {
            return `<span class="ord-chip check" title="Открыт ${esc(fmtTime(o.review_at))}">На проверке · ${esc(o.review_name)}</span>`;
        }
        return statusChip(o.status);
    }

    /*
     * Остаток товара (выгрузка 1С раз в 3 часа) — только подсказка, выбрать можно и с нулём/минусом.
     * qty/unit — сколько заказано: если в той же единице заказано больше остатка — «мало».
     */
    function stockText(stock, stockUnit, qty, unit) {
        if (stock === null || stock === undefined || stock === "") return "";
        const n = Number(stock);
        const low = n <= 0 || (qty && unit && stockUnit && unit === stockUnit && Number(String(qty).replace(",", ".")) > n);
        const su = stockUnit ? " " + stockUnit : "";
        const label = n === 0 ? "нет на складе" : "ост. " + (n < 0 ? "-" + fmtQty(-n) : fmtQty(n)) + su;
        const cls = n < 0 ? "neg" : low ? "low" : "";      // отрицательный остаток — красным
        return `<span class="ord-stock ${cls}" title="Остаток на складе (обновляется раз в 3 часа)">${esc(label)}${low && n > 0 ? " · мало" : ""}</span>`;
    }

    /* Цветной кружок в начале строки: зелёный — совпало, жёлтый — проверить, синий — вручную, красный — не найден */
    function matchDot(source) {
        const m = MATCH[source] || MATCH.none;
        return `<span class="ord-dot ${m.cls}" title="${esc(m.hint)}"></span>`;
    }

    function matchChip(source) {
        const m = MATCH[source] || MATCH.none;
        return `<span class="ord-chip small ${m.cls}" title="${esc(m.hint)}">${esc(m.text)}</span>`;
    }

    /* «2026-10-23» — как есть; время «2026-10-21T23:05:00Z» — в местном дне */
    function fmtDate(iso) {
        if (!iso) return "";
        let y, m, d;
        if (String(iso).length > 10) {
            const t = new Date(iso);
            y = String(t.getFullYear()); m = String(t.getMonth() + 1).padStart(2, "0"); d = String(t.getDate()).padStart(2, "0");
        } else {
            [y, m, d] = String(iso).split("-");
        }
        return d + "." + m + "." + y.slice(2);
    }

    function fmtTime(iso) {
        if (!iso) return "";
        const d = new Date(iso);
        return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    }

    function fmtWhen(o) {
        const parts = [];
        if (o.delivery_date) parts.push(fmtDate(o.delivery_date));
        if (o.time_from || o.time_to) parts.push((o.time_from || "…") + "–" + (o.time_to || "…"));
        return parts.join(" ");
    }

    /* количество для поля: 0.5 → «0,5». Набранное оператором «0,5» (строка с запятой) тоже понимаем —
       иначе после перерисовки экрана было «NaN»; непонятное показываем как набрано. */
    function fmtQty(q) {
        if (q === null || q === undefined || q === "") return "";
        const n = Number(String(q).trim().replace(",", "."));
        if (!isFinite(n)) return String(q);
        return String(Math.round(n * 1000) / 1000).replace(".", ",");
    }

    /* Автообновление экрана, пока он открыт. */
    function poll(screen, fn, ms) {
        const id = setInterval(() => {
            if (window.currentScreen !== screen || document.hidden) {
                if (window.currentScreen !== screen) clearInterval(id);
                return;
            }
            fn();
        }, ms);
        return id;
    }

    /* Черновик формы в браузере (на случай, если закрыли приложение). */
    const draft = {
        get(key) {
            try { return JSON.parse(localStorage.getItem("ord_draft_" + key)) || null; } catch (_) { return null; }
        },
        set(key, value) {
            try { localStorage.setItem("ord_draft_" + key, JSON.stringify(value)); } catch (_) { /* нет места */ }
        },
        clear(key) {
            try { localStorage.removeItem("ord_draft_" + key); } catch (_) { /* недоступно */ }
        }
    };

    /* Модальное окно: возвращает { el, close }. */
    function modal(html, cls) {
        const overlay = document.createElement("div");
        overlay.className = "ord-modal-overlay";
        overlay.innerHTML = `<div class="ord-modal ${cls || ""}">${html}</div>`;
        document.body.appendChild(overlay);
        const close = () => overlay.remove();
        overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
        return { el: overlay.querySelector(".ord-modal"), close };
    }

    /*
     * Выбор контрагента: менеджеру — только свои клиенты.
     * Окно открывается сразу (список грузится уже в нём), повторное нажатие не открывает второе окно,
     * список держится в памяти 10 минут.
     */
    const cpCache = {};          // "0" безнал / "1" наличные → { at, list, loaded }
    let cpPicking = null;        // уже открытое окно выбора

    async function loadCounterparties(cash) {
        const key = cash ? "1" : "0";
        const c = cpCache[key];
        if (c && Date.now() - c.at < 10 * 60 * 1000) return c;
        /* сервер отдаёт только тех, на кого можно передать заказ: свои клиенты (у отдельных РОПов — клиенты отдела),
           оператору — все; с галочкой «Наличные» — из файла наличных (Нр) */
        const r = await api("GET", "/counterparties" + (cash ? "?cash=1" : ""));
        const res = { at: Date.now(), list: Array.isArray(r.counterparties) ? r.counterparties : [], loaded: r.loaded !== false };
        cpCache[key] = res;
        return res;
    }

    /* opts.cash — наличные контрагенты (галочка «Наличные (Нр)» в новом заказе) */
    function pickCounterparty(opts) {
        const cash = Boolean(opts && opts.cash);
        if (cpPicking) return cpPicking.then(() => null);   // окно уже открыто

        cpPicking = new Promise(resolve => {
            const m = modal(`
                <div class="ord-modal-head">
                    <b>${cash ? "Контрагент — наличные" : "Контрагент"}</b>
                    <button class="ord-x" type="button" aria-label="Закрыть">✕</button>
                </div>
                <input class="ord-input" type="search" placeholder="Поиск…" autocomplete="off">
                <div class="ord-pick-list"><div class="ord-empty">Загрузка…</div></div>
            `);
            const input = m.el.querySelector("input");
            const box = m.el.querySelector(".ord-pick-list");
            let list = null;
            let loaded = true;
            let done = false;

            const finish = value => {
                if (done) return;
                done = true;
                m.close();
                cpPicking = null;
                resolve(value);
            };

            m.el.querySelector(".ord-x").onclick = () => finish(null);
            m.el.parentNode.addEventListener("click", e => { if (e.target === m.el.parentNode) finish(null); });

            function render() {
                if (!list) return;
                const q = input.value.trim().toLowerCase();
                const rows = list.filter(c =>
                    !q || String(c.name || "").toLowerCase().includes(q) || String(c.full_name || "").toLowerCase().includes(q)
                ).slice(0, 200);
                box.innerHTML = rows.length
                    ? rows.map((c, i) => `<div class="ord-pick" data-i="${i}">${esc(c.name)}</div>`).join("")
                    : `<div class="ord-empty">${list.length ? "Ничего не найдено"
                        : cash && !loaded ? "Наличные контрагенты ещё не выгружены из 1С"
                        : cash ? "У вас нет клиентов с наличным расчётом" : "У вас нет своих клиентов"}</div>`;
                box.querySelectorAll(".ord-pick").forEach(el => {
                    el.onclick = () => finish(rows[Number(el.dataset.i)]);
                });
            }

            input.oninput = render;
            setTimeout(() => input.focus(), 50);

            loadCounterparties(cash)
                .then(r => { list = r.list; loaded = r.loaded; render(); })
                .catch(e => { box.innerHTML = `<div class="ord-empty bad">${esc(e.message)}</div>`; });
        });

        return cpPicking;
    }

    /* ---------- выбор дня (запоминается на устройстве отдельно для каждого экрана) ---------- */

    function isoDay(d) {
        return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }

    function today() {
        return isoDay(new Date());
    }

    function shiftDay(iso, days) {
        const [y, m, d] = iso.split("-").map(Number);
        return isoDay(new Date(y, m - 1, d + days));
    }

    const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

    function dayLabel(iso) {
        const t = today();
        if (iso === t) return "сегодня";
        if (iso === shiftDay(t, 1)) return "завтра";
        if (iso === shiftDay(t, -1)) return "вчера";
        const [y, m, d] = iso.split("-").map(Number);
        return WEEKDAYS[new Date(y, m - 1, d).getDay()];
    }

    /* Рабочий день по умолчанию: с 0:00 до 19:00 — сегодня, с 19:00 — завтра (время устройства) */
    function workDay() {
        return new Date().getHours() >= 19 ? shiftDay(today(), 1) : today();
    }

    const day = {
        workDay,
        /* при открытии экрана (не при возврате из карточки) — поставить рабочий день */
        reset(key) {
            day.set(key, workDay());
        },
        get(key) {
            let v = null;
            try { v = localStorage.getItem("ord_day_" + key); } catch (_) { /* недоступно */ }
            return /^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : today();
        },
        set(key, value) {
            try { localStorage.setItem("ord_day_" + key, value); } catch (_) { /* недоступно */ }
        },
        html(key) {
            const v = day.get(key);
            return `
                <div class="ord-day" data-key="${esc(key)}">
                    <button type="button" class="ord-day-btn" data-shift="-1" aria-label="Предыдущий день">‹</button>
                    <label class="ord-day-pick">
                        <span class="ord-day-text">${esc(fmtDate(v))} · ${esc(dayLabel(v))}</span>
                        <input type="date" value="${esc(v)}" aria-label="День доставки">
                    </label>
                    <button type="button" class="ord-day-btn" data-shift="1" aria-label="Следующий день">›</button>
                    <button type="button" class="ord-day-today ${v === today() ? "hidden" : ""}">Сегодня</button>
                </div>`;
        },
        /* root — контейнер с day.html(key); onChange(iso) вызывается при смене дня */
        bind(root, key, onChange) {
            const box = root.querySelector('.ord-day[data-key="' + key + '"]');
            if (!box) return;
            const input = box.querySelector("input");
            const apply = v => {
                if (!/^\d{4}-\d{2}-\d{2}$/.test(v || "")) return;
                day.set(key, v);
                input.value = v;
                box.querySelector(".ord-day-text").textContent = fmtDate(v) + " · " + dayLabel(v);
                box.querySelector(".ord-day-today").classList.toggle("hidden", v === today());
                onChange(v);
            };
            box.querySelectorAll(".ord-day-btn").forEach(b => {
                b.onclick = () => apply(shiftDay(input.value || today(), Number(b.dataset.shift)));
            });
            box.querySelector(".ord-day-today").onclick = () => apply(today());
            input.onchange = () => apply(input.value);
        }
    };

    /* Вопрос «да/нет» своим окном (вместо confirm). Возвращает Promise<boolean>. */
    function ask(text, yesText, noText) {
        return new Promise(resolve => {
            const m = modal(`
                <div class="ord-ask-text">${esc(text)}</div>
                <div class="ord-actions">
                    <button type="button" class="btn-secondary" data-a="no">${esc(noText || "Отмена")}</button>
                    <button type="button" class="ord-primary" data-a="yes">${esc(yesText || "Да")}</button>
                </div>
            `, "small");
            let done = false;
            const finish = v => { if (done) return; done = true; m.close(); resolve(v); };
            m.el.querySelector('[data-a="yes"]').onclick = () => finish(true);
            m.el.querySelector('[data-a="no"]').onclick = () => finish(false);
            m.el.parentNode.addEventListener("click", e => { if (e.target === m.el.parentNode) finish(false); });
        });
    }

    /* Ссылка v8:… — её перехватывает обработчик поля HTML в 1С (в PWA ничего не делает). */
    function v8(href) {
        if (!window.ORD_V8) return;
        const a = document.createElement("a");
        a.href = href;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => a.remove(), 1000);
    }

    /* Заменить содержимое, только если оно изменилось (автообновление без мигания) */
    window.ordSetHtml = function (el, html) {
        if (!el || el.__ordHtml === html) return;
        el.__ordHtml = html;
        el.innerHTML = html;
    };

    /* «Иванова, 31.10 21:10, совпадает 11 из 12 позиций, На проверке» — похожий заказ */
    function similarText(d) {
        return [
            d.author_name || "—",
            fmtDate(d.created_at) + " " + fmtTime(d.created_at),
            "совпадает " + d.matched + " из " + d.total + " поз.",
            (STATUS[d.status] || { text: d.status }).text + (d.doc_number ? " № " + d.doc_number : "")
        ].join(", ");
    }

    window.ORD = {
        api, user, isOperator, toast, esc, modal, draft, poll, pickCounterparty, day, ask, v8, setSession,
        statusChip, orderChip, cashChip, addonChip, shiftDay, matchChip, matchDot, stockText, fmtDate, fmtTime, fmtWhen, fmtQty, similarText, STATUS, MATCH
    };
})();
