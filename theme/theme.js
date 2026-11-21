/*
 * Тема оформления: «Как в системе» (по умолчанию), «Тёмная», «Светлая».
 * Подключается в <head> до отрисовки, чтобы не мигало. Выбор хранится на этом устройстве (localStorage).
 * Светлая тема — html[data-theme="light"] в theme.css.
 */
(function () {
    var KEY = "theme";
    var media = window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;

    function mode() {
        try { return localStorage.getItem(KEY) || "system"; } catch (e) { return "system"; }
    }

    function apply() {
        var m = mode();
        var light = m === "light" || (m === "system" && media && media.matches);
        if (light) document.documentElement.setAttribute("data-theme", "light");
        else document.documentElement.removeAttribute("data-theme");
    }

    apply();
    if (media) {
        if (media.addEventListener) media.addEventListener("change", apply);
        else if (media.addListener) media.addListener(apply);
    }

    window.themeMode = mode;
    window.themeSet = function (m) {
        try {
            if (m === "system") localStorage.removeItem(KEY); else localStorage.setItem(KEY, m);
        } catch (e) { /* без сохранения */ }
        apply();
        document.querySelectorAll(".theme-pick button").forEach(function (b) {
            b.classList.toggle("active", b.getAttribute("data-mode") === mode());
        });
    };
    window.themePickerHtml = function () {
        var cur = mode();
        var opt = function (m, label) {
            return '<button type="button" data-mode="' + m + '" class="' + (cur === m ? "active" : "") + '" onclick="themeSet(\'' + m + '\')">' + label + '</button>';
        };
        return '<section class="help-card"><h2>Оформление</h2><div class="theme-pick">' +
            opt("system", "Как в системе") + opt("dark", "Тёмная") + opt("light", "Светлая") + '</div></section>';
    };
})();
