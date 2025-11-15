// analytics.js
// Модуль статистики и аналитики запросов

class Analytics {
  constructor() {
    this.stats = {
      total: 0,
      byType: {},
      byMethod: {},
      byStatus: {},
      byDomain: {},
      errors: 0,
      totalDuration: 0,
      avgDuration: 0,
      slowest: [],
      fastest: [],
      largestResponse: [],
      timeline: []
    };
  }

  // Анализ массива логов
  analyze(logs) {
    this.reset();
    
    if (!logs || logs.length === 0) {
      return this.stats;
    }

    this.stats.total = logs.length;

    logs.forEach(log => {
      this.processLog(log);
    });

    this.calculateAverages();
    this.findExtremes(logs);
    this.buildTimeline(logs);

    return this.stats;
  }

  // Обработка одного лога
  processLog(log) {
    // По типу API
    this.stats.byType[log.apiType] = (this.stats.byType[log.apiType] || 0) + 1;

    // По методу
    if (log.method) {
      this.stats.byMethod[log.method] = (this.stats.byMethod[log.method] || 0) + 1;
    }

    // По статусу
    if (log.status) {
      const statusGroup = this.getStatusGroup(log.status);
      this.stats.byStatus[statusGroup] = (this.stats.byStatus[statusGroup] || 0) + 1;
      
      if (log.status >= 400) {
        this.stats.errors++;
      }
    }

    // По домену
    if (log.url) {
      try {
        const domain = new URL(log.url).hostname;
        this.stats.byDomain[domain] = (this.stats.byDomain[domain] || 0) + 1;
      } catch (e) {
        // Невалидный URL
      }
    }

    // Длительность
    if (log.duration) {
      this.stats.totalDuration += log.duration;
    }
  }

  // Группировка статусов
  getStatusGroup(status) {
    if (status >= 200 && status < 300) return '2xx Success';
    if (status >= 300 && status < 400) return '3xx Redirect';
    if (status >= 400 && status < 500) return '4xx Client Error';
    if (status >= 500) return '5xx Server Error';
    return 'Other';
  }

  // Расчет средних значений
  calculateAverages() {
    if (this.stats.total > 0) {
      this.stats.avgDuration = this.stats.totalDuration / this.stats.total;
    }
  }

  // Поиск экстремумов
  findExtremes(logs) {
    // Самые медленные
    this.stats.slowest = logs
      .filter(log => log.duration)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10)
      .map(log => ({
        url: log.url,
        duration: log.duration,
        method: log.method,
        timestamp: log.timestamp
      }));

    // Самые быстрые
    this.stats.fastest = logs
      .filter(log => log.duration && log.duration > 0)
      .sort((a, b) => a.duration - b.duration)
      .slice(0, 10)
      .map(log => ({
        url: log.url,
        duration: log.duration,
        method: log.method,
        timestamp: log.timestamp
      }));

    // Самые большие ответы
    this.stats.largestResponse = logs
      .filter(log => log.responseSize)
      .sort((a, b) => b.responseSize - a.responseSize)
      .slice(0, 10)
      .map(log => ({
        url: log.url,
        size: log.responseSize,
        method: log.method,
        timestamp: log.timestamp
      }));
  }

  // Построение временной шкалы (группировка по минутам)
  buildTimeline(logs) {
    const timelineMap = {};
    
    logs.forEach(log => {
      if (!log.timestamp) return;
      
      // Округление до минуты
      const date = new Date(log.timestamp);
      const minute = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        date.getHours(),
        date.getMinutes()
      ).toISOString();
      
      if (!timelineMap[minute]) {
        timelineMap[minute] = {
          timestamp: minute,
          count: 0,
          errors: 0,
          avgDuration: 0,
          totalDuration: 0
        };
      }
      
      timelineMap[minute].count++;
      if (log.status >= 400) timelineMap[minute].errors++;
      if (log.duration) {
        timelineMap[minute].totalDuration += log.duration;
      }
    });

    // Расчет средних и сортировка
    this.stats.timeline = Object.values(timelineMap)
      .map(item => {
        if (item.count > 0) {
          item.avgDuration = item.totalDuration / item.count;
        }
        delete item.totalDuration;
        return item;
      })
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  // Сброс статистики
  reset() {
    this.stats = {
      total: 0,
      byType: {},
      byMethod: {},
      byStatus: {},
      byDomain: {},
      errors: 0,
      totalDuration: 0,
      avgDuration: 0,
      slowest: [],
      fastest: [],
      largestResponse: [],
      timeline: []
    };
  }

  // Получение топ доменов
  getTopDomains(limit = 10) {
    return Object.entries(this.stats.byDomain)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([domain, count]) => ({ domain, count }));
  }

  // Получение процента ошибок
  getErrorRate() {
    if (this.stats.total === 0) return 0;
    return (this.stats.errors / this.stats.total) * 100;
  }

  // Экспорт статистики в текстовый отчет
  generateTextReport() {
    const report = [];
    
    report.push('=== API Sniffer Statistics Report ===');
    report.push('');
    report.push(`Total Requests: ${this.stats.total}`);
    report.push(`Errors: ${this.stats.errors} (${this.getErrorRate().toFixed(2)}%)`);
    report.push(`Average Duration: ${this.stats.avgDuration.toFixed(2)}ms`);
    report.push('');
    
    report.push('By API Type:');
    Object.entries(this.stats.byType).forEach(([type, count]) => {
      report.push(`  ${type}: ${count}`);
    });
    report.push('');
    
    report.push('By HTTP Method:');
    Object.entries(this.stats.byMethod).forEach(([method, count]) => {
      report.push(`  ${method}: ${count}`);
    });
    report.push('');
    
    report.push('By Status Code:');
    Object.entries(this.stats.byStatus).forEach(([status, count]) => {
      report.push(`  ${status}: ${count}`);
    });
    report.push('');
    
    report.push('Top 10 Domains:');
    this.getTopDomains(10).forEach(({ domain, count }) => {
      report.push(`  ${domain}: ${count}`);
    });
    report.push('');
    
    report.push('Top 10 Slowest Requests:');
    this.stats.slowest.forEach((item, index) => {
      report.push(`  ${index + 1}. ${item.method} ${item.url} - ${item.duration.toFixed(2)}ms`);
    });
    
    return report.join('\n');
  }
}

// Экспорт
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Analytics;
}
