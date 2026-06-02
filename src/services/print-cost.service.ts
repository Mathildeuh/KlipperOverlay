import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { moonrakerService } from './moonraker.service';
import { tapoService } from './tapo.service';
import { printSessionStore } from './print-session.store';
import { PrintMetadata, PrintSession, PrintSessionStatus, PrinterStatus, TapoEnergySnapshot } from '../types';

const round2 = (value: number): number => Math.round(value * 100) / 100;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

class PrintCostService {
  private activeSession: PrintSession | null = null;
  private unsubscribeStatus?: () => void;

  start() {
    tapoService.init(
      config.tapo.email,
      config.tapo.password,
      config.tapo.deviceIp,
      config.tapo.enabled
    );

    this.unsubscribeStatus = moonrakerService.onStatusUpdate((previous, current) => {
      this.handleStatusUpdate(previous, current).catch(() => {});
    });
  }

  stop() {
    if (this.unsubscribeStatus) {
      this.unsubscribeStatus();
    }
  }

  async getCurrent(): Promise<{ printing: boolean; session?: PrintSession; powerW?: number }> {
    if (!this.activeSession) {
      return { printing: false };
    }

    const energyNow = await tapoService.snapshot();
    const now = Date.now();
    const { energyDeltaKwh, costs } = this.calculateCosts(this.activeSession, energyNow, now);

    return {
      printing: true,
      session: {
        ...this.activeSession,
        energyDeltaKwh,
        costs,
      },
      powerW: energyNow.powerW,
    };
  }

  async getHistory(limit: number): Promise<PrintSession[]> {
    const sessions = await printSessionStore.readAll();
    return sessions
      .filter((session) => session.status !== 'printing')
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
  }

  async getById(id: string): Promise<PrintSession | undefined> {
    return printSessionStore.getById(id);
  }

  private async handleStatusUpdate(previous: PrinterStatus | null, current: PrinterStatus) {
    const prevState = previous?.state;
    const currentState = current.state;

    if (prevState !== 'printing' && currentState === 'printing') {
      await this.startSession(current);
      return;
    }

    if (prevState === 'printing' && currentState !== 'printing') {
      await this.endSession(current);
    }
  }

  private async startSession(status: PrinterStatus) {
    if (this.activeSession) return;

    const filename = status.filename || 'unknown.gcode';
    const meta = await this.fetchMetadata(filename);
    const energyStart = await tapoService.snapshot();

    const session: PrintSession = {
      id: uuidv4(),
      filename,
      startedAt: Date.now(),
      status: 'printing',
      energyStart,
      filamentG: meta?.filamentWeightG,
      costs: {
        electricityEur: 0,
        filamentEur: 0,
        wearEur: 0,
        totalEur: 0,
      },
      meta,
    };

    this.activeSession = session;
    await printSessionStore.upsert(session);
  }

  private async endSession(status: PrinterStatus) {
    if (!this.activeSession) return;

    const energyEnd = await tapoService.snapshot();
    const endedAt = Date.now();
    const finalStatus = this.mapFinalStatus(status);

    const { energyDeltaKwh, costs } = this.calculateCosts(this.activeSession, energyEnd, endedAt);

    const session: PrintSession = {
      ...this.activeSession,
      endedAt,
      status: finalStatus,
      energyEnd,
      energyDeltaKwh,
      costs,
    };

    await printSessionStore.upsert(session);

    this.activeSession = null;
  }

  private async fetchMetadata(filename: string): Promise<PrintMetadata | undefined> {
    const metadata = await moonrakerService.getFileMetadata(filename);
    if (!metadata) return undefined;

    const meta: PrintMetadata = {
      filename,
    };

    if (isFiniteNumber(metadata.estimated_time)) {
      meta.estimatedTimeSec = metadata.estimated_time;
    }
    if (isFiniteNumber(metadata.filament_weight_total)) {
      meta.filamentWeightG = metadata.filament_weight_total;
    }
    if (isFiniteNumber(metadata.filament_total)) {
      meta.filamentLengthMm = metadata.filament_total;
    }

    return meta;
  }

  private calculateCosts(session: PrintSession, energyNow: TapoEnergySnapshot | undefined, now: number) {
    const energyDeltaKwh = this.computeEnergyDeltaKwh(session.energyStart, energyNow);
    const electricityEur = round2((energyDeltaKwh || 0) * config.costs.electricityEurPerKwh);
    const filamentEur = round2(((session.filamentG || 0) / 1000) * config.costs.filamentEurPerKg);
    const elapsedHours = Math.max(0, (now - session.startedAt) / 3600000);
    const wearEur = round2(elapsedHours * config.costs.machineEurPerHour);
    const totalEur = round2(electricityEur + filamentEur + wearEur);

    return {
      energyDeltaKwh,
      costs: {
        electricityEur,
        filamentEur,
        wearEur,
        totalEur,
      },
    };
  }

  private computeEnergyDeltaKwh(start?: TapoEnergySnapshot, end?: TapoEnergySnapshot): number | undefined {
    if (!start || !end) return undefined;

    if (isFiniteNumber(start.totalKwh) && isFiniteNumber(end.totalKwh)) {
      const delta = end.totalKwh - start.totalKwh;
      return delta >= 0 ? delta : undefined;
    }

    if (isFiniteNumber(start.todayWh) && isFiniteNumber(end.todayWh)) {
      const delta = (end.todayWh - start.todayWh) / 1000;
      return delta >= 0 ? delta : undefined;
    }

    if (isFiniteNumber(start.monthWh) && isFiniteNumber(end.monthWh)) {
      const delta = (end.monthWh - start.monthWh) / 1000;
      return delta >= 0 ? delta : undefined;
    }

    return undefined;
  }

  private mapFinalStatus(status: PrinterStatus): PrintSessionStatus {
    const raw = status.rawState?.toLowerCase();
    if (raw === 'cancelled') return 'canceled';
    if (raw === 'error' || raw === 'shutdown') return 'failed';
    if (raw === 'complete') return 'completed';

    if (status.state === 'error') return 'failed';

    return 'completed';
  }
}

export const printCostService = new PrintCostService();
