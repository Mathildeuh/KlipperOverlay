import { cloudLogin, loginDevice, loginDeviceByIp } from 'tp-link-tapo-connect';
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
  private warnedMissing = false;
  private warnedError = false;

  init(email: string, password: string, deviceIp: string, enabled: boolean) {
    this.email = email.trim();
    this.password = password.trim();
    this.deviceIp = deviceIp.trim();
    this.enabled = enabled && Boolean(this.email && this.password);
    this.warnedMissing = !this.enabled;
  }

  private async loginViaCloud(): Promise<TapoDevice> {
    const cloud = await cloudLogin(this.email, this.password);
    const devices = await cloud.listDevicesByType('SMART.TAPOPLUG');

    if (!devices || devices.length === 0) {
      throw new Error('Aucun appareil Tapo trouvé dans le cloud');
    }

    return loginDevice(this.email, this.password, devices[0]);
  }

  private async ensureDevice(): Promise<TapoDevice | null> {
    if (!this.enabled) return null;
    if (!this.email || !this.password) {
      this.warnedMissing = true;
      this.enabled = false;
      return null;
    }
    if (this.device) return this.device;
    try {
      if (this.deviceIp) {
        try {
          this.device = await loginDeviceByIp(this.email, this.password, this.deviceIp);
          return this.device;
        } catch {
          this.device = await this.loginViaCloud();
          return this.device;
        }
      }

      this.device = await this.loginViaCloud();
      return this.device;
    } catch (error) {
      this.warnedError = true;
      this.enabled = false;
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
      return { ts };
    }
  }
}

export const tapoService = new TapoService();
