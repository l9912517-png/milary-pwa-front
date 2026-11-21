/*
 * Демо-режим на стороне приложения (серверная часть — demo-mode/ на сервере).
 *
 * Для обычных пользователей ничего не меняет. Если сервер сообщает, что пользователь демо:
 *  - вверху показывается плашка «Демо-режим»;
 *  - когда сервер отказывает в действии (запись в 1С, разработки и т.п.), вместо ошибки показывается понятное сообщение.
 *
 * Подключается ДО app.js, чтобы перехватить все запросы.
 */
(function () {

    "use strict";

    var DEMO_MESSAGE = "В демо-режиме это действие недоступно";

    function jwt() {
        try {
            return localStorage.getItem("jwt");
        } catch (e) {
            return null;
        }
    }

    function toast(text) {

        var old = document.getElementById("demoToast");
        if (old && old.parentNode) old.parentNode.removeChild(old);

        var el = document.createElement("div");
        el.id = "demoToast";
        el.textContent = text;
        el.style.cssText = "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);max-width:90%;" +
            "padding:12px 16px;border-radius:10px;background:#333;color:#fff;font-size:14px;z-index:100000;" +
            "box-shadow:0 4px 14px rgba(0,0,0,.3);text-align:center;";
        document.body.appendChild(el);

        setTimeout(function () {
            if (el.parentNode) el.parentNode.removeChild(el);
        }, 3500);
    }

    /* Перехват fetch: отказ демо-режима (403 с demo: true) показываем сообщением */
    var originalFetch = window.fetch;

    if (typeof originalFetch === "function") {

        window.fetch = function () {

            return originalFetch.apply(this, arguments).then(function (response) {

                if (window.__demo && response && response.status === 403) {
                    try {
                        response.clone().json().then(function (data) {
                            if (data && data.demo) toast(data.message || DEMO_MESSAGE);
                        }).catch(function () {});
                    } catch (e) {}
                }

                return response;
            });
        };
    }

    function showBanner() {

        if (document.getElementById("demoBanner")) return;

        var el = document.createElement("div");
        el.id = "demoBanner";
        el.textContent = "Демо-режим: данные условные, изменения в 1С отключены";
        el.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;padding:3px 8px;background:#f5a623;" +
            "color:#222;font-size:12px;text-align:center;pointer-events:none;";
        document.body.appendChild(el);
        document.body.style.paddingTop = "20px";
    }

    function check() {

        var token = jwt();
        if (!token) return false;

        originalFetch("/api/demo/me", { headers: { "Authorization": "Bearer " + token } })
            .then(function (r) { return r.ok ? r.json() : null; })
            .then(function (data) {
                if (data && data.demo) {
                    window.__demo = true;
                    showBanner();
                }
            })
            .catch(function () {});

        return true;
    }

    /* Токен может появиться после входа, поэтому проверяем сразу и затем недолго ждём его */
    function start() {

        if (check()) return;

        var tries = 0;
        var timer = setInterval(function () {
            tries += 1;
            if (check() || tries > 150) clearInterval(timer);
        }, 2000);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start);
    } else {
        start();
    }

})();
