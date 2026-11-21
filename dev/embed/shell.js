/*
 * Рабочее место офис-менеджера в 1С: поиск по всем разработкам и привязка карточки 1С.
 * Поле HTML документа в обработке PWA_РабочееМестоРазработок.
 *
 * 1С открывает /pwa/dev/embed/?code=<одноразовый код>
 * (POST /api/idf/embed/session с context { page: 'developments' }).
 * Страница меняет код на JWT (POST /api/idf/embed/exchange) и держит его только в памяти.
 *
 * Связь с 1С:
 *   - ссылка v8:dev/relogin — получить новый код и войти заново;
 *   - заголовок «Разработки: relogin» — сеанс истёк, 1С переподключает страницу сама.
 *
 * Совместимость с браузером 1С (V8WebKit): без fetch, ?., ??, alert/confirm/prompt,
 * без полей класса и CSS gap. Свои модальные окна.
 */
(function () {
    'use strict';

    var token = '';
    var authLost = false;

    var STATUS_TEXT = {
        active: 'В работе',
        contract_request: 'Заявка на договор',
        converted: 'Клиент заведён',
        closed: 'Закрыта',
        expired: 'Истекла'
    };

    var CHIPS = [
        { value: '', text: 'Все' },
        { value: 'active', text: 'В работе' },
        { value: 'contract_request', text: 'Заявка на договор' },
        { value: 'converted', text: 'Клиент заведён' },
        { value: 'closed', text: 'Закрыта' },
        { value: 'expired', text: 'Истекла' }
    ];

    var ACTION_TEXT = {
        created: 'Создана',
        reactivated: 'Возобновлена',
        updated: 'Изменена',
        extended: 'Продлена',
        closed: 'Закрыта',
        expired: 'Истёк срок',
        contract_request: 'Заявка на договор',
        converted: 'Клиент заведён',
        unlinked: 'Привязка снята',
        repeat_allowed: 'Разрешён повтор',
        duplicate_confirmed: 'Подтверждён дубль',
        link_ambiguous: 'Несколько подходящих карточек 1С'
    };

    var state = { q: '', status: '', items: [], cards: [], total: 0, openId: null, detail: null, timer: null };

    /* ---------- служебное ---------- */

    function esc(v) {
        return String(v === null || v === undefined ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    function pad(n) { return n < 10 ? '0' + n : String(n); }

    function fmtDate(v) {
        if (!v) return '';
        var d = new Date(v);
        if (isNaN(d.getTime())) return String(v).slice(0, 10);
        return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
    }

    function root() { return document.getElementById('dv-root'); }

    function reportError(text) {
        try {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/sw-log', true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send(JSON.stringify({ source: 'dev-embed', error: String(text).slice(0, 2000), ua: navigator.userAgent }));
        } catch (e) { /* не важно */ }
        try {
            var bar = document.getElementById('dv-error');
            if (!bar) {
                bar = document.createElement('div');
                bar.id = 'dv-error';
                document.body.appendChild(bar);
            }
            bar.textContent = 'Ошибка страницы: ' + String(text).slice(0, 300);
        } catch (e) { /* не важно */ }
    }

    window.onerror = function (msg, src, line, col) {
        reportError(msg + ' @ ' + String(src || '').split('/').pop() + ':' + line + ':' + col);
    };

    if (!Element.prototype.matches) {
        Element.prototype.matches = Element.prototype.webkitMatchesSelector || Element.prototype.msMatchesSelector;
    }
    if (!Element.prototype.closest) {
        Element.prototype.closest = function (sel) {
            var el = this;
            while (el && el.nodeType === 1) { if (el.matches(sel)) return el; el = el.parentElement; }
            return null;
        };
    }

    function api(method, path, body) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open(method, path, true);
            xhr.setRequestHeader('Authorization', 'Bearer ' + token);
            if (body !== undefined) xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.onload = function () {
                var data = null;
                try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
                if (xhr.status >= 200 && xhr.status < 300 && data && data.success !== false) {
                    resolve(data);
                    return;
                }
                if (xhr.status === 401) showRelogin('Сеанс истёк.');
                var err = new Error(data && data.message ? data.message :
                    xhr.status === 401 ? 'Сеанс истёк' :
                    xhr.status === 403 ? 'Нет доступа' : 'Ошибка сервера (' + xhr.status + ')');
                err.status = xhr.status;
                reject(err);
            };
            xhr.onerror = function () { reject(new Error('Нет связи с сервером')); };
            xhr.ontimeout = function () { reject(new Error('Сервер не ответил вовремя')); };
            xhr.timeout = 30000;
            xhr.send(body === undefined ? null : JSON.stringify(body));
        });
    }

    function showRelogin(text) {
        authLost = true;
        document.title = 'Разработки: relogin';
        root().innerHTML = '<div class="dv-empty">' + esc(text) +
            '<div style="margin-top:10px"><a href="v8:dev/relogin">Подключиться заново</a></div></div>';
    }

    var toastTimer = null;
    function toast(text, bad) {
        var el = document.getElementById('dv-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'dv-toast';
            document.body.appendChild(el);
        }
        el.className = bad ? 'bad' : '';
        el.textContent = text;
        el.style.display = 'block';
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.style.display = 'none'; }, bad ? 6000 : 3500);
    }

    /* ---------- список ---------- */

    function renderShell() {
        var chips = '';
        for (var i = 0; i < CHIPS.length; i++) {
            chips += '<span class="dv-chip' + (CHIPS[i].value === state.status ? ' on' : '') +
                '" data-chip="' + esc(CHIPS[i].value) + '">' + esc(CHIPS[i].text) + '</span>';
        }

        root().innerHTML =
            '<div class="dv-search">' +
                '<div class="dv-search-row">' +
                    '<input type="text" id="dv-q" placeholder="Название, юр. лицо, ИНН или адрес" value="' + esc(state.q) + '">' +
                    '<button type="button" id="dv-find">Найти</button>' +
                '</div>' +
                '<div class="dv-chips">' + chips + '</div>' +
                '<div class="dv-hint" id="dv-hint"></div>' +
            '</div>' +
            '<div id="dv-list"></div>';

        var input = document.getElementById('dv-q');
        input.onkeyup = function (e) {
            if (e && (e.keyCode === 13 || e.which === 13)) { doSearch(); return; }
            if (state.timer) clearTimeout(state.timer);
            state.timer = setTimeout(doSearch, 500);
        };
        document.getElementById('dv-find').onclick = doSearch;

        var list = root().querySelectorAll('.dv-chip');
        for (var j = 0; j < list.length; j++) {
            list[j].onclick = function () {
                state.status = this.getAttribute('data-chip') || '';
                renderShell();
                load();
            };
        }
    }

    function doSearch() {
        var input = document.getElementById('dv-q');
        if (!input) return;
        if (state.timer) { clearTimeout(state.timer); state.timer = null; }
        var q = input.value.replace(/^\s+|\s+$/g, '');
        if (q === state.q && state.items.length) return;
        state.q = q;
        load();
    }

    function load() {
        var list = document.getElementById('dv-list');
        if (list) list.innerHTML = '<div class="dv-empty">Загрузка…</div>';

        var path = '/api/dev-office/search?q=' + encodeURIComponent(state.q) +
            '&status=' + encodeURIComponent(state.status) + '&limit=100';

        api('GET', path).then(function (r) {
            state.items = r.items || [];
            state.cards = r.counterparties || [];
            state.total = r.total || 0;
            state.openId = null;
            state.detail = null;
            renderList();
        }).catch(function (err) {
            var l = document.getElementById('dv-list');
            if (l) l.innerHTML = '<div class="dv-empty dv-bad">' + esc(err.message) + '</div>';
        });
    }

    function renderList() {
        var hint = document.getElementById('dv-hint');
        if (hint) {
            if (!state.q && !state.status) {
                hint.textContent = 'Без запроса показаны разработки «В работе» и заявки на договор. ' +
                    'Чтобы найти клиента среди закрытых и заведённых, введите название, ИНН или адрес.';
            } else {
                hint.textContent = 'Разработок: ' + state.total +
                    (state.total > state.items.length ? ' (показаны первые ' + state.items.length + ')' : '') +
                    (state.q && !state.status ? '. Карточек в справочнике 1С: ' + state.cards.length : '');
            }
        }

        var list = document.getElementById('dv-list');
        if (!list) return;

        if (!state.items.length && !state.cards.length) {
            list.innerHTML = '<div class="dv-empty">Ничего не найдено. Клиента никто не разрабатывает и в справочнике 1С его нет.</div>';
            return;
        }

        var html = '';
        if (state.items.length) {
            if (state.cards.length) html += '<div class="dv-section">Разработки</div>';
            for (var i = 0; i < state.items.length; i++) html += cardHtml(state.items[i]);
        } else if (state.q) {
            html += '<div class="dv-empty">Среди разработок ничего не найдено.</div>';
        }
        if (state.cards.length) {
            html += '<div class="dv-section">Справочник контрагентов 1С</div>';
            for (var c = 0; c < state.cards.length; c++) html += counterpartyHtml(state.cards[c]);
        }
        list.innerHTML = html;

        var cards = list.querySelectorAll('.dv-card');
        for (var k = 0; k < cards.length; k++) {
            cards[k].onclick = function (e) {
                var t = e.target || e.srcElement;
                if (t && t.closest && t.closest('.dv-details')) return;
                var cardId = this.getAttribute('data-id');
                if (cardId) toggle(Number(cardId));
            };
        }
    }

    function counterpartyHtml(c) {
        var h = '<div class="dv-card dv-cp">' +
            '<div class="dv-card-top">' +
                '<span class="dv-name">' + esc(c.name || 'Без названия') + '</span>' +
                '<span class="dv-badge dv-st-cp">Есть в 1С</span>' +
            '</div>';
        if (c.legal_name) h += '<div class="dv-line">' + esc(c.legal_name) + '</div>';
        if (c.address) h += '<div class="dv-line">' + esc(c.address) + '</div>';
        var meta = '';
        if (c.inn) meta += 'ИНН ' + c.inn + ', ';
        if (c.manager) meta += 'менеджер в 1С: ' + c.manager + ', ';
        meta += c.last_shipment_date ? 'последняя отгрузка ' + fmtDate(c.last_shipment_date) : 'отгрузок не было';
        if (c.created_at) meta += ', карточка создана ' + fmtDate(c.created_at);
        h += '<div class="dv-line dv-muted">' + esc(meta) + '</div>';
        if (c.development) {
            var d = c.development;
            h += '<div class="dv-linked">Разработка: <b>' + esc(d.name) + '</b> — ' +
                esc(STATUS_TEXT[d.status] || d.status) + ', менеджер ' + esc(d.manager_name) + '</div>';
        }
        return h + '</div>';
    }

    function findItem(id) {
        for (var i = 0; i < state.items.length; i++) if (state.items[i].id === id) return state.items[i];
        return null;
    }

    function cardHtml(d) {
        var open = state.openId === d.id;
        var h = '<div class="dv-card' + (open ? ' open' : '') + '" data-id="' + d.id + '">' +
            '<div class="dv-card-top">' +
                '<span class="dv-name">' + esc(d.display_name || 'Без названия') + '</span>' +
                '<span class="dv-badge dv-st-' + esc(d.status) + '">' + esc(STATUS_TEXT[d.status] || d.status) + '</span>' +
            '</div>' +
            '<div class="dv-line"><b>Менеджер:</b> ' + esc(d.manager_name) + '</div>';

        if (d.address) h += '<div class="dv-line">' + esc(d.address) + '</div>';

        var meta = 'Создана ' + fmtDate(d.created_at);
        if (d.status === 'active' && d.expires_at) meta += ', срок до ' + fmtDate(d.expires_at);
        if (d.closed_at) meta += ', закрыта ' + fmtDate(d.closed_at);
        h += '<div class="dv-line dv-muted">' + esc(meta) + (d.inn ? ', ИНН ' + esc(d.inn) : '') + '</div>';

        if (d.counterparty_name) {
            h += '<div class="dv-linked">Карточка в 1С: <b>' + esc(d.counterparty_name) + '</b></div>';
        }

        if (open) h += detailsHtml(d);
        return h + '</div>';
    }

    function detailsHtml(d) {
        var h = '<div class="dv-details">';
        function row(label, value) {
            if (!value) return '';
            return '<div class="dv-row"><span>' + esc(label) + '</span><b>' + esc(value) + '</b></div>';
        }
        h += row('Название (англ.):', d.display_name_en);
        h += row('Юр. лицо:', d.legal_name);
        h += row('ИНН:', d.inn);
        h += row('Заявка на договор:', fmtDate(d.contract_request_at));
        h += row('Срок до:', fmtDate(d.expires_at));
        h += row('Последняя отгрузка:', fmtDate(d.last_shipment_date));
        h += row('Комментарий:', d.comment);

        h += '<div class="dv-hist"><div class="dv-hist-title">История</div>';
        if (!state.detail || state.detail.id !== d.id) {
            h += '<div class="dv-muted">Загрузка…</div>';
        } else {
            var hist = state.detail.history;
            if (!hist.length) h += '<div class="dv-muted">Записей нет</div>';
            for (var i = 0; i < hist.length; i++) {
                var x = hist[i];
                var t = ACTION_TEXT[x.action] || x.action;
                if (x.action === 'converted' && x.counterparty_name) {
                    t += ': ' + x.counterparty_name + (x.manual ? ' (привязано вручную)' : ' (автоматически)');
                }
                h += '<div class="dv-hist-item">' + esc(fmtDate(x.at)) + ' — ' + esc(t) + (x.by ? ' · ' + esc(x.by) : '') + '</div>';
            }
        }
        h += '</div>';

        if (d.can_link) {
            h += '<div class="dv-actions"><button type="button" class="dv-btn-link" id="dv-link-btn">🔗 Привязать карточку 1С</button></div>';
        }
        return h + '</div>';
    }

    function toggle(id) {
        if (state.openId === id) {
            state.openId = null;
            state.detail = null;
            renderList();
            return;
        }
        state.openId = id;
        state.detail = null;
        renderList();
        bindDetails();

        api('GET', '/api/dev-office/item/' + id).then(function (r) {
            if (state.openId !== id) return;
            var item = findItem(id);
            if (item && r.development) {
                for (var key in r.development) if (Object.prototype.hasOwnProperty.call(r.development, key)) item[key] = r.development[key];
            }
            state.detail = { id: id, history: r.history || [] };
            renderList();
            bindDetails();
        }).catch(function (err) { toast(err.message, true); });
    }

    function bindDetails() {
        var btn = document.getElementById('dv-link-btn');
        if (btn) {
            btn.onclick = function (e) {
                if (e && e.stopPropagation) e.stopPropagation();
                openLinkDialog(findItem(state.openId));
            };
        }
    }

    /* ---------- окно привязки карточки 1С ---------- */

    function closeModal() {
        var a = document.getElementById('dv-modal-back');
        var b = document.getElementById('dv-modal');
        if (a && a.parentNode) a.parentNode.removeChild(a);
        if (b && b.parentNode) b.parentNode.removeChild(b);
    }

    function openLinkDialog(dev) {
        if (!dev) return;
        closeModal();

        var back = document.createElement('div');
        back.id = 'dv-modal-back';
        back.onclick = closeModal;
        var box = document.createElement('div');
        box.id = 'dv-modal';
        box.innerHTML =
            '<h3>Привязать карточку 1С</h3>' +
            '<div class="dv-modal-sub">Разработка: <b>' + esc(dev.display_name) + '</b> (' + esc(dev.manager_name) + ')' +
                (dev.address ? '<br>' + esc(dev.address) : '') + '</div>' +
            '<div class="dv-modal-search">' +
                '<input type="text" id="dv-lq" placeholder="Название, юр. лицо или ИНН карточки 1С">' +
                '<button type="button" id="dv-lfind">Найти</button>' +
            '</div>' +
            '<div class="dv-hint" id="dv-lhint"></div>' +
            '<div id="dv-llist"></div>' +
            '<div id="dv-lconfirm"></div>' +
            '<div style="margin-top:10px"><button type="button" class="dv-btn-sec" id="dv-lclose">Закрыть</button></div>';
        document.body.appendChild(back);
        document.body.appendChild(box);

        var items = [];

        function loadCards(q) {
            var list = document.getElementById('dv-llist');
            list.innerHTML = '<div class="dv-empty">Загрузка…</div>';
            document.getElementById('dv-lconfirm').innerHTML = '';
            api('GET', '/api/developments/' + dev.id + '/link-candidates?q=' + encodeURIComponent(q)).then(function (r) {
                items = r.items || [];
                document.getElementById('dv-lhint').textContent = q
                    ? 'Результаты поиска по 1С'
                    : 'Самые похожие карточки. Если нужной нет, найдите её поиском.';
                renderCards();
            }).catch(function (err) {
                list.innerHTML = '<div class="dv-empty dv-bad">' + esc(err.message) + '</div>';
            });
        }

        function renderCards() {
            var list = document.getElementById('dv-llist');
            if (!items.length) {
                list.innerHTML = '<div class="dv-empty">Ничего не найдено. Измените запрос.</div>';
                return;
            }
            var h = '';
            for (var i = 0; i < items.length; i++) {
                var c = items[i];
                h += '<div class="dv-pick"><b>' + esc(c.name) + '</b>' +
                    (c.legal_name ? '<div>' + esc(c.legal_name) + '</div>' : '') +
                    (c.inn ? '<div>ИНН ' + esc(c.inn) + '</div>' : '') +
                    '<div>' + esc(c.address || 'адрес не указан') + '</div>' +
                    '<div class="dv-muted">Создана в 1С: ' + esc(c.created_at ? fmtDate(c.created_at) : '—') +
                        '; последняя отгрузка: ' + esc(c.last_shipment_date ? fmtDate(c.last_shipment_date) : 'нет') + '</div>' +
                    (c.taken_by ? '<div class="dv-warn">⚠️ Уже привязана к разработке «' + esc(c.taken_by.name) + '»</div>' : '') +
                    '<div style="margin-top:6px"><button type="button" data-pick="' + i + '">Выбрать</button></div></div>';
            }
            list.innerHTML = h;
            var btns = list.querySelectorAll('[data-pick]');
            for (var k = 0; k < btns.length; k++) {
                btns[k].onclick = function () { askConfirm(items[Number(this.getAttribute('data-pick'))]); };
            }
        }

        function askConfirm(card) {
            var box2 = document.getElementById('dv-lconfirm');
            box2.innerHTML = '<div class="dv-confirm">Привязать карточку <b>' + esc(card.name) + '</b> к разработке <b>' +
                esc(dev.display_name) + '</b>?' +
                (card.taken_by ? '<div class="dv-warn">Эта карточка уже привязана к другой разработке («' + esc(card.taken_by.name) + '»). Всё равно привязать?</div>' : '') +
                '<div><button type="button" id="dv-lyes">Да, привязать</button>' +
                '<button type="button" class="dv-btn-sec" id="dv-lno">Отмена</button></div></div>';
            document.getElementById('dv-lno').onclick = function () { box2.innerHTML = ''; };
            document.getElementById('dv-lyes').onclick = function () {
                var yes = this;
                yes.disabled = true;
                api('POST', '/api/developments/' + dev.id + '/link', { guid: card.guid, confirm_taken: !!card.taken_by }).then(function () {
                    closeModal();
                    toast('Карточка привязана. Менеджер увидит статус «Клиент заведён».');
                    state.openId = null;
                    state.detail = null;
                    load();
                }).catch(function (err) {
                    yes.disabled = false;
                    toast(err.message, true);
                });
            };
        }

        var q = document.getElementById('dv-lq');
        q.onkeyup = function (e) {
            if (e && (e.keyCode === 13 || e.which === 13)) loadCards(q.value.replace(/^\s+|\s+$/g, ''));
        };
        document.getElementById('dv-lfind').onclick = function () { loadCards(q.value.replace(/^\s+|\s+$/g, '')); };
        document.getElementById('dv-lclose').onclick = closeModal;

        loadCards('');
    }

    /* ---------- вход ---------- */

    function codeFromUrl() {
        var m = /[?&]code=([0-9a-f]{20,})/.exec(location.search);
        return m ? m[1] : '';
    }

    function exchange(code) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/idf/embed/exchange', true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.onload = function () {
                var data = null;
                try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
                if (xhr.status === 200 && data && data.jwt) resolve(data);
                else reject(new Error(data && data.message ? data.message : 'Не удалось войти (' + xhr.status + ')'));
            };
            xhr.onerror = function () { reject(new Error('Нет связи с сервером')); };
            xhr.send(JSON.stringify({ code: code }));
        });
    }

    function start() {
        var code = codeFromUrl();
        try { history.replaceState(null, '', location.pathname); } catch (e) { /* не важно */ }

        if (!code) { showRelogin('Рабочее место открывается из 1С.'); return; }

        exchange(code).then(function (r) {
            var user = r.user || {};
            if (['staff', 'admin', 'director'].indexOf(user.role) < 0) {
                root().innerHTML = '<div class="dv-empty dv-bad">Поиск по разработкам доступен офис-менеджеру, директору и администратору (сейчас: ' +
                    esc(user.name || '') + ', роль ' + esc(user.role || '') + ').</div>';
                return;
            }
            token = r.jwt;
            document.getElementById('dv-user').textContent = user.name || '';
            document.title = 'Разработки';
            renderShell();
            load();
        }).catch(function (err) {
            showRelogin(err.message);
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
