/*
 * IDF — интерфейс заданий. Один код для PWA (mode: 'mobile') и 1С (mode: 'desktop').
 *
 *   IDF.mount(element, { mode: 'mobile' | 'desktop', setTitle(text), onCounters(c), v8Links: bool })
 *
 * Ограничения совместимости — см. core.js. Весь пользовательский текст выводится через C.esc / C.text.
 * Обработчики — делегированием по атрибуту data-idf (без onclick с данными внутри).
 */
(function () {
    'use strict';

    var C = window.IDFCore;

    var PRIORITY = { low: 'Низкий', normal: 'Обычный', high: 'Высокий' };
    var STEP_KINDS = [
        { id: 'author_head', text: 'Руководитель отдела автора' },
        { id: 'department_head', text: 'Руководитель указанного отдела' },
        { id: 'director', text: 'Директор' },
        { id: 'user', text: 'Конкретный сотрудник' }
    ];
    var EXEC_STATUS = { assigned: 'ждёт, кто возьмёт', in_work: 'в работе', done: 'выполнено' };
    var STEP_STATUS = { pending: 'ожидает', approved: 'согласовано', rejected: 'отклонено' };

    var S = null;   // состояние текущего экрана

    /* ================= монтирование ================= */

    function mount(target, opts) {
        opts = opts || {};
        S = {
            opts: opts,
            mode: opts.mode === 'desktop' ? 'desktop' : 'mobile',
            el: null,
            me: null,
            view: 'inbox',
            state: 'active',
            overdue: false,
            onlyAction: false,
            q: '',
            tasks: [],
            taskId: null,
            card: null,
            detail: 'empty',        // empty / card / form / settings
            form: null,
            settings: { tab: 'types', edit: null, editKind: null, filter: '' },
            ref: { types: null, users: null, deps: null, kinds: null },
            busy: false,
            listSeq: 0
        };

        var el = document.createElement('div');
        el.className = 'idf idf-' + S.mode + (opts.embed ? ' idf-embed' : '');
        el.innerHTML = '<div class="idf-loading">Загрузка…</div>';
        target.innerHTML = '';
        target.appendChild(el);
        S.el = el;

        el.addEventListener('click', onClick);
        el.addEventListener('change', onChange);
        el.addEventListener('input', onInput);
        el.addEventListener('keydown', onKeyDown);

        setTitle('IDF');

        return C.get('/me').then(function (me) {
            S.me = me;
            reportCounters(me.counters);
            renderShell();
            loadList();
            if (opts.openTaskId) openCard(opts.openTaskId);
            else if (opts.startCreate) openForm(null);
        }).catch(function (err) {
            el.innerHTML = '<div class="idf-empty">' + C.esc(err.message) + '</div>';
        });
    }

    function alive() {
        return S && S.el && document.body.contains(S.el);
    }

    function setTitle(t) {
        if (S.opts.setTitle) S.opts.setTitle(t);
    }

    function reportCounters(c) {
        if (S && S.me && c) S.me.counters = c;
        if (S && S.opts.onCounters && c) S.opts.onCounters(c);
    }

    function refreshCounters() {
        return C.get('/counters').then(function (r) {
            reportCounters(r.counters);
            if (alive()) renderTabs();
        }).catch(function () {});
    }

    /* ================= справочники ================= */

    function loadRef(name) {
        if (S.ref[name]) return Promise.resolve(S.ref[name]);
        var path = name === 'types' ? '/types' : name === 'users' ? '/users' : name === 'kinds' ? '/objects/kinds' : '/departments';
        return C.get(path).then(function (r) {
            S.ref[name] = r[name === 'deps' ? 'departments' : name];
            return S.ref[name];
        });
    }

    function resetRef() {
        S.ref = { types: null, users: null, deps: null, kinds: null };
    }

    /* ================= каркас ================= */

    function renderShell() {
        S.el.innerHTML =
            '<div class="idf-top">' +
                '<div class="idf-tabs"></div>' +
                '<button type="button" class="idf-btn idf-btn-primary idf-create" data-idf="create">+ Создать</button>' +
            '</div>' +
            '<div class="idf-body">' +
                '<div class="idf-list-pane"></div>' +
                '<div class="idf-detail-pane"></div>' +
            '</div>';
        renderTabs();
        renderDetail();
    }

    function tabHtml(id, text, count, warn) {
        return '<button type="button" class="idf-tab' + (S.view === id ? ' idf-tab-on' : '') + '" data-idf="tab" data-v="' + id + '">' +
            C.esc(text) + (count ? ' <span class="idf-count' + (warn ? ' idf-count-warn' : '') + '">' + count + '</span>' : '') + '</button>';
    }

    function renderTabs() {
        var box = S.el.querySelector('.idf-tabs');
        if (!box) return;
        var c = S.me.counters || {};
        var html = tabHtml('inbox', 'Входящие', c.inbox, c.inbox_overdue) + tabHtml('outbox', 'Исходящие', c.outbox);
        if (S.me.can_control) html += tabHtml('control', 'Контроль', c.control_overdue, true);
        if (S.me.is_admin && !S.opts.hideSettings) html += tabHtml('settings', 'Настройки');
        box.innerHTML = html;
    }

    function setLayout() {
        var cls = 'idf idf-' + S.mode + (S.opts.embed ? ' idf-embed' : '');
        if (S.view === 'settings') cls += ' idf-wide';
        if (S.detail !== 'empty') cls += ' idf-has-detail';
        S.el.className = cls;
    }

    /* ================= список ================= */

    function loadList() {
        if (S.view === 'settings') return;
        var seq = ++S.listSeq;
        var pane = S.el.querySelector('.idf-list-pane');
        renderFilters();
        var listBox = pane.querySelector('.idf-list');
        if (listBox && !S.tasks.length) listBox.innerHTML = '<div class="idf-empty">Загрузка…</div>';

        C.get('/tasks', { view: S.view, state: S.state, overdue: S.overdue ? 1 : '', action: S.onlyAction ? 1 : '', q: S.q }).then(function (r) {
            if (!alive() || seq !== S.listSeq) return;
            S.tasks = r.tasks || [];
            renderList();
        }).catch(function (err) {
            if (!alive()) return;
            var lb = S.el.querySelector('.idf-list');
            if (lb) lb.innerHTML = '<div class="idf-empty">' + C.esc(err.message) + '</div>';
        });
    }

    function renderFilters() {
        var pane = S.el.querySelector('.idf-list-pane');
        var html = '<div class="idf-filters">' +
            '<input type="text" class="idf-input idf-search" data-idf-input="q" placeholder="Поиск: тема или номер" value="' + C.esc(S.q) + '">';
        html += '<select class="idf-input idf-state" data-idf-change="state">' +
            opt('active', 'Активные', S.state) + opt('closed', 'Закрытые', S.state) + opt('all', 'Все', S.state) + '</select>';
        if (S.view !== 'control') {
            html += '<label class="idf-check"><input type="checkbox" data-idf-change="onlyAction"' + (S.onlyAction ? ' checked' : '') + '> Ждут моего действия</label>';
        }
        if (S.view === 'control') {
            html += '<label class="idf-check"><input type="checkbox" data-idf-change="overdue"' + (S.overdue ? ' checked' : '') + '> Только просроченные</label>';
        }
        html += '</div><div class="idf-list"></div>';
        pane.innerHTML = html;
    }

    function opt(value, text, current) {
        return '<option value="' + C.esc(value) + '"' + (String(value) === String(current) ? ' selected' : '') + '>' + C.esc(text) + '</option>';
    }

    function renderList() {
        var box = S.el.querySelector('.idf-list');
        if (!box) return;
        if (!S.tasks.length) {
            var empty = S.onlyAction ? 'Нет заданий, которые ждут вашего действия' :
                S.view === 'inbox' ? 'Вам пока не поручено ни одного задания' :
                S.view === 'outbox' ? 'Вы пока не создали ни одного задания' : 'Заданий нет';
            box.innerHTML = '<div class="idf-empty">' + empty + '</div>';
            return;
        }
        var html = '';
        S.tasks.forEach(function (t) {
            html += '<div class="idf-item' + (S.taskId === t.id ? ' idf-item-on' : '') + (t.needs_action ? ' idf-item-action' : '') + (t.overdue ? ' idf-item-overdue' : '') +
                '" data-idf="open" data-id="' + t.id + '">' +
                '<div class="idf-item-head">' +
                    '<span class="idf-num">' + C.esc(t.number || 'Черновик') + '</span>' +
                    statusChip(t.status, t.status_title) +
                    (t.priority === 'high' ? '<span class="idf-prio-high">!</span>' : '') +
                    (t.needs_action ? '<span class="idf-action-mark">Ждёт вас</span>' : '') +
                '</div>' +
                '<div class="idf-item-subj">' + C.esc(t.subject) + '</div>' +
                '<div class="idf-item-meta">' + C.esc(t.type_name) +
                    ' · ' + C.esc(t.author_name) + (t.executors_text ? ' → ' + C.esc(t.executors_text) : '') + '</div>' +
                (t.due_at ? '<div class="idf-item-due' + (t.overdue ? ' idf-red' : '') + '">Срок: ' + C.esc(C.fmtDateTime(t.due_at)) + (t.overdue ? ' — просрочено' : '') + '</div>' : '') +
                '</div>';
        });
        box.innerHTML = html;
    }

    function statusChip(status, title) {
        return '<span class="idf-chip idf-st-' + C.esc(status) + '">' + C.esc(title || status) + '</span>';
    }

    /* ================= правая часть / вторая страница ================= */

    function renderDetail() {
        setLayout();
        var pane = S.el.querySelector('.idf-detail-pane');
        if (!pane) return;

        if (S.view === 'settings') { renderSettings(pane); return; }

        if (S.detail === 'card' && S.card) { pane.innerHTML = cardHtml(S.card); scrollFeedEnd(pane); return; }
        if (S.detail === 'form' && S.form) { pane.innerHTML = formHtml(); return; }

        pane.innerHTML = S.mode === 'desktop' ? '<div class="idf-empty idf-hint">Выберите задание в списке или создайте новое</div>' : '';
    }

    function backBar(text) {
        return S.mode === 'mobile' ? '<button type="button" class="idf-back" data-idf="back">← ' + C.esc(text || 'Назад') + '</button>' : '';
    }

    function closeDetail() {
        S.detail = 'empty';
        S.taskId = null;
        S.card = null;
        S.form = null;
        setTitle('IDF');
        renderDetail();
        renderList();
    }

    function scrollFeedEnd(pane) {
        if (S.mode !== 'desktop') return;
        pane.scrollTop = 0;
    }

    /* ================= карточка ================= */

    function openCard(id) {
        S.taskId = Number(id);
        S.detail = 'card';
        var pane = S.el.querySelector('.idf-detail-pane');
        setLayout();
        if (pane && (!S.card || S.card.task.id !== S.taskId)) pane.innerHTML = '<div class="idf-empty">Загрузка…</div>';
        renderList();
        return Promise.all([C.get('/tasks/' + S.taskId), loadRef('kinds').catch(function () { return []; })]).then(function (res) {
            var card = res[0];
            if (!alive() || S.taskId !== card.task.id) return;
            S.card = card;
            setTitle(card.task.number || 'Черновик');
            renderDetail();
        }).catch(function (err) {
            if (!alive()) return;
            if (pane) pane.innerHTML = backBar() + '<div class="idf-empty">' + C.esc(err.message) + '</div>';
        });
    }

    function field(label, valueHtml) {
        if (!valueHtml) return '';
        return '<div class="idf-field"><div class="idf-field-l">' + C.esc(label) + '</div><div class="idf-field-v">' + valueHtml + '</div></div>';
    }

    function linkHtml(l) {
        var kind = String(l.kind || '');
        var shortKind = kind.indexOf('.') >= 0 ? kind.split('.')[1] : kind;
        /* представление из 1С уже содержит номер и дату («Заказ покупателя МФ-1 от 20.10.2026») */
        var text = l.title || (shortKind + (l.number ? ' № ' + l.number : '') + (l.date ? ' от ' + l.date : ''));
        if (S.opts.v8Links) {
            return '<a class="idf-link" href="v8:' + C.esc(kind) + '/' + C.esc(l.guid) + '">' + C.esc(text) + '</a>';
        }
        return '<span class="idf-link-text">' + C.esc(text) + '</span>';
    }

    /* ---------- блоки «Объекты 1С» и «Вложения» (общие для карточки и формы) ---------- */

    function objectsBlockHtml(links, canAdd, removeAttr) {
        var html = '<div class="idf-sec">Объекты 1С</div><div class="idf-links">';
        if (!links.length) html += '<div class="idf-muted">не привязаны</div>';
        links.forEach(function (l, i) {
            var rm = removeAttr ? removeAttr(l, i) : '';
            html += '<div class="idf-link-row">' + linkHtml(l) + (rm ? ' <button type="button" class="idf-tag-x" ' + rm + '>×</button>' : '') + '</div>';
        });
        html += '</div>';
        var kinds = S.ref.kinds || [];
        if (canAdd && kinds.length) {
            html += '<div class="idf-obj-add"><select class="idf-input idf-obj-kind">' +
                kinds.map(function (k) { return opt(k.id, k.title, ''); }).join('') + '</select>' +
                '<button type="button" class="idf-btn" data-idf="obj-add">Добавить объект 1С</button></div>';
        }
        return html;
    }

    /*
     * Ссылка на вложение. В 1С новые окна браузера открывать нельзя (окно прячется, 1С зависает):
     * там ссылка вида v8:open-url/<адрес> — её перехватывает 1С и открывает файл системным браузером.
     */
    function fileHref(url) {
        if (S.opts.v8Links) {
            var full = location.protocol + '//' + location.host + url;
            return 'href="v8:open-url/' + C.esc(encodeURIComponent(full)) + '"';
        }
        return 'href="' + C.esc(url) + '" target="_blank" rel="noopener"';
    }

    function fileInputHtml(changeAct) {
        return '<label class="idf-btn idf-file-btn">+ Фото или файл' +
            '<input type="file" multiple class="idf-file-input" data-idf-change="' + changeAct + '" ' +
            'accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip"></label>' +
            '<span class="idf-muted"> до 20 МБ, фото сжимаются</span>';
    }

    function attachmentsBlockHtml(list, canAdd) {
        var html = '<div class="idf-sec">Вложения</div>';
        var images = list.filter(function (a) { return a.is_image; });
        var other = list.filter(function (a) { return !a.is_image; });
        if (!list.length) html += '<div class="idf-muted">нет</div>';
        if (images.length) {
            html += '<div class="idf-thumbs">';
            images.forEach(function (a) {
                html += '<div class="idf-thumb"><img src="' + C.esc(a.url) + '" alt="" data-idf="img" data-url="' + C.esc(a.url) + '" data-name="' + C.esc(a.orig_name) + '">' +
                    (a.can_delete ? '<button type="button" class="idf-thumb-x" data-idf="att-x" data-id="' + a.id + '">×</button>' : '') + '</div>';
            });
            html += '</div>';
        }
        other.forEach(function (a) {
            if (a.purged) {
                html += '<div class="idf-file-row idf-muted">📄 ' + C.esc(a.orig_name) + ' · удалён по сроку хранения</div>';
                return;
            }
            html += '<div class="idf-file-row"><a class="idf-link" ' + fileHref(a.url) + '>📄 ' + C.esc(a.orig_name) + '</a> ' +
                '<span class="idf-muted">' + C.esc(C.fmtSize(a.size)) + ' · ' + C.esc(a.uploaded_by_name) + '</span>' +
                (a.can_delete ? ' <button type="button" class="idf-tag-x" data-idf="att-x" data-id="' + a.id + '">×</button>' : '') + '</div>';
        });
        if (canAdd) html += '<div class="idf-file-add">' + fileInputHtml('card-files') + '</div>';
        return html;
    }

    function pendingFilesHtml(files) {
        var html = '<div class="idf-sec">Вложения</div>';
        if (!files.length) html += '<div class="idf-muted">нет</div>';
        files.forEach(function (f, i) {
            html += '<div class="idf-file-row">📎 ' + C.esc(f.name) + ' <span class="idf-muted">' + C.esc(C.fmtSize(f.blob.size)) + '</span>' +
                ' <button type="button" class="idf-tag-x" data-idf="f-file-x" data-i="' + i + '">×</button></div>';
        });
        html += '<div class="idf-file-add">' + fileInputHtml('f-files') + '</div>';
        return html;
    }

    function cardHtml(card) {
        var t = card.task;
        var html = backBar('К списку') +
            '<div class="idf-card">' +
            '<div class="idf-card-head">' +
                '<span class="idf-num">' + C.esc(t.number || 'Черновик') + '</span> ' + statusChip(t.status, t.status_title) +
                (t.overdue ? ' <span class="idf-chip idf-chip-red">Просрочено</span>' : '') +
            '</div>' +
            '<div class="idf-card-subj">' + C.esc(t.subject) + '</div>' +
            '<div class="idf-fields">' +
                field('Тип', C.esc(t.type_name)) +
                field('Автор', C.esc(t.author_name) + (t.author_department_name ? ' <span class="idf-muted">(' + C.esc(t.author_department_name) + ')</span>' : '')) +
                field('Приоритет', C.esc(PRIORITY[t.priority] || t.priority)) +
                field('Срок', t.due_at ? '<span' + (t.overdue ? ' class="idf-red"' : '') + '>' + C.esc(C.fmtDateTime(t.due_at)) + '</span>' : 'без срока') +
                field('Создано', C.esc(C.fmtDateTime(t.created_at))) +
                (t.status === 'question' ? field('Вопрос задал', C.esc(t.question_from_name)) : '') +
            '</div>';

        if (t.description) html += '<div class="idf-desc">' + C.text(t.description) + '</div>';

        /* Вопрос исполнителя — заметный блок с полем ответа (иначе ответ пишут в комментарий и статус не меняется) */
        if (t.status === 'question') {
            var asked = null;
            card.feed.forEach(function (f) { if (f.kind === 'event' && f.action === 'asked') asked = f; });
            html += '<div class="idf-question">' +
                '<div><b>Вопрос от ' + C.esc(t.question_from_name || (asked && asked.user_name) || 'исполнителя') + '</b>' +
                (asked ? ' <span class="idf-feed-at">' + C.esc(C.fmtDateTime(asked.at)) + '</span>' : '') + '</div>' +
                (asked && asked.data && asked.data.comment ? '<div class="idf-question-text">' + C.text(asked.data.comment) + '</div>' : '');
            if (card.actions.indexOf('answer') >= 0) {
                html += '<textarea class="idf-input" rows="3" maxlength="4000" data-idf-input="answer" placeholder="Ваш ответ…"></textarea>' +
                    '<button type="button" class="idf-btn idf-btn-primary" data-idf="send-answer">Ответить — вернуть в работу</button>';
            } else {
                html += '<div class="idf-muted">Ждём ответа автора.</div>';
            }
            html += '</div>';
        }

        if (card.links.length || card.can_contribute) {
            html += objectsBlockHtml(card.links, card.can_contribute, function (l) {
                return l.can_delete ? 'data-idf="link-x" data-id="' + l.id + '"' : '';
            });
        }
        if (card.attachments.length || card.can_contribute) {
            html += attachmentsBlockHtml(card.attachments, card.can_contribute);
        }

        if (card.steps.length) {
            html += '<div class="idf-sec">Согласование</div><div class="idf-steps">';
            card.steps.forEach(function (s) {
                var who = s.decided_by_name || s.approvers.map(function (a) { return a.name; }).join(', ');
                html += '<div class="idf-step' + (s.current ? ' idf-step-cur' : '') + '">' +
                    '<span class="idf-step-no">' + s.step_no + '</span> ' + C.esc(s.title) +
                    ' — ' + C.esc(who) + ' <span class="idf-chip idf-step-' + C.esc(s.status) + '">' + C.esc(STEP_STATUS[s.status] || s.status) + '</span>' +
                    (s.comment ? '<div class="idf-muted">' + C.text(s.comment) + '</div>' : '') +
                    '</div>';
            });
            html += '</div>';
        }

        html += '<div class="idf-sec">Исполнители</div><div class="idf-execs">';
        card.executors.forEach(function (e) {
            var who = e.kind === 'user' ? C.esc(e.name) : 'Отдел: ' + C.esc(e.department_name) + (e.taken_by_name ? ' → ' + C.esc(e.taken_by_name) : '');
            html += '<div class="idf-exec">' + who +
                ' <span class="idf-chip idf-ex-' + C.esc(e.status) + '">' + C.esc(EXEC_STATUS[e.status] || e.status) + '</span>' +
                (e.comment ? '<div class="idf-muted">' + C.text(e.comment) + '</div>' : '') + '</div>';
        });
        if (!card.executors.length) html += '<div class="idf-muted">не указаны</div>';
        html += '</div>';

        if (card.watchers.length) {
            html += '<div class="idf-sec">Наблюдатели</div><div class="idf-muted">' +
                card.watchers.map(function (w) { return C.esc(w.name); }).join(', ') + '</div>';
        }

        html += actionsHtml(card.actions);

        html += '<div class="idf-sec">Лента</div><div class="idf-feed">';
        card.feed.forEach(function (f) { html += feedItemHtml(f); });
        html += '</div>';

        if (card.actions.indexOf('comment') >= 0) {
            var answering = card.actions.indexOf('answer') >= 0;
            html += '<div class="idf-comment-box">' +
                '<textarea class="idf-input" rows="3" maxlength="4000" data-idf-input="comment" placeholder="' +
                (answering ? 'Ответ на вопрос исполнителя…' : 'Написать комментарий…') + '"></textarea>' +
                '<button type="button" class="idf-btn' + (answering ? ' idf-btn-primary' : '') + '" data-idf="send-comment">' +
                (answering ? 'Ответить — вернуть в работу' : 'Отправить комментарий') + '</button></div>';
        }

        html += '</div>';
        return html;
    }

    var ACTION_UI = {
        edit: { text: 'Изменить' },
        submit: { text: 'Отправить', primary: true },
        approve: { text: 'Согласовать', primary: true },
        reject: { text: 'Отклонить', danger: true },
        take: { text: 'Взять в работу', primary: true },
        done: { text: 'Выполнено', primary: true },
        ask: { text: 'Вопрос автору' },
        answer: { text: 'Ответить', primary: true },
        accept: { text: 'Принять работу', primary: true },
        rework: { text: 'Вернуть на доработку' },
        force_close: { text: 'Закрыть (админ)' },
        cancel: { text: 'Отменить задание', danger: true }
    };

    function actionsHtml(actions) {
        var html = '';
        actions.forEach(function (a) {
            var ui = ACTION_UI[a];
            if (!ui) return;
            html += '<button type="button" class="idf-btn' + (ui.primary ? ' idf-btn-primary' : '') + (ui.danger ? ' idf-btn-danger' : '') +
                '" data-idf="act" data-a="' + a + '">' + C.esc(ui.text) + '</button>';
        });
        return html ? '<div class="idf-actions">' + html + '</div>' : '';
    }

    var EVENT_TEXT = {
        created: 'создал(а) задание',
        updated: 'изменил(а) задание',
        submitted: 'отправил(а) задание',
        resubmitted: 'отправил(а) задание повторно',
        step_auto_approved: 'шаг согласован автоматически',
        approved: 'согласовал(а)',
        rejected: 'отклонил(а)',
        started: 'Задание передано исполнителям',
        taken: 'взял(а) в работу',
        executor_done: 'отметил(а) выполнение',
        done: 'Все исполнители отметились — ждёт приёмки автором',
        closed: 'Задание закрыто',
        asked: 'задал(а) вопрос автору',
        answered: 'ответил(а) на вопрос',
        accepted: 'принял(а) работу, задание закрыто',
        reworked: 'вернул(а) на доработку',
        cancelled: 'отменил(а) задание',
        attached: 'прикрепил(а) файл',
        attachment_removed: 'удалил(а) файл',
        linked: 'привязал(а) объект 1С',
        unlinked: 'убрал(а) объект 1С',
        force_closed: 'закрыл(а) задание как администратор',
        files_purged: 'Файлы удалены по сроку хранения',
        draft_expired: 'Черновик отменён автоматически: не отправлялся'
    };

    function feedItemHtml(f) {
        var when = '<span class="idf-feed-at">' + C.esc(C.fmtDateTime(f.at)) + '</span>';
        if (f.kind === 'comment') {
            return '<div class="idf-feed-item idf-feed-comment"><div><b>' + C.esc(f.user_name) + '</b> ' + when + '</div>' +
                '<div class="idf-feed-text">' + C.text(f.text) + '</div></div>';
        }
        var d = f.data || {};
        var text = EVENT_TEXT[f.action] || f.action;
        var extra = '';
        if (d.number && (f.action === 'submitted' || f.action === 'resubmitted')) extra = ' № ' + d.number;
        if (d.step && (f.action === 'approved' || f.action === 'rejected' || f.action === 'step_auto_approved')) extra = ' (' + d.step + ')';
        if (d.department && f.action === 'taken') extra = ' из отдела «' + d.department + '»';
        if (d.name && (f.action === 'attached' || f.action === 'attachment_removed')) extra = ' «' + d.name + '»';
        if (d.title && (f.action === 'linked' || f.action === 'unlinked')) extra = ': ' + d.title;
        if (d.days && (f.action === 'files_purged' || f.action === 'draft_expired')) extra = ' (' + d.days + ' дн.)';
        return '<div class="idf-feed-item idf-feed-event"><div>' + (f.user_name ? '<b>' + C.esc(f.user_name) + '</b> ' : '') +
            C.esc(text + extra) + ' ' + when + '</div>' +
            (d.comment ? '<div class="idf-feed-text">' + C.text(d.comment) + '</div>' : '') + '</div>';
    }

    function runAction(a) {
        var t = S.card.task;
        if (a === 'edit') { openForm(t.id); return; }

        var cfg = {
            submit: { title: 'Отправить задание?', text: 'Задание уйдёт на согласование или сразу исполнителям.' },
            approve: { title: 'Согласовать задание?', comment: { label: 'Комментарий (необязательно)' } },
            reject: { title: 'Отклонить задание', comment: { label: 'Причина отклонения', required: true }, danger: true },
            take: { title: 'Взять задание в работу?', text: 'Вы станете исполнителем от своего отдела.' },
            done: { title: 'Отметить выполнение', comment: { label: 'Что сделано (необязательно)' } },
            ask: { title: 'Вопрос автору', comment: { label: 'Ваш вопрос', required: true } },
            answer: { title: 'Ответ исполнителю', comment: { label: 'Ответ', required: true } },
            accept: { title: 'Принять работу?', comment: { label: 'Комментарий (необязательно)' } },
            rework: { title: 'Вернуть на доработку', comment: { label: 'Что нужно доработать', required: true } },
            force_close: { title: 'Закрыть задание?', text: 'Задание будет закрыто без приёмки автором. Участники получат уведомление.', comment: { label: 'Почему закрывается', required: true } },
            cancel: { title: 'Отменить задание?', comment: { label: 'Причина (необязательно)' }, danger: true }
        }[a];
        if (!cfg) return;

        C.dialog({
            title: cfg.title,
            html: cfg.text ? '<div>' + C.esc(cfg.text) + '</div>' : '',
            comment: cfg.comment,
            buttons: [
                { id: 'cancel', text: 'Назад', noValidate: true },
                { id: 'ok', text: ACTION_UI[a].text, primary: !cfg.danger, danger: !!cfg.danger }
            ]
        }).then(function (r) {
            if (r.button !== 'ok') return;
            return C.post('/tasks/' + t.id + '/action', { action: a, comment: r.comment }).then(function () {
                C.toast('Готово');
                afterChange(t.id);
            });
        }).catch(function (err) {
            C.toast(err.message, true);
            if (err.status === 409) afterChange(t.id);
        });
    }

    function afterChange(taskId) {
        refreshCounters();
        loadList();
        if (taskId) openCard(taskId);
    }

    /* Пока автору задан вопрос, текст из любого поля — это ответ: задание возвращается в работу */
    function sendAnswer(text) {
        var id = S.card.task.id;
        C.post('/tasks/' + id + '/action', { action: 'answer', comment: text }).then(function () {
            C.toast('Ответ отправлен, задание снова в работе');
            afterChange(id);
        }).catch(function (err) {
            C.toast(err.message, true);
            if (err.status === 409) afterChange(id);
        });
    }

    function sendComment(field) {
        var ta = S.el.querySelector('[data-idf-input="' + (field || 'comment') + '"]');
        var body = ta ? ta.value.trim() : '';
        if (!body) { C.toast(field === 'answer' ? 'Напишите ответ' : 'Напишите комментарий', true); return; }
        if (S.card.actions.indexOf('answer') >= 0) { sendAnswer(body); return; }
        var id = S.card.task.id;
        C.post('/tasks/' + id + '/comments', { body: body }).then(function () {
            openCard(id);
        }).catch(function (err) { C.toast(err.message, true); });
    }

    /* ================= форма создания / правки ================= */

    function openForm(taskId) {
        Promise.all([loadRef('types'), loadRef('users'), loadRef('deps'), loadRef('kinds').catch(function () { return []; })]).then(function () {
            if (!alive()) return;
            if (taskId && S.card && S.card.task.id === taskId) {
                var t = S.card.task;
                S.form = {
                    id: t.id,
                    type_id: t.type_id,
                    subject: t.subject,
                    description: t.description,
                    priority: t.priority,
                    due: C.toLocalInput(t.due_at),
                    executors: S.card.executors.map(function (e) {
                        return e.kind === 'user' ? { kind: 'user', user_id: e.user_id } : { kind: 'department', department_id: e.department_id };
                    }),
                    watchers: S.card.watchers.map(function (w) { return w.user_id; }),
                    links: S.card.links.slice(),
                    files: []
                };
            } else {
                var first = S.ref.types[0];
                S.form = {
                    id: null,
                    type_id: first ? first.id : null,
                    subject: '', description: '', priority: 'normal', due: '',
                    executors: first ? first.default_executors.slice() : [],
                    watchers: [],
                    links: ((S.opts.prefill && S.opts.prefill.links) || []).slice(),
                    files: []
                };
                applyTypeDefaults();
            }
            S.detail = 'form';
            S.taskId = taskId || null;
            setTitle(taskId ? 'Изменение задания' : 'Новое задание');
            renderDetail();
            renderList();
        }).catch(function (err) { C.toast(err.message, true); });
    }

    function currentType() {
        var list = S.ref.types || [];
        for (var i = 0; i < list.length; i++) if (list[i].id === Number(S.form.type_id)) return list[i];
        return null;
    }

    function applyTypeDefaults() {
        var t = currentType();
        if (!t) return;
        S.form.executors = t.default_executors.slice();
        if (!S.form.due && t.default_due_hours) {
            S.form.due = C.toLocalInput(new Date(Date.now() + t.default_due_hours * 3600000).toISOString());
        }
    }

    function userName(uid) {
        var list = S.ref.users || [];
        for (var i = 0; i < list.length; i++) if (list[i].user_id === uid) return list[i].name;
        return uid;
    }

    function depName(id) {
        var list = S.ref.deps || [];
        for (var i = 0; i < list.length; i++) if (list[i].id === Number(id)) return list[i].name;
        return 'отдел #' + id;
    }

    function chipsHtml(items, removeAct) {
        if (!items.length) return '<div class="idf-muted">никого</div>';
        return items.map(function (it, i) {
            var text = typeof it === 'string' ? userName(it) :
                it.kind === 'user' ? userName(it.user_id) : 'Отдел: ' + depName(it.department_id);
            return '<span class="idf-tag">' + C.esc(text) +
                (removeAct ? ' <button type="button" class="idf-tag-x" data-idf="' + removeAct + '" data-i="' + i + '">×</button>' : '') + '</span>';
        }).join('');
    }

    function pickerOptions(withDeps) {
        var html = '<option value="">— выберите —</option>';
        if (withDeps) {
            html += '<optgroup label="Отделы (любой сотрудник отдела может взять)">';
            (S.ref.deps || []).forEach(function (d) { html += '<option value="d:' + d.id + '">' + C.esc(d.name) + '</option>'; });
            html += '</optgroup><optgroup label="Сотрудники">';
        }
        (S.ref.users || []).forEach(function (u) {
            html += '<option value="u:' + C.esc(u.user_id) + '">' + C.esc(u.name) + (u.department_name ? ' — ' + C.esc(u.department_name) : '') + '</option>';
        });
        if (withDeps) html += '</optgroup>';
        return html;
    }

    function formHtml() {
        var f = S.form;
        var type = currentType();
        var typeLocked = !!f.id;
        var canChangeExec = !type || type.allow_change_executors;

        var html = backBar('Отмена') +
            '<div class="idf-card idf-form">' +
            '<div class="idf-card-subj">' + (f.id ? 'Изменение задания' : 'Новое задание') + '</div>';

        html += '<label class="idf-label">Тип задания</label>';
        if (typeLocked) {
            html += '<div>' + C.esc(type ? type.name : '') + '</div>';
        } else {
            html += '<select class="idf-input" data-idf-change="f-type">' +
                (S.ref.types || []).map(function (t) { return opt(t.id, t.name, f.type_id); }).join('') + '</select>';
        }
        if (type && type.description) html += '<div class="idf-muted idf-type-desc">' + C.text(type.description) + '</div>';
        if (type && type.requires_approval) html += '<div class="idf-note">Требует согласования перед исполнением.</div>';

        html += '<label class="idf-label">Тема *</label>' +
            '<input type="text" class="idf-input" maxlength="' + S.me.limits.subject + '" data-idf-input="f-subject" value="' + C.esc(f.subject) + '">';

        html += '<label class="idf-label">Описание</label>' +
            '<textarea class="idf-input" rows="5" maxlength="' + S.me.limits.text + '" data-idf-input="f-description">' + C.esc(f.description) + '</textarea>';

        html += '<div class="idf-row2"><div>' +
            '<label class="idf-label">Приоритет</label><select class="idf-input" data-idf-change="f-priority">' +
            opt('low', PRIORITY.low, f.priority) + opt('normal', PRIORITY.normal, f.priority) + opt('high', PRIORITY.high, f.priority) +
            '</select></div><div>' +
            '<label class="idf-label">Срок (дд.мм.гггг чч:мм)</label>' +
            '<input type="text" class="idf-input" data-idf-input="f-due" placeholder="например 25.10.2026 18:00" value="' + C.esc(f.due) + '">' +
            '<div class="idf-quick">' +
                '<button type="button" class="idf-mini" data-idf="due" data-d="0">Сегодня</button>' +
                '<button type="button" class="idf-mini" data-idf="due" data-d="1">Завтра</button>' +
                '<button type="button" class="idf-mini" data-idf="due" data-d="3">3 раб. дня</button>' +
                '<button type="button" class="idf-mini" data-idf="due" data-d="5">Неделя</button>' +
                '<button type="button" class="idf-mini" data-idf="due" data-d="-1">Без срока</button>' +
            '</div></div></div>';

        html += '<label class="idf-label">Исполнители *</label><div class="idf-tags">' + chipsHtml(f.executors, canChangeExec ? 'f-exec-x' : null) + '</div>';
        if (canChangeExec) {
            html += '<div class="idf-picker"><select class="idf-input" data-idf-change="f-exec-add">' + pickerOptions(true) + '</select></div>';
        } else {
            html += '<div class="idf-muted">Исполнители заданы в настройках типа.</div>';
        }

        html += '<label class="idf-label">Наблюдатели</label><div class="idf-tags">' + chipsHtml(f.watchers, 'f-watch-x') + '</div>' +
            '<div class="idf-picker"><select class="idf-input" data-idf-change="f-watch-add">' + pickerOptions(false) + '</select></div>';

        html += objectsBlockHtml(f.links, true, function (l, i) {
            return l.id ? '' : 'data-idf="f-link-x" data-i="' + i + '"';   // уже сохранённые убираются в карточке
        });
        html += pendingFilesHtml(f.files);

        html += '<div class="idf-form-err"></div><div class="idf-actions">' +
            '<button type="button" class="idf-btn idf-btn-primary" data-idf="f-save" data-submit="1">Отправить</button>' +
            '<button type="button" class="idf-btn" data-idf="f-save" data-submit="0">Сохранить черновик</button>' +
            '<button type="button" class="idf-btn" data-idf="back">Отмена</button>' +
            '</div></div>';
        return html;
    }

    function readFormInputs() {
        var f = S.form;
        var el = S.el;
        var s = el.querySelector('[data-idf-input="f-subject"]');
        var d = el.querySelector('[data-idf-input="f-description"]');
        var due = el.querySelector('[data-idf-input="f-due"]');
        if (s) f.subject = s.value;
        if (d) f.description = d.value;
        if (due) f.due = due.value;
    }

    function formError(text) {
        var box = S.el.querySelector('.idf-form-err');
        if (box) box.textContent = text;
        C.toast(text, true);
    }

    function saveForm(submit) {
        readFormInputs();
        var f = S.form;
        if (!String(f.subject).trim()) { formError('Заполните тему'); return; }
        var due = C.parseLocal(f.due);
        if (due === undefined) { formError('Срок: введите дату как 25.10.2026 или 25.10.2026 18:00'); return; }
        if (!f.executors.length) { formError('Добавьте хотя бы одного исполнителя'); return; }

        var body = {
            type_id: f.type_id,
            subject: f.subject,
            description: f.description,
            priority: f.priority,
            due_at: due,
            executors: f.executors,
            watchers: f.watchers
        };

        var newLinks = f.links.filter(function (l) { return !l.id; });
        var p;
        if (f.id) {
            p = C.post('/tasks/' + f.id + '/update', body).then(function () {
                return newLinks.length ? C.post('/tasks/' + f.id + '/links', { links: newLinks }) : null;
            }).then(function () { return f.id; });
        } else {
            /* с файлами: сначала черновик, затем файлы, затем отправка */
            body.submit = !!submit && !f.files.length;
            body.links = newLinks;
            p = C.post('/tasks', body).then(function (r) { return r.id; });
        }
        p = p.then(function (id) {
            return uploadAll(id, f.files).then(function () {
                var needSubmit = submit && (f.id || f.files.length);
                return needSubmit ? C.post('/tasks/' + id + '/action', { action: 'submit' }) : null;
            }).then(function () { return id; });
        });

        var buttons = S.el.querySelectorAll('[data-idf="f-save"]');
        for (var i = 0; i < buttons.length; i++) buttons[i].disabled = true;

        p.then(function (id) {
            C.toast(submit ? 'Задание отправлено' : 'Черновик сохранён');
            S.form = null;
            if (S.opts.prefill) S.opts.prefill = null;
            if (S.view !== 'outbox' && !submit) { S.view = 'outbox'; renderTabs(); }
            afterChange(id);
        }).catch(function (err) {
            for (var j = 0; j < buttons.length; j++) buttons[j].disabled = false;
            formError(err.message);
            if (f.id && submit) afterChange(f.id);
        });
    }

    /* ================= вложения и объекты 1С ================= */

    /* Подготовить выбранные файлы: фото сжимаются, проверка размера */
    function prepareFiles(fileList) {
        var list = Array.prototype.slice.call(fileList || []);
        var out = [];
        var chain = Promise.resolve();
        list.forEach(function (file) {
            chain = chain.then(function () {
                return C.compressImage(file).then(function (r) {
                    if (r.blob.size > 20 * 1024 * 1024) { C.toast('«' + file.name + '» больше 20 МБ', true); return; }
                    out.push({ blob: r.blob, name: r.name });
                });
            });
        });
        return chain.then(function () { return out; });
    }

    function uploadAll(taskId, files) {
        var chain = Promise.resolve();
        files.forEach(function (f, i) {
            chain = chain.then(function () {
                return C.upload('/tasks/' + taskId + '/attachments', f.blob, f.name, function (pct) {
                    C.toast('Загрузка ' + (i + 1) + ' из ' + files.length + ': ' + pct + '%');
                });
            });
        });
        return chain;
    }

    function cardUpload(input) {
        if (S.busy) return;
        var id = S.card.task.id;
        S.busy = true;
        prepareFiles(input.files).then(function (files) {
            input.value = '';
            if (!files.length) return;
            return uploadAll(id, files).then(function () { C.toast('Файлы добавлены'); });
        }).catch(function (err) {
            C.toast(err.message, true);
        }).then(function () {
            S.busy = false;
            openCard(id);
        });
    }

    function selectedKind() {
        var sel = S.el.querySelector('.idf-obj-kind');
        var list = S.ref.kinds || [];
        for (var i = 0; i < list.length; i++) if (sel && String(list[i].id) === sel.value) return list[i];
        return null;
    }

    function addObjects() {
        var kind = selectedKind();
        if (!kind || !window.IDFObjects) return;
        if (S.detail === 'form') readFormInputs();
        window.IDFObjects.pick(kind, S.ref.kinds || []).then(function (links) {
            if (!links.length || !alive()) return;
            if (S.detail === 'form' && S.form) {
                links.forEach(function (l) {
                    for (var i = 0; i < S.form.links.length; i++) {
                        if (S.form.links[i].guid === l.guid && S.form.links[i].kind === l.kind) return;
                    }
                    S.form.links.push(l);
                });
                renderDetail();
                return;
            }
            if (S.card) {
                var id = S.card.task.id;
                return C.post('/tasks/' + id + '/links', { links: links }).then(function () {
                    C.toast('Объекты добавлены');
                    openCard(id);
                });
            }
        }).catch(function (err) { C.toast(err.message, true); });
    }

    function removeLink(id) {
        C.confirm('Убрать объект 1С?', 'Привязка будет удалена из задания.', 'Убрать', true).then(function (ok) {
            if (!ok) return;
            return C.post('/links/' + id + '/delete').then(function () { openCard(S.card.task.id); });
        }).catch(function (err) { C.toast(err.message, true); });
    }

    function removeAttachment(id) {
        C.confirm('Удалить файл?', 'Файл будет убран из задания.', 'Удалить', true).then(function (ok) {
            if (!ok) return;
            return C.post('/attachments/' + id + '/delete').then(function () { openCard(S.card.task.id); });
        }).catch(function (err) { C.toast(err.message, true); });
    }

    function showImage(url, name) {
        C.dialog({
            title: name || 'Фото',
            html: '<div class="idf-preview"><img src="' + C.esc(url) + '" alt=""></div>' +
                '<div class="idf-muted"><a class="idf-link" ' + fileHref(url) + '>Открыть отдельно</a></div>',
            buttons: [{ id: 'ok', text: 'Закрыть', primary: true }]
        });
    }

    /* ================= настройки (admin) ================= */

    function renderSettings(pane) {
        var st = S.settings;
        var html = '<div class="idf-card idf-settings">' +
            '<div class="idf-subtabs">' +
                subTab('types', 'Типы заданий') + subTab('deps', 'Отделы') + subTab('members', 'Сотрудники') + subTab('objects', 'Объекты 1С') +
            '</div><div class="idf-settings-body"><div class="idf-empty">Загрузка…</div></div></div>';
        pane.innerHTML = html;

        var body = pane.querySelector('.idf-settings-body');
        if (st.tab === 'types') settingsTypes(body);
        else if (st.tab === 'deps') settingsDeps(body);
        else if (st.tab === 'objects') settingsObjects(body);
        else settingsMembers(body);
    }

    function subTab(id, text) {
        return '<button type="button" class="idf-tab' + (S.settings.tab === id ? ' idf-tab-on' : '') + '" data-idf="stab" data-v="' + id + '">' + C.esc(text) + '</button>';
    }

    function adminLoad() {
        return Promise.all([
            C.get('/admin/types'),
            C.get('/admin/departments'),
            loadRef('users')
        ]).then(function (r) {
            S.settings.types = r[0].types;
            S.settings.deps = r[1].departments;
            S.ref.deps = r[1].departments.filter(function (d) { return d.is_active; });
        });
    }

    function settingsTypes(body) {
        adminLoad().then(function () {
            if (!alive()) return;
            var st = S.settings;
            if (st.edit && st.editKind === 'type') { body.innerHTML = typeEditHtml(st.edit); return; }

            var html = '<div class="idf-actions"><button type="button" class="idf-btn idf-btn-primary" data-idf="type-new">+ Новый тип</button></div>' +
                '<table class="idf-table"><tr><th>Тип</th><th>Согласование</th><th>Исполнители по умолчанию</th><th>Приёмка</th><th></th></tr>';
            st.types.forEach(function (t) {
                html += '<tr' + (t.is_active ? '' : ' class="idf-off"') + '>' +
                    '<td><b>' + C.esc(t.name) + '</b>' + (t.is_active ? '' : ' (выключен)') + '</td>' +
                    '<td>' + (t.requires_approval ? C.esc(t.approval_steps.map(stepText).join(' → ')) : 'нет') + '</td>' +
                    '<td>' + C.esc(t.default_executors.map(execText).join(', ') || '—') + '</td>' +
                    '<td>' + (t.requires_acceptance ? 'да' : 'нет') + '</td>' +
                    '<td><button type="button" class="idf-mini" data-idf="type-edit" data-id="' + t.id + '">Изменить</button></td></tr>';
            });
            html += '</table>';
            body.innerHTML = html;
        }).catch(function (err) { body.innerHTML = '<div class="idf-empty">' + C.esc(err.message) + '</div>'; });
    }

    function stepText(s) {
        if (s.kind === 'department_head') return 'Руководитель: ' + depName(s.department_id);
        if (s.kind === 'user') return userName(s.user_id);
        for (var i = 0; i < STEP_KINDS.length; i++) if (STEP_KINDS[i].id === s.kind) return STEP_KINDS[i].text;
        return s.kind;
    }

    function execText(e) {
        return e.kind === 'user' ? userName(e.user_id) : 'Отдел: ' + depName(e.department_id);
    }

    function typeEditHtml(t) {
        var html = '<div class="idf-form">' +
            '<div class="idf-card-subj">' + (t.id ? 'Тип: ' + C.esc(t.name) : 'Новый тип задания') + '</div>' +
            '<label class="idf-label">Название *</label><input type="text" class="idf-input" maxlength="100" data-idf-input="t-name" value="' + C.esc(t.name) + '">' +
            '<label class="idf-label">Описание (подсказка при создании)</label><textarea class="idf-input" rows="2" maxlength="2000" data-idf-input="t-description">' + C.esc(t.description) + '</textarea>' +
            '<label class="idf-check"><input type="checkbox" data-idf-change="t-approval"' + (t.requires_approval ? ' checked' : '') + '> Требует согласования</label>';

        if (t.requires_approval) {
            html += '<div class="idf-steps-edit">';
            t.approval_steps.forEach(function (s, i) {
                html += '<div class="idf-step-row"><span class="idf-step-no">' + (i + 1) + '</span>' +
                    '<select class="idf-input" data-idf-change="t-step-kind" data-i="' + i + '">' +
                    STEP_KINDS.map(function (k) { return opt(k.id, k.text, s.kind); }).join('') + '</select>';
                if (s.kind === 'department_head') {
                    html += '<select class="idf-input" data-idf-change="t-step-dep" data-i="' + i + '"><option value="">— отдел —</option>' +
                        (S.ref.deps || []).map(function (d) { return opt(d.id, d.name, s.department_id); }).join('') + '</select>';
                }
                if (s.kind === 'user') {
                    html += '<select class="idf-input" data-idf-change="t-step-user" data-i="' + i + '"><option value="">— сотрудник —</option>' +
                        (S.ref.users || []).map(function (u) { return opt(u.user_id, u.name, s.user_id); }).join('') + '</select>';
                }
                html += '<button type="button" class="idf-mini" data-idf="t-step-x" data-i="' + i + '">×</button></div>';
            });
            html += '<button type="button" class="idf-mini" data-idf="t-step-add">+ Шаг согласования</button>' +
                '<div class="idf-muted">Шаги идут по порядку. Если у отдела нет руководителя, шаг уходит директору.</div></div>';
        }

        html += '<label class="idf-label">Исполнители по умолчанию</label><div class="idf-tags">' + chipsHtml(t.default_executors, 't-exec-x') + '</div>' +
            '<div class="idf-picker"><select class="idf-input" data-idf-change="t-exec-add">' + pickerOptions(true) + '</select></div>' +
            '<label class="idf-check"><input type="checkbox" data-idf-change="t-allow"' + (t.allow_change_executors ? ' checked' : '') + '> Автор может менять исполнителей</label>' +
            '<label class="idf-check"><input type="checkbox" data-idf-change="t-accept"' + (t.requires_acceptance ? ' checked' : '') + '> Автор принимает работу (иначе задание закрывается сразу после выполнения)</label>' +
            '<div class="idf-row2"><div><label class="idf-label">Срок по умолчанию, часов (0 — нет)</label>' +
            '<input type="text" class="idf-input" data-idf-input="t-due" value="' + C.esc(t.default_due_hours || 0) + '"></div>' +
            '<div><label class="idf-label">Порядок в списке</label><input type="text" class="idf-input" data-idf-input="t-sort" value="' + C.esc(t.sort || 0) + '"></div></div>' +
            '<label class="idf-check"><input type="checkbox" data-idf-change="t-active"' + (t.is_active ? ' checked' : '') + '> Тип включён</label>' +
            '<div class="idf-form-err"></div><div class="idf-actions">' +
            '<button type="button" class="idf-btn idf-btn-primary" data-idf="type-save">Сохранить</button>' +
            '<button type="button" class="idf-btn" data-idf="s-cancel">Отмена</button></div></div>';
        return html;
    }

    function readTypeInputs() {
        var t = S.settings.edit;
        var q = function (n) { var x = S.el.querySelector('[data-idf-input="' + n + '"]'); return x ? x.value : ''; };
        t.name = q('t-name');
        t.description = q('t-description');
        t.default_due_hours = q('t-due');
        t.sort = q('t-sort');
    }

    function saveType() {
        readTypeInputs();
        var t = S.settings.edit;
        var body = {
            name: t.name, description: t.description, is_active: t.is_active,
            requires_approval: t.requires_approval, approval_steps: t.approval_steps,
            default_executors: t.default_executors, allow_change_executors: t.allow_change_executors,
            requires_acceptance: t.requires_acceptance, default_due_hours: t.default_due_hours, sort: t.sort
        };
        C.post('/admin/types' + (t.id ? '/' + t.id : ''), body).then(function () {
            C.toast('Тип сохранён');
            S.settings.edit = null;
            resetRef();
            renderDetail();
        }).catch(function (err) { settingsError(err.message); });
    }

    function settingsError(text) {
        var box = S.el.querySelector('.idf-form-err');
        if (box) box.textContent = text;
        C.toast(text, true);
    }

    function settingsDeps(body) {
        adminLoad().then(function () {
            if (!alive()) return;
            var st = S.settings;
            if (st.edit && st.editKind === 'dep') { body.innerHTML = depEditHtml(st.edit); return; }

            var html = '<div class="idf-actions">' +
                '<button type="button" class="idf-btn idf-btn-primary" data-idf="dep-new">+ Новый отдел</button>' +
                '<button type="button" class="idf-btn" data-idf="dep-import">Отделы продаж из 1С (managers.data)</button></div>' +
                '<table class="idf-table"><tr><th>Отдел</th><th>Руководитель</th><th>Сотрудников</th><th></th></tr>';
            st.deps.forEach(function (d) {
                html += '<tr' + (d.is_active ? '' : ' class="idf-off"') + '><td><b>' + C.esc(d.name) + '</b>' + (d.kind === 'sales' ? ' <span class="idf-muted">продажи</span>' : '') +
                    (d.is_active ? '' : ' (выключен)') + '</td>' +
                    '<td>' + (d.head_name ? C.esc(d.head_name) : '<span class="idf-muted">нет — согласует директор</span>') + '</td>' +
                    '<td>' + d.members_count + '</td>' +
                    '<td><button type="button" class="idf-mini" data-idf="dep-edit" data-id="' + d.id + '">Изменить</button></td></tr>';
            });
            html += '</table><div class="idf-muted">Сотрудников по отделам распределяйте на вкладке «Сотрудники».</div>';
            body.innerHTML = html;
        }).catch(function (err) { body.innerHTML = '<div class="idf-empty">' + C.esc(err.message) + '</div>'; });
    }

    function depEditHtml(d) {
        return '<div class="idf-form">' +
            '<div class="idf-card-subj">' + (d.id ? 'Отдел: ' + C.esc(d.name) : 'Новый отдел') + '</div>' +
            '<label class="idf-label">Название *</label><input type="text" class="idf-input" maxlength="100" data-idf-input="d-name" value="' + C.esc(d.name) + '">' +
            '<label class="idf-label">Руководитель</label><select class="idf-input" data-idf-change="d-head"><option value="">— нет —</option>' +
            (S.ref.users || []).map(function (u) { return opt(u.user_id, u.name, d.head_user_id || ''); }).join('') + '</select>' +
            '<label class="idf-check"><input type="checkbox" data-idf-change="d-sales"' + (d.kind === 'sales' ? ' checked' : '') + '> Отдел продаж</label>' +
            '<label class="idf-check"><input type="checkbox" data-idf-change="d-active"' + (d.is_active ? ' checked' : '') + '> Отдел действует</label>' +
            '<div class="idf-form-err"></div><div class="idf-actions">' +
            '<button type="button" class="idf-btn idf-btn-primary" data-idf="dep-save">Сохранить</button>' +
            '<button type="button" class="idf-btn" data-idf="s-cancel">Отмена</button></div></div>';
    }

    function saveDep() {
        var d = S.settings.edit;
        var n = S.el.querySelector('[data-idf-input="d-name"]');
        d.name = n ? n.value : d.name;
        C.post('/admin/departments' + (d.id ? '/' + d.id : ''), {
            name: d.name, head_user_id: d.head_user_id || null, kind: d.kind, is_active: d.is_active
        }).then(function () {
            C.toast('Отдел сохранён');
            S.settings.edit = null;
            resetRef();
            renderDetail();
        }).catch(function (err) { settingsError(err.message); });
    }

    function importDeps() {
        C.confirm('Отделы продаж из 1С',
            'Для каждого руководителя из managers.data будет создан или обновлён отдел продаж, его менеджеры попадут в этот отдел (если состояли в другом — будут переведены).',
            'Загрузить').then(function (ok) {
            if (!ok) return;
            return C.post('/admin/departments-import').then(function (r) {
                var x = r.result;
                C.info('Готово', 'Создано отделов: ' + x.departments_created + '\nОбновлено отделов: ' + x.departments_updated + '\nНазначено сотрудников: ' + x.members_set);
                resetRef();
                renderDetail();
            });
        }).catch(function (err) { C.toast(err.message, true); });
    }

    function settingsMembers(body) {
        Promise.all([C.get('/admin/members'), C.get('/admin/departments')]).then(function (r) {
            if (!alive()) return;
            S.settings.members = r[0].members;
            S.settings.deps = r[1].departments;
            var deps = r[1].departments;
            var f = S.settings.filter.toLowerCase();

            var html = '<input type="text" class="idf-input idf-search" data-idf-input="m-filter" placeholder="Поиск сотрудника" value="' + C.esc(S.settings.filter) + '">' +
                '<table class="idf-table"><tr><th>Сотрудник</th><th>Роль</th><th>Отдел</th><th>Должность</th></tr>';
            S.settings.members.forEach(function (m) {
                var key = (String(m.name) + ' ' + String(m.department_name) + ' ' + String(m.role)).toLowerCase();
                html += '<tr data-s="' + C.esc(key) + '"' + (f && key.indexOf(f) < 0 ? ' style="display:none"' : '') + '><td>' + C.esc(m.name) + '</td><td>' + C.esc(m.role) + '</td>' +
                    '<td><select class="idf-input" data-idf-change="m-dep" data-u="' + C.esc(m.user_id) + '"><option value="">— не в отделе —</option>' +
                    deps.map(function (d) { return opt(d.id, d.name, m.department_id || ''); }).join('') + '</select></td>' +
                    '<td><input type="text" class="idf-input" maxlength="100" data-idf-change="m-pos" data-u="' + C.esc(m.user_id) + '" value="' + C.esc(m.position) + '"></td></tr>';
            });
            html += '</table>';
            body.innerHTML = html;
        }).catch(function (err) { body.innerHTML = '<div class="idf-empty">' + C.esc(err.message) + '</div>'; });
    }

    function settingsObjects(body) {
        C.get('/admin/objects').then(function (r) {
            if (!alive()) return;
            var st = S.settings;
            st.kinds = r.kinds;
            if (st.edit && st.editKind === 'obj') { body.innerHTML = objEditHtml(st.edit); return; }
            var html = '<div class="idf-actions"><button type="button" class="idf-btn idf-btn-primary" data-idf="obj-new">+ Новый вид</button></div>' +
                '<table class="idf-table"><tr><th>Название</th><th>Вид 1С</th><th>Откуда</th><th></th></tr>';
            r.kinds.forEach(function (k) {
                html += '<tr' + (k.is_active ? '' : ' class="idf-off"') + '><td><b>' + C.esc(k.title) + '</b>' + (k.is_active ? '' : ' (выключен)') + '</td>' +
                    '<td>' + C.esc(k.kind) + '</td>' +
                    '<td>' + (k.source === 'directory' ? 'справочник ' + C.esc(k.directory) + (k.filter_by_manager ? ', только свои' : '') : 'запрос в 1С') + '</td>' +
                    '<td><button type="button" class="idf-mini" data-idf="obj-edit" data-id="' + k.id + '">Изменить</button></td></tr>';
            });
            html += '</table><div class="idf-muted">Документы запрашиваются у 1С задачей idf_docs по контрагенту и периоду. ' +
                'Справочники берутся из файлов, которые 1С уже выгружает на сервер.</div>';
            body.innerHTML = html;
        }).catch(function (err) { body.innerHTML = '<div class="idf-empty">' + C.esc(err.message) + '</div>'; });
    }

    function objEditHtml(k) {
        return '<div class="idf-form">' +
            '<div class="idf-card-subj">' + (k.id ? 'Объект: ' + C.esc(k.title) : 'Новый вид объекта 1С') + '</div>' +
            '<label class="idf-label">Название в списке *</label><input type="text" class="idf-input" maxlength="60" data-idf-input="o-title" value="' + C.esc(k.title) + '">' +
            '<label class="idf-label">Вид 1С * (например Документ.ЗаказПокупателя)</label><input type="text" class="idf-input" maxlength="90" data-idf-input="o-kind" value="' + C.esc(k.kind) + '">' +
            '<label class="idf-label">Откуда брать</label><select class="idf-input" data-idf-change="o-source">' +
                opt('1c', 'Запрос в 1С (документы, по контрагенту и периоду)', k.source) +
                opt('directory', 'Справочник на сервере', k.source) + '</select>' +
            (k.source === 'directory' ?
                '<label class="idf-label">Файл справочника (без .data)</label><input type="text" class="idf-input" maxlength="60" data-idf-input="o-dir" value="' + C.esc(k.directory) + '">' +
                '<label class="idf-check"><input type="checkbox" data-idf-change="o-own"' + (k.filter_by_manager ? ' checked' : '') + '> Менеджеру — только свои записи</label>' : '') +
            '<label class="idf-label">Порядок в списке</label><input type="text" class="idf-input" data-idf-input="o-sort" value="' + C.esc(k.sort || 0) + '">' +
            '<label class="idf-check"><input type="checkbox" data-idf-change="o-active"' + (k.is_active ? ' checked' : '') + '> Включён</label>' +
            '<div class="idf-form-err"></div><div class="idf-actions">' +
            '<button type="button" class="idf-btn idf-btn-primary" data-idf="obj-save">Сохранить</button>' +
            '<button type="button" class="idf-btn" data-idf="s-cancel">Отмена</button></div></div>';
    }

    function readObjInputs() {
        var k = S.settings.edit;
        var q = function (n) { var x = S.el.querySelector('[data-idf-input="' + n + '"]'); return x ? x.value : null; };
        if (q('o-title') !== null) k.title = q('o-title');
        if (q('o-kind') !== null) k.kind = q('o-kind');
        if (q('o-dir') !== null) k.directory = q('o-dir');
        if (q('o-sort') !== null) k.sort = q('o-sort');
    }

    function saveObj() {
        readObjInputs();
        var k = S.settings.edit;
        C.post('/admin/objects' + (k.id ? '/' + k.id : ''), {
            title: k.title, kind: k.kind, source: k.source, directory: k.directory,
            filter_by_manager: k.filter_by_manager, is_active: k.is_active, sort: k.sort
        }).then(function () {
            C.toast('Сохранено');
            S.settings.edit = null;
            resetRef();
            renderDetail();
        }).catch(function (err) { settingsError(err.message); });
    }

    function saveMember(uid) {
        var m = null;
        S.settings.members.forEach(function (x) { if (x.user_id === uid) m = x; });
        if (!m) return;
        C.post('/admin/members', { user_id: uid, department_id: m.department_id || null, position: m.position || '' }).then(function () {
            C.toast('Сохранено');
            resetRef();
        }).catch(function (err) { C.toast(err.message, true); });
    }

    /* ================= обработчики событий ================= */

    function attr(t, name) {
        while (t && t !== S.el) {
            if (t.getAttribute && t.getAttribute(name) !== null) return t;
            t = t.parentNode;
        }
        return null;
    }

    function onClick(e) {
        var el = attr(e.target, 'data-idf');
        if (!el) return;
        var a = el.getAttribute('data-idf');
        var st = S.settings;

        if (a === 'tab') {
            S.view = el.getAttribute('data-v');
            S.tasks = [];
            S.detail = 'empty'; S.card = null; S.form = null; S.taskId = null;
            st.edit = null;
            setTitle('IDF');
            renderTabs();
            setLayout();
            if (S.view === 'settings') { S.el.querySelector('.idf-list-pane').innerHTML = ''; renderDetail(); }
            else { renderDetail(); loadList(); }
            refreshCounters();
        }
        else if (a === 'open') openCard(el.getAttribute('data-id'));
        else if (a === 'create') {
            if (S.view === 'settings') { S.view = 'outbox'; renderTabs(); loadList(); }
            openForm(null);
        }
        else if (a === 'back') closeDetail();
        else if (a === 'act') runAction(el.getAttribute('data-a'));
        else if (a === 'send-comment') sendComment('comment');
        else if (a === 'send-answer') sendComment('answer');

        /* форма задания */
        else if (a === 'due') {
            readFormInputs();
            var d = Number(el.getAttribute('data-d'));
            if (d < 0) S.form.due = '';
            else if (d === 0) { var x = new Date(); x.setHours(18, 0, 0, 0); S.form.due = C.toLocalInput(x.toISOString()); }
            else S.form.due = C.toLocalInput(C.dueIn(d));
            var inp = S.el.querySelector('[data-idf-input="f-due"]');
            if (inp) inp.value = S.form.due;
        }
        else if (a === 'f-exec-x') { readFormInputs(); S.form.executors.splice(Number(el.getAttribute('data-i')), 1); renderDetail(); }
        else if (a === 'f-watch-x') { readFormInputs(); S.form.watchers.splice(Number(el.getAttribute('data-i')), 1); renderDetail(); }
        else if (a === 'f-save') saveForm(el.getAttribute('data-submit') === '1');
        else if (a === 'f-link-x') { readFormInputs(); S.form.links.splice(Number(el.getAttribute('data-i')), 1); renderDetail(); }
        else if (a === 'f-file-x') { readFormInputs(); S.form.files.splice(Number(el.getAttribute('data-i')), 1); renderDetail(); }
        else if (a === 'obj-add') addObjects();
        else if (a === 'link-x') removeLink(el.getAttribute('data-id'));
        else if (a === 'att-x') removeAttachment(el.getAttribute('data-id'));
        else if (a === 'img') showImage(el.getAttribute('data-url'), el.getAttribute('data-name'));

        /* настройки */
        else if (a === 'stab') { st.tab = el.getAttribute('data-v'); st.edit = null; renderDetail(); }
        else if (a === 's-cancel') { st.edit = null; renderDetail(); }
        else if (a === 'type-new') {
            st.editKind = 'type';
            st.edit = { id: null, name: '', description: '', is_active: true, requires_approval: false, approval_steps: [],
                default_executors: [], allow_change_executors: true, requires_acceptance: true, default_due_hours: 0, sort: 0 };
            renderDetail();
        }
        else if (a === 'type-edit') {
            var id = Number(el.getAttribute('data-id'));
            st.types.forEach(function (t) {
                if (t.id === id) st.edit = JSON.parse(JSON.stringify(t));
            });
            st.editKind = 'type';
            renderDetail();
        }
        else if (a === 'type-save') saveType();
        else if (a === 't-step-add') { readTypeInputs(); st.edit.approval_steps.push({ kind: 'author_head' }); renderDetail(); }
        else if (a === 't-step-x') { readTypeInputs(); st.edit.approval_steps.splice(Number(el.getAttribute('data-i')), 1); renderDetail(); }
        else if (a === 't-exec-x') { readTypeInputs(); st.edit.default_executors.splice(Number(el.getAttribute('data-i')), 1); renderDetail(); }
        else if (a === 'dep-new') { st.editKind = 'dep'; st.edit = { id: null, name: '', head_user_id: '', kind: 'other', is_active: true }; renderDetail(); }
        else if (a === 'dep-edit') {
            var did = Number(el.getAttribute('data-id'));
            st.deps.forEach(function (d) { if (d.id === did) st.edit = { id: d.id, name: d.name, head_user_id: d.head_user_id || '', kind: d.kind, is_active: !!d.is_active }; });
            st.editKind = 'dep';
            renderDetail();
        }
        else if (a === 'dep-save') saveDep();
        else if (a === 'obj-new') { st.editKind = 'obj'; st.edit = { id: null, title: '', kind: 'Документ.', source: '1c', directory: '', filter_by_manager: false, is_active: true, sort: 100 }; renderDetail(); }
        else if (a === 'obj-edit') {
            var oid = Number(el.getAttribute('data-id'));
            (st.kinds || []).forEach(function (k) { if (k.id === oid) st.edit = JSON.parse(JSON.stringify(k)); });
            st.editKind = 'obj';
            renderDetail();
        }
        else if (a === 'obj-save') saveObj();
        else if (a === 'dep-import') importDeps();
    }

    function addPicked(list, value, allowDeps) {
        if (!value) return;
        var kind = value.charAt(0);
        var id = value.slice(2);
        for (var i = 0; i < list.length; i++) {
            var x = list[i];
            if (kind === 'u' && x.kind === 'user' && x.user_id === id) return;
            if (kind === 'd' && x.kind === 'department' && String(x.department_id) === id) return;
        }
        if (kind === 'u') list.push({ kind: 'user', user_id: id });
        else if (kind === 'd' && allowDeps) list.push({ kind: 'department', department_id: Number(id) });
    }

    function onChange(e) {
        var el = attr(e.target, 'data-idf-change');
        if (!el) return;
        var a = el.getAttribute('data-idf-change');
        var v = el.type === 'checkbox' ? el.checked : el.value;
        var st = S.settings;

        if (a === 'state') { S.state = v; loadList(); }
        else if (a === 'overdue') { S.overdue = v; loadList(); }
        else if (a === 'onlyAction') { S.onlyAction = v; loadList(); }

        else if (a === 'f-type') { readFormInputs(); S.form.type_id = Number(v); applyTypeDefaults(); renderDetail(); }
        else if (a === 'f-priority') S.form.priority = v;
        else if (a === 'card-files') cardUpload(el);
        else if (a === 'f-files') {
            readFormInputs();
            prepareFiles(el.files).then(function (files) {
                S.form.files = S.form.files.concat(files);
                renderDetail();
            });
        }
        else if (a === 'f-exec-add') { readFormInputs(); addPicked(S.form.executors, v, true); renderDetail(); }
        else if (a === 'f-watch-add') {
            readFormInputs();
            var uid = v.slice(2);
            if (v && S.form.watchers.indexOf(uid) < 0) S.form.watchers.push(uid);
            renderDetail();
        }

        else if (a === 't-approval') { readTypeInputs(); st.edit.requires_approval = v; if (v && !st.edit.approval_steps.length) st.edit.approval_steps.push({ kind: 'author_head' }); renderDetail(); }
        else if (a === 't-step-kind') { readTypeInputs(); st.edit.approval_steps[Number(el.getAttribute('data-i'))] = { kind: v }; renderDetail(); }
        else if (a === 't-step-dep') st.edit.approval_steps[Number(el.getAttribute('data-i'))].department_id = Number(v) || null;
        else if (a === 't-step-user') st.edit.approval_steps[Number(el.getAttribute('data-i'))].user_id = v || null;
        else if (a === 't-exec-add') { readTypeInputs(); addPicked(st.edit.default_executors, v, true); renderDetail(); }
        else if (a === 't-allow') st.edit.allow_change_executors = v;
        else if (a === 't-accept') st.edit.requires_acceptance = v;
        else if (a === 't-active') st.edit.is_active = v;

        else if (a === 'o-source') { readObjInputs(); st.edit.source = v; renderDetail(); }
        else if (a === 'o-own') st.edit.filter_by_manager = v;
        else if (a === 'o-active') st.edit.is_active = v;
        else if (a === 'd-head') st.edit.head_user_id = v;
        else if (a === 'd-sales') st.edit.kind = v ? 'sales' : 'other';
        else if (a === 'd-active') st.edit.is_active = v;

        else if (a === 'm-dep' || a === 'm-pos') {
            var u = el.getAttribute('data-u');
            st.members.forEach(function (m) {
                if (m.user_id !== u) return;
                if (a === 'm-dep') m.department_id = v ? Number(v) : null;
                else m.position = v;
            });
            saveMember(u);
        }
    }

    var searchTimer = null;

    function onInput(e) {
        var el = attr(e.target, 'data-idf-input');
        if (!el) return;
        var a = el.getAttribute('data-idf-input');
        if (a === 'q') {
            S.q = el.value;
            if (searchTimer) clearTimeout(searchTimer);
            searchTimer = setTimeout(loadList, 400);
        } else if (a === 'm-filter') {
            S.settings.filter = el.value;
            var f = el.value.trim().toLowerCase();
            var rows = S.el.querySelectorAll('tr[data-s]');
            for (var i = 0; i < rows.length; i++) {
                rows[i].style.display = !f || rows[i].getAttribute('data-s').indexOf(f) >= 0 ? '' : 'none';
            }
        }
    }

    function onKeyDown(e) {
        var el = attr(e.target, 'data-idf-input');
        if (el && el.getAttribute('data-idf-input') === 'comment' && (e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.keyCode === 13)) {
            sendComment();
        }
    }

    /* Обновить список и счётчики (панель 1С вызывает раз в минуту), не мешая форме */
    function refresh() {
        if (!alive()) return;
        refreshCounters();
        if (S.view !== 'settings' && S.detail !== 'form') loadList();
    }

    window.IDF = {
        refresh: refresh,
        mount: mount,
        refreshCounters: function () { if (alive()) return refreshCounters(); return C.get('/counters').then(function (r) { return r.counters; }); }
    };
})();
