/*
 * IDF — панель в 1С (поле HTML документа в обработке «Рабочее место IDF»).
 *
 * 1С открывает /pwa/idf/embed/?code=<одноразовый код>. Страница меняет код на JWT
 * (POST /api/idf/embed/exchange) и держит его только в памяти: при новом открытии
 * 1С выдаёт новый код.
 *
 * Связь с 1С без вызовов из страницы:
 *   - document.title = «IDF» или «IDF (N)», N — сколько заданий ждут действия; 1С читает его
 *     раз в минуту, ставит в заголовок панели и показывает оповещение, когда N растёт;
 *   - ссылки v8:… перехватывает обработчик onclick поля HTML в 1С:
 *       v8:Документ.<Имя>/<guid>, v8:Справочник.<Имя>/<guid> — открыть объект 1С;
 *       v8:open-url/<адрес>                                  — открыть файл системным браузером;
 *       v8:idf/relogin                                       — получить новый код и войти заново.
 *   - заголовок «IDF: relogin» — сеанс истёк или код устарел: 1С переподключает панель сама.
 *
 * Совместимость с браузером 1С: без fetch, ?., ??, alert/confirm.
 */
(function () {
    'use strict';

    var C = window.IDFCore;
    var token = '';
    var REFRESH_MS = 60000;

    function root() { return document.getElementById('idf-root'); }

    function showMessage(text, withRelogin) {
        /* заголовок «IDF: relogin» 1С видит при опросе и сама переподключает панель */
        if (withRelogin) document.title = 'IDF: relogin';
        root().innerHTML = '<div class="idf-boot">' + C.text(text) +
            (withRelogin ? '<div><a class="idf-relogin" href="v8:idf/relogin">Подключиться заново</a></div>' : '') + '</div>';
    }

    function setTitle(counters) {
        var n = counters && counters.action ? Number(counters.action) : 0;
        document.title = n > 0 ? 'IDF (' + n + ')' : 'IDF';
    }

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

        if (!code) { showMessage('Панель IDF открывается из 1С.', true); return; }

        exchange(code).then(function (r) {
            token = r.jwt;
            C.options.getToken = function () { return token; };
            C.options.onAuthError = function () { showMessage('Сеанс IDF истёк.', true); };

            var ctx = r.context || {};
            window.IDF.mount(root(), {
                mode: 'mobile',
                embed: true,
                v8Links: true,
                hideSettings: true,
                openTaskId: ctx.action === 'open' ? ctx.task_id : null,
                startCreate: ctx.action === 'create',
                prefill: ctx.action === 'create' ? { links: ctx.links || [] } : null,
                onCounters: setTitle
            });

            setInterval(function () { if (token && window.IDF.refresh) window.IDF.refresh(); }, REFRESH_MS);
        }).catch(function (err) {
            showMessage(err.message, true);
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
