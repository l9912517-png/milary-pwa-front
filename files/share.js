/*
 * «Отправить» у одного файла: в «Файлах» и в историях документов (Счета, Акты, УПД, Прайс).
 * Телефон: системное окно «Поделиться» с самим файлом (Telegram, WhatsApp, почта…).
 * Если браузер так не умеет — файл скачивается, и подсказываем, где его найти.
 *
 * Safari разрешает «Поделиться» только сразу после нажатия: если файл скачивался дольше,
 * показываем кнопку «Отправить» ещё раз — уже с готовым файлом.
 */

const SHARE_ICON = "M12 3v12 M8 7l4-4 4 4 M5 11v9h14v-9";

function fileUrlOf(name) {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    return "/files/" + encodeURIComponent(user.user_id || "") + "/" + encodeURIComponent(name);
}

function fileShareButtonHtml(name, url) {
    return `<button type="button" class="file-share-btn" aria-label="Отправить ${escapeHtml(name)}" title="Отправить"
        onclick="event.stopPropagation(); fileShareOne(${jsArg(name)}, ${jsArg(url || fileUrlOf(name))}, this)">${iconSvg(SHARE_ICON)}</button>`;
}

/* строка файла в истории документа: имя открывает файл, справа — «Отправить» */
function docFileRowHtml(name, date) {
    const url = fileUrlOf(name);
    const ext = String(name).split(".").pop().toLowerCase();
    return `
        <div class="menu-item doc-file-row" data-file="${escapeHtml(name)}" data-url="${escapeHtml(url)}" data-ext="${escapeHtml(ext)}"
             onclick="fileClick(this.dataset.file, this.dataset.url, this.dataset.ext)">
            <span class="icon">${typeof getFileIcon === "function" ? getFileIcon(ext) : ""}</span>
            <span class="doc-file-text">
                <span class="doc-file-name">${escapeHtml(name)}</span>
                <span class="doc-file-date">${escapeHtml(formatDate(date))}</span>
            </span>
            ${fileShareButtonHtml(name, url)}
        </div>`;
}

async function fileShareOne(name, url, btn) {
    if (btn) btn.classList.add("is-busy");
    let file;
    try {
        const r = await fetch(url);
        if (!r.ok) throw new Error("HTTP " + r.status);
        const blob = await r.blob();
        file = new File([blob], name, { type: typeof getMimeType === "function" ? getMimeType(name) : blob.type });
    } catch (e) {
        if (btn) btn.classList.remove("is-busy");
        return alert("Не удалось загрузить файл. Проверьте связь");
    }
    if (btn) btn.classList.remove("is-busy");

    const canFiles = navigator.share && navigator.canShare && navigator.canShare({ files: [file] });
    if (!canFiles) return fileDownloadFallback(file);

    try {
        await navigator.share({ files: [file], title: name });
    } catch (e) {
        if (e && e.name === "AbortError") return;                  // передумали
        if (e && e.name === "NotAllowedError") return fileShareConfirm(file);
        fileDownloadFallback(file);
    }
}

/* файл готов — второе нажатие уже с готовым файлом (Safari) */
function fileShareConfirm(file) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.addEventListener("click", e => { if (e.target === overlay) overlay.remove(); });
    overlay.innerHTML = `
        <div class="modal-window" role="dialog" aria-label="Отправить файл">
            <h3>Файл готов</h3>
            <div class="transfer-sub" style="text-align:left">${escapeHtml(file.name)}</div>
            <div class="modal-actions">
                <button type="button" class="btn-secondary" onclick="this.closest('.modal-overlay').remove()">Отмена</button>
                <button type="button" class="btn-primary-wide">Отправить</button>
            </div>
        </div>`;
    overlay.querySelector(".btn-primary-wide").addEventListener("click", async () => {
        overlay.remove();
        try { await navigator.share({ files: [file], title: file.name }); }
        catch (e) { if (!e || e.name !== "AbortError") fileDownloadFallback(file); }
    });
    document.body.appendChild(overlay);
}

function fileDownloadFallback(file) {
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    alert("Этот браузер не умеет отправлять файлы напрямую — файл скачан.\n\nОтправьте его из мессенджера: скрепка → Файл → Загрузки.");
}
