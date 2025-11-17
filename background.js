// background-enhanced.js
// Расширенная версия с новыми функциями
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

let recording = false;
let paused = false;
let logs = [];
let settings = null;
let autoCleanupInterval = null;

// Функция для уведомления всех вкладок об изменении состояния
async function notifyAllTabs(state) {
  try {
    const tabs = await browserAPI.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) {
        browserAPI.tabs.sendMessage(tab.id, {
          action: "state_changed",
          recording: state.recording,
          paused: state.paused
        }).catch(err => {
          // Игнорируем ошибки для вкладок где content script не загружен
          console.log('[API Sniffer Enhanced] Could not notify tab', tab.id, ':', err.message);
        });
      }
    }
  } catch (err) {
    console.error('[API Sniffer Enhanced] Error notifying tabs:', err);
  }
}

// Получение настроек по умолчанию (упрощенная версия из settings.js)
function getDefaultSettings() {
  return {
    ignoreList: {
      enabled: true,
      patterns: ['*/analytics/*', '*/google-analytics.com/*', '*/ads/*']
    },
    recordingConditions: {
      enabled: false,
      urlPatterns: [],
      domains: [],
      excludePatterns: []
    },
    security: {
      hideTokens: true,
      tokenPatterns: ['authorization', 'x-auth-token', 'bearer', 'token', 'password'],
      autoCleanup: {
        enabled: false,
        intervalMinutes: 30,
        maxRecords: 1000
      }
    },
    performance: {
      maxLogs: 5000
    }
  };
}

// Проверка, должен ли URL быть проигнорирован
function shouldIgnoreUrl(url) {
  if (!settings || !settings.ignoreList.enabled) return false;
  return settings.ignoreList.patterns.some(pattern => {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return regex.test(url);
  });
}

// Проверка, должен ли URL быть записан
function shouldRecordUrl(url) {
  if (!settings) return true;
  
  const conditions = settings.recordingConditions;
  if (!conditions.enabled) return true;
  
  // Проверка исключений
  if (conditions.excludePatterns.some(pattern => {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    return regex.test(url);
  })) {
    return false;
  }
  
  // Проверка паттернов
  if (conditions.urlPatterns.length > 0) {
    return conditions.urlPatterns.some(pattern => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(url);
    });
  }
  
  // Проверка доменов
  if (conditions.domains.length > 0) {
    try {
      const urlObj = new URL(url);
      return conditions.domains.some(domain => urlObj.hostname.includes(domain));
    } catch (e) {
      return false;
    }
  }
  
  return true;
}

// Фильтрация чувствительных данных
function filterSensitiveData(headers) {
  if (!settings || !settings.security.hideTokens) return headers;
  
  const filtered = { ...headers };
  const patterns = settings.security.tokenPatterns;
  
  for (const key in filtered) {
    const lowerKey = key.toLowerCase();
    if (patterns.some(pattern => lowerKey.includes(pattern.toLowerCase()))) {
      filtered[key] = '***HIDDEN***';
    }
  }
  
  return filtered;
}

// Автоочистка логов
function startAutoCleanup() {
  if (autoCleanupInterval) {
    clearInterval(autoCleanupInterval);
  }
  
  if (!settings || !settings.security.autoCleanup.enabled) return;
  
  const intervalMs = settings.security.autoCleanup.intervalMinutes * 60 * 1000;
  const maxRecords = settings.security.autoCleanup.maxRecords;
  
  autoCleanupInterval = setInterval(async () => {
    if (logs.length > maxRecords) {
      logs = logs.slice(-maxRecords);
      await browserAPI.storage.local.set({ logs });
      console.log(`[API Sniffer] Auto-cleanup: trimmed to ${maxRecords} records`);
    }
  }, intervalMs);
  
  console.log(`[API Sniffer] Auto-cleanup started: every ${settings.security.autoCleanup.intervalMinutes} minutes`);
}

// Инициализация
async function initState() {
  try {
    const data = await browserAPI.storage.local.get(['recording', 'paused', 'logs', 'settings']);
    recording = data.recording !== undefined ? data.recording : false;  // По умолчанию ВЫКЛЮЧЕНО
    paused = data.paused || false;
    logs = data.logs || [];
    settings = data.settings || getDefaultSettings();
    
    console.log('[API Sniffer Enhanced] State loaded:', { 
      recording, 
      paused,
      logsCount: logs.length 
    });
    
    startAutoCleanup();
  } catch (e) {
    console.error('[API Sniffer Enhanced] Error loading state:', e);
    recording = false;  // По умолчанию ВЫКЛЮЧЕНО
    paused = false;
    logs = [];
    settings = getDefaultSettings();
  }
}

initState();

browserAPI.runtime.onInstalled.addListener(() => {
  console.log('[API Sniffer Enhanced] Extension installed/updated');
  recording = false;  // По умолчанию ВЫКЛЮЧЕНО - пользователь должен запустить вручную
  paused = false;
  logs = [];
  settings = getDefaultSettings();
  browserAPI.storage.local.set({ recording, paused, logs, settings });
});

browserAPI.runtime.onStartup.addListener(() => {
  console.log('[API Sniffer Enhanced] Browser startup');
  initState();
});

// Обработка сообщений
browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true; // Важно для асинхронных ответов
});

async function handleMessage(message, sender, sendResponse) {
  try {
    const action = message.action || message.type;
    console.log('[API Sniffer Enhanced] Message:', action, '| recording:', recording, '| paused:', paused);

    // Запись лога
    if (action === "api_log") {
      if (!recording || paused) {
        console.log('[API Sniffer Enhanced] Recording OFF or paused');
        sendResponse({ ok: true });
        return;
      }
      
      const url = message.payload.url;
      
      // Проверки фильтров
      if (shouldIgnoreUrl(url)) {
        console.log('[API Sniffer Enhanced] URL ignored:', url);
        sendResponse({ ok: true });
        return;
      }
      
      if (!shouldRecordUrl(url)) {
        console.log('[API Sniffer Enhanced] URL not matching conditions:', url);
        sendResponse({ ok: true });
        return;
      }
      
      // Фильтрация чувствительных данных
      const payload = {
        ...message.payload,
        tabId: sender.tab ? sender.tab.id : null,
        requestHeaders: filterSensitiveData(message.payload.requestHeaders || {}),
        responseHeaders: filterSensitiveData(message.payload.responseHeaders || {})
      };
      
      logs.push(payload);
      
      // Проверка лимита
      if (settings && settings.performance.maxLogs) {
        if (logs.length > settings.performance.maxLogs) {
          logs = logs.slice(-settings.performance.maxLogs);
        }
      }
      
      await browserAPI.storage.local.set({ logs });
      console.log('[API Sniffer Enhanced] Log saved, total:', logs.length);
      sendResponse({ ok: true });
      return;
    }

  // Получить состояние
  if (action === "get_state") {
    sendResponse({ recording, paused, count: logs.length });
    return;
  }

  // Установить запись
  if (action === "set_recording") {
    recording = !!message.value;
    await browserAPI.storage.local.set({ recording });
    console.log('[API Sniffer Enhanced] Recording:', recording);
    
    // Уведомляем все вкладки об изменении состояния
    notifyAllTabs({ recording, paused });
    
    sendResponse({ recording });
    return;
  }

  // Пауза/возобновление
  if (action === "set_paused") {
    paused = message.paused !== undefined ? message.paused : !!message.value;
    await browserAPI.storage.local.set({ paused });
    console.log('[API Sniffer Enhanced] Paused:', paused);
    
    // Уведомляем все вкладки об изменении состояния
    notifyAllTabs({ recording, paused });
    
    sendResponse({ paused });
    return;
  }

  // Получить логи
  if (action === "get_logs") {
    sendResponse({ logs });
    return;
  }

  // Очистить логи
  if (action === "clear_logs") {
    logs = [];
    await browserAPI.storage.local.set({ logs });
    console.log('[API Sniffer Enhanced] Logs cleared');
    sendResponse({ ok: true });
    return;
  }

  // Обновить настройки
  if (action === "update_settings") {
    settings = message.settings;
    await browserAPI.storage.local.set({ settings });
    startAutoCleanup(); // Перезапуск автоочистки с новыми настройками
    console.log('[API Sniffer Enhanced] Settings updated');
    sendResponse({ ok: true });
    return;
  }

  // Получить настройки
  if (action === "get_settings") {
    sendResponse({ settings });
    return;
  }

  // Фильтрация логов
  if (action === "filter_logs") {
    const filtered = filterLogs(logs, message.filters);
    sendResponse({ logs: filtered });
    return;
  }

  // Получить статистику
  if (action === "get_stats") {
    const stats = calculateStats(logs);
    sendResponse({ stats });
    return;
  }
  
  } catch (error) {
    console.error('[API Sniffer Enhanced] Error handling message:', error);
    sendResponse({ error: error.message });
  }
}

// Фильтрация логов по критериям
function filterLogs(logs, filters) {
  if (!filters) return logs;
  
  return logs.filter(log => {
    // Фильтр по типу API
    if (filters.apiTypes && filters.apiTypes.length > 0) {
      if (!filters.apiTypes.includes(log.apiType)) return false;
    }
    
    // Фильтр по методу
    if (filters.methods && filters.methods.length > 0) {
      if (!filters.methods.includes(log.method)) return false;
    }
    
    // Фильтр по статусу
    if (filters.statusCodes && filters.statusCodes !== 'all') {
      if (filters.statusCodes === 'success' && (log.status < 200 || log.status >= 300)) return false;
      if (filters.statusCodes === 'errors' && (log.status < 400)) return false;
    }
    
    // Фильтр по URL (регулярное выражение)
    if (filters.urlPattern && filters.urlPattern.trim() !== '') {
      try {
        const regex = new RegExp(filters.urlPattern, 'i');
        if (!regex.test(log.url)) return false;
      } catch (e) {
        // Невалидное регулярное выражение
      }
    }
    
    // Текстовый поиск
    if (filters.searchQuery && filters.searchQuery.trim() !== '') {
      const query = filters.searchQuery.toLowerCase();
      const searchIn = JSON.stringify(log).toLowerCase();
      if (!searchIn.includes(query)) return false;
    }
    
    return true;
  });
}

// Расчет статистики
function calculateStats(logs) {
  const stats = {
    total: logs.length,
    byType: {},
    byMethod: {},
    byStatus: {},
    errors: 0,
    avgDuration: 0
  };
  
  let totalDuration = 0;
  
  logs.forEach(log => {
    stats.byType[log.apiType] = (stats.byType[log.apiType] || 0) + 1;
    if (log.method) stats.byMethod[log.method] = (stats.byMethod[log.method] || 0) + 1;
    if (log.status) {
      const group = getStatusGroup(log.status);
      stats.byStatus[group] = (stats.byStatus[group] || 0) + 1;
      if (log.status >= 400) stats.errors++;
    }
    if (log.duration) totalDuration += log.duration;
  });
  
  if (stats.total > 0) {
    stats.avgDuration = totalDuration / stats.total;
  }
  
  return stats;
}

function getStatusGroup(status) {
  if (status >= 200 && status < 300) return '2xx Success';
  if (status >= 300 && status < 400) return '3xx Redirect';
  if (status >= 400 && status < 500) return '4xx Client Error';
  if (status >= 500) return '5xx Server Error';
  return 'Other';
}
