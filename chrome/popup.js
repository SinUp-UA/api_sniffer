// Universal browser API
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// Состояние
let currentTab = 'logs';
let allLogs = [];
let filteredLogs = [];
let currentFilters = {
    search: '',
    method: '',
    status: '',
    apiTypes: ['fetch', 'xhr', 'websocket', 'eventsource']
};

// Инициализация
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[API Sniffer Popup] Инициализация');
    
    // Инициализировать обработчики ПЕРВЫМ делом
    initEventHandlers();
    
    // Загрузить настройки
    await loadSettings();
    
    // Загрузить состояние
    await loadState();
    
    // Загрузить логи
    await loadLogs();
    
    // Загрузить статистику
    await loadStats();
    
    // Обновлять каждые 2 секунды
    setInterval(async () => {
        await loadLogs();
        await loadState(); // Обновлять статус тоже
    }, 2000);
});

// Загрузить настройки
async function loadSettings() {
    try {
        const result = await browserAPI.storage.local.get(['settings']);
        if (result.settings) {
            applySettingsToUI(result.settings);
        }
    } catch (error) {
        console.error('[API Sniffer Popup] Ошибка загрузки настроек:', error);
    }
}

// Применить настройки к UI
function applySettingsToUI(settings) {
    try {
        // Фильтры API типов
        if (settings.filters && settings.filters.apiTypes) {
            const apiTypes = Array.isArray(settings.filters.apiTypes) ? settings.filters.apiTypes : [];
            document.getElementById('filterFetch').checked = apiTypes.includes('fetch');
            document.getElementById('filterXhr').checked = apiTypes.includes('xhr');
            document.getElementById('filterWebsocket').checked = apiTypes.includes('websocket');
            document.getElementById('filterEventSource').checked = apiTypes.includes('eventsource');
        }
        
        // Условия записи
        if (settings.recordingConditions) {
            const urlPatterns = Array.isArray(settings.recordingConditions.urlPatterns) 
                ? settings.recordingConditions.urlPatterns : [];
            const excludePatterns = Array.isArray(settings.recordingConditions.excludePatterns) 
                ? settings.recordingConditions.excludePatterns : [];
            
            document.getElementById('urlPatterns').value = urlPatterns.join(', ');
            document.getElementById('excludePatterns').value = excludePatterns.join(', ');
        }
        
        // Игнор-лист
        if (settings.ignoreList) {
            let ignoreList = [];
            if (Array.isArray(settings.ignoreList)) {
                ignoreList = settings.ignoreList;
            } else if (settings.ignoreList.patterns && Array.isArray(settings.ignoreList.patterns)) {
                ignoreList = settings.ignoreList.patterns;
            }
            document.getElementById('ignoreList').value = ignoreList.join('\n');
        }
        
        // Безопасность
        if (settings.security) {
            document.getElementById('hideTokens').checked = settings.security.hideTokens || false;
            document.getElementById('autoCleanup').checked = 
                (settings.security.autoCleanup && settings.security.autoCleanup.enabled) || false;
        }
        
        // Производительность
        if (settings.performance && settings.performance.maxRecords) {
            document.getElementById('maxRecords').value = settings.performance.maxRecords;
        } else if (settings.security && settings.security.autoCleanup && settings.security.autoCleanup.maxRecords) {
            document.getElementById('maxRecords').value = settings.security.autoCleanup.maxRecords;
        }
    } catch (error) {
        console.error('[API Sniffer Popup] Ошибка применения настроек:', error);
    }
}

// Загрузить состояние
async function loadState() {
    try {
        const response = await browserAPI.runtime.sendMessage({ action: 'get_state' });
        console.log('[API Sniffer Popup] Состояние:', response);
        
        if (!response) {
            console.error('[API Sniffer Popup] Нет ответа от background');
            return;
        }
        
        // Обновить UI
        updateRecordingStatus(response.recording, response.paused);
    } catch (error) {
        console.error('[API Sniffer Popup] Ошибка загрузки состояния:', error);
    }
}

// Обновить статус записи
function updateRecordingStatus(recording, paused) {
    console.log('[API Sniffer Popup] Обновление статуса:', { recording, paused });
    
    const statusElement = document.getElementById('recordingStatus');
    const recordBtn = document.getElementById('recordBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    
    if (!statusElement || !recordBtn || !pauseBtn) {
        console.error('[API Sniffer Popup] Элементы статуса не найдены!');
        return;
    }
    
    // Обновить кнопку записи
    if (recording) {
        recordBtn.querySelector('.icon').textContent = '⏹'; // Стоп
        recordBtn.title = 'Остановить запись';
    } else {
        recordBtn.querySelector('.icon').textContent = '⏺'; // Старт
        recordBtn.title = 'Начать запись';
    }
    
    // Обновить статус
    if (!recording) {
        statusElement.innerHTML = '<span class="status-dot" style="background: #e53e3e;"></span>Запись остановлена';
        pauseBtn.querySelector('.icon').textContent = '⏸';
        pauseBtn.disabled = true;
        pauseBtn.style.opacity = '0.5';
        console.log('[API Sniffer Popup] Статус: Остановлена');
    } else if (paused) {
        statusElement.innerHTML = '<span class="status-dot status-paused"></span>Запись на паузе';
        pauseBtn.querySelector('.icon').textContent = '▶';
        pauseBtn.disabled = false;
        pauseBtn.style.opacity = '1';
        console.log('[API Sniffer Popup] Статус: На паузе');
    } else {
        statusElement.innerHTML = '<span class="status-dot status-active"></span>Запись активна';
        pauseBtn.querySelector('.icon').textContent = '⏸';
        pauseBtn.disabled = false;
        pauseBtn.style.opacity = '1';
        console.log('[API Sniffer Popup] Статус: Активна');
    }
}

// Загрузить логи
async function loadLogs() {
    try {
        const response = await browserAPI.runtime.sendMessage({ 
            action: 'filter_logs',
            filters: currentFilters
        });
        
        allLogs = response.logs || [];
        filteredLogs = allLogs;
        
        // Применить локальные фильтры
        applyLocalFilters();
        
        // Обновить счетчик
        document.getElementById('logsCount').textContent = `Логов: ${allLogs.length}`;
        
        // Отобразить логи
        displayLogs();
    } catch (error) {
        console.error('[API Sniffer Popup] Ошибка загрузки логов:', error);
    }
}

// Применить локальные фильтры
function applyLocalFilters() {
    filteredLogs = allLogs.filter(log => {
        // Поиск
        if (currentFilters.search) {
            const search = currentFilters.search.toLowerCase();
            const matchUrl = log.url.toLowerCase().includes(search);
            const matchMethod = log.method?.toLowerCase().includes(search);
            if (!matchUrl && !matchMethod) return false;
        }
        
        // Метод
        if (currentFilters.method && log.method !== currentFilters.method) {
            return false;
        }
        
        // Статус
        if (currentFilters.status) {
            const statusGroup = getStatusGroup(log.status);
            if (statusGroup !== currentFilters.status) {
                return false;
            }
        }
        
        return true;
    });
}

// Получить группу статуса
function getStatusGroup(status) {
    if (!status) return '';
    if (status >= 200 && status < 300) return '2xx';
    if (status >= 300 && status < 400) return '3xx';
    if (status >= 400 && status < 500) return '4xx';
    if (status >= 500) return '5xx';
    return '';
}

// Отобразить логи
function displayLogs() {
    const logsList = document.getElementById('logsList');
    
    if (filteredLogs.length === 0) {
        logsList.innerHTML = `
            <div class="empty-state">
                <span class="empty-icon">📭</span>
                <p>Нет захваченных запросов</p>
                <small>API запросы будут отображаться здесь</small>
            </div>
        `;
        return;
    }
    
    // Сохранить состояния развернутых элементов перед обновлением
    const expandedIndices = new Set();
    document.querySelectorAll('.log-item.expanded').forEach(item => {
        expandedIndices.add(item.dataset.index);
    });
    
    logsList.innerHTML = filteredLogs.map((log, index) => `
        <div class="log-item ${expandedIndices.has(String(index)) ? 'expanded' : ''}" data-index="${index}">
            <div class="log-header">
                <span class="log-method method-${log.method || 'GET'}">${log.method || 'GET'}</span>
                ${log.status ? `<span class="log-status status-${getStatusGroup(log.status)}">${log.status}</span>` : ''}
                <span class="log-type">${log.type}</span>
                <span class="log-time">${formatTime(log.timestamp)}</span>
            </div>
            <div class="log-url">${truncateUrl(log.url)}</div>
            <div class="log-details">
                <div><strong>URL:</strong> ${log.url}</div>
                ${log.duration ? `<div><strong>Время:</strong> ${log.duration}ms</div>` : ''}
                ${log.requestHeaders ? `<div><strong>Заголовки запроса:</strong> ${Object.keys(log.requestHeaders).length}</div>` : ''}
                ${log.responseHeaders ? `<div><strong>Заголовки ответа:</strong> ${Object.keys(log.responseHeaders).length}</div>` : ''}
                ${log.requestBody ? `<div><strong>Тело запроса:</strong> ${formatBody(log.requestBody)}</div>` : ''}
                ${log.responseBody ? `<div><strong>Тело ответа:</strong> ${formatBody(log.responseBody)}</div>` : ''}
            </div>
        </div>
    `).join('');
    
    // Добавить обработчики кликов
    document.querySelectorAll('.log-item').forEach(item => {
        item.addEventListener('click', () => {
            item.classList.toggle('expanded');
        });
    });
}

// Форматировать время
function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Сократить URL
function truncateUrl(url, maxLength = 80) {
    if (url.length <= maxLength) return url;
    return url.substring(0, maxLength) + '...';
}

// Форматировать тело
function formatBody(body) {
    if (typeof body === 'string') {
        return body.length > 100 ? body.substring(0, 100) + '...' : body;
    }
    return JSON.stringify(body).substring(0, 100);
}

// Загрузить статистику
async function loadStats() {
    try {
        const response = await browserAPI.runtime.sendMessage({ action: 'get_stats' });
        console.log('[API Sniffer Popup] Статистика:', response);
        
        displayStats(response.stats);
    } catch (error) {
        console.error('[API Sniffer Popup] Ошибка загрузки статистики:', error);
    }
}

// Отобразить статистику
function displayStats(stats) {
    if (!stats) return;
    
    // Общая статистика
    document.getElementById('totalRequests').textContent = stats.total || 0;
    
    const successCount = (stats.byStatus?.['2xx'] || 0);
    const errorCount = (stats.byStatus?.['4xx'] || 0) + (stats.byStatus?.['5xx'] || 0);
    const total = stats.total || 1;
    
    document.getElementById('successRate').textContent = Math.round((successCount / total) * 100) + '%';
    document.getElementById('errorRate').textContent = Math.round((errorCount / total) * 100) + '%';
    document.getElementById('avgDuration').textContent = Math.round(stats.duration?.average || 0) + 'ms';
    
    // По типам API
    displayChart('apiTypesChart', stats.byType || {});
    
    // По методам
    displayChart('methodsChart', stats.byMethod || {});
    
    // По статусам
    displayChart('statusChart', stats.byStatus || {});
    
    // Самые медленные
    displayList('slowestRequests', stats.slowest || [], 'url', 'duration', 'ms');
    
    // Топ доменов
    displayList('topDomains', stats.topDomains || [], 'domain', 'count', 'запросов');
}

// Отобразить график
function displayChart(elementId, data) {
    const element = document.getElementById(elementId);
    const max = Math.max(...Object.values(data));
    
    element.innerHTML = Object.entries(data).map(([key, value]) => `
        <div class="chart-bar">
            <div class="chart-label">${key}</div>
            <div class="chart-progress">
                <div class="chart-fill" style="width: ${(value / max) * 100}%">
                    ${value}
                </div>
            </div>
            <div class="chart-value">${value}</div>
        </div>
    `).join('');
}

// Отобразить список
function displayList(elementId, items, labelKey, valueKey, suffix = '') {
    const element = document.getElementById(elementId);
    
    if (items.length === 0) {
        element.innerHTML = '<div class="list-item"><span class="list-item-label">Нет данных</span></div>';
        return;
    }
    
    element.innerHTML = items.slice(0, 5).map(item => `
        <div class="list-item">
            <span class="list-item-label">${truncateUrl(item[labelKey], 50)}</span>
            <span class="list-item-value">${item[valueKey]}${suffix}</span>
        </div>
    `).join('');
}

// Инициализировать обработчики событий
function initEventHandlers() {
    console.log('[API Sniffer Popup] Инициализация обработчиков событий');
    
    // Табы
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('[API Sniffer Popup] Клик по табу:', tab.dataset.tab);
            switchTab(tab.dataset.tab);
        });
    });
    
    // Старт/Стоп записи
    document.getElementById('recordBtn').addEventListener('click', toggleRecording);
    
    // Пауза/Возобновление
    document.getElementById('pauseBtn').addEventListener('click', togglePause);
    
    // Очистка
    document.getElementById('clearBtn').addEventListener('click', clearLogs);
    
    // Быстрые фильтры
    document.getElementById('searchInput').addEventListener('input', (e) => {
        currentFilters.search = e.target.value;
        applyLocalFilters();
        displayLogs();
    });
    
    document.getElementById('methodFilter').addEventListener('change', (e) => {
        currentFilters.method = e.target.value;
        applyLocalFilters();
        displayLogs();
    });
    
    document.getElementById('statusFilter').addEventListener('change', (e) => {
        currentFilters.status = e.target.value;
        applyLocalFilters();
        displayLogs();
    });
    
    // Экспорт
    document.getElementById('exportJsonBtn').addEventListener('click', () => exportLogs('json'));
    document.getElementById('exportHarBtn').addEventListener('click', () => exportLogs('har'));
    document.getElementById('exportCsvBtn').addEventListener('click', () => exportLogs('csv'));
    document.getElementById('exportPostmanBtn').addEventListener('click', () => exportLogs('postman'));
    
    // Применить фильтры
    document.getElementById('applyFiltersBtn').addEventListener('click', applyFilters);
    
    // Сбросить фильтры
    document.getElementById('resetFiltersBtn').addEventListener('click', resetFilters);
}

// Переключить таб
function switchTab(tabName) {
    console.log('[API Sniffer Popup] Переключение на таб:', tabName);
    currentTab = tabName;
    
    // Обновить активный таб
    document.querySelectorAll('.tab').forEach(tab => {
        const isActive = tab.dataset.tab === tabName;
        tab.classList.toggle('active', isActive);
        console.log('[API Sniffer Popup] Таб', tab.dataset.tab, 'активен:', isActive);
    });
    
    // Показать контент
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    
    const tabMap = {
        'logs': 'logsTab',
        'stats': 'statsTab',
        'filters': 'filtersTab'
    };
    
    const targetTab = document.getElementById(tabMap[tabName]);
    if (targetTab) {
        targetTab.classList.add('active');
        console.log('[API Sniffer Popup] Показан контент:', tabMap[tabName]);
    } else {
        console.error('[API Sniffer Popup] Не найден контент для таба:', tabName);
    }
    
    // Обновить данные
    if (tabName === 'stats') {
        loadStats();
    }
}

// Переключить запись (старт/стоп)
async function toggleRecording() {
    console.log('[API Sniffer Popup] Переключение записи...');
    
    try {
        const state = await browserAPI.runtime.sendMessage({ action: 'get_state' });
        console.log('[API Sniffer Popup] Текущее состояние:', state);
        
        if (!state) {
            console.error('[API Sniffer Popup] Не удалось получить состояние!');
            alert('Ошибка: не удалось получить состояние расширения');
            return;
        }
        
        const newRecordingState = !state.recording;
        console.log('[API Sniffer Popup] Новое состояние записи:', newRecordingState);
        
        const response = await browserAPI.runtime.sendMessage({ 
            action: 'set_recording',
            value: newRecordingState
        });
        
        console.log('[API Sniffer Popup] Ответ на set_recording:', response);
        
        // Если запись включается, сбросить паузу
        if (newRecordingState) {
            await browserAPI.runtime.sendMessage({ 
                action: 'set_paused',
                paused: false
            });
            updateRecordingStatus(newRecordingState, false);
        } else {
            updateRecordingStatus(newRecordingState, state.paused);
        }
        
        // Перезагрузить состояние для проверки
        setTimeout(loadState, 100);
    } catch (error) {
        console.error('[API Sniffer Popup] Ошибка переключения записи:', error);
        alert('Ошибка: ' + error.message);
    }
}

// Переключить паузу
async function togglePause() {
    console.log('[API Sniffer Popup] Переключение паузы...');
    
    try {
        const state = await browserAPI.runtime.sendMessage({ action: 'get_state' });
        console.log('[API Sniffer Popup] Текущее состояние:', state);
        
        if (!state) {
            console.error('[API Sniffer Popup] Не удалось получить состояние!');
            alert('Ошибка: не удалось получить состояние расширения');
            return;
        }
        
        const newPausedState = !state.paused;
        console.log('[API Sniffer Popup] Новое состояние паузы:', newPausedState);
        
        const response = await browserAPI.runtime.sendMessage({ 
            action: 'set_paused',
            paused: newPausedState
        });
        
        console.log('[API Sniffer Popup] Ответ на set_paused:', response);
        
        // Обновить UI немедленно
        updateRecordingStatus(state.recording, newPausedState);
        
        // Перезагрузить состояние для проверки
        setTimeout(loadState, 100);
    } catch (error) {
        console.error('[API Sniffer Popup] Ошибка переключения паузы:', error);
        alert('Ошибка: ' + error.message);
    }
}

// Очистить логи
async function clearLogs() {
    if (!confirm('Очистить все логи?')) return;
    
    try {
        await browserAPI.runtime.sendMessage({ action: 'clear_logs' });
        allLogs = [];
        filteredLogs = [];
        displayLogs();
    } catch (error) {
        console.error('[API Sniffer Popup] Ошибка очистки логов:', error);
    }
}

// Применить фильтры
async function applyFilters() {
    try {
        // Собрать настройки из UI
        const apiTypes = [];
        if (document.getElementById('filterFetch').checked) apiTypes.push('fetch');
        if (document.getElementById('filterXhr').checked) apiTypes.push('xhr');
        if (document.getElementById('filterWebsocket').checked) apiTypes.push('websocket');
        if (document.getElementById('filterEventSource').checked) apiTypes.push('eventsource');
        
        const urlPatterns = document.getElementById('urlPatterns').value
            .split(',').map(p => p.trim()).filter(p => p);
        const excludePatterns = document.getElementById('excludePatterns').value
            .split(',').map(p => p.trim()).filter(p => p);
        const ignoreList = document.getElementById('ignoreList').value
            .split('\n').map(p => p.trim()).filter(p => p);
        
        const settings = {
            filters: { apiTypes },
            recordingConditions: { urlPatterns, excludePatterns },
            ignoreList,
            security: {
                hideTokens: document.getElementById('hideTokens').checked,
                autoCleanup: {
                    enabled: document.getElementById('autoCleanup').checked
                }
            },
            performance: {
                maxRecords: parseInt(document.getElementById('maxRecords').value)
            }
        };
        
        // Отправить на background
        await browserAPI.runtime.sendMessage({
            action: 'update_settings',
            settings
        });
        
        // Обновить фильтры
        currentFilters.apiTypes = apiTypes;
        
        // Перезагрузить логи
        await loadLogs();
        
        alert('Фильтры применены!');
    } catch (error) {
        console.error('[API Sniffer Popup] Ошибка применения фильтров:', error);
        alert('Ошибка применения фильтров');
    }
}

// Сбросить фильтры
async function resetFilters() {
    try {
        await browserAPI.runtime.sendMessage({
            action: 'update_settings',
            settings: {
                filters: {
                    apiTypes: ['fetch', 'xhr', 'websocket', 'eventsource']
                },
                recordingConditions: {
                    urlPatterns: [],
                    excludePatterns: []
                },
                ignoreList: []
            }
        });
        
        await loadSettings();
        await loadLogs();
        
        alert('Фильтры сброшены!');
    } catch (error) {
        console.error('[API Sniffer Popup] Ошибка сброса фильтров:', error);
    }
}

// Экспорт логов
async function exportLogs(format) {
    try {
        // Проверка на пустые логи
        if (!filteredLogs || filteredLogs.length === 0) {
            alert('Нет логов для экспорта!');
            return;
        }
        
        let data, filename, mimeType;
        
        switch (format) {
            case 'json':
                data = JSON.stringify(filteredLogs, null, 2);
                filename = `api-sniffer-${Date.now()}.json`;
                mimeType = 'application/json';
                break;
                
            case 'har':
                data = convertToHAR(filteredLogs);
                filename = `api-sniffer-${Date.now()}.har`;
                mimeType = 'application/json';
                break;
                
            case 'csv':
                data = convertToCSV(filteredLogs);
                filename = `api-sniffer-${Date.now()}.csv`;
                mimeType = 'text/csv';
                break;
                
            case 'postman':
                data = convertToPostman(filteredLogs);
                filename = `api-sniffer-${Date.now()}.postman_collection.json`;
                mimeType = 'application/json';
                break;
        }
        
        // Скачать файл
        const blob = new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('[API Sniffer Popup] Ошибка экспорта:', error);
        alert('Ошибка экспорта');
    }
}

// Конвертировать в HAR
// Конвертировать в HAR
function convertToHAR(logs) {
    const har = {
        log: {
            version: '1.2',
            creator: { name: 'API Sniffer', version: '1.0.0' },
            entries: logs.map(log => {
                // Безопасное преобразование timestamp
                let startedDateTime;
                try {
                    const date = new Date(log.timestamp);
                    startedDateTime = isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
                } catch (e) {
                    startedDateTime = new Date().toISOString();
                }
                
                return {
                    startedDateTime,
                    time: log.duration || 0,
                    request: {
                        method: log.method || 'GET',
                        url: log.url || '',
                        httpVersion: 'HTTP/1.1',
                        headers: Object.entries(log.requestHeaders || {}).map(([name, value]) => ({ 
                            name, 
                            value: String(value) 
                        })),
                        queryString: [],
                        cookies: [],
                        headersSize: -1,
                        bodySize: -1,
                        postData: log.requestBody ? { 
                            mimeType: 'application/json',
                            text: typeof log.requestBody === 'string' ? log.requestBody : JSON.stringify(log.requestBody) 
                        } : undefined
                    },
                    response: {
                        status: log.status || 0,
                        statusText: log.statusText || '',
                        httpVersion: 'HTTP/1.1',
                        headers: Object.entries(log.responseHeaders || {}).map(([name, value]) => ({ 
                            name, 
                            value: String(value) 
                        })),
                        cookies: [],
                        content: {
                            size: -1,
                            mimeType: 'application/json',
                            text: log.responseBody ? (typeof log.responseBody === 'string' ? log.responseBody : JSON.stringify(log.responseBody)) : ''
                        },
                        redirectURL: '',
                        headersSize: -1,
                        bodySize: -1
                    },
                    cache: {},
                    timings: {
                        send: 0,
                        wait: log.duration || 0,
                        receive: 0
                    }
                };
            })
        }
    };
    
    return JSON.stringify(har, null, 2);
}

// Конвертировать в CSV
function convertToCSV(logs) {
    const headers = ['Timestamp', 'Type', 'Method', 'URL', 'Status', 'Duration'];
    const rows = logs.map(log => {
        // Безопасное преобразование timestamp
        let timestamp;
        try {
            const date = new Date(log.timestamp);
            timestamp = isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
        } catch (e) {
            timestamp = new Date().toISOString();
        }
        
        return [
            timestamp,
            log.apiType || log.type || '',
            log.method || '',
            log.url || '',
            log.status || '',
            log.duration || ''
        ];
    });
    
    return [headers, ...rows].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
}

// Конвертировать в Postman
function convertToPostman(logs) {
    const collection = {
        info: {
            name: 'API Sniffer Export',
            schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
        },
        item: logs.map(log => {
            try {
                const urlObj = new URL(log.url);
                return {
                    name: `${log.method || 'GET'} ${urlObj.pathname}`,
                    request: {
                        method: log.method || 'GET',
                        header: Object.entries(log.requestHeaders || {}).map(([key, value]) => ({ 
                            key, 
                            value: String(value) 
                        })),
                        url: {
                            raw: log.url,
                            protocol: urlObj.protocol.replace(':', ''),
                            host: urlObj.hostname.split('.'),
                            path: urlObj.pathname.split('/').filter(p => p),
                            query: Array.from(urlObj.searchParams.entries()).map(([key, value]) => ({ key, value }))
                        },
                        body: log.requestBody ? {
                            mode: 'raw',
                            raw: typeof log.requestBody === 'string' ? log.requestBody : JSON.stringify(log.requestBody, null, 2),
                            options: {
                                raw: {
                                    language: 'json'
                                }
                            }
                        } : undefined
                    }
                };
            } catch (e) {
                console.error('[API Sniffer Popup] Ошибка обработки URL для Postman:', log.url, e);
                return {
                    name: `${log.method || 'GET'} ${log.url}`,
                    request: {
                        method: log.method || 'GET',
                        header: [],
                        url: log.url
                    }
                };
            }
        })
    };
    
    return JSON.stringify(collection, null, 2);
}
