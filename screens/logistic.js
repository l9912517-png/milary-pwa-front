console.log("LOGISTIC JS LOADED");

window.logisticData = null;

/* =======================================================
   SCREEN
======================================================= */

registerScreen("logistic", function () {

    window.currentScreen = "logistic";

    title.innerText = "Логистика";

    container.innerHTML = `

        <div style="
            display:flex;
            flex-direction:column;
            gap:12px;
        ">

            <div id="logisticHeader"></div>

            <!-- SEARCH -->

            <div>

                <input
                    type="text"
                    id="logisticSearch"
                    placeholder="🔍 Поиск водителя, телефона, авто..."
                    oninput="filterLogisticCards()"
                    style="
                        width:100%;
                        box-sizing:border-box;
                        padding:14px;
                        border-radius:14px;
                        border:1px solid #dbe2ea;
                        background:#fff;
                        font-size:15px;
                        box-shadow:0 2px 6px rgba(0,0,0,0.04);
                    "
                >

            </div>

            <!-- LIST -->

            <div id="logisticContainer">

                <div class="menu-item">
                    Загрузка...
                </div>

            </div>

        </div>
    `;

    loadLogistic();
});

/* =======================================================
   LOAD
======================================================= */

async function loadLogistic() {

    const logisticContainer =
        document.getElementById("logisticContainer");

    const logisticHeader =
        document.getElementById("logisticHeader");

    try {

        const response = await fetch(
            "/files/common/logistic.json?t=" + Date.now()
        );

        if (!response.ok) {

            logisticContainer.innerHTML = `
                <div class="menu-item">
                    Нет данных
                </div>
            `;

            return;
        }

        let data = await response.json();

        // ===== DOUBLE JSON FIX =====

        if (typeof data === "string") {

            try {
                data = JSON.parse(data);
            } catch (e) {

                console.error(
                    "LOGISTIC JSON ERROR:",
                    e
                );

                logisticContainer.innerHTML = `
                    <div class="menu-item">
                        Ошибка JSON
                    </div>
                `;

                return;
            }
        }

        window.logisticData = data;

        if (!data || !Array.isArray(data.routes)) {

            logisticContainer.innerHTML = `
                <div class="menu-item">
                    Нет маршрутов
                </div>
            `;

            return;
        }

        // ===== UPDATED =====

        if (
            data.generated_at &&
            typeof renderUpdatedAt === "function"
        ) {

            logisticHeader.innerHTML =
                renderUpdatedAt(data.generated_at);
        }

        // ===== CARDS =====

        let html = `

            <div style="
                display:flex;
                flex-direction:column;
                gap:14px;
            ">
        `;

        data.routes.forEach(route => {

            const driver =
                route.driver || {};

            const vehicle =
                route.vehicle || {};

            const stats =
                route.stats || {};

            const location =
                route.location || {};

            const totalPoints =
                stats.points_total || 0;

            const donePoints =
                stats.points_done || 0;

            const hasLocation =
                location.lat !== null &&
                location.lng !== null;

            const progress =
                totalPoints > 0
                    ? Math.round(
                        (donePoints / totalPoints) * 100
                    )
                    : 0;

            html += `

                <div
                    class="logistic-card"

                    onclick="
                        openLogisticRoute(
                            '${route.route_uuid}'
                        )
                    "

                    data-search="
                        ${(
                            (driver.name || '') + ' ' +
                            (driver.phone || '') + ' ' +
                            (vehicle.description || '')
                        ).toLowerCase()}
                    "

                    style="
                        background:
                            linear-gradient(
                                135deg,
                                #ffffff,
                                #f8fafc
                            );

                        border-radius:20px;
                        padding:16px;

                        box-shadow:
                            0 4px 14px
                            rgba(0,0,0,0.08);

                        border:
                            1px solid #e8edf3;

                        display:flex;
                        flex-direction:column;
                        gap:14px;

                        cursor:pointer;
                    "
                >

                    <!-- TOP -->

                    <div style="
                        display:flex;
                        justify-content:space-between;
                        align-items:flex-start;
                        gap:10px;
                    ">

                        <div style="
                            display:flex;
                            flex-direction:column;
                            gap:5px;
                            flex:1;
                        ">

                            <div style="
                                font-size:18px;
                                font-weight:700;
                                color:#111827;
                                line-height:1.3;
                            ">
                                🚚
                                ${driver.name || "-"}
                            </div>

                            <div style="
                                font-size:13px;
                                color:#6b7280;
                            ">
                                👤 Маршрут #${route.driver_slot || "-"}
                            </div>

                        </div>

                        <div style="
                            background:
                                ${hasLocation
                                    ? '#dcfce7'
                                    : '#fee2e2'};

                            color:
                                ${hasLocation
                                    ? '#166534'
                                    : '#991b1b'};

                            padding:6px 10px;
                            border-radius:999px;

                            font-size:12px;
                            font-weight:700;
                        ">
                            ${hasLocation
                                ? '🟢 GPS'
                                : '🔴 OFFLINE'}
                        </div>

                    </div>

                    <!-- PHONE -->

                    <div style="
                        display:flex;
                        align-items:center;
                        gap:8px;
                        font-size:15px;
                        color:#374151;
                    ">

                        📞

                        <a
                            href="tel:${driver.phone || ''}"

                            onclick="event.stopPropagation()"

                            style="
                                color:#2563eb;
                                text-decoration:none;
                                font-weight:600;
                            "
                        >
                            ${driver.phone || "-"}
                        </a>

                    </div>

                    <!-- AUTO -->

                    <div style="
                        background:#eef2ff;
                        color:#3730a3;
                        border-radius:12px;
                        padding:12px;
                        font-size:14px;
                        font-weight:600;
                    ">
                        🚘
                        ${vehicle.description || "-"}
                    </div>

                    <!-- PROGRESS -->

                    <div style="
                        display:flex;
                        flex-direction:column;
                        gap:6px;
                    ">

                        <div style="
                            display:flex;
                            justify-content:space-between;
                            font-size:13px;
                            color:#4b5563;
                            font-weight:600;
                        ">

                            <span>
                                📦
                                ${donePoints}
                                /
                                ${totalPoints}
                            </span>

                            <span>
                                ${progress}%
                            </span>

                        </div>

                        <div style="
                            height:10px;
                            background:#e5e7eb;
                            border-radius:999px;
                            overflow:hidden;
                        ">

                            <div style="
                                width:${progress}%;
                                height:100%;

                                background:
                                    linear-gradient(
                                        90deg,
                                        #22c55e,
                                        #16a34a
                                    );
                            "></div>

                        </div>

                    </div>

                    <!-- GPS -->

                    <div style="
                        display:flex;
                        flex-direction:column;
                        gap:4px;
                        font-size:12px;
                        color:#6b7280;
                    ">

                        <div>
                            📍
                            ${hasLocation
                                ? location.lat + ", " + location.lng
                                : "нет координат"}
                        </div>

                        <div>
                            🕒
                            ${location.updated_at || "не обновлялось"}
                        </div>

                    </div>

                    <!-- BUTTONS -->

                    <div style="
                        display:flex;
                        gap:10px;
                    ">

                        <button

                            onclick="
                                event.stopPropagation();

                                requestDriverLocation(
                                    '${route.route_uuid}'
                                );
                            "

                            style="
                                flex:1;

                                background:#2563eb;
                                color:#fff;

                                border:none;
                                border-radius:12px;

                                padding:12px;

                                font-weight:700;
                            "
                        >
                            📡 Запросить
                        </button>

                        <button

                            onclick="
                                event.stopPropagation();

                                openDriverMap(
                                    ${location.lat},
                                    ${location.lng}
                                );
                            "

                            style="
                                flex:1;

                                background:
                                    ${hasLocation
                                        ? '#16a34a'
                                        : '#9ca3af'};

                                color:#fff;

                                border:none;
                                border-radius:12px;

                                padding:12px;

                                font-weight:700;
                            "

                            ${hasLocation ? "" : "disabled"}

                        >
                            🗺 Карта
                        </button>

                    </div>

                </div>
            `;
        });

        html += `</div>`;

        // ===== BACK =====

        if (
            currentUser.role === "admin" ||
            currentUser.role === "director"
        ) {

            html += `

                <button
                    onclick="showMenu()"

                    style="
                        margin-top:10px;
                        background:#d1d5db;
                        color:#111827;
                    "
                >
                    Назад
                </button>
            `;
        }

        logisticContainer.innerHTML = html;

    } catch (e) {

        console.error("LOGISTIC ERROR:", e);

        logisticContainer.innerHTML = `
            <div class="menu-item">
                Ошибка загрузки
            </div>
        `;
    }
}

/* =======================================================
   FILTER
======================================================= */

function filterLogisticCards() {

    const input =
        document.getElementById("logisticSearch");

    if (!input) return;

    const query =
        input.value
            .trim()
            .toLowerCase();

    const cards =
        document.querySelectorAll(".logistic-card");

    cards.forEach(card => {

        const text =
            card.dataset.search || "";

        card.style.display =
            !query || text.includes(query)
                ? ""
                : "none";
    });
}

/* =======================================================
   MAP
======================================================= */

function openDriverMap(lat, lng) {

    if (!lat || !lng) {

        alert("Нет координат");

        return;
    }

    window.open(
        `https://maps.google.com/?q=${lat},${lng}`,
        "_blank"
    );
}

/* =======================================================
   REQUEST LOCATION
======================================================= */

function requestDriverLocation(routeUuid) {

    alert(
        "Запрос геолокации: " + routeUuid
    );

    // TODO:
    // позже тут будет API запрос водителю
}

/* =======================================================
   OPEN ROUTE
======================================================= */

function openLogisticRoute(routeUuid) {

    if (
        !window.logisticData ||
        !window.logisticData.routes
    ) {
        return;
    }

    const route =
        window.logisticData.routes.find(
            r => r.route_uuid === routeUuid
        );

    if (!route) {

        alert("Маршрут не найден");

        return;
    }

    title.innerText =
        route.driver?.name || "Маршрут";

    const stops =
        route.stops || [];

    // ===== GROUP =====

    const groupedStops = {};

    stops.forEach(stop => {

        const trip =
            stop.trip_number || 1;

        if (!groupedStops[trip]) {
            groupedStops[trip] = [];
        }

        groupedStops[trip].push(stop);
    });

    let html = `

        <div style="
            display:flex;
            flex-direction:column;
            gap:14px;
        ">

            <!-- DRIVER -->

            <div style="
                background:
                    linear-gradient(
                        135deg,
                        #ffffff,
                        #f8fafc
                    );

                border-radius:20px;
                padding:18px;

                box-shadow:
                    0 4px 14px
                    rgba(0,0,0,0.08);

                display:flex;
                flex-direction:column;
                gap:12px;

                border:1px solid #e5e7eb;
            ">

                <div style="
                    font-size:20px;
                    font-weight:700;
                    color:#111827;
                ">
                    🚚
                    ${route.driver?.name || "-"}
                </div>

                <div style="
                    display:flex;
                    flex-direction:column;
                    gap:6px;

                    color:#374151;
                    font-size:14px;
                ">

                    <div>
                        📞
                        ${route.driver?.phone || "-"}
                    </div>

                    <div>
                        🚘
                        ${route.vehicle?.description || "-"}
                    </div>

                    <div>
                        📦
                        ${route.stats?.points_done || 0}
                        /
                        ${route.stats?.points_total || 0}
                    </div>

                </div>

            </div>
    `;

    // ===== EMPTY =====

    if (!stops.length) {

        html += `

            <div class="menu-item">
                Нет точек маршрута
            </div>
        `;

    } else {

        // ===== TRIPS =====

        Object.keys(groupedStops).forEach(trip => {

            const tripStops =
                groupedStops[trip];

            html += `

                <div style="
                    background:#ffffff;
                    border-radius:20px;

                    overflow:hidden;

                    border:1px solid #dbeafe;

                    box-shadow:
                        0 4px 14px
                        rgba(0,0,0,0.06);
                ">

                    <!-- HEADER -->

                    <div style="
                        background:
                            linear-gradient(
                                135deg,
                                #2563eb,
                                #1d4ed8
                            );

                        color:#fff;

                        padding:16px;

                        font-size:17px;
                        font-weight:700;

                        display:flex;
                        justify-content:space-between;
                        align-items:center;
                    ">

                        <div>
                            🚛 Ходка ${trip}
                        </div>

                        <div style="
                            background:
                                rgba(255,255,255,0.15);

                            padding:6px 10px;

                            border-radius:999px;

                            font-size:12px;
                        ">
                            ${tripStops.length} точек
                        </div>

                    </div>

                    <!-- BODY -->

                    <div style="
                        padding:12px;

                        display:flex;
                        flex-direction:column;
                        gap:10px;

                        background:#f8fafc;
                    ">
            `;

            tripStops.forEach(stop => {

                html += `

                    <div style="
                        background:#fff;

                        border-radius:16px;
                        padding:14px;

                        border-left:
                            5px solid #2563eb;

                        box-shadow:
                            0 2px 8px
                            rgba(0,0,0,0.05);

                        display:flex;
                        flex-direction:column;
                        gap:10px;
                    ">

                        <!-- NAME -->

                        <div style="
                            font-size:15px;
                            font-weight:700;
                            color:#111827;
                            line-height:1.4;
                        ">
                            🏪
                            ${stop.counterparty?.name || "-"}
                        </div>

                        <!-- ADDRESS -->

                        <div style="
                            font-size:14px;
                            color:#374151;
                            line-height:1.5;
                        ">
                            📍
                            ${stop.address || "-"}
                        </div>

                        <!-- TIME -->

                        <div style="
                            display:inline-flex;
                            align-items:center;
                            gap:6px;

                            width:max-content;

                            background:#eef2ff;
                            color:#3730a3;

                            padding:6px 10px;

                            border-radius:999px;

                            font-size:12px;
                            font-weight:600;
                        ">
                            ⏰
                            ${stop.delivery_time || "-"}
                        </div>

                    </div>
                `;
            });

            html += `

                    </div>

                </div>
            `;
        });
    }

    // ===== BACK =====

    html += `

        <button
            onclick="openScreen('logistic')"

            style="
                margin-top:10px;
                background:#d1d5db;
                color:#111827;
            "
        >
            Назад
        </button>

        </div>
    `;

    container.innerHTML = html;
}