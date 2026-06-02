// ===== Print History Management =====

const HISTORY_STORAGE_KEY = 'klipper_print_history';
const MAX_HISTORY_ITEMS = 50;

class PrintHistoryManager {
  constructor() {
    this.history = [];
    this.loadFromStorage();
  }

  loadFromStorage() {
    try {
      const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (stored) {
        this.history = JSON.parse(stored);
      }
    } catch (error) {
      this.history = [];
    }
  }

  saveToStorage() {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(this.history));
    } catch (error) {
    }
  }

  addPrint(filename, duration, state) {
    const item = {
      id: `print_${Date.now()}`,
      filename,
      startTime: Date.now() - duration,
      endTime: Date.now(),
      duration,
      state,
      progress: state === 'completed' ? 100 : Math.random() * 80,
      timestamp: new Date().toLocaleString('fr-FR')
    };

    this.history.unshift(item);

    // Limiter la taille
    if (this.history.length > MAX_HISTORY_ITEMS) {
      this.history = this.history.slice(0, MAX_HISTORY_ITEMS);
    }

    this.saveToStorage();
  }

  getHistory() {
    return this.history;
  }

  getStats() {
    const completed = this.history.filter((p) => p.state === 'completed').length;
    const failed = this.history.filter((p) => p.state === 'failed').length;
    const cancelled = this.history.filter((p) => p.state === 'cancelled').length;
    const totalDuration = this.history.reduce((sum, p) => sum + p.duration, 0);
    const successRate = this.history.length > 0 ? (completed / this.history.length) * 100 : 0;

    return {
      total: this.history.length,
      completed,
      failed,
      cancelled,
      successRate,
      totalPrintTime: totalDuration
    };
  }

  clear() {
    this.history = [];
    this.saveToStorage();
  }
}

window.PrintHistoryManager = PrintHistoryManager;
window.printHistoryManager = new PrintHistoryManager();
