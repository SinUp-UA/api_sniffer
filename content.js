// content.js
// Универсальная обёртка для поддержки всех браузеров
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

console.log('[API Sniffer Content] Script loaded on:', window.location.href);

// Инжектим sniffer.js в страницу, чтобы иметь доступ к window.fetch/XHR/WebSocket/EventSource
(function injectSniffer() {
  try {
    // Проверка валидности контекста перед использованием runtime API
    if (!browserAPI.runtime?.id) {
      console.warn('[API Sniffer Content] Extension context invalidated, cannot inject sniffer.js');
      return;
    }

    const script = document.createElement("script");
    script.src = browserAPI.runtime.getURL("sniffer.js");
    script.async = false;
    script.onload = () => {
      console.log('[API Sniffer Content] sniffer.js injected successfully');
      script.remove();
    };
    script.onerror = (e) => {
      console.error('[API Sniffer Content] Failed to inject sniffer.js:', e);
    };
    (document.head || document.documentElement).prepend(script);
  } catch (e) {
    // Тихо игнорировать ошибки контекста расширения
    if (e.message?.includes('Extension context invalidated')) {
      console.warn('[API Sniffer Content] Extension context invalidated during injection');
    } else {
      console.error('[API Sniffer Content] Error injecting sniffer.js:', e);
    }
  }
})();

// Мост: получаем window.postMessage из sniffer.js и отправляем в background
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.__sniffer__ !== true) return;

  console.log('[API Sniffer Content] Event captured:', data.payload.apiType, data.payload.url);

  // Проверка валидности контекста расширения
  try {
    if (!browserAPI.runtime?.id) {
      console.warn('[API Sniffer Content] Extension context invalidated, stopping message forwarding');
      return;
    }

    browserAPI.runtime.sendMessage({
      action: "api_log",
      payload: data.payload
    }).catch(err => {
      // Игнорировать ошибки если контекст инвалидирован
      if (err.message?.includes('Extension context invalidated')) {
        console.warn('[API Sniffer Content] Extension context invalidated');
      } else {
        console.error('[API Sniffer Content] Error sending message:', err);
      }
    });
  } catch (err) {
    console.warn('[API Sniffer Content] Cannot access extension context:', err.message);
  }
});
