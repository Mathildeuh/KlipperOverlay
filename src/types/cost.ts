export interface TapoEnergySnapshot {
  ts: number;
  powerW?: number;
  todayWh?: number;
  monthWh?: number;
  totalKwh?: number;
}

export interface PrintMetadata {
  filename: string;
  estimatedTimeSec?: number;
  filamentWeightG?: number;
  filamentLengthMm?: number;
}

export type PrintSessionStatus = 'printing' | 'completed' | 'canceled' | 'failed';

export interface PrintSession {
  id: string;
  filename: string;
  startedAt: number;
  endedAt?: number;
  status: PrintSessionStatus;
  energyStart?: TapoEnergySnapshot;
  energyEnd?: TapoEnergySnapshot;
  energyDeltaKwh?: number;
  filamentG?: number;
  costs: {
    electricityEur: number;
    filamentEur: number;
    wearEur: number;
    totalEur: number;
  };
  meta?: PrintMetadata;
}
