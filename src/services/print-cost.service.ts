import { v4 as uuidv4 } from 'uuid';
import { PrintSession, TapoEnergySnapshot, PrintMetadata } from '../types';
import { moonrakerService } from './moonraker.service';
import { tapoService } from './tapo.service';
import { printSessionStore } from './print-session.store';
import { config } from '../config';

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

export class PrintCostService {
  private currentSession: PrintSession | null = null;
  private lastPrinterState: string | null = null;

  constructor() {
    // Poll moonraker every second to detect transitions
    setInterval(() => this.checkPrinter(), config.refreshInterval || 1000);
  }

  private async checkPrinter() {
    try {
      const status = await moonrakerService.getPrinterStatus();
      const prevState = this.lastPrinterState;
      const nowState = status.state;

      // detect start
      if (prevState !== 'printing' && nowState === 'printing') {
        await this.onStart(status.filename || 'unknown');
      }

      // detect end
      if (prevState === 'printing' && nowState !== 'printing') {
        await this.onEnd(nowState as any);
      }

      this.lastPrinterState = nowState;
    } catch (err) {
      console.error('Erreur checkPrinter:', (err as Error).message);
    }
  }

  private async fetchMetadata(filename: string): Promise<PrintMetadata | undefined> {
    try {
      const meta = await (moonrakerService as any).getFileMetadata(filename);
      if (!meta) return undefined;
      const mapped: PrintMetadata = {
        filename,
        estimatedTimeSec: meta.estimated_time ?? undefined,
        filamentWeightG: meta.filament_weight_total ?? undefined,
        filamentLengthMm: meta.filament_total ?? undefined,
      };
      return mapped;
    } catch (err) {
      return undefined;
    }
  }

  private async onStart(filename: string) {
    try {
      const id = uuidv4();
      const energyStart = (await tapoService.snapshot()) || undefined;
      const meta = await this.fetchMetadata(filename);
      const session: PrintSession = {
        id,
        filename,
        startedAt: Date.now(),
        status: 'printing',
        energyStart,
        costs: { electricityEur: 0, filamentEur: 0, wearEur: 0, totalEur: 0 },
        meta: meta ? meta : undefined,
      };
      this.currentSession = session;
      printSessionStore.upsert(session);
      console.log(`🟢 Print started: ${filename} (${id})`);
    } catch (err) {
      console.error('Erreur onStart:', (err as Error).message);
    }
  }

  private calculateCosts(session: PrintSession, nowEnergy?: TapoEnergySnapshot) {
    const start = session.energyStart;
    let energyDeltaKwh = 0;
    if (start && nowEnergy) {
      if (typeof nowEnergy.totalKwh === 'number' && typeof start.totalKwh === 'number') {
        energyDeltaKwh = nowEnergy.totalKwh - start.totalKwh;
      } else if (typeof nowEnergy.todayWh === 'number' && typeof start.todayWh === 'number') {
        energyDeltaKwh = (nowEnergy.todayWh - start.todayWh) / 1000;
      } else if (typeof nowEnergy.monthWh === 'number' && typeof start.monthWh === 'number') {
        energyDeltaKwh = (nowEnergy.monthWh - start.monthWh) / 1000;
      } else {
        energyDeltaKwh = 0;
      }
    }
    if (energyDeltaKwh < 0) energyDeltaKwh = 0;

    const electricityEur = energyDeltaKwh * config.pricing.electricityEurPerKwh;
    const filamentG = session.filamentG ?? session.meta?.filamentWeightG ?? 0;
    const filamentEur = (filamentG / 1000) * config.pricing.filamentEurPerKg;
    const elapsedHours = ((Date.now() - session.startedAt) / 1000) / 3600;
    const wearEur = elapsedHours * config.pricing.machineEurPerHour;
    const totalEur = electricityEur + filamentEur + wearEur;

    session.energyDeltaKwh = round2(energyDeltaKwh);
    session.costs.electricityEur = round2(electricityEur);
    session.costs.filamentEur = round2(filamentEur);
    session.costs.wearEur = round2(wearEur);
    session.costs.totalEur = round2(totalEur);
    return session;
  }

  private async onEnd(finalState: string) {
    try {
      if (!this.currentSession) return;
      const energyEnd = (await tapoService.snapshot()) || undefined;
      this.currentSession.endedAt = Date.now();
      this.currentSession.energyEnd = energyEnd;

      // compute final costs
      this.calculateCosts(this.currentSession, energyEnd);

      // determine status
      let status: PrintSession['status'] = 'completed';
      if (finalState === 'error') status = 'failed';
      if (finalState === 'idle' && this.currentSession.meta?.estimatedTimeSec && this.currentSession.meta.estimatedTimeSec > 0 && ((this.currentSession.endedAt - this.currentSession.startedAt) / 1000) < (this.currentSession.meta.estimatedTimeSec * 0.1)) {
        status = 'canceled';
      }
      this.currentSession.status = status;

      printSessionStore.upsert(this.currentSession);
      console.log(`🔴 Print ended: ${this.currentSession.filename} (${this.currentSession.id}) status=${this.currentSession.status}`);
      this.currentSession = null;
    } catch (err) {
      console.error('Erreur onEnd:', (err as Error).message);
    }
  }

  getCurrent() {
    if (!this.currentSession) return { printing: false } as any;
    const now = Date.now();
    const energyNow = (tapoService.snapshot()) as any;
    // energyNow is a promise; but for live endpoint we'll call snapshot separately
    // here just return session skeleton
    return { printing: true, session: this.currentSession };
  }

  async getLiveCosts(): Promise<any> {
    if (!this.currentSession) return { printing: false };
    const energyNow = (await tapoService.snapshot()) || undefined;
    const status = await moonrakerService.getPrinterStatus();
    const session = JSON.parse(JSON.stringify(this.currentSession)) as PrintSession;
    const updated = this.calculateCosts(session, energyNow);
    return { printing: true, session: updated, printerStatus: status, energyNow };
  }

  getHistory(limit = 50) {
    const all = printSessionStore.readAll();
    return all.sort((a, b) => (b.startedAt - a.startedAt)).slice(0, limit);
  }

  getById(id: string) {
    return printSessionStore.getById(id);
  }
}

export const printCostService = new PrintCostService();
