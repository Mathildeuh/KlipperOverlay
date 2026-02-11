import { loginDevice } from 'tp-link-tapo-connect';
import { TapoEnergySnapshot } from '../types';

interface TapoDevice {
  getEnergyUsage: () => Promise<any>;
}

const normalizeW = (value: number | undefined): number | undefined => {
  if (value === undefined || value === null) return undefined;
  return value > 10000 ? value / 1000 : value;
};

const normalizeWh = (value: number | undefined): number | undefined => {
  if (value === undefined || value === null) return undefined;
  return value > 10000 ? value / 1000 : value;
};

const toNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

class TapoService {
  private email = '';
  private password = '';
  private deviceIp = '';
  private device: TapoDevice | null = null;
  private enabled = false;

  init(email: string, password: string, deviceIp: string, enabled: boolean) {
    this.email = email;
    this.password = password;
    this.deviceIp = deviceIp;
    this.enabled = enabled;
  }

  private async ensureDevice(): Promise<TapoDevice | null> {
    if (!this.enabled) return null;
    if (this.device) return this.device;
    try {
      this.device = await loginDevice(this.email, this.password, this.deviceIp);
      return this.device;
    } catch (error) {
      console.warn('⚠️ Tapo indisponible:', (error as Error).message);
      return null;
    }
  }

  async snapshot(): Promise<TapoEnergySnapshot> {
    const ts = Date.now();
    const device = await this.ensureDevice();
    if (!device) return { ts };

    try {
      const energy = await device.getEnergyUsage();

      const powerW = normalizeW(
        toNumber(energy?.current_power ?? energy?.current_power_w ?? energy?.current_power_mw)
      );
      const todayWh = normalizeWh(
        toNumber(energy?.today_energy ?? energy?.today_energy_wh ?? energy?.today_energy_mwh)
      );
      const monthWh = normalizeWh(
        toNumber(energy?.month_energy ?? energy?.month_energy_wh ?? energy?.month_energy_mwh)
      );

      const totalKwhDirect = toNumber(energy?.total_energy_kwh);
      const totalWh = normalizeWh(
        toNumber(energy?.total_energy ?? energy?.total_energy_wh ?? energy?.total_energy_mwh)
      );
      const totalKwh = totalKwhDirect ?? (totalWh !== undefined ? totalWh / 1000 : undefined);

      return {
        ts,
        powerW,
        todayWh,
        monthWh,
        totalKwh,
      };
    } catch (error) {
      console.warn('⚠️ Snapshot Tapo indisponible:', (error as Error).message);
      return { ts };
    }
  }
}

export const tapoService = new TapoService();
