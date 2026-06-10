const STORAGE_KEY = "around-barcode-log";

const state = {
  html5QrCode: null,
  isScanning: false,
  lastScan: { code: "", at: 0 },
  rows: loadRows(),
};

const els = {
  barcodeList: document.querySelector("#barcode-list"),
  cameraStatus: document.querySelector("#camera-status"),
  emptyState: document.querySelector("#empty-state"),
  exportCsv: document.querySelector("#export-csv"),
  exportXlsx: document.querySelector("#export-xlsx"),
  manualCode: document.querySelector("#manual-code"),
  manualForm: document.querySelector("#manual-form"),
  startScan: document.querySelector("#start-scan"),
  stopScan: document.querySelector("#stop-scan"),
  totalCount: document.querySelector("#total-count"),
};

render();

els.startScan.addEventListener("click", startScanner);
els.stopScan.addEventListener("click", stopScanner);
els.exportXlsx.addEventListener("click", exportXlsx);
els.exportCsv.addEventListener("click", exportCsv);
els.manualForm.addEventListener("submit", addManualCode);
els.barcodeList.addEventListener("click", deleteRow);

window.addEventListener("beforeunload", () => {
  if (state.isScanning) {
    stopScanner();
  }
});

function loadRows() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
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
  els.exportCsv.disabled = state.rows.length === 0;

  els.barcodeList.innerHTML = state.rows
    .map((row, index) => {
      return `
        <tr>
          <td>${index + 1}</td>
          <td class="code">${escapeHtml(row.code)}</td>
          <td>${formatScanDate(row.createdAt)}</td>
          <td>${formatScanTime(row.createdAt)}</td>
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
  addCode(code);
  setStatus(`تمت إضافة الباركود: ${code}`);
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

  addCode(code);
  els.manualCode.value = "";
  setStatus(`تمت إضافة الباركود يدويًا: ${code}`);
}

function addCode(code) {
  state.rows.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    code,
    createdAt: new Date().toISOString(),
  });
  saveRows();
  render();
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
    setStatus("مكتبة Excel لم يتم تحميلها. استخدم CSV أو تأكد من اتصال الإنترنت.");
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

function exportCsv() {
  if (!state.rows.length) {
    return;
  }

  const header = ["#", "Barcode", "Scan Date", "Scan Time", "Scanned At"];
  const lines = state.rows
    .slice()
    .reverse()
    .map((row, index) => [
      index + 1,
      row.code,
      formatScanDate(row.createdAt),
      formatScanTime(row.createdAt),
      formatFullScanDate(row.createdAt),
    ]);
  const csv = [header, ...lines].map((line) => line.map(csvCell).join(",")).join("\n");
  download(new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" }), fileName("barcodes", "csv"));
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
