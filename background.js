// background.js
// Универсальная обёртка для поддержки всех браузеров
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

let recording = false;
let logs = [];

// Инициализация
browserAPI.runtime.onInstalled.addListener(() => {
  recording = false;
  logs = [];
  browserAPI.storage.local.set({ recording, logs });
});

// Обработка сообщений от content.js и popup.js
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "api_log") {
    if (!recording) return; // запись выключена
    const payload = {
      ...message.payload,
      tabId: sender.tab ? sender.tab.id : null
    };
    logs.push(payload);
    browserAPI.storage.local.set({ logs });
    return;
  }

  if (message.type === "get_state") {
    sendResponse({ recording, count: logs.length });
    return true;
  }

  if (message.type === "set_recording") {
    recording = !!message.value;
    browserAPI.storage.local.set({ recording });
    sendResponse({ recording });
    return true;
  }

  if (message.type === "get_logs") {
    sendResponse({ logs });
    return true;
  }

  if (message.type === "clear_logs") {
    logs = [];
    browserAPI.storage.local.set({ logs });
    sendResponse({ ok: true });
    return true;
  }
});
