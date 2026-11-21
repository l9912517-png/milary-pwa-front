/*
 * IDF — окно подбора объектов 1С.
 *
 *   IDFObjects.pick(kind, kinds) → Promise([ { kind, guid, number, date, title } ])   ([] — ничего не выбрано)
 *
 *   kind.source = 'directory' — поиск по справочнику на сервере (/api/idf/objects/directory)
 *   kind.source = '1c'        — отбор по контрагенту и периоду, «Получить»:
 *        POST /api/task { type: 'idf_docs', payload: { kind, counterparty, date_from, date_to, limit }, wait_file: 'idf_docs.json' }
 *        → GET /api/task/<uuid>/status (раз в секунду) → GET /api/idf/objects/docs?task=<uuid>
 *
 * Совместимость с браузером 1С: без fetch, ?., ??, spread; свои окна вместо alert/confirm.
 */
(function () {
    'use strict';

    var C = window.IDFCore;
    var WAIT_SECONDS = 40;

    function openBox(title, bodyHtml, footHtml) {
        var wrap = document.createElement('div');
        wrap.className = 'idf-modal';
        wrap.innerHTML = '<div class="idf-modal-box idf-modal-wide" role="dialog">' +
            '<div class="idf-modal-head"><span>' + C.esc(title) + '</span>' +
            '<button type="button" class="idf-modal-x" data-x="close">×</button></div>' +
            '<div class="idf-modal-body">' + bodyHtml + '</div>' +
            '<div class="idf-modal-foot">' + footHtml + '</div></div>';
        document.body.appendChild(wrap);
        return wrap;
    }

    function closeBox(wrap) {
        if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
    }

    function q(wrap, sel) { return wrap.querySelector(sel); }

    /* Esc закрывает только верхнее окно */
    function isTop(wrap) {
        var all = document.querySelectorAll('.idf-modal');
        return all.length && all[all.length - 1] === wrap;
    }

    function debounce(fn, ms) {
        var t = null;
        return function () {
            var args = arguments, self = this;
            if (t) clearTimeout(t);
            t = setTimeout(function () { fn.apply(self, args); }, ms);
        };
    }

    /* ---------- справочник на сервере ---------- */

    function pickDirectory(kind) {
        return new Promise(function (resolve) {
            var wrap = openBox(kind.title,
                '<input type="text" class="idf-input idf-pick-q" placeholder="Поиск: название, ИНН, код">' +
                '<div class="idf-pick-list"><div class="idf-empty">Загрузка…</div></div>',
                '<button type="button" class="idf-btn" data-x="close">Закрыть</button>');
            var rows = [];
            var seq = 0;
            var done = false;

            function finish(list) {
                if (done) return;
                done = true;
                document.removeEventListener('keydown', onKey);
                closeBox(wrap);
                resolve(list);
            }
            function onKey(e) { if ((e.key === 'Escape' || e.keyCode === 27) && isTop(wrap)) finish([]); }
            document.addEventListener('keydown', onKey);

            function load() {
                var my = ++seq;
                var text = q(wrap, '.idf-pick-q').value;
                C.get('/objects/directory', { kind_id: kind.id, q: text, limit: 50 }).then(function (r) {
                    if (my !== seq) return;
                    rows = r.rows || [];
                    var box = q(wrap, '.idf-pick-list');
                    if (!rows.length) { box.innerHTML = '<div class="idf-empty">Ничего не найдено</div>'; return; }
                    var html = '';
                    rows.forEach(function (it, i) {
                        html += '<div class="idf-pick-item" data-i="' + i + '"><b>' + C.esc(it.name) + '</b>' +
                            (it.full_name && it.full_name !== it.name ? '<div class="idf-muted">' + C.esc(it.full_name) + '</div>' : '') +
                            (it.inn ? '<div class="idf-muted">ИНН ' + C.esc(it.inn) + '</div>' : '') + '</div>';
                    });
                    if (r.total > rows.length) html += '<div class="idf-muted idf-pick-more">Показаны первые ' + rows.length + ' из ' + r.total + '. Уточните поиск.</div>';
                    box.innerHTML = html;
                }).catch(function (err) {
                    if (my !== seq) return;
                    q(wrap, '.idf-pick-list').innerHTML = '<div class="idf-empty">' + C.esc(err.message) + '</div>';
                });
            }

            q(wrap, '.idf-pick-q').addEventListener('input', debounce(load, 300));
            wrap.addEventListener('click', function (e) {
                var t = e.target;
                if (t === wrap || (t.getAttribute && t.getAttribute('data-x') === 'close')) { finish([]); return; }
                while (t && t !== wrap && !(t.getAttribute && t.getAttribute('data-i') !== null)) t = t.parentNode;
                if (!t || t === wrap) return;
                var it = rows[Number(t.getAttribute('data-i'))];
                if (it) finish([{ kind: kind.kind, guid: it.guid, number: '', date: '', title: it.name }]);
            });
            setTimeout(function () { q(wrap, '.idf-pick-q').focus(); }, 30);
            load();
        });
    }

    /* ---------- документы из 1С ---------- */

    function pickDocs(kind, kinds) {
        var cpKind = null;
        for (var i = 0; i < kinds.length; i++) {
            if (kinds[i].source === 'directory' && kinds[i].kind === 'Справочник.Контрагенты') cpKind = kinds[i];
        }

        return new Promise(function (resolve) {
            var today = new Date();
            var from = new Date(today.getTime() - 30 * 86400000);
            var state = { cp: null, rows: [], selected: {}, polling: null, done: false };

            var wrap = openBox(kind.title,
                '<label class="idf-label">Контрагент *</label>' +
                '<div class="idf-pick-cp"><span class="idf-muted">не выбран</span> ' +
                '<button type="button" class="idf-mini" data-x="cp">Выбрать</button></div>' +
                '<label class="idf-label">Период</label>' +
                '<div class="idf-period"><input type="text" class="idf-input idf-d1" value="' + C.dayText(from) + '"> — ' +
                '<input type="text" class="idf-input idf-d2" value="' + C.dayText(today) + '"></div>' +
                '<div class="idf-quick">' +
                    '<button type="button" class="idf-mini" data-p="0">Сегодня</button>' +
                    '<button type="button" class="idf-mini" data-p="7">7 дней</button>' +
                    '<button type="button" class="idf-mini" data-p="30">30 дней</button>' +
                    '<button type="button" class="idf-mini" data-p="m">Этот месяц</button>' +
                    '<button type="button" class="idf-mini" data-p="pm">Прошлый месяц</button>' +
                '</div>' +
                '<div class="idf-pick-status"></div>' +
                '<div class="idf-pick-list idf-pick-docs"></div>',
                '<button type="button" class="idf-btn idf-btn-primary" data-x="get">Получить</button>' +
                '<button type="button" class="idf-btn idf-btn-primary idf-hidden" data-x="add">Добавить выбранные</button>' +
                '<button type="button" class="idf-btn" data-x="close">Закрыть</button>');

            function status(html) { q(wrap, '.idf-pick-status').innerHTML = html; }

            function finish(list) {
                if (state.done) return;
                state.done = true;
                if (state.polling) clearInterval(state.polling);
                document.removeEventListener('keydown', onKey);
                closeBox(wrap);
                resolve(list);
            }
            function onKey(e) { if ((e.key === 'Escape' || e.keyCode === 27) && isTop(wrap)) finish([]); }
            document.addEventListener('keydown', onKey);

            function setPeriod(p) {
                var d1, d2 = new Date();
                if (p === '0') d1 = new Date();
                else if (p === 'm') d1 = new Date(d2.getFullYear(), d2.getMonth(), 1);
                else if (p === 'pm') { d1 = new Date(d2.getFullYear(), d2.getMonth() - 1, 1); d2 = new Date(d2.getFullYear(), d2.getMonth(), 0); }
                else d1 = new Date(d2.getTime() - Number(p) * 86400000);
                q(wrap, '.idf-d1').value = C.dayText(d1);
                q(wrap, '.idf-d2').value = C.dayText(d2);
            }

            function renderRows() {
                var box = q(wrap, '.idf-pick-docs');
                var addBtn = q(wrap, '[data-x="add"]');
                if (!state.rows.length) { box.innerHTML = ''; addBtn.className = 'idf-btn idf-btn-primary idf-hidden'; return; }
                var html = '';
                state.rows.forEach(function (r, i) {
                    html += '<label class="idf-pick-item idf-pick-doc"><input type="checkbox" data-r="' + i + '"' + (state.selected[i] ? ' checked' : '') + '> ' +
                        '<span><b>' + C.esc(r.number) + '</b> от ' + C.esc(r.date_text || r.date) +
                        (r.sum ? ' · ' + C.esc(r.sum) : '') + (r.posted ? '' : ' <span class="idf-muted">(не проведён)</span>') +
                        '<div class="idf-muted">' + C.esc(r.counterparty) + '</div></span></label>';
                });
                box.innerHTML = html;
                var n = 0;
                for (var k in state.selected) if (state.selected[k]) n++;
                addBtn.textContent = n ? 'Добавить выбранные (' + n + ')' : 'Добавить выбранные';
                addBtn.className = 'idf-btn idf-btn-primary';
            }

            function stopPolling() {
                if (state.polling) clearInterval(state.polling);
                state.polling = null;
                q(wrap, '[data-x="get"]').disabled = false;
            }

            function request() {
                if (!state.cp) { status('<span class="idf-red">Выберите контрагента</span>'); return; }
                var d1 = C.parseDay(q(wrap, '.idf-d1').value);
                var d2 = C.parseDay(q(wrap, '.idf-d2').value);
                if (!d1 || !d2 || d1 > d2) { status('<span class="idf-red">Период: даты как 01.10.2026, начало не позже конца</span>'); return; }
                if ((d2 - d1) / 86400000 > 370) { status('<span class="idf-red">Период не больше года</span>'); return; }

                state.rows = []; state.selected = {}; renderRows();
                q(wrap, '[data-x="get"]').disabled = true;
                status('Запрос отправлен в 1С…');

                C.hostApi('POST', '/api/task', {
                    type: 'idf_docs',
                    payload: { kind: kind.kind, counterparty: state.cp.guid, date_from: C.isoDay(d1), date_to: C.isoDay(d2), limit: 500 },
                    wait_file: 'idf_docs.json'
                }).then(function (r) {
                    var uuid = r.uuid;
                    var started = Date.now();
                    state.polling = setInterval(function () {
                        if (state.done) return;
                        var sec = Math.round((Date.now() - started) / 1000);
                        if (sec > WAIT_SECONDS) {
                            stopPolling();
                            status('<span class="idf-red">1С не ответила за ' + WAIT_SECONDS + ' секунд. Попробуйте ещё раз.</span>');
                            return;
                        }
                        C.hostApi('GET', '/api/task/' + uuid + '/status?t=' + Date.now()).then(function (s) {
                            if (s.status !== 'ready') { status('Запрос отправлен в 1С… ' + sec + ' с'); return; }
                            stopPolling();
                            return C.get('/objects/docs', { task: uuid }).then(function (d) {
                                if (d.error) { status('<span class="idf-red">1С: ' + C.esc(d.error) + '</span>'); return; }
                                state.rows = d.rows || [];
                                status(state.rows.length ?
                                    'Найдено: ' + state.rows.length + (d.truncated ? ' (показаны первые — сузьте период)' : '') :
                                    'Документов за период нет');
                                renderRows();
                            });
                        }).catch(function (err) {
                            if (err.status === 409) return;    // файл ещё пишется
                            stopPolling();
                            status('<span class="idf-red">' + C.esc(err.message) + '</span>');
                        });
                    }, 1000);
                }).catch(function (err) {
                    stopPolling();
                    status('<span class="idf-red">' + C.esc(err.message) + '</span>');
                });
            }

            wrap.addEventListener('change', function (e) {
                var r = e.target.getAttribute && e.target.getAttribute('data-r');
                if (r === null || r === undefined) return;
                state.selected[r] = e.target.checked;
                renderRows();
            });

            wrap.addEventListener('click', function (e) {
                var t = e.target;
                if (t === wrap) { finish([]); return; }
                var x = t.getAttribute && t.getAttribute('data-x');
                var p = t.getAttribute && t.getAttribute('data-p');
                if (p !== null && p !== undefined) { setPeriod(p); return; }
                if (x === 'close') finish([]);
                else if (x === 'get') request();
                else if (x === 'cp') {
                    if (!cpKind) { status('<span class="idf-red">В настройках IDF нет вида «Справочник.Контрагенты»</span>'); return; }
                    pickDirectory(cpKind).then(function (list) {
                        if (!list.length) return;
                        state.cp = list[0];
                        q(wrap, '.idf-pick-cp').innerHTML = '<b>' + C.esc(state.cp.title) + '</b> <button type="button" class="idf-mini" data-x="cp">Изменить</button>';
                        status('');
                    });
                }
                else if (x === 'add') {
                    var out = [];
                    state.rows.forEach(function (r, i) {
                        if (!state.selected[i]) return;
                        out.push({ kind: kind.kind, guid: r.guid, number: r.number, date: r.date_text || r.date, title: r.title || (kind.title + ' ' + r.number) });
                    });
                    if (!out.length) { status('<span class="idf-red">Отметьте документы галочками</span>'); return; }
                    finish(out);
                }
            });
        });
    }

    window.IDFObjects = {
        pick: function (kind, kinds) {
            return kind.source === 'directory' ? pickDirectory(kind) : pickDocs(kind, kinds || []);
        }
    };
})();
