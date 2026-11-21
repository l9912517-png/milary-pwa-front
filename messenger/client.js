(function () {
    'use strict';

    const API = '/api/messenger';
let currentChat = null;
let currentChatPeer = null;
let currentChatMuted = false;
let pollTimer = null;
let lastRenderedMessagesSignature = '';
let lastMessageId = 0;
let selectedMessageIds = new Set();
let currentMessages = [];

    function jwt() {
        return localStorage.getItem('jwt') || '';
    }

    async function api(path, options = {}) {
        const headers = Object.assign({
            'Authorization': 'Bearer ' + jwt(),
            'Content-Type': 'application/json'
        }, options.headers || {});

        const response = await fetch(API + path, Object.assign({}, options, { headers }));
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return response.json();
    }

    function esc(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function fmtDate(value) {
        if (!value) return '';

        // SQLite CURRENT_TIMESTAMP хранится в UTC без суффикса Z:
        // "YYYY-MM-DD HH:mm:ss". Если передать такую строку напрямую
        // в Date(), браузер может трактовать её как местное время.
        // Поэтому явно помечаем SQLite-время как UTC и только после этого
        // переводим его в локальный часовой пояс устройства.
        let raw = String(value).trim();
        let date;

        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)) {
            date = new Date(raw.replace(' ', 'T') + 'Z');
        } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(raw)) {
            date = new Date(raw + 'Z');
        } else {
            date = new Date(raw);
        }

        if (Number.isNaN(date.getTime())) return '';

        return date.toLocaleString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function stopPolling() {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
    }

    async function loadCurrentUser() {
        try {
            const data = await api('/me');
            window.MF_MESSENGER_USER_ID = data.user_id || '';
            localStorage.setItem(
                'messenger_user_id',
                window.MF_MESSENGER_USER_ID
            );
        } catch (_) {}
    }

    async function updateBadge() {
        try {
            const data = await api('/unread');

            const badge = document.getElementById('messengerBadge');

            if (!badge) return;

            const count = Number(data.unread || 0);

            badge.textContent = count > 99 ? '99+' : String(count);

            badge.classList.toggle(
                'hidden',
                count === 0
            );

        } catch (_) {}
    }

    async function showMessenger() {

    stopPolling();

    currentChat = null;
    currentChatPeer = null;
    currentChatMuted = false;
    lastMessageId = 0;

    if (typeof window.title !== 'undefined' && window.title) {
        window.title.innerText = 'Чаты';
    } else {
        const title = document.getElementById('screen-title');
        if (title) title.innerText = 'Чаты';
    }

    const container =
        document.getElementById('screen-container');

    container.innerHTML =
        '<div class="mf-messenger-loading">Загрузка...</div>';

    try {

        const data = await api('/chats');

        /*
         * Сохраняем список чатов.
         * Он понадобится при открытии конкретного чата,
         * чтобы показать имя собеседника в шапке.
         */

        window.MF_MESSENGER_CHATS =
            data.chats || [];

        renderChats(
            window.MF_MESSENGER_CHATS
        );

        updateBadge();

    } catch (err) {

        console.error(err);

        container.innerHTML =
            '<div class="mf-messenger-error">' +
            'Не удалось загрузить чаты' +
            '</div>';
    }
}

    function renderChats(chats) {

    const container =
        document.getElementById(
            'screen-container'
        );


    /*
     * Разделяем группы и личные чаты.
     */

    const groupChats =
        chats.filter(
            chat => chat.type === 'group'
        );


    const privateChats =
        chats.filter(
            chat => chat.type !== 'group'
        );


    /*
     * Рендер одной карточки чата.
     */

    function renderChat(chat, isGroup) {

        const title =
            isGroup
                ? (
                    chat.title ||
                    'Группа'
                )
                : (
                    chat.peer
                        ? chat.peer.name
                        : 'Пользователь'
                );


        const preview =
            chat.last_body ||
            'Нет сообщений';


        const unread =
            Number(
                chat.unread_count || 0
            );


        /*
         * Для группы используем
         * отдельную иконку.
         */

        const avatar =
            isGroup
                ? '👥'
                : esc(title)
                    .slice(0, 1)
                    .toUpperCase();


        return `

            <button
                class="mf-chat-row ${
                    isGroup
                        ? 'mf-group-chat-row'
                        : ''
                }"
                onclick="
                    window.MF_MESSENGER.openChat(
                        ${chat.id}
                    )
                "
                ${
                    isGroup
                        ? `
                            style="
                                background:#edf7e6 !important;
                                border-left:4px solid #2f751d;
                            "
                          `
                        : ''
                }
            >

                <span class="mf-chat-avatar ${
                    isGroup
                        ? 'mf-group-chat-avatar'
                        : ''
                }">

                    ${avatar}

                </span>


                <span class="mf-chat-main">

                    <span class="mf-chat-title">

                        ${
                            isGroup
                                ? '👥 '
                                : ''
                        }

                        ${esc(title)}

                    </span>


                    <span class="mf-chat-preview">

                        ${esc(preview)}

                    </span>

                </span>


                <span class="mf-chat-meta">

                    <span>

                        ${fmtDate(
                            chat.last_message_at ||
                            chat.created_at
                        )}

                    </span>


                    ${
                        unread
                            ? `
                                <b>
                                    ${
                                        unread > 99
                                            ? '99+'
                                            : unread
                                    }
                                </b>
                              `
                            : ''
                    }

                </span>

            </button>

        `;
    }


    /*
     * Сначала группы.
     */

    const groupsHtml =
        groupChats
            .map(
                chat =>
                    renderChat(
                        chat,
                        true
                    )
            )
            .join('');


    /*
     * Потом обычные чаты.
     */

    const privateHtml =
        privateChats
            .map(
                chat =>
                    renderChat(
                        chat,
                        false
                    )
            )
            .join('');


    /*
     * Формируем список.
     */

    let chatsHtml = '';


    if (groupChats.length) {

        chatsHtml += `

            <div
                class="mf-chat-section-title"
                style="
                    margin:8px 4px 6px;
                    font-size:13px;
                    font-weight:700;
                    color:#35652a;
                "
            >
                👥 Групповые чаты
            </div>

            <div class="mf-group-chats">

                ${groupsHtml}

            </div>

        `;

    }


    if (privateChats.length) {

        chatsHtml += `

            ${
                groupChats.length
                    ? `
                        <div
                            class="mf-chat-section-title"
                            style="
                                margin:14px 4px 6px;
                                font-size:13px;
                                font-weight:700;
                                color:#777;
                            "
                        >
                            Личные чаты
                        </div>
                      `
                    : ''
            }


            <div class="mf-private-chats">

                ${privateHtml}

            </div>

        `;

    }


    if (!chats.length) {

        chatsHtml = `

            <div class="mf-empty">

                Чатов пока нет.

                <br>

                Нажмите ＋,
                чтобы начать.

            </div>

        `;

    }


    container.innerHTML = `

        <section class="mf-messenger">


            <div class="mf-messenger-toolbar">

                <strong>
                    Чаты
                </strong>


                <button
                    class="mf-icon-button"
                    onclick="
                        window.MF_MESSENGER.newChat()
                    "
                    aria-label="Новый чат"
                >
                    ＋
                </button>

            </div>


            <div class="mf-chat-list">

                ${chatsHtml}

            </div>


        </section>

    `;
}

async function newChat() {

    try {

        const data = await api('/users');
        const users = data.users || [];

        if (!users.length) {
            alert('Нет доступных пользователей');
            return;
        }


        const overlay =
            document.createElement('div');

        overlay.className =
            'mf-modal-overlay';


        overlay.innerHTML = `

            <div class="mf-modal mf-new-chat-modal">


                <!-- ================= HEADER ================= -->

                <div class="mf-modal-header">

                    <div>

                        <h3>
                            Новый чат
                        </h3>

                        <div class="mf-modal-subtitle">
                            Выберите пользователя
                        </div>

                    </div>


                    <button
                        type="button"
                        class="mf-modal-close"
                        aria-label="Закрыть"
                        onclick="
                            this.closest(
                                '.mf-modal-overlay'
                            ).remove()
                        "
                    >
                        ×
                    </button>

                </div>


                <!-- ================= ПОИСК ================= -->

                <div class="mf-user-search-wrap">

                    <svg
                        class="mf-search-icon"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                    >

                        <circle
                            cx="11"
                            cy="11"
                            r="7"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                        />

                        <path
                            d="M16.5 16.5L21 21"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                        />

                    </svg>


                    <input
                        type="text"
                        id="mfUserSearch"
                        class="mf-user-search"
                        placeholder="Поиск пользователя..."
                        autocomplete="off"
                    >

                </div>


                <!-- ================= СПИСОК ================= -->

                <div class="mf-user-list">

                    ${
                        users.map(u => `

                            <button
                                type="button"
                                class="mf-user-item"

                                data-name="${esc(u.name)}"
                                data-role="${esc(u.role)}"

                                onclick="
                                    window.MF_MESSENGER.createPrivateChat(
                                        decodeURIComponent(
                                            '${encodeURIComponent(u.user_id)}'
                                        )
                                    )
                                "
                            >

                                <span
                                    class="mf-user-avatar"
                                >
                                    ${
                                        esc(
                                            u.name || '?'
                                        )
                                        .trim()
                                        .charAt(0)
                                        .toUpperCase()
                                    }
                                </span>


                                <span
                                    class="mf-user-info"
                                >

                                    <span
                                        class="mf-user-name"
                                    >
                                        ${esc(u.name)}
                                    </span>


                                    <span
                                        class="mf-user-role"
                                    >
                                        ${esc(u.role)}
                                    </span>

                                </span>


                                <span
                                    class="mf-user-arrow"
                                >
                                    ›
                                </span>

                            </button>

                        `).join('')

                    }

                </div>


                <!-- ================= ОТМЕНА ================= -->

                <button
                    type="button"
                    class="mf-cancel"
                    onclick="
                        this.closest(
                            '.mf-modal-overlay'
                        ).remove()
                    "
                >
                    Отмена
                </button>


            </div>

        `;


        document.body.appendChild(
            overlay
        );


        /* =========================================
           ПОИСК ПОЛЬЗОВАТЕЛЯ
        ========================================= */

        const search =
            overlay.querySelector(
                '#mfUserSearch'
            );


        const items =
            Array.from(
                overlay.querySelectorAll(
                    '.mf-user-item'
                )
            );


        const userList =
            overlay.querySelector(
                '.mf-user-list'
            );


        /*
         * Сообщение "Пользователь не найден"
         */

        const noResults =
            document.createElement(
                'div'
            );


        noResults.className =
            'mf-user-search-empty';


        noResults.textContent =
            'Пользователь не найден';


        noResults.style.cssText = `
            display:none;
            padding:20px;
            text-align:center;
            color:#777;
            font-size:14px;
        `;


        if (userList) {

            userList.appendChild(
                noResults
            );

        }


        /*
         * Нормализация текста.
         *
         * Убираем лишние пробелы,
         * приводим к нижнему регистру.
         */

        function normalizeSearchText(
            value
        ) {

            return String(
                value == null
                    ? ''
                    : value
            )
            .toLowerCase()
            .trim()
            .replace(
                /\s+/g,
                ' '
            );

        }


        /*
         * Сам поиск.
         */

        if (search) {

            search.addEventListener(
                'input',
                function () {

                    const query =
                        normalizeSearchText(
                            this.value
                        );


                    let visibleCount =
                        0;


                    items.forEach(
                        function (item) {

                            const name =
                                normalizeSearchText(
                                    item.dataset.name
                                );


                            const role =
                                normalizeSearchText(
                                    item.dataset.role
                                );


                            /*
                             * Ищем одновременно
                             * по имени и роли.
                             */

                            const visible =
                                !query ||
                                name.includes(query) ||
                                role.includes(query);


                            /*
                             * ВАЖНО:
                             *
                             * CSS мессенджера может задавать
                             * display:flex для .mf-user-item.
                             *
                             * Поэтому обычного
                             * item.style.display = 'none'
                             * недостаточно.
                             *
                             * Используем !important.
                             */

                            if (visible) {

                                item.style.setProperty(
                                    'display',
                                    'flex',
                                    'important'
                                );

                                visibleCount++;

                            } else {

                                item.style.setProperty(
                                    'display',
                                    'none',
                                    'important'
                                );

                            }

                        }
                    );


                    /*
                     * Ничего не найдено.
                     */

                    if (noResults) {

                        noResults.style.display =
                            query &&
                            visibleCount === 0
                                ? 'block'
                                : 'none';

                    }

                }
            );

        }


        /* =========================================
           ЗАКРЫТИЕ ПО КЛИКУ ВНЕ ОКНА
        ========================================= */

        overlay.addEventListener(
            'click',
            function (event) {

                if (
                    event.target === overlay
                ) {

                    overlay.remove();

                }

            }
        );


        /* =========================================
           ФОКУС В ПОИСК
        ========================================= */

        setTimeout(
            function () {

                if (search) {
                    search.focus();
                }

            },
            50
        );


    } catch (err) {

        console.error(
            '[MESSENGER NEW CHAT]',
            err
        );


        alert(
            'Не удалось загрузить пользователей'
        );

    }

}

    async function createPrivateChat(userId) {

        try {

            const data =
                await api(
                    '/chats/private',
                    {
                        method: 'POST',
                        body: JSON.stringify({
                            user_id: userId
                        })
                    }
                );

            document
                .querySelector('.mf-modal-overlay')
                ?.remove();

            await openChat(
                data.chat_id
            );

        } catch (err) {

            console.error(err);

            alert(
                'Не удалось создать чат'
            );
        }
    }

   async function openChat(chatId) {
    selectedMessageIds.clear();
    currentMessages = [];

    stopPolling();

    currentChat = Number(chatId);
    currentChatMuted = false;
    lastMessageId = 0;
    lastRenderedMessagesSignature = '';

    /*
     * Сначала пытаемся взять собеседника
     * из уже загруженного списка чатов.
     */

    currentChatPeer = null;

    const chats =
        window.MF_MESSENGER_CHATS || [];

    const chat =
        chats.find(
            c => Number(c.id) === currentChat
        );

    if (chat) {

        if (chat.type === 'private') {

            currentChatPeer =
                chat.peer || null;

        } else {

            currentChatPeer = {
                name: chat.title || 'Группа',
                role: '',
                type: 'group',
                memberCount: Number(chat.member_count || 0)
            };
        }
    }


    /*
     * Если чат был только что создан
     * через "Новый чат", списка может ещё не быть.
     *
     * Тогда один раз запрашиваем актуальный список.
     */

    if (!currentChatPeer) {

        try {

            const data =
                await api('/chats');

            window.MF_MESSENGER_CHATS =
                data.chats || [];

            const freshChat =
                window.MF_MESSENGER_CHATS.find(
                    c => Number(c.id) === currentChat
                );

            if (freshChat) {

                if (freshChat.type === 'private') {

                    currentChatPeer =
                        freshChat.peer || null;

                } else {

                    currentChatPeer = {
                        name:
                            freshChat.title ||
                            'Группа',
                        role: '',
                        type: 'group',
                        memberCount: Number(freshChat.member_count || 0)
                    };
                }
            }

        } catch (err) {

            console.error(
                'Не удалось получить данные чата:',
                err
            );
        }
    }


    await loadChatSettings();
    renderChatShell();

    await loadChatMessages(true);

    pollTimer =
        setInterval(
            loadChatMessages,
            1500
        );
}

async function loadChatSettings() {
    if (!currentChat) return;

    try {
        const data = await api(`/chats/${currentChat}/settings`);
        currentChatMuted = Boolean(data.muted);
    } catch (err) {
        console.error('Не удалось получить настройки чата:', err);
        currentChatMuted = false;
    }
}

async function toggleChatMute() {
    if (!currentChat) return;

    const nextMuted = !currentChatMuted;
    const toggle = document.getElementById('mfChatMuteToggle');
    const label = document.getElementById('mfChatMuteLabel');

    if (toggle) toggle.disabled = true;

    try {
        const data = await api(`/chats/${currentChat}/settings`, {
            method: 'POST',
            body: JSON.stringify({ muted: nextMuted })
        });

        currentChatMuted = Boolean(data.muted);
        if (toggle) {
            toggle.classList.toggle('is-on', currentChatMuted);
            toggle.setAttribute('aria-checked', currentChatMuted ? 'true' : 'false');
        }
        if (label) label.textContent = currentChatMuted ? 'Без уведомлений' : 'Уведомления';
    } catch (err) {
        console.error('Не удалось изменить уведомления чата:', err);
    } finally {
        if (toggle) toggle.disabled = false;
    }
}

function renderChatShell() {

    const container =
        document.getElementById('screen-container');

    const peer =
        currentChatPeer || {};

    const peerName =
        peer.name || 'Пользователь';

    const isGroup = peer.type === 'group';
    const memberCount = Number(peer.memberCount || 0);

    const peerRole =
        isGroup
            ? (
                memberCount > 0
                    ? `Группа · ${memberCount} ${memberCount === 1 ? 'участник' : (memberCount < 5 ? 'участника' : 'участников')}`
                    : 'Группа'
            )
            : (peer.role || 'Внутренний пользователь');

    const avatar =
        isGroup
            ? '👥'
            : (
                String(peerName)
                    .trim()
                    .slice(0, 1)
                    .toUpperCase() || 'П'
            );


    container.innerHTML = `

        <section class="mf-messenger mf-chat-screen">

            <!-- ================= ШАПКА ЧАТА ================= -->

            <header class="mf-chat-header">

                <button
                    type="button"
                    class="mf-chat-back"
                    onclick="window.MF_MESSENGER.show()"
                    aria-label="Назад"
                >
                    <svg viewBox="0 0 24 24">
                        <path
                            d="M15 5l-7 7 7 7"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                    </svg>
                </button>


                <div class="mf-chat-user">

                    <div class="mf-chat-avatar">
                        ${esc(avatar)}
                    </div>


                    <div class="mf-chat-user-info">

                        <div class="mf-chat-user-name">
                            ${esc(peerName)}
                        </div>

                        <div class="mf-chat-user-role">
                            ${esc(peerRole)}
                        </div>

                    </div>

                </div>

                <div class="mf-chat-settings">
                    <span
                        id="mfChatMuteLabel"
                        class="mf-chat-mute-label"
                    >${currentChatMuted ? 'Без уведомлений' : 'Уведомления'}</span>

                    <button
                        type="button"
                        id="mfChatMuteToggle"
                        class="mf-chat-mute-toggle${currentChatMuted ? ' is-on' : ''}"
                        role="switch"
                        aria-checked="${currentChatMuted ? 'true' : 'false'}"
                        aria-label="Без уведомлений"
                        onclick="window.MF_MESSENGER.toggleChatMute()"
                    >
                        <span class="mf-chat-mute-knob"></span>
                    </button>
                </div>

            </header>

            <div id="mfMessageSelectionBar" style="display:none;align-items:center;gap:8px;padding:8px 10px;background:#f5f5f5;border-bottom:1px solid #ddd;box-sizing:border-box;">
                <button type="button" id="mfMessageSelectionCancel" style="width:36px;height:36px;border:0;border-radius:50%;background:#e0e0e0;color:#333;font-size:22px;cursor:pointer;flex:0 0 36px;">✕</button>
                <div id="mfMessageSelectionCount" style="flex:1;min-width:0;font-weight:700;color:#333;">Выбрано: 0</div>
                <button type="button" id="mfMessageForward" style="padding:9px 12px;border:0;border-radius:9px;background:#1976d2;color:#fff;font-weight:700;cursor:pointer;white-space:nowrap;">↗ Переслать</button>
                <button type="button" id="mfMessageDeleteSelected" style="padding:9px 12px;border:0;border-radius:9px;background:#c62828;color:#fff;font-weight:700;cursor:pointer;white-space:nowrap;">🗑 Удалить</button>
            </div>

            <!-- ================= СООБЩЕНИЯ ================= -->

            <div
                id="mfChatMessages"
                class="mf-chat-messages"
            ></div>


            <!-- ================= НОВЫЕ СООБЩЕНИЯ ================= -->

            <button
                type="button"
                id="mfNewMessagesBtn"
                class="mf-new-messages-btn"
            >
                ↓ Новые сообщения
            </button>


            <!-- ================= ПОЛЕ ВВОДА ================= -->

            <form
                class="mf-chat-compose"
                onsubmit="window.MF_MESSENGER.send(event)"
            >

                <div
                    id="mfChatAttachmentPreview"
                    class="mf-chat-attachment-preview"
                    aria-live="polite"
                ></div>

                <textarea
                    id="mfChatInput"
                    rows="1"
                    maxlength="4000"
                    placeholder="Написать сообщение..."
                    autocomplete="off"
                ></textarea>


                <!-- Выбор обычного файла -->

                <input
                    type="file"
                    id="mfChatFile"
                    hidden
                >


                <!-- Камера -->

                <input
                    type="file"
                    id="mfChatCamera"
                    accept="image/*"
                    capture="environment"
                    hidden
                >


                <!-- Одна кнопка вложения -->

                <button
                    type="button"
                    class="mf-chat-attach"
                    id="mfChatAttach"
                    aria-label="Прикрепить файл"
                >
                    📎
                </button>


                <!-- Меню вложений -->

                <div
                    id="mfChatAttachMenu"
                    class="mf-chat-attach-menu"
                >

                    <button
                        type="button"
                        id="mfChatChooseFile"
                    >
                        📎 Файл
                    </button>

                    <button
                        type="button"
                        id="mfChatTakePhoto"
                    >
                        📷 Фото
                    </button>

                </div>


                <!-- Отправка сообщения -->

                <button
                    type="submit"
                    class="mf-chat-send"
                    aria-label="Отправить"
                >

                    <svg viewBox="0 0 24 24">

                        <path
                            d="M3 11.5L21 3l-6 18-6-7.5z"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linejoin="round"
                        />

                        <path
                            d="M11 13.5L21 3"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                        />

                    </svg>

                </button>

            </form>

        </section>

    `;


    document.getElementById('mfMessageSelectionCancel')?.addEventListener('click', clearMessageSelection);
    document.getElementById('mfMessageForward')?.addEventListener('click', openForwardModal);
    document.getElementById('mfMessageDeleteSelected')?.addEventListener('click', deleteSelectedMessages);
    updateMessageSelectionBar();

    const input =
        document.getElementById('mfChatInput');

    if (!input)
        return;


    /*
     * ВЛОЖЕНИЯ
     */

    const attachButton =
        document.getElementById('mfChatAttach');

    const attachMenu =
        document.getElementById('mfChatAttachMenu');

    const fileInput =
        document.getElementById('mfChatFile');

    const cameraInput =
        document.getElementById('mfChatCamera');

    const chooseFileButton =
        document.getElementById('mfChatChooseFile');

    const takePhotoButton =
        document.getElementById('mfChatTakePhoto');


    if (
        attachButton &&
        attachMenu &&
        fileInput &&
        cameraInput &&
        chooseFileButton &&
        takePhotoButton
    ) {

        attachButton.addEventListener(
            'click',
            function () {

                attachMenu.classList.toggle('visible');

            }
        );


        chooseFileButton.addEventListener(
            'click',
            function () {

                attachMenu.classList.remove('visible');

                fileInput.click();

            }
        );


        takePhotoButton.addEventListener(
            'click',
            function () {

                attachMenu.classList.remove('visible');

                cameraInput.click();

            }
        );

    }

    /*
     * Показываем выбранный файл ДО отправки.
     * Пользователь сразу видит, что файл действительно выбран.
     */
    const attachmentPreview =
        document.getElementById('mfChatAttachmentPreview');

    let attachmentPreviewUrl = null;

    function clearAttachmentSelection() {

        if (attachmentPreviewUrl) {

            try {
                URL.revokeObjectURL(attachmentPreviewUrl);
            } catch (_) {}

            attachmentPreviewUrl = null;
        }

        if (fileInput) {
            fileInput.value = '';
        }

        if (cameraInput) {
            cameraInput.value = '';
        }

        if (attachmentPreview) {
            attachmentPreview.innerHTML = '';
            attachmentPreview.classList.remove('visible');
        }
    }

    function showAttachmentSelection(file) {

        if (!attachmentPreview || !file) {
            return;
        }

        if (attachmentPreviewUrl) {

            try {
                URL.revokeObjectURL(attachmentPreviewUrl);
            } catch (_) {}

            attachmentPreviewUrl = null;
        }

        const isImage =
            String(file.type || '')
                .toLowerCase()
                .startsWith('image/');

        if (isImage) {
            attachmentPreviewUrl =
                URL.createObjectURL(file);
        }

        attachmentPreview.innerHTML = `
            <div class="mf-chat-selected-file">

                ${
                    isImage
                        ? `
                            <img
                                class="mf-chat-selected-file-image"
                                src="${attachmentPreviewUrl}"
                                alt=""
                            >
                          `
                        : `
                            <span class="mf-chat-selected-file-icon">
                                📎
                            </span>
                          `
                }

                <span class="mf-chat-selected-file-info">
                    <strong>
                        ${esc(file.name)}
                    </strong>

                    <small>
                        ${formatFileSize(file.size) || ''}
                    </small>
                </span>

                <button
                    type="button"
                    class="mf-chat-selected-file-remove"
                    aria-label="Убрать выбранный файл"
                >
                    ×
                </button>

            </div>
        `;

        attachmentPreview.classList.add('visible');

        const removeButton =
            attachmentPreview.querySelector(
                '.mf-chat-selected-file-remove'
            );

        if (removeButton) {
            removeButton.addEventListener(
                'click',
                clearAttachmentSelection
            );
        }
    }

    function handleAttachmentInput(inputElement) {

        if (
            !inputElement ||
            !inputElement.files ||
            !inputElement.files.length
        ) {
            return;
        }

        /*
         * Выбираем только один источник вложения.
         */
        if (inputElement === fileInput && cameraInput) {
            cameraInput.value = '';
        }

        if (inputElement === cameraInput && fileInput) {
            fileInput.value = '';
        }

        showAttachmentSelection(
            inputElement.files[0]
        );
    }

    if (fileInput) {
        fileInput.addEventListener(
            'change',
            function () {
                handleAttachmentInput(fileInput);
            }
        );
    }

    if (cameraInput) {
        cameraInput.addEventListener(
            'change',
            function () {
                handleAttachmentInput(cameraInput);
            }
        );
    }


    /*
     * Кнопка "Новые сообщения"
     */

    const messagesBox =
        document.getElementById(
            'mfChatMessages'
        );

    const newMessagesBtn =
        document.getElementById(
            'mfNewMessagesBtn'
        );


    if (
        messagesBox &&
        newMessagesBtn
    ) {

        newMessagesBtn.addEventListener(
            'click',
            function () {

                messagesBox.scrollTo({
                    top:
                        messagesBox.scrollHeight,
                    behavior:
                        'smooth'
                });

                newMessagesBtn.classList.remove(
                    'visible'
                );

            }
        );

    }


    /*
     * Автоматический рост поля
     */

    function resizeInput() {

        input.style.height = 'auto';

        input.style.height =
            Math.min(
                input.scrollHeight,
                110
            ) + 'px';

    }


    input.addEventListener(
        'input',
        resizeInput
    );


    /*
     * Enter — отправить
     * Shift + Enter — новая строка
     */

    input.addEventListener(
        'keydown',
        function (event) {

            if (
                event.key === 'Enter' &&
                !event.shiftKey
            ) {

                event.preventDefault();

                input
                    .closest('form')
                    ?.requestSubmit();

            }

        }
    );

}

   async function loadChatMessages(forceScroll = false) {

    if (!currentChat)
        return;

    try {

        const data =
            await api(
                `/chats/${currentChat}/messages?limit=100`
            );

        const messages =
            data.messages || [];

        /*
         * Не перерисовываем весь чат на каждом polling-запросе.
         * Старый код делал innerHTML + заново загружал картинки
         * даже когда данные вообще не изменились. Это и давало
         * мигание чата.
         *
         * В signature учитываем всё, что может визуально измениться:
         * текст, вложение, удаление и статус прочитано.
         */
        const messagesSignature = messages.map(m => [
            m.id,
            m.body || '',
            m.sender_id || '',
            m.created_at || '',
            m.deleted_at || '',
            m.attachment_name || '',
            m.attachment_path || '',
            m.attachment_mime || '',
            m.attachment_size || 0,
            Number(m.is_read || 0)
        ].join('\u001f')).join('\u001e');

        const hasChanged =
            messagesSignature !== lastRenderedMessagesSignature;

        const last =
            messages[messages.length - 1];

        const hasNewMessage =
            !!last &&
            last.id !== lastMessageId;


        /*
         * Рендерим сообщения.
         */

        if (hasChanged || forceScroll) {
            renderMessages(
                messages,
                {
                    forceScroll,
                    hasNewMessage
                }
            );

            lastRenderedMessagesSignature =
                messagesSignature;
        }


        /*
         * Если это первое открытие чата
         * или отправка собственного сообщения,
         * renderMessages() принудительно
         * прокручивает вниз.
         *
         * Поэтому последнее сообщение
         * считаем прочитанным.
         */

        if (
            forceScroll &&
            last
        ) {

            lastMessageId =
                last.id;

            await api(
                `/chats/${currentChat}/read`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        message_id: last.id
                    })
                }
            );

            updateBadge();

            return;
        }


        /*
         * При обычном polling проверяем,
         * находится ли пользователь внизу.
         */

        const box =
            document.getElementById(
                'mfChatMessages'
            );

        if (!box)
            return;


        const isNearBottom =
            box.scrollHeight -
            box.scrollTop -
            box.clientHeight < 80;


        /*
         * Новое сообщение + пользователь внизу:
         * считаем сообщение прочитанным.
         */

        if (
            last &&
            hasNewMessage &&
            isNearBottom
        ) {

            lastMessageId =
                last.id;

            await api(
                `/chats/${currentChat}/read`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        message_id: last.id
                    })
                }
            );

            updateBadge();
        }

    } catch (err) {

        console.error(err);
    }
}


function formatFileSize(bytes) {

    const size =
        Number(bytes);

    if (
        !Number.isFinite(size) ||
        size <= 0
    ) {
        return '';
    }

    if (size < 1024) {

        return `${size} Б`;

    }

    if (size < 1024 * 1024) {

        return `${(size / 1024).toFixed(1)} КБ`;

    }

    if (size < 1024 * 1024 * 1024) {

        return `${(
            size /
            (1024 * 1024)
        ).toFixed(1)} МБ`;

    }

    return `${(
        size /
        (1024 * 1024 * 1024)
    ).toFixed(1)} ГБ`;

}


/*
 * Загружает защищённый файл с JWT.
 *
 * Обычный <img src=""> или <a href="">
 * Authorization header не передаёт.
 */
async function loadMessengerFile(url) {

    const response =
        await fetch(
            url,
            {
                method: 'GET',

                headers: {
                    'Authorization':
                        'Bearer ' + jwt()
                }
            }
        );

    if (!response.ok) {

        throw new Error(
            'HTTP ' + response.status
        );

    }

    return await response.blob();

}


/*
 * Открытие / скачивание вложения.
 */
async function openMessengerAttachment(
    url,
    filename
) {

    try {

        const blob =
            await loadMessengerFile(url);

        const objectUrl =
            URL.createObjectURL(blob);

        const link =
            document.createElement('a');

        link.href =
            objectUrl;

        link.download =
            filename || 'file';

        link.target =
            '_blank';

        document.body.appendChild(link);

        link.click();

        link.remove();

        /*
         * Даём браузеру время использовать URL.
         */
        setTimeout(() => {

            URL.revokeObjectURL(
                objectUrl
            );

        }, 60000);

    } catch (error) {

        console.error(
            '[MESSENGER FILE]',
            error
        );

    }

}


/*
 * Загружает изображения через fetch(),
 * чтобы передать JWT.
 */
async function loadMessengerImages() {

    const images =
        document.querySelectorAll(
            '#mfChatMessages img[data-file-url]'
        );

    for (const img of images) {

        const url =
            img.dataset.fileUrl;

        if (!url)
            continue;

        try {

            const blob =
                await loadMessengerFile(url);

            const objectUrl =
                URL.createObjectURL(blob);

            img.src =
                objectUrl;

            /*
             * Сохраняем URL, чтобы при следующем
             * рендере его можно было освободить.
             */
            if (
                !window.MF_MESSENGER_OBJECT_URLS
            ) {

                window.MF_MESSENGER_OBJECT_URLS =
                    [];

            }

            window.MF_MESSENGER_OBJECT_URLS.push(
                objectUrl
            );

        } catch (error) {

            console.error(
                '[MESSENGER IMAGE]',
                error
            );

            img.removeAttribute(
                'src'
            );

            img.alt =
                'Не удалось загрузить изображение';

        }

    }

}


function updateMessageSelectionBar() {
    const bar=document.getElementById('mfMessageSelectionBar');
    const count=document.getElementById('mfMessageSelectionCount');
    const del=document.getElementById('mfMessageDeleteSelected');
    const forward=document.getElementById('mfMessageForward');
    const ids=Array.from(selectedMessageIds);
    const msgs=currentMessages.filter(m=>selectedMessageIds.has(Number(m.id)));
    const canDelete=msgs.length>0 && msgs.every(m=>String(m.sender_id)===String(window.MF_MESSENGER_USER_ID)&&!m.deleted_at);
    if(bar) bar.style.display=ids.length?'flex':'none';
    if(count) count.textContent=`Выбрано: ${ids.length}`;
    if(del){del.disabled=!canDelete;del.style.opacity=canDelete?'1':'.45';}
    if(forward){forward.disabled=!ids.length;forward.style.opacity=ids.length?'1':'.45';}
}
function clearMessageSelection(){selectedMessageIds.clear();updateMessageSelectionBar();if(currentMessages.length)renderMessages(currentMessages,{preserveScroll:true});}
async function deleteSelectedMessages(){
    const ids=Array.from(selectedMessageIds); const msgs=currentMessages.filter(m=>selectedMessageIds.has(Number(m.id)));
    if(!ids.length)return;
    if(!msgs.length||!msgs.every(m=>String(m.sender_id)===String(window.MF_MESSENGER_USER_ID)&&!m.deleted_at)){alert('Удалять можно только свои сообщения.');return;}
    if(!confirm(`Удалить выбранные сообщения (${ids.length})?`))return;
    try{for(const id of ids)await api(`/chats/${currentChat}/messages/${encodeURIComponent(id)}`,{method:'DELETE'});selectedMessageIds.clear();await loadChatMessages();}
    catch(error){console.error('[MESSENGER DELETE SELECTED]',error);alert(error.message||'Не удалось удалить выбранные сообщения');updateMessageSelectionBar();}
}
async function openForwardModal(){
    const ids=Array.from(selectedMessageIds);
    if(!ids.length)return;

    const old=document.getElementById('mfForwardModal');
    if(old)old.remove();

    const modal=document.createElement('div');
    modal.id='mfForwardModal';
    Object.assign(modal.style,{
        position:'fixed',inset:'0',background:'rgba(0,0,0,.45)',zIndex:'10050',
        display:'flex',alignItems:'center',justifyContent:'center',padding:'16px',boxSizing:'border-box'
    });
    modal.innerHTML=`<div style="width:100%;max-width:560px;max-height:85vh;background:#fff;border-radius:16px;box-shadow:0 8px 30px rgba(0,0,0,.3);overflow:hidden;display:flex;flex-direction:column;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 16px;background:#1976d2;color:#fff;">
            <div style="font-size:18px;font-weight:700;">↗ Переслать</div>
            <button id="mfForwardClose" type="button" style="width:36px;height:36px;border:0;border-radius:50%;background:rgba(255,255,255,.18);color:#fff;font-size:22px;cursor:pointer;">×</button>
        </div>
        <div style="padding:10px 14px;color:#666;font-size:13px;">Выбрано сообщений: ${ids.length}</div>
        <div id="mfForwardBody" style="overflow-y:auto;padding:0 12px;min-height:120px;"><div style="padding:30px;text-align:center;color:#777;">Загрузка пользователей...</div></div>
        <div style="display:flex;gap:8px;padding:12px;border-top:1px solid #eee;">
            <button id="mfForwardCancel" type="button" style="flex:1;padding:11px;border:0;border-radius:10px;background:#ddd;color:#222;font-weight:600;cursor:pointer;">Отмена</button>
            <button id="mfForwardSend" type="button" style="flex:1;padding:11px;border:0;border-radius:10px;background:#1976d2;color:#fff;font-weight:700;cursor:pointer;">Переслать</button>
        </div>
    </div>`;

    document.body.appendChild(modal);
    const close=()=>modal.remove();
    document.getElementById('mfForwardClose')?.addEventListener('click',close);
    document.getElementById('mfForwardCancel')?.addEventListener('click',close);
    modal.addEventListener('click',e=>{if(e.target===modal)close();});

    try{
        const [usersData,chatsData]=await Promise.all([
            api('/users'),
            api('/chats')
        ]);

        if(!document.getElementById('mfForwardModal'))return;

        const users=Array.isArray(usersData.users)?usersData.users:[];
        const chats=Array.isArray(chatsData.chats)?chatsData.chats:[];
        window.MF_MESSENGER_CHATS=chats;

        const existingPrivateByUser=new Map();
        const targetChats=[];
        const usedChatIds=new Set();

        for(const chat of chats){
            if(Number(chat.id)===Number(currentChat))continue;
            if(chat.type==='group'){
                targetChats.push({kind:'chat',chatId:Number(chat.id),userId:null,title:chat.title||'Группа',sub:`Группа · ${Number(chat.member_count||0)} участников`,icon:'👥'});
                usedChatIds.add(Number(chat.id));
            }else if(chat.peer?.user_id){
                const uid=String(chat.peer.user_id);
                existingPrivateByUser.set(uid,Number(chat.id));
                targetChats.push({kind:'chat',chatId:Number(chat.id),userId:chat.peer.user_id,title:chat.peer.name||'Пользователь',sub:chat.peer.role||'Личный чат',icon:'👤'});
                usedChatIds.add(Number(chat.id));
            }
        }

        for(const user of users){
            if(existingPrivateByUser.has(String(user.user_id)))continue;
            targetChats.push({kind:'user',chatId:null,userId:user.user_id,title:user.name||'Пользователь',sub:user.role||'Новый личный чат',icon:'👤'});
        }

        const rows=targetChats.map((item,index)=>`
            <label style="display:flex;align-items:center;gap:10px;padding:10px;border-bottom:1px solid #eee;cursor:pointer;">
                <input type="checkbox" class="mf-forward-target" data-kind="${item.kind}" data-chat-id="${item.chatId??''}" data-user-id="${esc(item.userId??'')}" value="${index}" style="width:20px;height:20px;flex:0 0 auto;">
                <span style="font-size:22px;">${item.icon}</span>
                <span style="min-width:0;flex:1;">
                    <strong style="display:block;overflow-wrap:anywhere;">${esc(item.title)}</strong>
                    <small style="color:#777;">${esc(item.sub)}</small>
                </span>
            </label>`).join('');

        const body=document.getElementById('mfForwardBody');
        if(body)body.innerHTML=rows||'<div style="padding:25px;text-align:center;color:#777;">Нет доступных пользователей.</div>';

        document.getElementById('mfForwardSend')?.addEventListener('click',async()=>{
            const checked=Array.from(modal.querySelectorAll('.mf-forward-target:checked'));
            if(!checked.length){alert('Выберите хотя бы одного получателя.');return;}

            const btn=document.getElementById('mfForwardSend');
            if(btn){btn.disabled=true;btn.textContent='Пересылка...';}

            try{
                const targetIds=[];

                for(const checkbox of checked){
                    const kind=checkbox.dataset.kind;
                    let chatId=Number(checkbox.dataset.chatId);

                    if(kind==='user'){
                        const userId=checkbox.dataset.userId;
                        const created=await api('/chats/private',{
                            method:'POST',
                            body:JSON.stringify({user_id:userId})
                        });
                        chatId=Number(created.chat_id);
                    }

                    if(Number.isInteger(chatId)&&chatId>0)targetIds.push(chatId);
                }

                const uniqueTargetIds=[...new Set(targetIds)];
                if(!uniqueTargetIds.length)throw new Error('Не удалось определить чаты получателей');

                await api(`/chats/${currentChat}/forward`,{
                    method:'POST',
                    body:JSON.stringify({message_ids:ids,target_chat_ids:uniqueTargetIds})
                });

                close();
                selectedMessageIds.clear();
                await showMessenger();
            }catch(error){
                console.error('[MESSENGER FORWARD]',error);
                alert(error.message||'Не удалось переслать сообщения');
                if(btn){btn.disabled=false;btn.textContent='Переслать';}
            }
        });
    }catch(error){
        console.error('[MESSENGER FORWARD TARGETS]',error);
        const body=document.getElementById('mfForwardBody');
        if(body)body.innerHTML='<div style="padding:25px;text-align:center;color:#b00020;">Не удалось загрузить список получателей.</div>';
    }
}

function renderMessages(
    messages,
    options = {}
) {

    currentMessages = Array.isArray(messages) ? messages : [];

    const box =
        document.getElementById(
            'mfChatMessages'
        );

    if (!box)
        return;

    const newMessagesBtn =
        document.getElementById(
            'mfNewMessagesBtn'
        );

    /*
     * Освобождаем старые Blob URL.
     */
    if (
        window.MF_MESSENGER_OBJECT_URLS
    ) {

        window.MF_MESSENGER_OBJECT_URLS
            .forEach(url => {

                try {

                    URL.revokeObjectURL(
                        url
                    );

                } catch (e) {}

            });

        window.MF_MESSENGER_OBJECT_URLS =
            [];

    }


    /*
     * Определяем, находится ли пользователь
     * практически внизу чата.
     */

    const wasNearBottom =
        box.scrollHeight -
        box.scrollTop -
        box.clientHeight < 80;

    const previousScrollTop =
        box.scrollTop;


    box.innerHTML =
        messages.map(m => {

            const isMine =
                m.sender_id ===
                window.MF_MESSENGER_USER_ID;

            const isDeleted =
                !!m.deleted_at ||
                m.body === 'Сообщение удалено';

            const hasAttachment =
                !isDeleted &&
                !!m.attachment_name &&
                !!m.attachment_path;

            const fileUrl =
                hasAttachment
                    ? `${API}/chats/${currentChat}/files/${encodeURIComponent(
                        m.attachment_path
                    )}`
                    : '';

            const mime =
                String(
                    m.attachment_mime || ''
                ).toLowerCase();

            const isImage =
                mime.startsWith('image/');

            const forwardedHtml =
                !isDeleted && m.forwarded_from_message_id
                    ? `
                        <div style="margin-bottom:6px;padding:6px 8px;border-radius:8px;background:rgba(25,118,210,.08);color:#1976d2;font-size:12px;font-weight:700;">
                            ↗ Переслано от ${esc(m.forwarded_from_sender_name || 'пользователя')}
                        </div>
                      `
                    : '';

            const bodyHtml =
                isDeleted
                    ? `
                        <div class="mf-message-deleted">
                            Сообщение удалено
                        </div>
                      `
                    : (
                        m.body
                            ? `
                                <div class="mf-message-text">
                                    ${esc(m.body)
                                        .replace(
                                            /\n/g,
                                            '<br>'
                                        )}
                                </div>
                              `
                            : ''
                    );

            const attachmentHtml =
                hasAttachment
                    ? (

                        isImage

                            ? `
                                <button
                                    type="button"
                                    class="mf-message-attachment mf-message-image"
                                    data-file-url="${esc(fileUrl)}"
                                    data-file-name="${esc(m.attachment_name)}"
                                    aria-label="Открыть ${esc(m.attachment_name)}"
                                >

                                    <img
                                        data-file-url="${esc(fileUrl)}"
                                        alt="${esc(m.attachment_name)}"
                                        loading="lazy"
                                    >

                                </button>
                              `

                            : `
                                <button
                                    type="button"
                                    class="mf-message-attachment mf-message-file"
                                    data-file-url="${esc(fileUrl)}"
                                    data-file-name="${esc(m.attachment_name)}"
                                >

                                    <span class="mf-message-file-icon">
                                        📎
                                    </span>

                                    <span class="mf-message-file-info">

                                        <strong>
                                            ${esc(m.attachment_name)}
                                        </strong>

                                        ${
                                            m.attachment_size
                                                ? `
                                                    <small>
                                                        ${formatFileSize(
                                                            m.attachment_size
                                                        )}
                                                    </small>
                                                  `
                                                : ''
                                        }

                                    </span>

                                </button>
                              `

                    )
                    : (
                        /* файл стёрт по сроку хранения: имя есть, файла нет */
                        !isDeleted && m.attachment_name && !m.attachment_path
                            ? `
                                <div class="mf-message-file-expired" style="margin-top:4px;padding:6px 8px;border-radius:8px;background:rgba(0,0,0,.05);color:#777;font-size:13px;">
                                    📎 ${esc(m.attachment_name)} — файл удалён по сроку хранения
                                </div>
                              `
                            : ''
                    );

            const readHtml =
                isMine && !isDeleted
                    ? `
                        <span
                            class="mf-message-read ${
                                Number(m.is_read || 0)
                                    ? 'is-read'
                                    : ''
                            }"
                            aria-label="${
                                Number(m.is_read || 0)
                                    ? 'Прочитано'
                                    : 'Не прочитано'
                            }"
                            title="${
                                Number(m.is_read || 0)
                                    ? 'Прочитано'
                                    : 'Не прочитано'
                            }"
                        >${Number(m.is_read || 0) ? '✓✓' : '✓'}</span>
                      `
                    : '';

            return `

                <div
                    class="mf-message ${
                        isMine
                            ? 'mine'
                            : 'theirs'
                    } ${
                        isDeleted
                            ? 'deleted'
                            : ''
                    } ${
                        selectedMessageIds.has(Number(m.id))
                            ? 'mf-message-selected'
                            : ''
                    }"
                    data-message-id="${esc(m.id)}"
                    style="${
                        selectedMessageIds.has(Number(m.id))
                            ? 'background:rgba(25,118,210,.10);border-radius:12px;'
                            : ''
                    }"
                >

                    <div class="mf-message-bubble">

                        ${
                            !isMine
                                ? `
                                    <div class="mf-message-author">
                                        ${esc(
                                            m.sender_name
                                        )}
                                    </div>
                                  `
                                : ''
                        }

                        ${forwardedHtml}

                        ${bodyHtml}

                        ${attachmentHtml}

                        <div class="mf-message-footer">

                            <time>
                                ${fmtDate(
                                    m.created_at
                                )}
                            </time>

                            ${readHtml}


                        </div>

                    </div>

                </div>

            `;

        }).join('');


    /*
     * Обработчики файлов.
     */
    box
        .querySelectorAll(
            '.mf-message-attachment[data-file-url]'
        )
        .forEach(element => {

            element.addEventListener(
                'click',
                async event => {

                    event.preventDefault();

                    const url =
                        element.dataset.fileUrl;

                    const filename =
                        element.dataset.fileName;

                    if (!url)
                        return;

                    /*
                     * Для изображения:
                     * открываем его в новой вкладке
                     * после авторизованной загрузки.
                     */
                    if (
                        element.classList.contains(
                            'mf-message-image'
                        )
                    ) {

                        try {

                            const blob =
                                await loadMessengerFile(
                                    url
                                );

                            const objectUrl =
                                URL.createObjectURL(
                                    blob
                                );

                            window.open(
                                objectUrl,
                                '_blank',
                                'noopener'
                            );

                            setTimeout(
                                () => {

                                    URL.revokeObjectURL(
                                        objectUrl
                                    );

                                },
                                60000
                            );

                        } catch (error) {

                            console.error(
                                '[MESSENGER IMAGE OPEN]',
                                error
                            );

                        }

                        return;
                    }


                    /*
                     * Для обычного файла —
                     * скачивание через авторизованный fetch.
                     */
                    await openMessengerAttachment(
                        url,
                        filename
                    );

                }
            );

        });


    box.querySelectorAll('.mf-message[data-message-id]').forEach(messageElement => {
        messageElement.addEventListener('click', event => {
            if (event.target.closest('.mf-message-attachment')) return;
            const id = Number(messageElement.dataset.messageId);
            if (!Number.isInteger(id)) return;
            if (selectedMessageIds.has(id)) selectedMessageIds.delete(id);
            else selectedMessageIds.add(id);
            renderMessages(currentMessages, { preserveScroll: true });
        });
    });

    updateMessageSelectionBar();

    /*
     * Изображения показываем прямо
     * внутри сообщения.
     */
    loadMessengerImages();


    requestAnimationFrame(() => {

        /*
         * Принудительная прокрутка:
         *
         * - открытие чата;
         * - отправка своего сообщения;
         * - другие случаи с forceScroll.
         */

        if (options.forceScroll) {

            box.scrollTop =
                box.scrollHeight;

            if (newMessagesBtn) {

                newMessagesBtn.classList.remove(
                    'visible'
                );

            }

            return;
        }


        /*
         * Если пользователь уже был внизу,
         * новое сообщение показываем автоматически.
         */

        if (wasNearBottom) {

            box.scrollTop =
                box.scrollHeight;

            if (newMessagesBtn) {

                newMessagesBtn.classList.remove(
                    'visible'
                );

            }

            return;
        }


        /*
         * Пользователь читает старые сообщения.
         *
         * Не двигаем его вниз.
         */

        box.scrollTop =
            previousScrollTop;


        /*
         * Показываем кнопку только тогда,
         * когда действительно появилось новое сообщение.
         */

        if (
            newMessagesBtn &&
            options.hasNewMessage
        ) {

            newMessagesBtn.classList.add(
                'visible'
            );

        }

    });

}


   async function send(event) {

    event.preventDefault();


    const input =
        document.getElementById(
            'mfChatInput'
        );

    const fileInput =
        document.getElementById(
            'mfChatFile'
        );

    const cameraInput =
        document.getElementById(
            'mfChatCamera'
        );

    if (!input || !currentChat)
        return;


    const body =
        input.value.trim();


    /*
     * Берём выбранный файл.
     *
     * Приоритет:
     * 1. обычный файл
     * 2. фотография с камеры
     */

    const file =
        fileInput &&
        fileInput.files &&
        fileInput.files.length
            ? fileInput.files[0]
            : (
                cameraInput &&
                cameraInput.files &&
                cameraInput.files.length
                    ? cameraInput.files[0]
                    : null
            );


    /*
     * Нельзя отправлять полностью пустое сообщение.
     * Но файл без текста — разрешён.
     */

    if (
        !body &&
        !file
    ) {
        return;
    }


    input.disabled = true;


    try {

        /*
         * Для вложения используем multipart/form-data.
         *
         * Content-Type вручную НЕ задаём —
         * браузер сам добавит boundary.
         */

        const formData =
            new FormData();


        formData.append(
            'body',
            body
        );


        if (file) {

            formData.append(
                'file',
                file,
                file.name
            );

        }


        const response =
            await fetch(
                `${API}/chats/${currentChat}/messages`,
                {
                    method: 'POST',

                    headers: {
                        'Authorization':
                            'Bearer ' + jwt()
                    },

                    body: formData
                }
            );


        let data = null;

        try {
            data = await response.json();
        } catch (_) {
            data = null;
        }


        if (!response.ok) {

            throw new Error(
                data &&
                data.message
                    ? data.message
                    : 'HTTP ' + response.status
            );

        }


        /*
         * Очистка после успешной отправки.
         */

        input.value = '';


        /*
         * После успешной отправки полностью
         * очищаем выбранное вложение.
         */
        const preview =
            document.getElementById(
                'mfChatAttachmentPreview'
            );

        if (preview) {
            preview.innerHTML = '';
            preview.classList.remove('visible');
        }

        if (fileInput) {
            fileInput.value = '';
        }

        if (cameraInput) {
            cameraInput.value = '';
        }


        /*
         * Обновляем чат.
         */

        await loadChatMessages(true);


        if (data && data.message) {
            input.focus();
        }


    } catch (err) {

        console.error(
            'Ошибка отправки сообщения:',
            err
        );


        alert(
            'Не удалось отправить сообщение' +
            (
                err && err.message
                    ? '\n' + err.message
                    : ''
            )
        );


    } finally {

        input.disabled = false;

    }

}

    /*
     * ВАЖНО:
     *
     * Кнопка "Чаты" больше НЕ создаётся здесь.
     *
     * Нижняя навигация принадлежит основному PWA
     * и уже содержит собственную кнопку "Чаты".
     *
     * Messenger отвечает только за:
     * - открытие экрана;
     * - загрузку чатов;
     * - badge;
     * - создание чатов;
     * - сообщения.
     */

    window.MF_MESSENGER = {

        show:
            showMessenger,

        newChat:
            newChat,

        createPrivateChat:
            createPrivateChat,

        openChat:
            openChat,

        toggleChatMute:
            toggleChatMute,

        send:
            send,

        updateBadge:
            updateBadge
    };

    if (
        typeof registerScreen ===
        'function'
    ) {

        registerScreen(
            'messenger',
            showMessenger
        );
    }

    document.addEventListener(
        'DOMContentLoaded',
        function () {

            loadCurrentUser()
                .then(updateBadge);

        }
    );

    /*
     * app.js currently keeps current user
     * in a private variable, so the host
     * may optionally set
     * window.MF_MESSENGER_USER_ID
     * after login.
     */

    window.MF_MESSENGER_USER_ID =
        localStorage.getItem(
            'messenger_user_id'
        ) || '';

})();