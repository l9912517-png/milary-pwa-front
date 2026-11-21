/*
 * Рабочее место оператора заказов в 1С (поле HTML документа в обработке PWA_РабочееМестоОператора).
 *
 * 1С открывает /pwa/ord/embed/?code=<одноразовый код> (POST /api/embed/session с context { page: 'orders' }).
 * Страница меняет код на JWT (POST /api/embed/exchange) и держит его только в памяти.
 * Показывает тот же экран, что «Проверка заказов» в PWA (screens/ord_review.js).
 *
 * Связь с 1С:
 *   - ссылки v8:… перехватывает обработчик onclick поля HTML:
 *       v8:ord/create/<uuid>                  — создать «Заказ покупателя» из подтверждённого заказа;
 *       v8:Документ.ЗаказПокупателя/<guid>    — открыть созданный документ;
 *       v8:ord/relogin                        — получить новый код и войти заново;
 *   - document.title = «Заказы (N)» — N заказов ждут проверки (1С показывает в заголовке и оповещает);
 *     «Заказы: relogin» — сеанс истёк, 1С переподключает страницу сама.
 *
 * Совместимость с браузером 1С: без fetch, ?., ??, alert/confirm.
 */

/* Ошибки страницы — в лог сервера (/opt/app/sw-errors.log, source «ord-embed») и красной строкой на экране:
   в 1С нет консоли разработчика, иначе ошибку не увидеть. */
function ordReportError(text) {
    try {
        var xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/sw-log', true);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.send(JSON.stringify({ source: 'ord-embed', error: String(text).slice(0, 2000), ua: navigator.userAgent }));
    } catch (e) { /* не важно */ }
    try {
        var bar = document.getElementById('ord-error');
        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'ord-error';
            document.body.appendChild(bar);
        }
        bar.textContent = 'Ошибка страницы: ' + String(text).slice(0, 300);
    } catch (e) { /* не важно */ }
}

window.onerror = function (msg, src, line, col, err) {
    ordReportError(msg + ' @ ' + (src || '').split('/').pop() + ':' + line + ':' + col + (err && err.stack ? ' | ' + err.stack : ''));
};
window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    ordReportError('promise: ' + (r && r.message ? r.message : String(r)) + (r && r.stack ? ' | ' + r.stack : ''));
});

/* Для старого WebKit в 1С */
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
if (!Element.prototype.remove) {
    Element.prototype.remove = function () { if (this.parentNode) this.parentNode.removeChild(this); };
}

/* То, что экраны PWA берут из app.js */
var SCREENS = {};
var container = null;
var title = null;
var ORD_V8 = true;
window.ORD_V8 = true;

function registerScreen(name, fn) {
    SCREENS[name] = fn;
}

function openScreen(name) {
    if (SCREENS[name]) SCREENS[name]();
}

function ordShellStart() {
    'use strict';

    var COUNT_MS = 30000;
    var authLost = false;

    container = document.getElementById('ord-root');
    title = document.getElementById('ord-title');

    function showRelogin(text) {
        authLost = true;
        document.title = 'Заказы: relogin';
        container.innerHTML = '<div class="ord-empty">' + ORD.esc(text) +
            '<div><a class="ord-link-btn ord-relogin" href="v8:ord/relogin">Подключиться заново</a></div></div>';
    }

    function codeFromUrl() {
        var m = /[?&]code=([0-9a-f]{20,})/.exec(location.search);
        return m ? m[1] : '';
    }

    function exchange(code) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open('POST', '/api/embed/exchange', true);
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

    /* Сколько заказов ждут проверки (за все дни) — в заголовок страницы для 1С */
    function updateCount() {
        if (authLost) return;
        ORD.api('GET', '/orders?status=processed&limit=500').then(function (r) {
            if (authLost) return;
            var n = r.orders ? r.orders.length : 0;
            document.title = n > 0 ? 'Заказы (' + n + ')' : 'Заказы';
        }).catch(function () { /* не критично */ });
    }

    var code = codeFromUrl();
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* не важно */ }

    if (!code) {
        showRelogin('Рабочее место оператора открывается из 1С.');
        return;
    }

    exchange(code).then(function (r) {
        var user = r.user || {};
        if (['admin', 'operator', 'staff'].indexOf(user.role) < 0) {
            container.innerHTML = '<div class="ord-empty bad">Проверка заказов доступна оператору и администратору (сейчас: ' +
                ORD.esc(user.name || '') + ', роль ' + ORD.esc(user.role || '') + ').</div>';
            return;
        }

        ORD.setSession({
            jwt: r.jwt,
            user: user,
            onAuthError: function () { showRelogin('Сеанс истёк.'); }
        });
        document.getElementById('ord-user').textContent = user.name || '';

        openScreen('ord_review');
        updateCount();
        setInterval(updateCount, COUNT_MS);
    }).catch(function (err) {
        showRelogin(err.message);
    });
}
