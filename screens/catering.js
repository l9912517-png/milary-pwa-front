"use strict";

/*
 * Каталог заведений общественного питания Москвы (открытые данные, набор 1903).
 * Поиск, фильтры, сортировка; у каждого заведения отметка «свободно / клиент 1С / в разработке»
 * (сверка с контрагентами 1С и живыми разработками делает сервер).
 * «Взять в разработку» открывает обычную форму создания с уже заполненными полями.
 */

registerScreen("catering", async function () {

    title.innerText = "Каталог заведений";

    container.innerHTML = `
        <div id="catScreen" style="padding:10px;max-width:100%;box-sizing:border-box;">
            <div id="catContent"></div>
        </div>
    `;

    const content = document.getElementById("catContent");
    const PAGE = 30;

    /* ---------- вспомогательное ---------- */

    function esc(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function dmy(value) {
        const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? m[3] + "." + m[2] + "." + m[1] : "";
    }

    async function api(url, options = {}) {

        const token = localStorage.getItem("jwt");

        if (!token) throw new Error("Сессия пользователя отсутствует");

        const headers = { "Authorization": "Bearer " + token };

        if (options.body !== undefined) headers["Content-Type"] = "application/json";

        const response = await fetch(url, Object.assign({}, options, { headers }));

        if (response.status === 401) throw new Error("Сессия истекла. Войдите в систему заново.");

        let data = null;
        try { data = await response.json(); } catch (_) { data = null; }

        if (!response.ok) {
            throw new Error((data && (data.error || data.message)) || "Ошибка запроса: " + response.status);
        }

        return data;
    }

    /* ---------- состояние (сохраняется, пока открыто приложение) ---------- */

    const saved = window.__catState;

    const state = saved || {
        q: "",
        availability: "free",
        net: "no",
        adm_area: "",
        district: "",
        types: [],
        all_types: false,
        seats_min: "",
        seats_max: "",
        seats_unknown: true,
        social: false,
        sort: "name",
        lat: null,
        lon: null,
        filtersOpen: false
    };

    window.__catState = state;

    let filters = null;
    let items = [];
    let total = 0;
    let canLink = false;
    let statusReady = true;
    let restricted = false;
    let takenHidden = 0;
    let loading = false;
    let seq = 0;
    let expanded = null;

    /* ---------- оформление ---------- */

    const BADGE = {
        free: { bg: "#e8f5e9", fg: "#1b5e20", border: "#a5d6a7" },
        no_house: { bg: "#f1f1f1", fg: "#555555", border: "#cccccc" },
        client: { bg: "#ffebee", fg: "#b71c1c", border: "#ef9a9a" },
        client_dormant: { bg: "#fbe9e7", fg: "#bf360c", border: "#ffab91" },
        in_development: { bg: "#fff3e0", fg: "#e65100", border: "#ffcc80" },
        mine: { bg: "#e3f2fd", fg: "#0d47a1", border: "#90caf9" },
        maybe: { bg: "#fffde7", fg: "#7a5d00", border: "#fff176" }
    };

    const inputStyle = "width:100%;box-sizing:border-box;padding:10px;border:1px solid #ccc;border-radius:8px;background:#fff;color:#222;font-size:14px;";
    const btnStyle = "padding:8px 12px;border:1px solid #bbb;border-radius:8px;background:#f4f4f4;color:#222;font-size:13px;cursor:pointer;text-decoration:none;display:inline-block;";

    function chip(id, label, active) {
        return `<button type="button" data-avail="${id}" style="padding:8px 12px;margin:0 6px 6px 0;border-radius:18px;font-size:13px;cursor:pointer;border:1px solid ${active ? "#2e7d32" : "#bbb"};background:${active ? "#2e7d32" : "#fff"};color:${active ? "#fff" : "#222"};">${esc(label)}</button>`;
    }

    function mgrLabel(name) {
        return /^отдел/i.test(name) ? name[0].toUpperCase() + name.slice(1) : "Менеджер: " + name;
    }

    function availabilityText(item) {

        const a = item.availability;

        if (!a) return "";

        const m = (a.matches && a.matches[0]) || null;

        switch (a.state) {
        case "client":
            return m
                ? "Клиент 1С: " + m.name + (m.last_shipment_date ? ". Последняя отгрузка " + dmy(m.last_shipment_date) : "") + (m.manager_name ? ". " + mgrLabel(m.manager_name) : "")
                : "";
        case "client_dormant":
            return m ? "Есть в 1С: " + m.name + (m.last_shipment_date ? ". Последняя отгрузка " + dmy(m.last_shipment_date) : "") : "";
        case "in_development":
            return a.mine
                ? "Это ваша разработка" + (m && m.expires_at ? " до " + dmy(m.expires_at) : "")
                : (m ? "В разработке" + (m.manager_name ? " (" + m.manager_name + ")" : "") + (m.expires_at ? " до " + dmy(m.expires_at) : "") : "");
        case "maybe":
            return m ? "Похоже на: " + m.name + (m.address ? " (" + m.address + ")" : "") : "";
        case "no_house":
            return "В адресе нет номера дома, сверить с клиентами нельзя.";
        default:
            return "";
        }
    }

    /* ---------- запрос списка ---------- */

    function query(offset) {

        const p = new URLSearchParams();

        if (state.q.trim()) p.set("q", state.q.trim());
        if (state.availability !== "all") p.set("availability", state.availability);
        if (state.net) p.set("net", state.net);
        if (state.adm_area) p.set("adm_area", state.adm_area);
        if (state.district) p.set("district", state.district);
        if (state.types.length) p.set("types", state.types.join(","));
        else if (state.all_types) p.set("all_types", "1");
        if (String(state.seats_min).trim()) p.set("seats_min", String(state.seats_min).trim());
        if (String(state.seats_max).trim()) p.set("seats_max", String(state.seats_max).trim());
        if ((String(state.seats_min).trim() || String(state.seats_max).trim()) && state.seats_unknown) p.set("seats_unknown", "1");
        if (state.social) p.set("social", "1");
        if (state.sort === "distance" && state.lat != null) {
            p.set("sort", "distance");
            p.set("lat", state.lat);
            p.set("lon", state.lon);
        } else if (state.sort && state.sort !== "distance") {
            p.set("sort", state.sort);
        }
        p.set("limit", PAGE);
        p.set("offset", offset || 0);

        return "/api/catering/places?" + p.toString();
    }

    async function load(append) {

        const mine = ++seq;
        loading = true;
        renderList();

        try {

            const result = await api(query(append ? items.length : 0));

            if (mine !== seq) return;

            const list = Array.isArray(result.items) ? result.items : [];
            items = append ? items.concat(list) : list;
            total = Number(result.total) || 0;
            canLink = result.can_link === true;
            statusReady = result.status_ready !== false;
            restricted = result.restricted === true;
            takenHidden = Number(result.taken_hidden) || 0;
            if (restricted && state.availability !== "free") state.availability = "free";
            loading = false;
            renderList();

        } catch (error) {

            if (mine !== seq) return;

            loading = false;
            const box = document.getElementById("catList");
            if (box) {
                box.innerHTML = `<div style="padding:12px;border-radius:8px;background:rgba(224,69,123,0.16);color:#FF8FB3;">${esc(error.message)}</div>`;
            }
        }
    }

    /* ---------- каркас экрана ---------- */

    function selectOptions(list, current, emptyLabel) {
        return `<option value="">${esc(emptyLabel)}</option>` + list.map(o =>
            `<option value="${esc(o.name)}"${o.name === current ? " selected" : ""}>${esc(o.name)} (${esc(o.count)})</option>`
        ).join("");
    }

    function renderShell() {

        const areas = filters ? filters.adm_areas : [];
        const districts = filters ? filters.districts.filter(d => !state.adm_area || d.adm_area === state.adm_area) : [];
        const types = filters ? filters.types : [];

        content.innerHTML = `

            <button id="catBack" type="button" style="width:100%;margin-bottom:12px;padding:10px;border:0;border-radius:10px;background:rgba(255,255,255,0.10);color:var(--text);cursor:pointer;">
                ← К разработкам
            </button>

            <div style="margin-bottom:10px;">
                ${restricted ? "" : chip("free", "Свободные", state.availability === "free")}
                ${restricted ? "" : chip("all", "Все", state.availability === "all")}
                ${restricted ? "" : chip("taken", "Занятые", state.availability === "taken")}
                ${restricted ? "" : chip("maybe", "Возможно занято", state.availability === "maybe")}
            </div>

            <input id="catQ" type="search" autocomplete="off" value="${esc(state.q)}"
                placeholder="Название или улица" style="${inputStyle}">

            <div style="display:flex;margin-top:10px;">
                <select id="catSort" style="${inputStyle}flex:1;min-width:0;margin-right:8px;">
                    <option value="name"${state.sort === "name" ? " selected" : ""}>По названию</option>
                    <option value="seats"${state.sort === "seats" ? " selected" : ""}>По числу мест</option>
                    <option value="district"${state.sort === "district" ? " selected" : ""}>По району</option>
                    <option value="type"${state.sort === "type" ? " selected" : ""}>По типу</option>
                    <option value="distance"${state.sort === "distance" ? " selected" : ""}>Ближе ко мне</option>
                </select>
                <button id="catFiltersToggle" type="button" style="${btnStyle}white-space:nowrap;">
                    Фильтры ${state.filtersOpen ? "▴" : "▾"}
                </button>
            </div>

            <div id="catFilters" style="display:${state.filtersOpen ? "block" : "none"};margin-top:10px;padding:12px;border:1px solid #ddd;border-radius:10px;background:#fafafa;">

                <label style="display:block;font-size:13px;color:var(--text);">Округ
                    <select id="catArea" style="${inputStyle}margin-top:4px;">${selectOptions(areas, state.adm_area, "Все округа")}</select>
                </label>

                <label style="display:block;font-size:13px;color:var(--text);margin-top:10px;">Район
                    <select id="catDistrict" style="${inputStyle}margin-top:4px;">${selectOptions(districts, state.district, "Все районы")}</select>
                </label>

                <label style="display:block;font-size:13px;color:var(--text);margin-top:10px;">Сети
                    <select id="catNet" style="${inputStyle}margin-top:4px;">
                        <option value="no"${state.net === "no" ? " selected" : ""}>Не сеть</option>
                        <option value=""${state.net === "" ? " selected" : ""}>Все</option>
                        <option value="yes"${state.net === "yes" ? " selected" : ""}>Только сети</option>
                    </select>
                </label>

                <div style="font-size:13px;color:var(--text);margin-top:10px;">Тип заведения</div>
                <div id="catTypes" style="margin-top:4px;">
                    ${types.map(t => `
                        <label style="display:inline-block;margin:0 10px 6px 0;font-size:13px;color:var(--text);${t.hidden && !state.all_types ? "opacity:.55;" : ""}">
                            <input type="checkbox" data-type="${esc(t.name)}"${state.types.includes(t.name) ? " checked" : ""}>
                            ${esc(t.name)} (${esc(t.count)})
                        </label>
                    `).join("")}
                </div>
                <label style="display:block;margin-top:4px;font-size:12px;color:var(--muted);">
                    <input type="checkbox" id="catAllTypes"${state.all_types ? " checked" : ""}>
                    Показывать и заготовочные цеха, магазины (отделы кулинарии), ночные клубы
                </label>

                <div style="font-size:13px;color:var(--text);margin-top:10px;">Число мест</div>
                <div style="display:flex;margin-top:4px;">
                    <input id="catSeatsMin" type="number" min="0" inputmode="numeric" placeholder="от" value="${esc(state.seats_min)}" style="${inputStyle}flex:1;min-width:0;margin-right:8px;">
                    <input id="catSeatsMax" type="number" min="0" inputmode="numeric" placeholder="до" value="${esc(state.seats_max)}" style="${inputStyle}flex:1;min-width:0;">
                </div>
                <label style="display:block;margin-top:6px;font-size:13px;color:var(--text);">
                    <input type="checkbox" id="catSeatsUnknown"${state.seats_unknown ? " checked" : ""}>
                    Включая «число мест не указано»${filters && filters.seats ? " (" + esc(filters.seats.unknown) + ")" : ""}
                </label>

                <label style="display:block;margin-top:10px;font-size:13px;color:var(--text);">
                    <input type="checkbox" id="catSocial"${state.social ? " checked" : ""}> Только с социальными льготами
                </label>

                <button id="catReset" type="button" style="${btnStyle}margin-top:12px;">Сбросить фильтры</button>
            </div>

            <div id="catInfo" style="margin-top:12px;font-size:13px;color:var(--text);"></div>
            <div id="catList" style="margin-top:6px;"></div>
        `;

        bindShell();
    }

    function bindShell() {

        document.getElementById("catBack").addEventListener("click", () => openScreen("developments"));

        content.querySelectorAll("[data-avail]").forEach(btn => {
            btn.addEventListener("click", () => {
                state.availability = btn.dataset.avail;
                renderShell();
                load(false);
            });
        });

        let timer = null;
        document.getElementById("catQ").addEventListener("input", e => {
            state.q = e.target.value;
            clearTimeout(timer);
            timer = setTimeout(() => load(false), 350);
        });

        document.getElementById("catSort").addEventListener("change", e => {

            const value = e.target.value;

            if (value !== "distance") {
                state.sort = value;
                load(false);
                return;
            }

            if (state.lat != null) {
                state.sort = "distance";
                load(false);
                return;
            }

            if (!navigator.geolocation) {
                alertInline("Определение местоположения недоступно в этом браузере.");
                e.target.value = state.sort;
                return;
            }

            navigator.geolocation.getCurrentPosition(
                pos => {
                    state.lat = pos.coords.latitude;
                    state.lon = pos.coords.longitude;
                    state.sort = "distance";
                    load(false);
                },
                () => {
                    alertInline("Не удалось определить местоположение. Разрешите доступ к геопозиции в настройках браузера.");
                    e.target.value = state.sort === "distance" ? "name" : state.sort;
                    if (state.sort === "distance") state.sort = "name";
                },
                { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
            );
        });

        document.getElementById("catFiltersToggle").addEventListener("click", () => {
            state.filtersOpen = !state.filtersOpen;
            document.getElementById("catFilters").style.display = state.filtersOpen ? "block" : "none";
            document.getElementById("catFiltersToggle").textContent = "Фильтры " + (state.filtersOpen ? "▴" : "▾");
        });

        const simple = (id, key, transform) => {
            document.getElementById(id).addEventListener("change", e => {
                state[key] = transform ? transform(e.target) : e.target.value;
                load(false);
            });
        };

        document.getElementById("catArea").addEventListener("change", e => {
            state.adm_area = e.target.value;
            state.district = "";
            state.filtersOpen = true;
            renderShell();
            load(false);
        });

        simple("catDistrict", "district");
        simple("catNet", "net");
        simple("catSeatsUnknown", "seats_unknown", t => t.checked);
        simple("catSocial", "social", t => t.checked);
        simple("catAllTypes", "all_types", t => t.checked);

        let seatsTimer = null;
        ["catSeatsMin", "catSeatsMax"].forEach(id => {
            document.getElementById(id).addEventListener("input", e => {
                state[id === "catSeatsMin" ? "seats_min" : "seats_max"] = e.target.value;
                clearTimeout(seatsTimer);
                seatsTimer = setTimeout(() => load(false), 500);
            });
        });

        document.querySelectorAll("#catTypes [data-type]").forEach(box => {
            box.addEventListener("change", () => {
                const name = box.dataset.type;
                state.types = state.types.filter(t => t !== name);
                if (box.checked) state.types.push(name);
                load(false);
            });
        });

        document.getElementById("catReset").addEventListener("click", () => {
            Object.assign(state, {
                q: "", availability: "free", net: "no", adm_area: "", district: "", types: [], all_types: false,
                seats_min: "", seats_max: "", seats_unknown: true, social: false, sort: "name", filtersOpen: true
            });
            renderShell();
            load(false);
        });
    }

    function alertInline(text) {
        const info = document.getElementById("catInfo");
        if (info) info.innerHTML = `<span style="color:#FF8FB3;">${esc(text)}</span>`;
    }

    /* ---------- список ---------- */

    function actionButtons(item) {

        const a = item.availability;
        const blocked = a && a.taken;

        const links = [];

        if (item.map && item.map.point) links.push(`<a href="${esc(item.map.point)}" target="_blank" rel="noopener" style="${btnStyle}margin:0 6px 6px 0;">На карте</a>`);
        if (item.map && item.map.route) links.push(`<a href="${esc(item.map.route)}" target="_blank" rel="noopener" style="${btnStyle}margin:0 6px 6px 0;">Маршрут</a>`);
        if (!(item.map && item.map.point) && item.map && item.map.search) links.push(`<a href="${esc(item.map.search)}" target="_blank" rel="noopener" style="${btnStyle}margin:0 6px 6px 0;">Найти на карте</a>`);

        const take = blocked
            ? ""
            : `<button type="button" data-take="${esc(item.id)}" style="padding:8px 12px;margin:0 6px 6px 0;border:0;border-radius:8px;background:var(--accent);color:var(--accent-ink);font-size:13px;font-weight:600;cursor:pointer;">Взять в разработку</button>`;

        return take + links.join("");
    }

    function card(item) {

        const a = item.availability;
        const colors = a ? BADGE[a.state === "in_development" && a.mine ? "mine" : a.state] || BADGE.free : null;

        const meta = [
            item.type,
            item.seats ? "мест: " + item.seats : "мест: не указано",
            item.is_net ? "сеть" : "",
            item.district || "",
            item.distance_km != null ? item.distance_km + " км" : ""
        ].filter(Boolean).join(" · ");

        const detail = availabilityText(item);
        const open = expanded === item.id;

        return `
            <div data-card="${esc(item.id)}" style="margin-bottom:10px;padding:12px;background:var(--card);border:1px solid var(--card-border);border-radius:12px;">

                <div data-toggle="${esc(item.id)}" style="cursor:pointer;">
                    <div style="font-weight:700;font-size:15px;color:var(--text);line-height:1.3;">${esc(item.name)}</div>
                    <div style="font-size:13px;color:var(--muted);margin-top:3px;">${esc(meta)}</div>
                    <div style="font-size:14px;color:var(--text);margin-top:3px;">${esc(item.address)}</div>
                    ${a ? `
                        <div style="display:inline-block;margin-top:8px;padding:4px 10px;border-radius:14px;font-size:12px;font-weight:600;background:${colors.bg};color:${colors.fg};border:1px solid ${colors.border};">
                            ${esc(a.state === "in_development" && a.mine ? "Ваша разработка" : a.label)}
                        </div>
                        ${detail ? `<div style="font-size:13px;color:var(--text);margin-top:6px;line-height:1.35;">${esc(detail)}</div>` : ""}
                    ` : ""}
                </div>

                <div style="margin-top:10px;">${actionButtons(item)}</div>

                ${open ? `<div id="catDetail-${esc(item.id)}" style="margin-top:6px;padding-top:8px;border-top:1px solid var(--card-border);font-size:13px;color:var(--text);">Загрузка…</div>` : ""}
            </div>
        `;
    }

    function renderList() {

        const info = document.getElementById("catInfo");
        const box = document.getElementById("catList");

        if (!info || !box) return;

        let infoHtml = loading && !items.length ? "Загрузка…" : "Найдено: " + total;

        if (!statusReady && state.availability !== "all") {
            infoHtml += `<div style="margin-top:6px;padding:8px;border-radius:8px;background:rgba(255,190,90,0.14);color:#FFC680;">Сверка с клиентами 1С ещё не готова: отметки «свободно» и «занято» могут быть неточными. Попробуйте через минуту.</div>`;
        }

        if (restricted && takenHidden > 0) {
            infoHtml += `<div style="margin-top:6px;padding:8px;border-radius:8px;background:var(--card);color:var(--text);">Ещё ${takenHidden} по вашему запросу заняты — они в списке не показываются.</div>`;
        }

        info.innerHTML = infoHtml;

        if (!items.length) {
            box.innerHTML = loading ? "" : `<div style="padding:14px;color:var(--muted);">Ничего не найдено. Измените поиск или фильтры.</div>`;
            return;
        }

        box.innerHTML = items.map(card).join("") + (
            items.length < total
                ? `<button id="catMore" type="button" style="width:100%;padding:11px;border:1px solid var(--card-border);border-radius:10px;background:var(--card);color:var(--text);cursor:pointer;" ${loading ? "disabled" : ""}>${loading ? "Загрузка…" : "Показать ещё (" + (total - items.length) + ")"}</button>`
                : ""
        );

        const more = document.getElementById("catMore");
        if (more) more.addEventListener("click", () => load(true));

        box.querySelectorAll("[data-take]").forEach(btn => {
            btn.addEventListener("click", () => {
                const item = items.find(i => String(i.id) === btn.dataset.take);
                if (!item) return;
                window.__cateringPick = item;
                openScreen("developments");
            });
        });

        box.querySelectorAll("[data-toggle]").forEach(el => {
            el.addEventListener("click", () => {
                const id = Number(el.dataset.toggle);
                expanded = expanded === id ? null : id;
                renderList();
                if (expanded === id) loadDetail(id);
            });
        });

        if (expanded != null) loadDetail(expanded);
    }

    /* ---------- подробности: история изменений и решения ---------- */

    const HISTORY = {
        added: "добавлено в набор",
        missing: "пропало из набора",
        returned: "снова в наборе"
    };

    const FIELD = {
        name: "название", type: "тип", is_net: "признак сети", operator: "оператор", adm_area: "округ",
        district: "район", address_raw: "адрес", phone: "телефон", seats: "число мест", social: "льготы"
    };

    async function loadDetail(id) {

        const box = document.getElementById("catDetail-" + id);
        if (!box) return;

        try {

            const result = await api("/api/catering/places/" + id);

            if (expanded !== id) return;

            const place = result.place;
            const matches = (place.availability && place.availability.matches) || [];
            const history = result.history || [];
            const decisions = result.decisions || [];

            const matchHtml = matches.length ? matches.map(m => {

                const what = m.type === "development"
                    ? "Разработка" + (m.manager_name ? " (" + m.manager_name + ")" : "")
                    : "Карточка 1С" + (m.manager_name ? " (менеджер " + m.manager_name + ")" : "");

                const ref = m.type === "development" ? String(m.development_id) : m.guid;
                const kind = m.type === "development" ? "development" : "counterparty";

                const tools = result.can_link ? `
                    <div style="margin-top:4px;">
                        ${m.confirmed
                            ? `<button type="button" data-link="clear" data-kind="${kind}" data-ref="${esc(ref)}" style="${btnStyle}margin-right:6px;">Снять решение</button>`
                            : `<button type="button" data-link="dismiss" data-kind="${kind}" data-ref="${esc(ref)}" style="${btnStyle}margin-right:6px;">Это не он</button>
                               ${m.level !== "duplicate" ? `<button type="button" data-link="confirm" data-kind="${kind}" data-ref="${esc(ref)}" style="${btnStyle}">Это он</button>` : ""}`}
                    </div>` : "";

                return `<div style="margin-bottom:8px;"><b>${esc(what)}:</b> ${esc(m.name)}${m.address ? ", " + esc(m.address) : ""}
                    ${m.level !== "duplicate" ? `<span style="color:#FFC680;"> (возможное совпадение)</span>` : ""}
                    ${m.confirmed ? `<span style="color:var(--accent);"> (подтверждено РОПом)</span>` : ""}
                    ${tools}</div>`;
            }).join("") : `<div style="color:var(--muted);">Совпадений с клиентами и разработками нет.</div>`;

            const decisionHtml = decisions.length
                ? `<div style="margin-top:8px;"><b>Решения РОПа:</b>` + decisions.map(d =>
                    `<div style="margin-top:4px;">${esc(d.method === "dismissed" ? "Это не он" : "Это он")}: ${esc(d.name || d.ref)}
                        ${result.can_link ? `<button type="button" data-link="clear" data-kind="${esc(d.kind)}" data-ref="${esc(d.ref)}" style="${btnStyle}margin-left:6px;">Снять</button>` : ""}</div>`
                ).join("") + `</div>` : "";

            const historyHtml = history.length
                ? `<div style="margin-top:8px;"><b>Изменения в наборе:</b>` + history.slice(0, 8).map(h =>
                    `<div style="margin-top:3px;color:var(--text);">${esc(dmy(h.at))}: ${esc(HISTORY[h.kind] || (FIELD[h.field] || h.field))}${h.kind === "changed" ? ": " + esc(h.old_value || "пусто") + " → " + esc(h.new_value || "пусто") : ""}</div>`
                ).join("") + `</div>` : "";

            box.innerHTML = `
                ${place.phone ? `<div style="margin-bottom:6px;">Телефон: <a href="tel:${esc(place.phone.split(",")[0].replace(/[^\d+]/g, ""))}" style="color:#9DB8FF;">${esc(place.phone)}</a></div>` : ""}
                ${place.operator ? `<div style="margin-bottom:6px;">Оператор сети: ${esc(place.operator)}</div>` : ""}
                ${matchHtml}${decisionHtml}${historyHtml}
            `;

            box.querySelectorAll("[data-link]").forEach(btn => {
                btn.addEventListener("click", async () => {
                    btn.disabled = true;
                    try {
                        await api("/api/catering/places/" + id + "/link", {
                            method: "POST",
                            body: JSON.stringify({ action: btn.dataset.link, kind: btn.dataset.kind, ref: btn.dataset.ref })
                        });
                        await load(false);
                    } catch (error) {
                        box.insertAdjacentHTML("afterbegin", `<div style="margin-bottom:8px;color:#FF8FB3;">${esc(error.message)}</div>`);
                        btn.disabled = false;
                    }
                });
            });

        } catch (error) {
            if (box.isConnected) box.innerHTML = `<span style="color:#FF8FB3;">${esc(error.message)}</span>`;
        }
    }

    /* ---------- запуск ---------- */

    renderShell();

    try {
        filters = await api("/api/catering/filters");
        renderShell();
    } catch (error) {
        document.getElementById("catInfo").innerHTML = `<span style="color:#FF8FB3;">${esc(error.message)}</span>`;
    }

    if (filters && !filters.total) {
        document.getElementById("catInfo").innerHTML = "Каталог ещё не загружен. Обратитесь к администратору.";
        return;
    }

    load(false);
});
