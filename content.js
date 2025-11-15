// content.js
// Универсальная обёртка для поддержки всех браузеров
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

console.log('[API Sniffer Content] Script loaded on:', window.location.href);

// Инжектим sniffer.js в страницу, чтобы иметь доступ к window.fetch/XHR/WebSocket/EventSource
(function injectSniffer() {
  try {
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
    console.error('[API Sniffer Content] Error injecting sniffer.js:', e);
  }
})();

// Мост: получаем window.postMessage из sniffer.js и отправляем в background
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.__sniffer__ !== true) return;

  console.log('[API Sniffer Content] Event captured:', data.payload.apiType, data.payload.url);

  browserAPI.runtime.sendMessage({
    type: "api_log",
    payload: data.payload
  }).catch(err => {
    console.error('[API Sniffer Content] Error sending message:', err);
  });
});
