// sniffer.js
// Перехват fetch, XHR, WebSocket, SSE (EventSource)

(function () {
  if (window.__UNIVERSAL_API_SNIFFER_INSTALLED__) {
    console.log('[API Sniffer] Already installed, skipping');
    return;
  }
  window.__UNIVERSAL_API_SNIFFER_INSTALLED__ = true;

  // Глобальное состояние записи
  window.__SNIFFER_RECORDING__ = false;
  window.__SNIFFER_PAUSED__ = false;

  console.log('[API Sniffer] Installing hooks on:', window.location.href);

  function nowIso() {
    return new Date().toISOString();
  }

  function safeSerializeBody(body) {
    if (body == null) return null;

    if (typeof body === "string") return { type: "text", value: body };

    if (body instanceof Blob) {
      return { type: "blob", size: body.size };
    }

    if (body instanceof ArrayBuffer) {
      return { type: "arraybuffer", size: body.byteLength };
    }

    if (body instanceof FormData) {
      const obj = {};
      for (const [k, v] of body.entries()) {
        obj[k] = String(v);
      }
      return { type: "formdata", value: obj };
    }

    if (typeof body === "object") {
      try {
        return { type: "json", value: body };
      } catch {
        return { type: "object", value: null };
      }
    }

    return { type: typeof body, value: String(body) };
  }

  // Проверка: должны ли мы записывать события
  function shouldRecord() {
    return window.__SNIFFER_RECORDING__ && !window.__SNIFFER_PAUSED__;
  }

  function postLog(payload) {
    // Не отправляем логи если запись выключена или на паузе
    if (!shouldRecord()) {
      return;
    }
    
    console.log('[API Sniffer] Posting log:', payload.apiType, payload.url);
    try {
      window.postMessage(
        {
          __sniffer__: true,
          payload
        },
        "*"
      );
    } catch (e) {
      console.error('[API Sniffer] Error posting log:', e);
    }
  }

  // ---------------- FETCH ----------------
  const originalFetch = window.fetch;
  if (typeof originalFetch === "function") {
    window.fetch = async function (input, init = {}) {
      const start = performance.now();
      const timestamp = nowIso();

      let url =
        typeof input === "string"
          ? input
          : (input && input.url) || String(input);

      const method = (init.method || (input && input.method) || "GET").toUpperCase();

      const headers = new Headers(
        (init && init.headers) || (input && input.headers) || {}
      );
      const requestHeaders = {};
      headers.forEach((value, key) => {
        requestHeaders[key] = value;
      });

      let serializedRequestBody = null;
      if (init && init.body) {
        serializedRequestBody = safeSerializeBody(init.body);
      }

      let response;
      try {
        response = await originalFetch.apply(this, [input, init]);
      } catch (err) {
        const duration = performance.now() - start;

        postLog({
          apiType: "fetch",
          ok: false,
          error: String(err),
          url,
          method,
          status: 0,
          statusText: "",
          requestHeaders,
          requestBody: serializedRequestBody,
          responseHeaders: null,
          responseBody: null,
          timestamp,
          duration
        });

        throw err;
      }

      const duration = performance.now() - start;

      const responseHeaders = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      let responseBody = null;
      try {
        const clone = response.clone();
        const text = await clone.text();
        if (text && text.length) {
          responseBody = text.substring(0, 5000);
        }
      } catch {
        responseBody = null;
      }

      postLog({
        apiType: "fetch",
        ok: true,
        url,
        method,
        status: response.status,
        statusText: response.statusText,
        requestHeaders,
        requestBody: serializedRequestBody,
        responseHeaders,
        responseBody,
        timestamp,
        duration
      });

      return response;
    };
  }

  // ---------------- XHR ----------------
  const OriginalXHR = window.XMLHttpRequest;
  if (typeof OriginalXHR === "function") {
    function SnifferXHR() {
      const xhr = new OriginalXHR();

      let url = "";
      let method = "";
      let requestHeaders = {};
      let requestBody = null;
      let startTime = 0;
      let timestamp = "";

      const originalOpen = xhr.open;
      xhr.open = function (m, u, async, user, password) {
        method = (m || "GET").toUpperCase();
        url = u;
        return originalOpen.call(xhr, m, u, async, user, password);
      };

      const originalSetRequestHeader = xhr.setRequestHeader;
      xhr.setRequestHeader = function (name, value) {
        requestHeaders[name.toLowerCase()] = value;
        return originalSetRequestHeader.call(xhr, name, value);
      };

      const originalSend = xhr.send;
      xhr.send = function (body) {
        timestamp = nowIso();
        startTime = performance.now();
        requestBody = safeSerializeBody(body);

        xhr.addEventListener("loadend", function () {
          const duration = performance.now() - startTime;

          const rawHeaders = xhr.getAllResponseHeaders() || "";
          const responseHeaders = {};
          rawHeaders
            .trim()
            .split(/[\r\n]+/)
            .forEach((line) => {
              if (!line) return;
              const parts = line.split(": ");
              const key = parts.shift();
              if (!key) return;
              const value = parts.join(": ");
              responseHeaders[key.toLowerCase()] = value;
            });

          let responseBody = null;
          try {
            const text = xhr.responseText;
            if (text && text.length) {
              responseBody = text.substring(0, 5000);
            }
          } catch {
            responseBody = null;
          }

          postLog({
            apiType: "xhr",
            ok: true,
            url,
            method,
            status: xhr.status,
            statusText: xhr.statusText,
            requestHeaders,
            requestBody,
            responseHeaders,
            responseBody,
            timestamp,
            duration
          });
        });

        return originalSend.call(xhr, body);
      };

      return xhr;
    }
    window.XMLHttpRequest = SnifferXHR;
  }

  // ---------------- WebSocket ----------------
  if (typeof window.WebSocket === "function") {
    const OriginalWebSocket = window.WebSocket;

    function SnifferWebSocket(url, protocols) {
      const ws = protocols
        ? new OriginalWebSocket(url, protocols)
        : new OriginalWebSocket(url);

      const createdAt = nowIso();

      ws.addEventListener("open", () => {
        postLog({
          apiType: "websocket",
          event: "open",
          url,
          createdAt
        });
      });

      ws.addEventListener("message", (event) => {
        let dataPreview = "";
        try {
          dataPreview = String(event.data).substring(0, 5000);
        } catch {
          dataPreview = "[unserializable]";
        }
        postLog({
          apiType: "websocket",
          event: "message",
          url,
          data: dataPreview,
          timestamp: nowIso()
        });
      });

      ws.addEventListener("close", (event) => {
        postLog({
          apiType: "websocket",
          event: "close",
          url,
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          timestamp: nowIso()
        });
      });

      const originalSend = ws.send;
      ws.send = function (data) {
        let preview = "";
        try {
          preview = String(data).substring(0, 2000);
        } catch {
          preview = "[unserializable]";
        }
        postLog({
          apiType: "websocket",
          event: "send",
          url,
          data: preview,
          timestamp: nowIso()
        });

        return originalSend.call(ws, data);
      };

      return ws;
    }

    SnifferWebSocket.prototype = OriginalWebSocket.prototype;
    window.WebSocket = SnifferWebSocket;
  }

  // ---------------- SSE (EventSource) ----------------
  if (typeof window.EventSource === "function") {
    const OriginalEventSource = window.EventSource;

    window.EventSource = function (url, config) {
      const es = new OriginalEventSource(url, config);

      postLog({
        apiType: "sse",
        event: "create",
        url,
        timestamp: nowIso()
      });

      es.addEventListener("message", (event) => {
        let dataPreview = "";
        try {
          dataPreview = String(event.data).substring(0, 5000);
        } catch {
          dataPreview = "[unserializable]";
        }
        postLog({
          apiType: "sse",
          event: "message",
          url,
          data: dataPreview,
          timestamp: nowIso()
        });
      });

      es.addEventListener("error", () => {
        postLog({
          apiType: "sse",
          event: "error",
          url,
          timestamp: nowIso()
        });
      });

      return es;
    };
  }

  console.log('[API Sniffer] All hooks installed successfully! fetch:', !!window.fetch, 'XMLHttpRequest:', !!window.XMLHttpRequest, 'WebSocket:', !!window.WebSocket, 'EventSource:', !!window.EventSource);

  // Слушаем изменения состояния записи
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    const data = event.data;
    
    if (data && data.__sniffer_state_update__) {
      window.__SNIFFER_RECORDING__ = data.recording;
      window.__SNIFFER_PAUSED__ = data.paused;
      console.log('[API Sniffer] State updated: recording =', data.recording, ', paused =', data.paused);
    }
  });

  // Запросить начальное состояние
  window.postMessage({ __sniffer_request_state__: true }, "*");
})();
