// content.js
// Универсальная обёртка для поддержки всех браузеров
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Инжектим sniffer.js в страницу, чтобы иметь доступ к window.fetch/XHR/WebSocket/EventSource
(function injectSniffer() {
  try {
    const script = document.createElement("script");
    script.src = browserAPI.runtime.getURL("sniffer.js");
    script.async = false;
    script.onload = () => {
      script.remove();
    };
    (document.head || document.documentElement).prepend(script);
  } catch (e) {
    // молча
  }
})();

// Мост: получаем window.postMessage из sniffer.js и отправляем в background
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.__sniffer__ !== true) return;

  browserAPI.runtime.sendMessage({
    type: "api_log",
    payload: data.payload
  });
});
