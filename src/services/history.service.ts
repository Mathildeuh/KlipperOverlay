interface PrintHistoryItem {
  id: string;
  filename: string;
  startTime: number;
  endTime: number | null;
  duration: number;
  state: 'printing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  thumbnail?: string;
}

class PrintHistoryService {
  private history: PrintHistoryItem[] = [];
  private currentPrint: PrintHistoryItem | null = null;
  private maxHistorySize = 50;

  // Démarrer un nouveau print
  startPrint(filename: string, thumbnail?: string): void {
    this.currentPrint = {
      id: `print_${Date.now()}`,
      filename,
      startTime: Date.now(),
      endTime: null,
      duration: 0,
      state: 'printing',
      progress: 0,
      thumbnail
    };
  }

  // Mettre à jour la progression
  updateProgress(progress: number): void {
    if (this.currentPrint) {
      this.currentPrint.progress = progress;
      this.currentPrint.duration = Date.now() - this.currentPrint.startTime;
    }
  }

  // Terminer un print (succès)
  completePrint(): void {
    if (this.currentPrint) {
      this.currentPrint.endTime = Date.now();
      this.currentPrint.duration = this.currentPrint.endTime - this.currentPrint.startTime;
      this.currentPrint.state = 'completed';
      this.currentPrint.progress = 100;
      
      this.addToHistory(this.currentPrint);
      this.currentPrint = null;
    }
  }

  // Annuler/échouer un print
  failPrint(state: 'failed' | 'cancelled'): void {
    if (this.currentPrint) {
      this.currentPrint.endTime = Date.now();
      this.currentPrint.duration = this.currentPrint.endTime - this.currentPrint.startTime;
      this.currentPrint.state = state;
      
      this.addToHistory(this.currentPrint);
      this.currentPrint = null;
    }
  }

  private addToHistory(item: PrintHistoryItem): void {
    this.history.unshift(item);
    
    // Limiter la taille de l'historique
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(0, this.maxHistorySize);
    }

    // Sauvegarder dans localStorage côté client
    // (le serveur ne fait que gérer la logique)
  }

  getHistory(): PrintHistoryItem[] {
    return this.history;
  }

  getCurrentPrint(): PrintHistoryItem | null {
    return this.currentPrint;
  }

  getStats() {
    const completed = this.history.filter(p => p.state === 'completed').length;
    const failed = this.history.filter(p => p.state === 'failed').length;
    const cancelled = this.history.filter(p => p.state === 'cancelled').length;
    const totalDuration = this.history
      .filter(p => p.state === 'completed')
      .reduce((sum, p) => sum + p.duration, 0);
    
    return {
      total: this.history.length,
      completed,
      failed,
      cancelled,
      successRate: this.history.length > 0 ? (completed / this.history.length) * 100 : 0,
      totalPrintTime: totalDuration
    };
  }
}

export const printHistoryService = new PrintHistoryService();
export type { PrintHistoryItem };
