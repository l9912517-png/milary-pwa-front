/*
 * IDF — подключение к PWA. Использует из app.js только registerScreen, openScreen,
 * #screen-container и #screen-title. Своё добавляет снаружи, не меняя app.js:
 *   - бейдж на кнопке «IDF» в нижней панели (сколько заданий ждут моего действия);
 *   - нажатие на сообщение IDF в «Сообщениях» открывает задание;
 *   - адрес /pwa/?idf_task=ID открывает задание (для push).
 */
(function () {
    'use strict';

    var C = window.IDFCore;
    var pendingTaskId = null;

    function screenContainer() {
        return document.getElementById('screen-container');
    }

    function showIDF() {
        var box = screenContainer();
        if (!box || !window.IDF) return;
        var openTaskId = pendingTaskId;
        pendingTaskId = null;
        window.IDF.mount(box, {
            mode: 'mobile',
            openTaskId: openTaskId,
            setTitle: function (text) {
                var t = document.getElementById('screen-title');
                if (t) t.innerText = text;
            },
            onCounters: setBadge
        });
    }

    if (typeof registerScreen === 'function') {
        registerScreen('idf', showIDF);
    }

    function idfButton() {
        return document.querySelector('nav.bottom-nav button[onclick*="openIDF"]');
    }

    function activateButton() {
        var b = idfButton();
        if (b && typeof setActive === 'function') setActive(b);
    }

    window.openIDF = function (taskId) {
        if (taskId) pendingTaskId = Number(taskId);
        if (typeof openScreen === 'function') openScreen('idf');
        else showIDF();
    };

    /* ---------- бейдж на кнопке ---------- */

    function ensureBadge() {
        var b = idfButton();
        if (!b) return null;
        var badge = b.querySelector('.idf-nav-badge');
        if (badge) return badge;
        var svg = b.querySelector('svg');
        var wrap = document.createElement('div');
        wrap.className = 'icon-wrapper';
        if (svg) {
            b.insertBefore(wrap, svg);
            wrap.appendChild(svg);
        } else {
            b.insertBefore(wrap, b.firstChild);
        }
        badge = document.createElement('span');
        badge.className = 'badge hidden idf-nav-badge';
        wrap.appendChild(badge);
        return badge;
    }

    function setBadge(c) {
        var badge = ensureBadge();
        if (!badge || !c) return;
        var n = Number(c.action) || 0;
        if (n > 0) {
            badge.textContent = n > 99 ? '99+' : String(n);
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    function hasToken() {
        try { return !!localStorage.getItem('jwt'); } catch (e) { return false; }
    }

    function refreshBadge() {
        if (!hasToken() || !C) return;
        C.get('/counters').then(function (r) { setBadge(r.counters); }).catch(function () {});
    }

    /* ---------- сообщения IDF в экране «Сообщения» ---------- */

    function wrapOpenMessage() {
        var original = window.openMessage;
        if (typeof original !== 'function' || original.__idf) return;

        var wrapped = function (id) {
            var self = this;
            var args = arguments;
            /* сначала узнаём тип сообщения: если это IDF — открываем задание
               (карточка сама отметит сообщения по нему прочитанными), иначе — как раньше */
            return new Promise(function (resolve) {
                var xhr = new XMLHttpRequest();
                xhr.open('GET', '/api/messages?t=' + Date.now(), true);
                xhr.setRequestHeader('Authorization', 'Bearer ' + (localStorage.getItem('jwt') || ''));
                xhr.onload = function () {
                    try { resolve(JSON.parse(xhr.responseText)); } catch (e) { resolve(null); }
                };
                xhr.onerror = function () { resolve(null); };
                xhr.send(null);
            }).then(function (data) {
                var list = data && data.messages ? data.messages : [];
                for (var i = 0; i < list.length; i++) {
                    var m = list[i];
                    if (String(m.id) === String(id) && m.type === 'idf' && m.data && m.data.task_id) {
                        activateButton();
                        window.openIDF(m.data.task_id);
                        return;
                    }
                }
                return original.apply(self, args);
            });
        };
        wrapped.__idf = true;
        window.openMessage = wrapped;
    }

    /* ---------- запуск ---------- */

    function openFromUrl() {
        var m = /[?&]idf_task=(\d+)/.exec(location.search);
        if (!m || !hasToken()) return;
        try { history.replaceState(null, '', location.pathname); } catch (e) { /* не важно */ }
        /* ждём, пока app.js завершит вход и покажет главный экран, затем открываем задание */
        var started = Date.now();
        var timer = setInterval(function () {
            var ready = false;
            try { ready = typeof currentUser !== 'undefined' && !!currentUser; } catch (e) { ready = false; }
            if (!ready && Date.now() - started < 15000) return;
            clearInterval(timer);
            if (!ready) return;
            setTimeout(function () {
                activateButton();
                window.openIDF(m[1]);
            }, 400);
        }, 200);
    }

    function start() {
        wrapOpenMessage();
        refreshBadge();
        openFromUrl();
        setInterval(refreshBadge, 60000);
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) refreshBadge();
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
