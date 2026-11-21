/*
 * «Проверки контрагентов» (директор, админ): журнал проверок по ИНН всех менеджеров.
 * Фильтры: период, менеджер, светофор, ИНН. По нажатию — отчёт, как его видел менеджер.
 */

registerScreen("checks_journal", async function () {

    window.currentScreen = "checks_journal";
    title.innerText = "Проверки контрагентов";

    const esc = CHK.esc;
    const iso = d => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    const today = new Date();
    const monthAgo = new Date(today.getTime() - 30 * 24 * 3600 * 1000);

    /* фильтры переживают переход в отчёт и обратно */
    const st = window.chkJournalState || (window.chkJournalState = { from: iso(monthAgo), to: iso(today), user: "", level: "", inn: "" });

    function renderList() {
        container.innerHTML = `
            <div class="chk-page">
                <div class="chk-card">
                    <div class="chk-filters">
                        <div><label>С</label><input type="date" id="cjFrom" class="chk-input" value="${esc(st.from)}"></div>
                        <div><label>По</label><input type="date" id="cjTo" class="chk-input" value="${esc(st.to)}"></div>
                        <div><label>Менеджер</label><select id="cjUser" class="chk-select"><option value="">Все</option></select></div>
                        <div><label>Результат</label>
                            <select id="cjLevel" class="chk-select">
                                <option value="">Все</option>
                                <option value="red">Риск (красный)</option>
                                <option value="yellow">Есть на что посмотреть (жёлтый)</option>
                                <option value="green">Без замечаний (зелёный)</option>
                            </select>
                        </div>
                        <div class="full"><label>ИНН</label><input type="text" id="cjInn" class="chk-input" inputmode="numeric" placeholder="Начало ИНН" value="${esc(st.inn)}"></div>
                    </div>
                    <div id="cjInfo" class="chk-hint"></div>
                </div>
                <div class="chk-card"><div id="cjList" class="chk-hint" style="margin-top:0">Загрузка…</div></div>
                <button type="button" id="cjBack" class="chk-btn secondary wide">← Меню</button>
            </div>
        `;

        document.getElementById("cjLevel").value = st.level;
        document.getElementById("cjBack").onclick = () => showMenu();

        let timer = null;
        const onChange = () => {
            st.from = document.getElementById("cjFrom").value;
            st.to = document.getElementById("cjTo").value;
            st.user = document.getElementById("cjUser").value;
            st.level = document.getElementById("cjLevel").value;
            st.inn = document.getElementById("cjInn").value.replace(/\D/g, "");
            clearTimeout(timer);
            timer = setTimeout(load, 250);
        };
        ["cjFrom", "cjTo", "cjUser", "cjLevel"].forEach(id => document.getElementById(id).addEventListener("change", onChange));
        document.getElementById("cjInn").addEventListener("input", onChange);

        load();
    }

    async function load() {
        const list = document.getElementById("cjList");
        if (!list) return;
        const qs = new URLSearchParams();
        ["from", "to", "user", "level", "inn"].forEach(k => { if (st[k]) qs.set(k, st[k]); });
        try {
            const r = await CHK.api("GET", "/journal?" + qs.toString());

            const sel = document.getElementById("cjUser");
            if (sel && sel.options.length <= 1) {
                sel.innerHTML = `<option value="">Все</option>` + r.users.map(u => `<option value="${esc(u.user_id)}">${esc(u.name)}</option>`).join("");
                sel.value = st.user;
            }

            const n = { red: 0, yellow: 0, green: 0 };
            r.checks.forEach(c => { if (n[c.level] !== undefined) n[c.level]++; });
            document.getElementById("cjInfo").innerHTML =
                (r.configured ? "" : `<div class="chk-warn" style="margin-bottom:6px">Ключ Checko не задан — менеджеры не могут проверять.</div>`) +
                `Найдено: ${r.checks.length} · ${CHK.dot("red")} ${n.red} · ${CHK.dot("yellow")} ${n.yellow} · ${CHK.dot("green")} ${n.green}<br>Запросов к Checko сегодня: ${esc(r.requestsToday)} (бесплатно 100 в сутки)`;

            if (!r.checks.length) {
                list.className = "chk-hint";
                list.textContent = "Проверок нет";
                return;
            }
            list.className = "";
            list.innerHTML = r.checks.map(c => CHK.listRow(c, true)).join("");
            list.querySelectorAll("[data-chk-id]").forEach(row => {
                row.onclick = () => openReport(row.dataset.chkId);
            });
        } catch (e) {
            list.className = "chk-error";
            list.textContent = e.message;
        }
    }

    async function openReport(id) {
        container.innerHTML = `<div class="chk-page"><div class="chk-card chk-hint" style="margin-top:0">Загрузка…</div></div>`;
        try {
            const r = await CHK.api("GET", "/checks/" + id);
            container.innerHTML = `
                <div class="chk-page">
                    ${CHK.reportHtml(r.check)}
                    <button type="button" id="cjToList" class="chk-btn secondary wide">← К журналу</button>
                </div>`;
        } catch (e) {
            container.innerHTML = `
                <div class="chk-page">
                    <div class="chk-error">${esc(e.message)}</div>
                    <button type="button" id="cjToList" class="chk-btn secondary wide">← К журналу</button>
                </div>`;
        }
        document.getElementById("cjToList").onclick = renderList;
        window.scrollTo(0, 0);
    }

    renderList();
});
