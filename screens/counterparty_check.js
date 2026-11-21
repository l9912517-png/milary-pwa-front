/*
 * Проверка контрагента по ИНН (менеджер и РОП — 2 проверки в день, админ — без лимита).
 * Открывается из «Разработок»: кнопка «Проверить по ИНН». С карточками разработок не связана.
 */

registerScreen("counterparty_check", async function () {

    window.currentScreen = "counterparty_check";
    title.innerText = "Проверка по ИНН";

    const esc = CHK.esc;

    container.innerHTML = `
        <div class="chk-page">
            <div class="chk-card">
                <div class="chk-row">
                    <input id="chkInn" class="chk-input" type="text" inputmode="numeric" autocomplete="off"
                           maxlength="14" placeholder="ИНН, 10 или 12 цифр">
                    <button type="button" id="chkGo" class="chk-btn">Проверить</button>
                </div>
                <div id="chkQuota" class="chk-quota"></div>
                <div class="chk-hint">Суды о взыскании долга, приставы, банкротство и статус в налоговой.
                    Тот же ИНН в течение недели показывается из сохранённой проверки — бесплатно и без списания.</div>
            </div>

            <div id="chkResult"></div>

            <div class="chk-card">
                <div class="chk-sec-title">Мои проверки</div>
                <div id="chkHistory" class="chk-hint" style="margin-top:0">Загрузка…</div>
            </div>

            <button type="button" id="chkBack" class="chk-btn secondary wide">← Разработки</button>
        </div>
    `;

    const input = document.getElementById("chkInn");
    const go = document.getElementById("chkGo");
    const result = document.getElementById("chkResult");
    const quotaEl = document.getElementById("chkQuota");
    const historyEl = document.getElementById("chkHistory");

    document.getElementById("chkBack").onclick = () => openScreen("developments");

    let configured = true;

    function showQuota(q) {
        if (!configured) {
            quotaEl.className = "chk-quota";
            quotaEl.innerHTML = `<div class="chk-warn">Проверка пока не настроена (нет ключа Checko). Сообщите администратору.</div>`;
            return;
        }
        if (!q) return;
        if (q.unlimited) {
            quotaEl.className = "chk-quota";
            quotaEl.textContent = "Без лимита";
            return;
        }
        quotaEl.className = "chk-quota" + (q.remaining ? "" : " none");
        quotaEl.textContent = q.remaining
            ? "Осталось сегодня: " + q.remaining + " из " + q.limit
            : "На сегодня проверки закончились. Повтор уже проверенного ИНН — можно.";
    }

    function showHistory(list) {
        if (!list || !list.length) {
            historyEl.className = "chk-hint";
            historyEl.textContent = "Пока не было";
            return;
        }
        historyEl.className = "";
        historyEl.innerHTML = list.map(c => CHK.listRow(c, false)).join("");
        historyEl.querySelectorAll("[data-chk-id]").forEach(row => {
            row.onclick = async () => {
                try {
                    const r = await CHK.api("GET", "/checks/" + row.dataset.chkId);
                    showReport(r.check);
                } catch (e) {
                    result.innerHTML = `<div class="chk-error">${esc(e.message)}</div>`;
                }
            };
        });
    }

    function showReport(check) {
        result.innerHTML = CHK.reportHtml(check);
        result.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    async function load() {
        try {
            const r = await CHK.api("GET", "/me");
            configured = r.configured;
            showQuota(r.quota);
            showHistory(r.history);
        } catch (e) {
            historyEl.textContent = e.message;
        }
    }

    async function run() {
        const inn = input.value.replace(/\D/g, "");
        if (!inn) { input.focus(); return; }
        if (!CHK.innKind(inn)) {
            result.innerHTML = `<div class="chk-error">Неверный ИНН: у организации 10 цифр, у ИП — 12. Проверьте, нет ли опечатки.</div>`;
            return;
        }
        go.disabled = true;
        go.textContent = "Проверяю…";
        result.innerHTML = `<div class="chk-card chk-hint" style="margin-top:0">Запрашиваю данные, это занимает несколько секунд…</div>`;
        try {
            const r = await CHK.api("POST", "/check", { inn });
            showReport(r.check);
            showQuota(r.quota);
            load();
        } catch (e) {
            result.innerHTML = `<div class="chk-error">${esc(e.message)}</div>`;
        } finally {
            go.disabled = false;
            go.textContent = "Проверить";
        }
    }

    go.onclick = run;
    input.addEventListener("keydown", e => { if (e.key === "Enter") run(); });

    await load();
    input.focus();
});
