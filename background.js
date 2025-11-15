// background.js
// Универсальная обёртка для поддержки всех браузеров
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

let recording = false;
let logs = [];

// Инициализация - загрузка состояния из storage
async function initState() {
  try {
    const data = await browserAPI.storage.local.get(['recording', 'logs']);
    recording = data.recording || false;
    logs = data.logs || [];
    console.log('[API Sniffer] State loaded:', { recording, logsCount: logs.length });
  } catch (e) {
    console.error('[API Sniffer] Error loading state:', e);
    recording = false;
    logs = [];
  }
}

// Вызываем инициализацию при старте
initState();

// Инициализация при установке
browserAPI.runtime.onInstalled.addListener(() => {
  console.log('[API Sniffer] Extension installed/updated');
  recording = false;
  logs = [];
  browserAPI.storage.local.set({ recording, logs });
});

// Восстановление состояния при пробуждении service worker (Chrome MV3)
browserAPI.runtime.onStartup.addListener(() => {
  console.log('[API Sniffer] Browser startup - reloading state');
  initState();
});

// Обработка сообщений от content.js и popup.js
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Важно: всегда загружаем актуальное состояние перед обработкой
  initState().then(() => {
    handleMessage(message, sender, sendResponse);
  });
  return true; // Асинхронный ответ
});

async function handleMessage(message, sender, sendResponse) {
  console.log('[API Sniffer] Message received:', message.type, sender.tab?.id);

  if (message.type === "api_log") {
    if (!recording) {
      console.log('[API Sniffer] Recording is OFF, skipping log');
      return;
    }
    const payload = {
      ...message.payload,
      tabId: sender.tab ? sender.tab.id : null
    };
    logs.push(payload);
    await browserAPI.storage.local.set({ logs });
    console.log('[API Sniffer] Log saved, total:', logs.length);
    return;
  }

  if (message.type === "get_state") {
    const state = { recording, count: logs.length };
    console.log('[API Sniffer] State requested:', state);
    sendResponse(state);
    return;
  }

  if (message.type === "set_recording") {
    recording = !!message.value;
    await browserAPI.storage.local.set({ recording });
    console.log('[API Sniffer] Recording set to:', recording);
    sendResponse({ recording });
    return;
  }

  if (message.type === "get_logs") {
    console.log('[API Sniffer] Logs requested, count:', logs.length);
    sendResponse({ logs });
    return;
  }

  if (message.type === "clear_logs") {
    logs = [];
    await browserAPI.storage.local.set({ logs });
    console.log('[API Sniffer] Logs cleared');
    sendResponse({ ok: true });
    return;
  }
}
