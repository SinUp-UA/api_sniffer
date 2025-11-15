// popup.js
// Универсальная обёртка для поддержки всех браузеров
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

const statusLabel = document.getElementById("statusLabel");
const countLabel = document.getElementById("countLabel");
const toggleBtn = document.getElementById("toggleBtn");
const exportZipBtn = document.getElementById("exportZipBtn");
const exportJsonBtn = document.getElementById("exportJsonBtn");
const clearBtn = document.getElementById("clearBtn");
const preview = document.getElementById("preview");

function updateUI(state) {
  if (!state) return;
  const { recording, count } = state;
  statusLabel.textContent = recording ? "Запись включена" : "Запись выключена";
  statusLabel.style.color = recording ? "#4ade80" : "#f97316";
  toggleBtn.textContent = recording ? "Остановить запись" : "Включить запись";
  countLabel.textContent = String(count ?? 0);
}

function loadState() {
  browserAPI.runtime.sendMessage({ type: "get_state" }, (res) => {
    if (browserAPI.runtime.lastError) return;
    updateUI(res || { recording: false, count: 0 });
  });

  browserAPI.runtime.sendMessage({ type: "get_logs" }, (res) => {
    if (browserAPI.runtime.lastError) return;
    const logs = (res && res.logs) || [];
    countLabel.textContent = String(logs.length);
    const last = logs.slice(-5);
    preview.value = JSON.stringify(last, null, 2);
  });
}

toggleBtn.addEventListener("click", () => {
  const enable = toggleBtn.textContent.includes("Включить");
  browserAPI.runtime.sendMessage(
    { type: "set_recording", value: enable },
    () => {
      if (browserAPI.runtime.lastError) return;
      loadState();
    }
  );
});

clearBtn.addEventListener("click", () => {
  browserAPI.runtime.sendMessage({ type: "clear_logs" }, () => {
    if (browserAPI.runtime.lastError) return;
    preview.value = "";
    countLabel.textContent = "0";
    loadState();
  });
});

exportJsonBtn.addEventListener("click", () => {
  browserAPI.runtime.sendMessage({ type: "get_logs" }, (res) => {
    if (browserAPI.runtime.lastError) return;
    const logs = (res && res.logs) || [];
    const blob = new Blob([JSON.stringify(logs, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const filename = `api_sniffer_logs_${Date.now()}.json`;

    browserAPI.downloads.download({
      url,
      filename
    });
  });
});

function buildHAR(logs) {
  return {
    log: {
      version: "1.2",
      creator: {
        name: "Universal API Sniffer",
        version: "1.0.0"
      },
      entries: logs
        .filter(l => l.apiType === "fetch" || l.apiType === "xhr")
        .map(l => ({
          startedDateTime: l.timestamp,
          time: l.duration || 0,
          request: {
            method: l.method,
            url: l.url,
            httpVersion: "HTTP/1.1",
            headers: Object.entries(l.requestHeaders || {})
              .map(([name, value]) => ({ name, value })),
            queryString: [],
            cookies: [],
            headersSize: -1,
            bodySize: -1,
            postData: l.requestBody
              ? {
                  mimeType: "application/json",
                  text:
                    l.requestBody.type === "json"
                      ? JSON.stringify(l.requestBody.value)
                      : String(l.requestBody.value)
                }
              : undefined
          },
          response: {
            status: l.status,
            statusText: l.statusText,
            httpVersion: "HTTP/1.1",
            headers: Object.entries(l.responseHeaders || {})
              .map(([name, value]) => ({ name, value })),
            cookies: [],
            content: {
              size: (l.responseBody || "").length,
              mimeType: "application/json",
              text: l.responseBody || ""
            },
            redirectURL: "",
            headersSize: -1,
            bodySize: -1
          },
          cache: {},
          timings: {
            send: 0,
            wait: l.duration || 0,
            receive: 0
          }
        }))
    }
  };
}

function buildSummary(logs) {
  const endpoints = {};

  for (const l of logs) {
    if (!l.url || !l.method) continue;
    const key = `${l.method} ${l.url}`;
    endpoints[key] = (endpoints[key] || 0) + 1;
  }

  return {
    totalEvents: logs.length,
    endpoints
  };
}

// Простейший генератор ZIP без сжатия (STORED)
function stringToUint8Array(str) {
  const encoder = new TextEncoder();
  return encoder.encode(str);
}

function crc32(buf) {
  const table = (function () {
    let c;
    const table = [];
    for (let n = 0; n < 256; n++) {
      c = n;
      for (let k = 0; k < 8; k++) {
        c = ((c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1));
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 0);
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

function uint32LE(n) {
  const b = new Uint8Array(4);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  b[2] = (n >>> 16) & 0xff;
  b[3] = (n >>> 24) & 0xff;
  return b;
}

function uint16LE(n) {
  const b = new Uint8Array(2);
  b[0] = n & 0xff;
  b[1] = (n >>> 8) & 0xff;
  return b;
}

function buildZipBlob(files) {
  // files: [{name, dataUint8}]
  const fileRecords = [];
  let offset = 0;
  const localParts = [];

  // DOS time & date (просто нули)
  const dosTime = uint16LE(0);
  const dosDate = uint16LE(0);

  for (const f of files) {
    const nameBytes = stringToUint8Array(f.name);
    const data = f.dataUint8;
    const crc = crc32(data);
    const size = data.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    let p = 0;

    // Local file header signature
    localHeader.set(uint32LE(0x04034b50), p); p += 4;
    // Version needed to extract
    localHeader.set(uint16LE(20), p); p += 2;
    // General purpose bit flag
    localHeader.set(uint16LE(0), p); p += 2;
    // Compression method (0 = store)
    localHeader.set(uint16LE(0), p); p += 2;
    // File last mod time
    localHeader.set(dosTime, p); p += 2;
    // File last mod date
    localHeader.set(dosDate, p); p += 2;
    // CRC-32
    localHeader.set(uint32LE(crc), p); p += 4;
    // Compressed size
    localHeader.set(uint32LE(size), p); p += 4;
    // Uncompressed size
    localHeader.set(uint32LE(size), p); p += 4;
    // File name length
    localHeader.set(uint16LE(nameBytes.length), p); p += 2;
    // Extra field length
    localHeader.set(uint16LE(0), p); p += 2;
    // File name
    localHeader.set(nameBytes, p); p += nameBytes.length;

    localParts.push(localHeader);
    localParts.push(data);

    fileRecords.push({
      nameBytes,
      crc,
      size,
      offset,
      dosTime,
      dosDate
    });

    offset += localHeader.length + data.length;
  }

  // Central directory
  const centralParts = [];
  let centralSize = 0;

  for (const f of fileRecords) {
    const { nameBytes, crc, size, offset: fileOffset, dosTime, dosDate } = f;
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    let p = 0;

    // Central file header signature
    centralHeader.set(uint32LE(0x02014b50), p); p += 4;
    // Version made by
    centralHeader.set(uint16LE(20), p); p += 2;
    // Version needed to extract
    centralHeader.set(uint16LE(20), p); p += 2;
    // General purpose bit flag
    centralHeader.set(uint16LE(0), p); p += 2;
    // Compression method
    centralHeader.set(uint16LE(0), p); p += 2;
    // File last mod time
    centralHeader.set(dosTime, p); p += 2;
    // File last mod date
    centralHeader.set(dosDate, p); p += 2;
    // CRC-32
    centralHeader.set(uint32LE(crc), p); p += 4;
    // Compressed size
    centralHeader.set(uint32LE(size), p); p += 4;
    // Uncompressed size
    centralHeader.set(uint32LE(size), p); p += 4;
    // File name length
    centralHeader.set(uint16LE(nameBytes.length), p); p += 2;
    // Extra field length
    centralHeader.set(uint16LE(0), p); p += 2;
    // File comment length
    centralHeader.set(uint16LE(0), p); p += 2;
    // Disk number start
    centralHeader.set(uint16LE(0), p); p += 2;
    // Internal file attributes
    centralHeader.set(uint16LE(0), p); p += 2;
    // External file attributes
    centralHeader.set(uint32LE(0), p); p += 4;
    // Relative offset of local header
    centralHeader.set(uint32LE(fileOffset), p); p += 4;
    // File name
    centralHeader.set(nameBytes, p); p += nameBytes.length;

    centralParts.push(centralHeader);
    centralSize += centralHeader.length;
  }

  const endRec = new Uint8Array(22);
  let p = 0;
  // End of central dir signature
  endRec.set(uint32LE(0x06054b50), p); p += 4;
  // Number of this disk
  endRec.set(uint16LE(0), p); p += 2;
  // Disk where central directory starts
  endRec.set(uint16LE(0), p); p += 2;
  // Number of central directory records on this disk
  endRec.set(uint16LE(fileRecords.length), p); p += 2;
  // Total number of central directory records
  endRec.set(uint16LE(fileRecords.length), p); p += 2;
  // Size of central directory
  endRec.set(uint32LE(centralSize), p); p += 4;
  // Offset of start of central directory
  endRec.set(uint32LE(offset), p); p += 4;
  // Comment length
  endRec.set(uint16LE(0), p); p += 2;

  // Собираем всё в один Uint8Array
  const totalSize = offset + centralSize + endRec.length;
  const out = new Uint8Array(totalSize);
  let pos = 0;

  for (const part of localParts) {
    out.set(part, pos);
    pos += part.length;
  }
  for (const part of centralParts) {
    out.set(part, pos);
    pos += part.length;
  }
  out.set(endRec, pos);
  pos += endRec.length;

  return new Blob([out], { type: "application/zip" });
}

exportZipBtn.addEventListener("click", () => {
  browserAPI.runtime.sendMessage({ type: "get_logs" }, (res) => {
    if (browserAPI.runtime.lastError) return;
    const logs = (res && res.logs) || [];

    const har = buildHAR(logs);
    const summary = buildSummary(logs);
    const meta = {
      version: "1.0.0",
      exportedAt: new Date().toISOString()
    };

    const files = [
      { name: "api_logs.json", data: JSON.stringify(logs, null, 2) },
      { name: "api_logs.har", data: JSON.stringify(har, null, 2) },
      { name: "summary.json", data: JSON.stringify(summary, null, 2) },
      { name: "meta.json", data: JSON.stringify(meta, null, 2) }
    ];

    const fileEntries = files.map(f => ({
      name: f.name,
      dataUint8: stringToUint8Array(f.data)
    }));

    const blob = buildZipBlob(fileEntries);
    const url = URL.createObjectURL(blob);
    const filename = `api_sniffer_export_${Date.now()}.zip`;

    browserAPI.downloads.download({
      url,
      filename
    });
  });
});

loadState();
