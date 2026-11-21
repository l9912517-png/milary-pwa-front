/*
 * Объявления (только админ): написать — всем или по ролям, важное — полосой на главной, по желанию push;
 * ниже — отправленные: кому, сколько прочитали, «Снять».
 * Сервер: /api/admin/announcements.
 */

registerScreen("admin_announce", function () {
    window.currentScreen = "admin_announce";
    window.screenBack = () => openAdminPanel();
    title.innerText = "Объявления";

    container.innerHTML = `
        <div class="tq-page">
            <form class="help-card an-form" onsubmit="event.preventDefault(); anSend();">
                <h2>Новое объявление</h2>
                <label class="field"><span class="field-label">Заголовок</span>
                    <input id="anTitle" maxlength="120" placeholder="Например: 25 ноября склад не работает" required></label>
                <label class="field"><span class="field-label">Текст</span>
                    <textarea id="anBody" maxlength="2000" rows="5" placeholder="Что нужно знать и что делать" required></textarea></label>
                <div class="field"><span class="field-label">Кому</span>
                    <div class="an-roles">
                        <label class="an-chip"><input type="checkbox" id="anAll" checked onchange="anAllChanged()"><span>Всем</span></label>
                        ${Object.entries(ANNOUNCE_ROLES).map(([k, v]) => `<label class="an-chip"><input type="checkbox" name="anRole" value="${k}" onchange="anRoleChanged()"><span>${escapeHtml(v)}</span></label>`).join("")}
                    </div>
                </div>
                <label class="an-switch"><input type="checkbox" id="anImportant"><span><b>Важное</b> — полосой вверху главной, пока не прочитают</span></label>
                <label class="an-switch"><input type="checkbox" id="anPush" checked><span><b>Уведомление</b> на телефон (у кого включены)</span></label>
                <label class="field"><span class="field-label">Показывать</span>
                    <select id="anDays">
                        <option value="1">1 день</option><option value="3">3 дня</option><option value="7">неделю</option>
                        <option value="14" selected>2 недели</option><option value="30">месяц</option>
                    </select></label>
                <button type="submit" class="login-submit" id="anSendBtn">Отправить</button>
            </form>
            <h2 class="an-h">Отправленные</h2>
            <div id="anList" class="tq-list"><div class="report-status">Загрузка…</div></div>
        </div>`;
    anLoad();
});

function anAllChanged() {
    if (document.getElementById("anAll").checked) document.querySelectorAll("input[name=anRole]").forEach(x => { x.checked = false; });
}

function anRoleChanged() {
    const any = [...document.querySelectorAll("input[name=anRole]")].some(x => x.checked);
    document.getElementById("anAll").checked = !any;
}

function anRolesText(roles) {
    return roles && roles.length ? roles.map(r => ANNOUNCE_ROLES[r] || r).join(", ") : "всем";
}

async function anSend() {
    const titleV = document.getElementById("anTitle").value.trim();
    const body = document.getElementById("anBody").value.trim();
    if (!titleV || !body) return alert("Заполните заголовок и текст");
    const roles = [...document.querySelectorAll("input[name=anRole]:checked")].map(x => x.value);
    const push = document.getElementById("anPush").checked;
    if (!confirm(`Отправить объявление ${roles.length ? "ролям: " + anRolesText(roles) : "всем"}${push ? " с уведомлением" : ""}?`)) return;

    const btn = document.getElementById("anSendBtn");
    btn.disabled = true;
    btn.textContent = "Отправляем…";
    let d = null;
    try {
        const r = await fetch("/api/admin/announcements", {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + localStorage.getItem("jwt") },
            body: JSON.stringify({
                title: titleV, body, roles, push,
                important: document.getElementById("anImportant").checked,
                days: Number(document.getElementById("anDays").value)
            })
        });
        d = await r.json();
    } catch (e) { d = null; }
    btn.disabled = false;
    btn.textContent = "Отправить";
    if (!d || !d.success) return alert((d && d.message) || "Не получилось отправить. Проверьте связь");

    alert(`Отправлено: получателей ${d.recipients}` + (push ? `, уведомлений доставлено ${d.pushed}` : "") + ".");
    document.getElementById("anTitle").value = "";
    document.getElementById("anBody").value = "";
    anLoad();
}

async function anLoad() {
    let d;
    try {
        const r = await fetch("/api/admin/announcements", { headers: { "Authorization": "Bearer " + localStorage.getItem("jwt") } });
        d = await r.json();
        if (!r.ok || !d.success) throw new Error();
    } catch (e) {
        const l = document.getElementById("anList");
        if (l) l.innerHTML = `<div class="report-status">Не удалось загрузить</div>`;
        return;
    }
    if (window.currentScreen !== "admin_announce") return;
    const list = document.getElementById("anList");
    if (!d.announcements.length) { list.innerHTML = `<div class="report-status">Объявлений ещё не было</div>`; return; }
    list.innerHTML = d.announcements.map(a => `
        <div class="tq-item${a.active ? "" : " an-off"}">
            <div class="tq-item-head" onclick="this.parentNode.classList.toggle('open')">
                <span class="tq-item-main">
                    <span class="tq-item-type">${escapeHtml(a.title)}</span>
                    <span class="tq-item-sub">${escapeHtml(adminTime(a.created_at))} · ${escapeHtml(anRolesText(a.roles))} · прочитали ${Number(a.read)} из ${Number(a.recipients)}</span>
                </span>
                ${a.important ? `<span class="tq-status fail">важное</span>` : ""}
                <span class="tq-status ${a.active ? "done" : ""}">${a.active ? "показывается" : "снято"}</span>
            </div>
            <div class="tq-item-body">
                <div class="an-text">${formatMessageText(a.body)}</div>
                <div class="ad-dev"><small>${a.active ? "Показывается до " + escapeHtml(adminTime(a.expires_at)) : "Больше не показывается"}${a.author ? " · автор: " + escapeHtml(a.author) : ""}</small></div>
                ${a.active ? `<button type="button" class="btn-secondary" onclick="anDelete(${Number(a.id)}, this)">Снять</button>` : ""}
            </div>
        </div>`).join("");
}

async function anDelete(id, btn) {
    if (!confirm("Снять объявление? Оно пропадёт из «Сообщений» у всех.")) return;
    btn.disabled = true;
    try {
        const r = await fetch(`/api/admin/announcements/${Number(id)}/delete`, { method: "POST", headers: { "Authorization": "Bearer " + localStorage.getItem("jwt") } });
        if (!r.ok) throw new Error();
    } catch (e) {
        btn.disabled = false;
        return alert("Не получилось. Проверьте связь");
    }
    anLoad();
}
