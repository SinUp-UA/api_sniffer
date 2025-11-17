// content.js
// Универсальная обёртка для поддержки всех браузеров
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Флаг для отслеживания инвалидации контекста (логируем только один раз)
let contextInvalidated = false;

console.log('[API Sniffer Content] Script loaded on:', window.location.href);

// Проверка валидности контекста расширения
function isContextValid() {
  if (!browserAPI.runtime?.id) {
    if (!contextInvalidated) {
      contextInvalidated = true;
      console.info('[API Sniffer Content] Extension context invalidated - this is normal after extension reload');
    }
    return false;
  }
  return true;
}

// Функция для получения и отправки состояния записи в sniffer.js
async function syncSnifferState() {
  if (!isContextValid()) return;
  
  try {
    const response = await browserAPI.runtime.sendMessage({ action: "get_state" });
    
    // Отправляем состояние в sniffer.js через postMessage
    window.postMessage({
      __sniffer_state_update__: true,
      recording: response.recording || false,
      paused: response.paused || false
    }, "*");
    
    console.log('[API Sniffer Content] State synced to sniffer.js:', response);
  } catch (err) {
    if (!err.message?.includes('Extension context invalidated')) {
      console.error('[API Sniffer Content] Error syncing state:', err);
    }
  }
}

// Инжектим sniffer.js в страницу, чтобы иметь доступ к window.fetch/XHR/WebSocket/EventSource
(function injectSniffer() {
  if (!isContextValid()) return;
  
  try {
    const script = document.createElement("script");
    script.src = browserAPI.runtime.getURL("sniffer.js");
    script.async = false;
    script.onload = () => {
      console.log('[API Sniffer Content] sniffer.js injected successfully');
      script.remove();
      
      // Синхронизируем состояние после загрузки sniffer.js
      setTimeout(() => syncSnifferState(), 100);
    };
    script.onerror = (e) => {
      console.error('[API Sniffer Content] Failed to inject sniffer.js:', e);
    };
    (document.head || document.documentElement).prepend(script);
  } catch (e) {
    if (!e.message?.includes('Extension context invalidated')) {
      console.error('[API Sniffer Content] Error injecting sniffer.js:', e);
    }
  }
})();

// Мост: получаем window.postMessage из sniffer.js и отправляем в background
window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data) return;

  // Обработка запроса состояния от sniffer.js
  if (data.__sniffer_request_state__) {
    syncSnifferState();
    return;
  }

  // Обработка логов от sniffer.js
  if (data.__sniffer__ !== true) return;

  // Проверка валидности контекста расширения
  if (!isContextValid()) return;

  console.log('[API Sniffer Content] Event captured:', data.payload.apiType, data.payload.url);

  try {
    browserAPI.runtime.sendMessage({
      action: "api_log",
      payload: data.payload
    }).catch(err => {
      // Тихо игнорировать ошибки инвалидации контекста
      if (!err.message?.includes('Extension context invalidated')) {
        console.error('[API Sniffer Content] Error sending message:', err);
      }
    });
  } catch (err) {
    if (!err.message?.includes('Extension context invalidated')) {
      console.warn('[API Sniffer Content] Cannot access extension context:', err.message);
    }
  }
});

// Слушаем изменения состояния от popup/background
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "state_changed") {
    // Обновляем состояние в sniffer.js когда оно меняется
    window.postMessage({
      __sniffer_state_update__: true,
      recording: message.recording || false,
      paused: message.paused || false
    }, "*");
    console.log('[API Sniffer Content] State updated from background:', message);
  }
});
