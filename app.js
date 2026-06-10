const STORAGE_KEY = "around-barcode-log";

const state = {
  audioContext: null,
  html5QrCode: null,
  isScanning: false,
  lastScan: { code: "", at: 0 },
  rows: loadRows(),
  toastTimer: null,
};

const els = {
  barcodeList: document.querySelector("#barcode-list"),
  cameraStatus: document.querySelector("#camera-status"),
  emptyState: document.querySelector("#empty-state"),
  exportXlsx: document.querySelector("#export-xlsx"),
  manualCode: document.querySelector("#manual-code"),
  manualForm: document.querySelector("#manual-form"),
  scanToast: document.querySelector("#scan-toast"),
  startScan: document.querySelector("#start-scan"),
  stopScan: document.querySelector("#stop-scan"),
  totalCount: document.querySelector("#total-count"),
};

render();

els.startScan.addEventListener("click", startScanner);
els.stopScan.addEventListener("click", stopScanner);
els.exportXlsx.addEventListener("click", exportXlsx);
els.manualForm.addEventListener("submit", addManualCode);
els.manualCode.addEventListener("input", keepManualCodeNumeric);
els.barcodeList.addEventListener("click", deleteRow);

window.addEventListener("beforeunload", () => {
  if (state.isScanning) {
    stopScanner();
  }
});

function loadRows() {
  try {
    const rows = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
    const unique = uniqueRows(rows);

    if (unique.length !== rows.length) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(unique));
    }

    return unique;
  } catch {
    return [];
  }
}

function saveRows() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.rows));
}

function render() {
  els.totalCount.textContent = state.rows.length;
  els.emptyState.hidden = state.rows.length > 0;
  els.exportXlsx.disabled = state.rows.length === 0;

  els.barcodeList.innerHTML = state.rows
    .map((row, index) => {
      return `
        <tr>
          <td>${index + 1}</td>
          <td class="code">${escapeHtml(row.code)}</td>
          <td><button class="danger delete-row" type="button" data-id="${row.id}">حذف</button></td>
        </tr>
      `;
    })
    .join("");
}

async function startScanner() {
  if (!window.Html5Qrcode) {
    setStatus("مكتبة قراءة الباركود لم يتم تحميلها. تأكد من اتصال الإنترنت وجرب تحديث الصفحة.");
    return;
  }

  try {
    unlockBeep();
    state.html5QrCode = state.html5QrCode || new Html5Qrcode("reader");
    await state.html5QrCode.start(
      { facingMode: "environment" },
      {
        fps: 12,
        formatsToSupport: supportedBarcodeFormats(),
        qrbox: (viewfinderWidth, viewfinderHeight) => ({
          width: Math.floor(viewfinderWidth * 0.82),
          height: Math.floor(Math.min(viewfinderHeight * 0.42, 220)),
        }),
      },
      onScanSuccess,
      () => {}
    );

    state.isScanning = true;
    els.startScan.disabled = true;
    els.stopScan.disabled = false;
    setStatus("الكاميرا شغالة. وجّهها على الباركود.");
  } catch (error) {
    setStatus("تعذر تشغيل الكاميرا. تأكد من السماح للمتصفح باستخدام الكاميرا وأن الموقع يعمل على HTTPS.");
  }
}

async function stopScanner() {
  if (!state.html5QrCode || !state.isScanning) {
    return;
  }

  try {
    await state.html5QrCode.stop();
    await state.html5QrCode.clear();
  } catch {
    // The scanner can already be stopped by the browser when permissions change.
  }

  state.isScanning = false;
  els.startScan.disabled = false;
  els.stopScan.disabled = true;
  setStatus("تم إيقاف الكاميرا.");
}

function onScanSuccess(decodedText) {
  const code = decodedText.trim();
  const now = Date.now();

  if (!code || (state.lastScan.code === code && now - state.lastScan.at < 1800)) {
    return;
  }

  state.lastScan = { code, at: now };
  const added = addCode(code);

  if (added) {
    playBeep();
    setStatus("تم الادخال");
    showScanMessage("تم الادخال");
    return;
  }

  setStatus("تم الادخال");
  showScanMessage("تم الادخال");
}

function supportedBarcodeFormats() {
  if (!window.Html5QrcodeSupportedFormats) {
    return undefined;
  }

  return [
    Html5QrcodeSupportedFormats.CODE_128,
    Html5QrcodeSupportedFormats.CODE_39,
    Html5QrcodeSupportedFormats.CODE_93,
    Html5QrcodeSupportedFormats.EAN_13,
    Html5QrcodeSupportedFormats.EAN_8,
    Html5QrcodeSupportedFormats.ITF,
    Html5QrcodeSupportedFormats.UPC_A,
    Html5QrcodeSupportedFormats.UPC_E,
    Html5QrcodeSupportedFormats.QR_CODE,
  ];
}

function addManualCode(event) {
  event.preventDefault();
  const code = els.manualCode.value.trim();

  if (!code) {
    return;
  }

  const added = addCode(code);
  els.manualCode.value = "";
  setStatus(added ? "تمت الإضافة يدويًا." : "هذا الباركود موجود بالفعل.");
}

function addCode(code) {
  const normalizedCode = code.trim();

  if (state.rows.some((row) => row.code === normalizedCode)) {
    return false;
  }

  state.rows.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    code: normalizedCode,
    createdAt: new Date().toISOString(),
  });
  saveRows();
  render();
  return true;
}

function deleteRow(event) {
  const button = event.target.closest("[data-id]");
  if (!button) {
    return;
  }

  state.rows = state.rows.filter((row) => row.id !== button.dataset.id);
  saveRows();
  render();
}

function exportXlsx() {
  if (!state.rows.length) {
    return;
  }

  if (!window.XLSX) {
    setStatus("مكتبة Excel لم يتم تحميلها. تأكد من اتصال الإنترنت وجرب تحديث الصفحة.");
    return;
  }

  const sheetRows = state.rows
    .slice()
    .reverse()
    .map((row, index) => ({
      "#": index + 1,
      Barcode: row.code,
      "Scan Date": formatScanDate(row.createdAt),
      "Scan Time": formatScanTime(row.createdAt),
      "Scanned At": formatFullScanDate(row.createdAt),
    }));

  const worksheet = XLSX.utils.json_to_sheet(sheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Barcodes");
  XLSX.writeFile(workbook, fileName("barcodes", "xlsx"));
}

function fileName(base, extension) {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${base}-${stamp}.${extension}`;
}

function formatScanDate(value) {
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatScanTime(value) {
  return new Intl.DateTimeFormat("ar-EG", {
    timeStyle: "short",
  }).format(new Date(value));
}

function formatFullScanDate(value) {
  return new Intl.DateTimeFormat("ar-EG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function setStatus(message) {
  els.cameraStatus.textContent = message;
}

function showScanMessage(message) {
  els.scanToast.textContent = message;
  els.scanToast.hidden = false;
  els.scanToast.classList.add("is-visible");

  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => {
    els.scanToast.classList.remove("is-visible");
    els.scanToast.hidden = true;
  }, 1400);
}

function uniqueRows(rows) {
  const seen = new Set();
  const unique = [];

  for (const row of rows) {
    const code = String(row.code || "").trim();

    if (!code || seen.has(code)) {
      continue;
    }

    seen.add(code);
    unique.push({ ...row, code });
  }

  return unique;
}

function keepManualCodeNumeric() {
  els.manualCode.value = els.manualCode.value.replace(/\D/g, "");
}

function unlockBeep() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;

  if (!AudioContext) {
    return;
  }

  state.audioContext = state.audioContext || new AudioContext();

  if (state.audioContext.state === "suspended") {
    state.audioContext.resume();
  }
}

function playBeep() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;

  if (!AudioContext) {
    return;
  }

  unlockBeep();

  const oscillator = state.audioContext.createOscillator();
  const secondOscillator = state.audioContext.createOscillator();
  const gain = state.audioContext.createGain();
  const now = state.audioContext.currentTime;

  oscillator.type = "square";
  secondOscillator.type = "sine";
  oscillator.frequency.setValueAtTime(1200, now);
  secondOscillator.frequency.setValueAtTime(1800, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(1, now + 0.01);
  gain.gain.setValueAtTime(1, now + 0.18);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

  oscillator.connect(gain);
  secondOscillator.connect(gain);
  gain.connect(state.audioContext.destination);
  oscillator.start(now);
  secondOscillator.start(now);
  oscillator.stop(now + 0.45);
  secondOscillator.stop(now + 0.45);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
