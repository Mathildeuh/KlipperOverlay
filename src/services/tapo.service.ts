import { TapoEnergySnapshot } from '../types';
import { config } from '../config';

let Tapo: any;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Tapo = require('tp-link-tapo-connect');
} catch (e) {
  // module not installed in environment; runtime will error if used
  Tapo = null;
}

export class TapoService {
  private client: any | null = null;
  private device: any | null = null;

  async init(): Promise<void> {
    if (!Tapo) {
      console.warn('⚠️ tp-link-tapo-connect non disponible');
      return;
    }

    try {
      const { Tapo } = require('tp-link-tapo-connect');
      this.client = new Tapo.TapoClient();
      const email = config.tapo.email;
      const password = config.tapo.password;
      if (!email || !password || !config.tapo.deviceIp) {
        console.warn('⚠️ Tapo config missing');
        return;
      }

      await this.client.login(email, password);
      this.device = await this.client.getDevice({ ip: config.tapo.deviceIp });
      console.log('✓ Tapo initialisé');
    } catch (err) {
      console.error('Erreur init Tapo:', (err as Error).message);
      this.client = null;
      this.device = null;
    }
  }

  async snapshot(): Promise<TapoEnergySnapshot | null> {
    try {
      if (!this.device) return null;
      const stats = await this.device.getRealtime();
      // stats example: { power: number (W), today: Wh, month: Wh, total: kWh }
      const snap: TapoEnergySnapshot = {
        ts: Date.now(),
        powerW: typeof stats.power === 'number' ? stats.power : undefined,
        todayWh: typeof stats.today === 'number' ? stats.today : undefined,
        monthWh: typeof stats.month === 'number' ? stats.month : undefined,
        totalKwh: typeof stats.total === 'number' ? stats.total : undefined,
      };
      return snap;
    } catch (err) {
      console.error('Erreur snapshot Tapo:', (err as Error).message);
      return null;
    }
  }
}

export const tapoService = new TapoService();
