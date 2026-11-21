/*
 * IDF — общее ядро интерфейса (PWA и встроенный браузер 1С).
 *
 * ВАЖНО: файл должен работать во встроенном браузере 1С (V8WebKit).
 * Нельзя: fetch, ?., ??, поля класса, Promise.allSettled, Object.fromEntries,
 *         alert/confirm/prompt (в 1С окно прячется и 1С зависает), CSS gap у flex.
 */
(function () {
    'use strict';

    var core = {};

    core.options = {
        apiBase: '/api/idf',
        getToken: function () { try { return localStorage.getItem('jwt') || ''; } catch (e) { return ''; } },
        onAuthError: null
    };

    /* ---------- HTTP через XMLHttpRequest ---------- */

    core.api = function (method, path, body) {
        return new Promise(function (resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open(method, core.options.apiBase + path, true);
            xhr.setRequestHeader('Authorization', 'Bearer ' + core.options.getToken());
            if (body !== undefined) xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.onload = function () {
                var data = null;
                try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
                if (xhr.status >= 200 && xhr.status < 300 && data && data.success !== false) {
                    resolve(data);
                    return;
                }
                if ((xhr.status === 401) && typeof core.options.onAuthError === 'function') {
                    core.options.onAuthError();
                }
                var msg = data && data.message ? data.message :
                    xhr.status === 401 ? 'Сеанс истёк, войдите заново' :
                    xhr.status === 403 ? 'Нет доступа' :
                    'Ошибка сервера (' + xhr.status + ')';
                var err = new Error(msg);
                err.status = xhr.status;
                reject(err);
            };
            xhr.onerror = function () { reject(new Error('Нет связи с сервером')); };
            xhr.ontimeout = function () { reject(new Error('Сервер не ответил вовремя')); };
            xhr.timeout = 30000;
            xhr.send(body === undefined ? null : JSON.stringify(body));
        });
    };

    /* Запрос к API хоста (не /api/idf): тот же формат ответа, полный путь */
    core.hostApi = function (method, fullPath, body) {
        var saved = core.options.apiBase;
        core.options.apiBase = '';
        var p = core.api(method, fullPath, body);
        core.options.apiBase = saved;
        return p;
    };

    /* Загрузка файла (multipart, поле file). onProgress(0..100) */
    core.upload = function (path, file, fileName, onProgress) {
        return new Promise(function (resolve, reject) {
            var fd = new FormData();
            fd.append('file', file, fileName || file.name || 'file');
            var xhr = new XMLHttpRequest();
            xhr.open('POST', core.options.apiBase + path, true);
            xhr.setRequestHeader('Authorization', 'Bearer ' + core.options.getToken());
            if (xhr.upload && onProgress) {
                xhr.upload.onprogress = function (e) {
                    if (e.lengthComputable) onProgress(Math.round(e.loaded * 100 / e.total));
                };
            }
            xhr.onload = function () {
                var data = null;
                try { data = JSON.parse(xhr.responseText); } catch (e) { data = null; }
                if (xhr.status >= 200 && xhr.status < 300 && data && data.success !== false) { resolve(data); return; }
                var err = new Error(data && data.message ? data.message : xhr.status === 413 ? 'Файл слишком большой' : 'Ошибка загрузки (' + xhr.status + ')');
                err.status = xhr.status;
                reject(err);
            };
            xhr.onerror = function () { reject(new Error('Нет связи с сервером')); };
            xhr.send(fd);
        });
    };

    /*
     * Сжатие фото перед загрузкой: длинная сторона до maxSide, JPEG 0.8.
     * Если результат не меньше оригинала (или это не фото) — отдаётся оригинал.
     * → Promise({ blob, name })
     */
    core.compressImage = function (file, maxSide) {
        maxSide = maxSide || 1600;
        return new Promise(function (resolve) {
            var original = { blob: file, name: file.name || 'file' };
            if (!/^image\/(jpeg|png|webp)$/i.test(file.type || '') || typeof FileReader !== 'function') { resolve(original); return; }
            var reader = new FileReader();
            reader.onerror = function () { resolve(original); };
            reader.onload = function () {
                var img = new Image();
                img.onerror = function () { resolve(original); };
                img.onload = function () {
                    var k = Math.min(1, maxSide / Math.max(img.width, img.height));
                    var c = document.createElement('canvas');
                    c.width = Math.max(1, Math.round(img.width * k));
                    c.height = Math.max(1, Math.round(img.height * k));
                    var ctx = c.getContext('2d');
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(0, 0, c.width, c.height);
                    ctx.drawImage(img, 0, 0, c.width, c.height);
                    if (!c.toBlob) { resolve(original); return; }
                    c.toBlob(function (b) {
                        if (!b || b.size >= file.size) { resolve(original); return; }
                        resolve({ blob: b, name: String(original.name).replace(/\.[^.]*$/, '') + '.jpg' });
                    }, 'image/jpeg', 0.8);
                };
                img.src = reader.result;
            };
            reader.readAsDataURL(file);
        });
    };

    core.fmtSize = function (n) {
        n = Number(n) || 0;
        if (n < 1024) return n + ' Б';
        if (n < 1048576) return Math.round(n / 1024) + ' КБ';
        return (Math.round(n / 104857.6) / 10) + ' МБ';
    };

    /* yyyy-mm-dd из Date */
    core.isoDay = function (d) {
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    };

    /* дд.мм.гггг → Date или null */
    core.parseDay = function (text) {
        var m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(String(text || '').trim());
        if (!m) return null;
        var d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
        return d.getDate() === Number(m[1]) ? d : null;
    };

    core.dayText = function (d) {
        return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
    };

    core.get = function (path, params) {
        var q = [];
        if (params) {
            for (var k in params) {
                if (Object.prototype.hasOwnProperty.call(params, k) && params[k] !== undefined && params[k] !== null && params[k] !== '') {
                    q.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
                }
            }
        }
        return core.api('GET', path + (q.length ? '?' + q.join('&') : ''));
    };

    core.post = function (path, body) {
        return core.api('POST', path, body || {});
    };

    /* ---------- экранирование: всё, что пришло от пользователя ---------- */

    core.esc = function (value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    /* Текст с переносами строк */
    core.text = function (value) {
        return core.esc(value).replace(/\r?\n/g, '<br>');
    };

    /* ---------- даты ---------- */

    function pad(n) { return n < 10 ? '0' + n : String(n); }

    core.parseIso = function (iso) {
        if (!iso) return null;
        var s = String(iso);
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) s = s.replace(' ', 'T') + 'Z';
        var d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    };

    core.fmtDate = function (iso) {
        var d = core.parseIso(iso);
        if (!d) return '';
        return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear();
    };

    core.fmtDateTime = function (iso) {
        var d = core.parseIso(iso);
        if (!d) return '';
        return core.fmtDate(iso) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    };

    /* «дд.мм.гггг» или «дд.мм.гггг чч:мм» → ISO; пустая строка → null; ошибка → undefined */
    core.parseLocal = function (text) {
        var s = String(text || '').trim();
        if (!s) return null;
        var m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(s);
        if (!m) return undefined;
        var d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]),
            m[4] !== undefined ? Number(m[4]) : 18, m[5] !== undefined ? Number(m[5]) : 0, 0);
        if (isNaN(d.getTime()) || d.getDate() !== Number(m[1])) return undefined;
        return d.toISOString();
    };

    core.toLocalInput = function (iso) {
        var d = core.parseIso(iso);
        if (!d) return '';
        return core.fmtDate(iso) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    };

    /* Срок через n рабочих дней в 18:00 (сб/вс пропускаются) */
    core.dueIn = function (days) {
        var d = new Date();
        var left = days;
        while (left > 0) {
            d.setDate(d.getDate() + 1);
            if (d.getDay() !== 0 && d.getDay() !== 6) left--;
        }
        d.setHours(18, 0, 0, 0);
        return d.toISOString();
    };

    /* ---------- свои модальные окна вместо alert/confirm/prompt ---------- */

    var modalRoot = null;

    function ensureModalRoot() {
        if (modalRoot && document.body.contains(modalRoot)) return modalRoot;
        modalRoot = document.createElement('div');
        modalRoot.className = 'idf-modal-root';
        document.body.appendChild(modalRoot);
        return modalRoot;
    }

    /*
     * core.dialog({ title, html, comment: { label, required, placeholder },
     *               buttons: [{ id, text, primary, danger }] })
     * → Promise({ button, comment }) ; закрытие крестиком/Esc → button = null
     */
    core.dialog = function (opts) {
        return new Promise(function (resolve) {
            var root = ensureModalRoot();
            var wrap = document.createElement('div');
            wrap.className = 'idf-modal';

            var buttons = opts.buttons || [{ id: 'ok', text: 'OK', primary: true }];
            var html = '<div class="idf-modal-box" role="dialog">' +
                '<div class="idf-modal-head"><span>' + core.esc(opts.title || '') + '</span>' +
                '<button type="button" class="idf-modal-x" data-btn="__close">×</button></div>' +
                '<div class="idf-modal-body">' + (opts.html || '');
            if (opts.comment) {
                html += '<label class="idf-label">' + core.esc(opts.comment.label || 'Комментарий') +
                    (opts.comment.required ? ' *' : '') + '</label>' +
                    '<textarea class="idf-input idf-modal-comment" rows="4" maxlength="4000" placeholder="' +
                    core.esc(opts.comment.placeholder || '') + '"></textarea>' +
                    '<div class="idf-modal-err"></div>';
            }
            html += '</div><div class="idf-modal-foot">';
            for (var i = 0; i < buttons.length; i++) {
                var b = buttons[i];
                html += '<button type="button" class="idf-btn' + (b.primary ? ' idf-btn-primary' : '') +
                    (b.danger ? ' idf-btn-danger' : '') + '" data-btn="' + core.esc(b.id) + '">' + core.esc(b.text) + '</button>';
            }
            html += '</div></div>';
            wrap.innerHTML = html;
            root.appendChild(wrap);

            var ta = wrap.querySelector('.idf-modal-comment');
            if (ta) setTimeout(function () { ta.focus(); }, 30);

            function close(button, comment) {
                document.removeEventListener('keydown', onKey);
                if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
                resolve({ button: button, comment: comment || '' });
            }

            function onKey(e) {
                if (e.key === 'Escape' || e.keyCode === 27) close(null);
            }
            document.addEventListener('keydown', onKey);

            wrap.addEventListener('click', function (e) {
                var t = e.target;
                if (t === wrap) { close(null); return; }
                var id = t.getAttribute && t.getAttribute('data-btn');
                if (!id) return;
                if (id === '__close') { close(null); return; }
                var value = ta ? ta.value.trim() : '';
                var btn = null;
                for (var j = 0; j < buttons.length; j++) if (buttons[j].id === id) btn = buttons[j];
                if (ta && opts.comment.required && btn && !btn.noValidate && !value) {
                    wrap.querySelector('.idf-modal-err').textContent = 'Заполните комментарий';
                    ta.focus();
                    return;
                }
                close(id, value);
            });
        });
    };

    core.info = function (title, text) {
        return core.dialog({ title: title, html: '<div>' + core.text(text) + '</div>', buttons: [{ id: 'ok', text: 'Понятно', primary: true }] });
    };

    core.confirm = function (title, text, okText, danger) {
        return core.dialog({
            title: title,
            html: '<div>' + core.text(text) + '</div>',
            buttons: [
                { id: 'cancel', text: 'Отмена' },
                { id: 'ok', text: okText || 'Да', primary: !danger, danger: !!danger }
            ]
        }).then(function (r) { return r.button === 'ok'; });
    };

    /* ---------- короткое уведомление внизу ---------- */

    var toastTimer = null;
    core.toast = function (text, isError) {
        var el = document.querySelector('.idf-toast');
        if (!el) {
            el = document.createElement('div');
            el.className = 'idf-toast';
            document.body.appendChild(el);
        }
        el.textContent = text;
        el.className = 'idf-toast idf-toast-show' + (isError ? ' idf-toast-err' : '');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.className = 'idf-toast'; }, isError ? 5000 : 2500);
    };

    window.IDFCore = core;
})();
