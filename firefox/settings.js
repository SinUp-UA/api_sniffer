// settings.js
// Управление настройками расширения
// Примечание: browserAPI объявлен в popup.js

// Настройки по умолчанию
const DEFAULT_SETTINGS = {
  // Фильтры
  filters: {
    apiTypes: ['fetch', 'xhr', 'websocket', 'sse'], // Какие типы API показывать
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'], // Какие HTTP методы
    statusCodes: 'all', // 'all', 'success' (2xx), 'errors' (4xx, 5xx)
    urlPattern: '', // Регулярное выражение для URL
    searchQuery: '' // Текстовый поиск
  },

  // Условия записи
  recordingConditions: {
    enabled: false, // Запись по условию
    urlPatterns: [], // Массив паттернов URL для записи
    domains: [], // Домены для записи
    excludePatterns: [] // Паттерны для исключения
  },

  // Игнор-лист
  ignoreList: {
    enabled: true,
    patterns: [
      '*/analytics/*',
      '*/google-analytics.com/*',
      '*/googletagmanager.com/*',
      '*/facebook.com/tr/*',
      '*/doubleclick.net/*',
      '*/ads/*',
      '*/tracking/*'
    ]
  },

  // Безопасность
  security: {
    hideTokens: true, // Скрывать токены в заголовках
    tokenPatterns: [
      'authorization',
      'x-auth-token',
      'x-api-key',
      'bearer',
      'token',
      'api-key',
      'apikey',
      'password',
      'secret'
    ],
    autoCleanup: {
      enabled: false,
      intervalMinutes: 30, // Очистка каждые 30 минут
      maxRecords: 1000 // Максимум записей
    }
  },

  // UI
  ui: {
    theme: 'light', // 'light', 'dark', 'auto'
    itemsPerPage: 50,
    showPreview: true,
    previewLines: 5,
    colorCoding: true, // Цветовая индикация статусов
    compactMode: false
  },

  // Экспорт
  export: {
    includeHeaders: true,
    includeBody: true,
    includeTimestamps: true,
    format: 'json' // 'json', 'har', 'csv', 'postman'
  },

  // Производительность
  performance: {
    maxLogs: 5000, // Максимум логов в памяти
    virtualScrolling: true,
    compressStorage: false
  },

  // Расширенное
  advanced: {
    captureStackTrace: false, // Захватывать stack trace
    captureGraphQL: true, // Специальная обработка GraphQL
    captureServiceWorker: true,
    enableMock: false, // Включить mock ответов
    enableReplay: true
  }
};

class Settings {
  constructor() {
    this.settings = { ...DEFAULT_SETTINGS };
    this.listeners = [];
  }

  // Загрузка настроек из storage
  async load() {
    try {
      const data = await browserAPI.storage.local.get('settings');
      if (data.settings) {
        this.settings = this.mergeSettings(DEFAULT_SETTINGS, data.settings);
      }
      console.log('[Settings] Loaded:', this.settings);
      return this.settings;
    } catch (e) {
      console.error('[Settings] Error loading:', e);
      return DEFAULT_SETTINGS;
    }
  }

  // Глубокое слияние настроек
  mergeSettings(defaults, custom) {
    const result = { ...defaults };
    for (const key in custom) {
      if (custom[key] && typeof custom[key] === 'object' && !Array.isArray(custom[key])) {
        result[key] = this.mergeSettings(defaults[key] || {}, custom[key]);
      } else {
        result[key] = custom[key];
      }
    }
    return result;
  }

  // Сохранение настроек
  async save(newSettings) {
    try {
      this.settings = newSettings || this.settings;
      await browserAPI.storage.local.set({ settings: this.settings });
      console.log('[Settings] Saved:', this.settings);
      this.notifyListeners();
      return true;
    } catch (e) {
      console.error('[Settings] Error saving:', e);
      return false;
    }
  }

  // Обновление части настроек
  async update(path, value) {
    const keys = path.split('.');
    let current = this.settings;
    for (let i = 0; i < keys.length - 1; i++) {
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
    return this.save();
  }

  // Получение значения по пути
  get(path) {
    const keys = path.split('.');
    let current = this.settings;
    for (const key of keys) {
      if (current[key] === undefined) return undefined;
      current = current[key];
    }
    return current;
  }

  // Сброс до значений по умолчанию
  async reset() {
    this.settings = { ...DEFAULT_SETTINGS };
    return this.save();
  }

  // Подписка на изменения
  onChange(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  // Уведомление слушателей
  notifyListeners() {
    this.listeners.forEach(callback => callback(this.settings));
  }

  // Проверка, должен ли URL быть проигнорирован
  shouldIgnoreUrl(url) {
    if (!this.settings.ignoreList.enabled) return false;
    
    return this.settings.ignoreList.patterns.some(pattern => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(url);
    });
  }

  // Проверка, должен ли URL быть записан (если включены условия)
  shouldRecordUrl(url) {
    const conditions = this.settings.recordingConditions;
    
    if (!conditions.enabled) return true; // Без условий записываем всё
    
    // Проверка исключений
    if (conditions.excludePatterns.some(pattern => {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(url);
    })) {
      return false;
    }
    
    // Проверка паттернов URL
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

  // Фильтрация токенов в заголовках
  filterSensitiveData(headers) {
    if (!this.settings.security.hideTokens) return headers;
    
    const filtered = { ...headers };
    const patterns = this.settings.security.tokenPatterns;
    
    for (const key in filtered) {
      const lowerKey = key.toLowerCase();
      if (patterns.some(pattern => lowerKey.includes(pattern.toLowerCase()))) {
        filtered[key] = '***HIDDEN***';
      }
    }
    
    return filtered;
  }
}

// Экспорт для использования в других скриптах
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { Settings, DEFAULT_SETTINGS };
}
