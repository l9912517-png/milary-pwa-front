/*
 * Проверка контрагента по ИНН — общее для экранов counterparty_check (менеджер) и checks_journal (директор, админ):
 * запросы к /api/chk, проверка ИНН, отчёт со светофором.
 */
(function () {
    "use strict";

    const API = "/api/chk";

    function esc(value) {
        return String(value === null || value === undefined ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    async function api(method, path, body) {
        const token = localStorage.getItem("jwt") || "";
        const headers = { "Authorization": "Bearer " + token };
        if (body !== undefined) headers["Content-Type"] = "application/json";

        let res;
        try {
            res = await fetch(API + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
        } catch (_) {
            throw new Error("Нет связи с сервером");
        }
        if (res.status === 401) {
            if (typeof logout === "function") logout();
            throw new Error("Войдите заново");
        }
        let data = null;
        try { data = await res.json(); } catch (_) { /* не JSON */ }
        if (!res.ok || !data || data.success === false) {
            const e = new Error((data && data.message) || ("Ошибка " + res.status));
            e.status = res.status;
            throw e;
        }
        return data;
    }

    function user() {
        try { return JSON.parse(localStorage.getItem("user")) || {}; } catch (_) { return {}; }
    }

    function role() {
        return String(user().role || "").toLowerCase();
    }

    /* кто проверяет и кто видит журнал — как на сервере (counterparty-check/config.js) */
    const canCheck = () => ["manager", "rop", "admin"].includes(role());
    const seesJournal = () => ["admin", "director"].includes(role());

    /* Контрольные цифры ИНН: 'company' (10 цифр), 'ip' (12) или null */
    function innKind(inn) {
        const d = String(inn).split("").map(Number);
        const sum = w => w.reduce((s, k, i) => s + k * d[i], 0) % 11 % 10;
        if (/^\d{10}$/.test(inn)) return sum([2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[9] ? "company" : null;
        if (/^\d{12}$/.test(inn)) {
            return sum([7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[10] &&
                sum([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8]) === d[11] ? "ip" : null;
        }
        return null;
    }

    /* время с сервера — UTC без зоны или ISO */
    function parseTime(s) {
        const t = String(s || "");
        const d = new Date(/Z|[+-]\d\d:?\d\d$/.test(t) ? t : t.replace(" ", "T") + "Z");
        return isNaN(d) ? null : d;
    }

    const p2 = n => (n < 10 ? "0" : "") + n;

    function fmtDateTime(s) {
        const d = parseTime(s);
        if (!d) return "";
        return p2(d.getDate()) + "." + p2(d.getMonth() + 1) + "." + d.getFullYear() + " " + p2(d.getHours()) + ":" + p2(d.getMinutes());
    }

    function fmtDate(s) {
        const r = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
        return r ? r[3] + "." + r[2] + "." + r[1] : esc(s || "");
    }

    function rub(n) {
        const v = Math.round(Number(n) || 0);
        return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0") + "\u00a0₽";
    }

    const LEVEL = {
        green: { text: "Без замечаний" },
        yellow: { text: "Есть на что посмотреть" },
        red: { text: "Риск" }
    };

    function dot(level) {
        return `<span class="chk-dot ${esc(level)}"></span>`;
    }

    /* Строка списка проверок (мои / журнал) */
    function listRow(c, withUser) {
        const sub = [
            "ИНН " + esc(c.inn),
            esc(fmtDateTime(c.created_at)),
            withUser ? esc(c.user_name || "") : ""
        ].filter(Boolean).join(" · ");
        return `
            <div class="chk-list-row" data-chk-id="${esc(c.id)}">
                ${dot(c.level)}
                <div class="chk-list-main">
                    <div class="chk-list-name">${esc(c.name || c.inn)}${c.cached ? `<span class="chk-tag">повтор</span>` : ""}</div>
                    <div class="chk-list-sub">${sub}</div>
                </div>
            </div>`;
    }

    /* Владельцы, связи, лицензии, налоги, контакты — из той же карточки компании */
    function extrasHtml(r) {
        let html = "";
        const row = (label, value) => value ? `<div class="chk-item"><div class="chk-item-sub">${esc(label)}</div><div>${value}</div></div>` : "";

        const t = r.taxes || {};
        const about = [
            row("Размер (реестр МСП)", esc(r.msp || "")),
            row("Налоговый режим", esc((t.regimes || []).join(", "))),
            row("Уплачено налогов" + (t.year ? " за " + t.year : ""), t.paid ? rub(t.paid) : ""),
            row("Уставный капитал", r.capital ? rub(r.capital) : ""),
            (r.okvedExtra || []).length ? `<details class="chk-item"><summary class="chk-item-sub">Другие виды деятельности: ${esc(r.okvedExtra.length)}</summary><div>${r.okvedExtra.map(esc).join("<br>")}</div></details>` : ""
        ].join("");
        if (about) html += `<div class="chk-card"><div class="chk-sec-title">🏢 О компании</div>${about}</div>`;

        const own = (r.founders || []).map(f => `
            <div class="chk-item">
                <div class="chk-item-top"><span>${esc(f.name)}</span><span class="chk-item-sum">${esc(f.share || "")}</span></div>
                ${f.inn ? `<div class="chk-item-sub">ИНН ${esc(f.inn)}${f.kind === "org" ? " · организация" : ""}</div>` : ""}
            </div>`).join("");
        const rel = (r.related || []).map(x => `
            <div class="chk-item">
                <div>${esc(x.name || x.inn)}</div>
                <div class="chk-item-sub">${[x.inn ? "ИНН " + esc(x.inn) : "", esc(x.status), x.via ? "через " + esc(x.via) : ""].filter(Boolean).join(" · ")}</div>
            </div>`).join("");
        if (own || rel) {
            html += `
            <div class="chk-card">
                ${own ? `<div class="chk-sec-title">👤 Учредители</div>${own}` : ""}
                ${rel ? `<div class="chk-sec-title" style="margin-top:${own ? 12 : 0}px">🔗 Связанные компании (${esc(r.related.length)})</div>
                    <div class="chk-hint" style="margin-top:0">Другие фирмы тех же учредителей — часто это другие точки того же владельца.</div>${rel}` : ""}
            </div>`;
        }

        if ((r.licenses || []).length) {
            html += `
            <div class="chk-card">
                <div class="chk-sec-title">📜 Лицензии</div>
                ${r.licenses.map(l => `
                    <div class="chk-item">
                        <div>${esc((l.kinds || []).join("; ") || "Лицензия")}</div>
                        <div class="chk-item-sub">${[l.number ? "№ " + esc(l.number) : "", l.date ? "с " + fmtDate(l.date) : "", l.until ? "до " + fmtDate(l.until) : "", esc(l.issuer)].filter(Boolean).join(" · ")}</div>
                    </div>`).join("")}
            </div>`;
        }

        const k = r.contacts || {};
        const cont = [
            row("Телефон", (k.phones || []).map(p => `<a href="tel:${esc(p.replace(/[^\d+]/g, ""))}">${esc(p)}</a>`).join(", ")),
            row("Почта", (k.emails || []).map(m => `<a href="mailto:${esc(m)}">${esc(m)}</a>`).join(", ")),
            row("Сайт", k.site ? `<a href="${esc(/^https?:/i.test(k.site) ? k.site : "http://" + k.site)}" target="_blank" rel="noopener">${esc(k.site)}</a>` : "")
        ].join("");
        if (cont) html += `<div class="chk-card"><div class="chk-sec-title">📞 Контакты из реестров</div>${cont}</div>`;

        return html;
    }

    /* Полный отчёт по проверке */
    function reportHtml(c) {
        const r = c.report || {};
        const lv = LEVEL[c.level] || LEVEL.yellow;
        const meta = [
            ["ИНН", r.inn], [r.kind === "ip" ? "ОГРНИП" : "ОГРН", r.ogrn], ["Статус", r.status],
            ["Зарегистрирована", r.regDate ? fmtDate(r.regDate) : ""], ["Руководитель", r.director],
            ["Адрес", r.address], ["Деятельность", r.okved]
        ].filter(x => x[1]).map(x => `${esc(x[0])}: <b>${x[0] === "Зарегистрирована" ? x[1] : esc(x[1])}</b>`).join("<br>");

        const reasons = (r.reasons || []).length
            ? `<ul class="chk-reasons">${r.reasons.map(x => `<li>${dot(x.level)}<span>${esc(x.text)}</span></li>`).join("")}</ul>`
            : `<div class="chk-hint">Судов о взыскании, долгов у приставов и сообщений о банкротстве не найдено.</div>`;

        let html = `
            <div class="chk-card">
                <div class="chk-verdict ${esc(c.level)}"><span class="chk-dot big ${esc(c.level)}"></span><span>${esc(lv.text)}</span></div>
                <div class="chk-name">${esc(r.name || c.name)}</div>
                ${r.fullName && r.fullName !== r.name ? `<div class="chk-meta">${esc(r.fullName)}</div>` : ""}
                <div class="chk-meta" style="margin-top:4px">${meta}</div>
                ${reasons}
                <div class="chk-hint">Проверено ${esc(fmtDateTime(c.checked_at || c.created_at))}${c.cached ? " — сохранённый результат, проверка не списана" : ""}${c.user_name && seesJournal() ? " · " + esc(c.user_name) : ""}</div>
            </div>`;

        const cs = r.cases;
        if (cs) {
            html += `
            <div class="chk-card">
                <div class="chk-sec-title">⚖️ Суды, где компания — ответчик</div>
                <div class="chk-sec-sub">За ${esc(cs.years)} года: <b>${esc(cs.total)}</b>${cs.totalSum ? " на " + rub(cs.totalSum) : ""}. За 12 месяцев: <b>${esc(cs.year)}</b>${cs.year ? " на " + rub(cs.yearSum) : ""}.</div>
                ${(cs.list || []).map(x => `
                    <div class="chk-item">
                        <div class="chk-item-top">
                            <span>${fmtDate(x.date)} · ${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.number)}</a>` : esc(x.number)}</span>
                            <span class="chk-item-sum">${x.sum ? rub(x.sum) : ""}</span>
                        </div>
                        <div class="chk-item-sub">Истец: ${esc((x.plaintiffs || []).join(", ") || "—")}</div>
                    </div>`).join("")}
                ${cs.total > (cs.list || []).length || cs.partial ? `<div class="chk-hint">Показаны последние ${(cs.list || []).length}. Все дела — на kad.arbitr.ru по ИНН.</div>` : ""}
            </div>`;
        }

        const su = r.sued;
        if (su && su.total) {
            html += `
            <div class="chk-card">
                <div class="chk-sec-title">📨 Суды, где компания — истец</div>
                <div class="chk-sec-sub">За ${esc(cs ? cs.years : 3)} года: <b>${esc(su.total)}</b>${su.totalSum ? " на " + rub(su.totalSum) : ""}. Кого судила сама — часто это её клиенты или поставщики.</div>
                ${(su.list || []).map(x => `
                    <div class="chk-item">
                        <div class="chk-item-top">
                            <span>${fmtDate(x.date)} · ${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.number)}</a>` : esc(x.number)}</span>
                            <span class="chk-item-sum">${x.sum ? rub(x.sum) : ""}</span>
                        </div>
                        <div class="chk-item-sub">Ответчик: ${esc((x.defendants || []).join(", ") || "—")}</div>
                    </div>`).join("")}
            </div>`;
        }

        const en = r.enforcements;
        if (r.kind === "ip") {
            html += `
            <div class="chk-card">
                <div class="chk-sec-title">👮 Приставы</div>
                <div class="chk-hint" style="margin-top:0">По ИП долги у приставов этим сервисом не проверяются. При необходимости — fssp.gov.ru, поиск по ФИО и региону.</div>
            </div>`;
        } else if (en) {
            html += `
            <div class="chk-card">
                <div class="chk-sec-title">👮 Приставы (ФССП)</div>
                <div class="chk-sec-sub">${en.open ? `Незавершённых производств: <b>${esc(en.open)}</b>, остаток долга <b>${rub(en.rest)}</b>` : "Незавершённых производств нет"}${en.total > en.open ? ` <span class="chk-item-sub">(всего было ${esc(en.total)})</span>` : ""}</div>
                ${(en.list || []).map(x => `
                    <div class="chk-item">
                        <div class="chk-item-top">
                            <span>${fmtDate(x.date)} · ${esc(x.subject || "—")}</span>
                            <span class="chk-item-sum">${rub(x.rest)}</span>
                        </div>
                        <div class="chk-item-sub">${esc(x.number)}${x.sum && x.sum !== x.rest ? " · было " + rub(x.sum) : ""}</div>
                    </div>`).join("")}
            </div>`;
        }

        if ((r.bankruptcy || []).length) {
            html += `
            <div class="chk-card">
                <div class="chk-sec-title">📉 Банкротство (ЕФРСБ)</div>
                ${r.bankruptcy.map(x => `
                    <div class="chk-item">
                        <div>${fmtDate(x.date)} · ${esc(x.type || "сообщение")}</div>
                        ${x.case ? `<div class="chk-item-sub">Дело ${esc(x.case)}</div>` : ""}
                    </div>`).join("")}
            </div>`;
        }

        html += extrasHtml(r);

        if (c.raw !== undefined) {
            html += `
            <details class="chk-card chk-raw">
                <summary>Все данные Checko (видит только админ)</summary>
                <pre>${esc(JSON.stringify(c.raw, null, 2) || "нет — проверка сделана до сохранения полного ответа")}</pre>
            </details>`;
        }

        html += `<div class="chk-hint" style="text-align:center">Данные Checko: ЕГРЮЛ/ЕГРИП, картотека арбитражных дел, ФССП, ЕФРСБ. Новые суды появляются с задержкой 1–2 недели.</div>`;
        return html;
    }

    window.CHK = { api, esc, user, role, canCheck, seesJournal, innKind, fmtDateTime, fmtDate, rub, dot, listRow, reportHtml, LEVEL };
})();
