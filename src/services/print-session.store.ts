import fs from 'fs/promises';
import path from 'path';
import { PrintSession } from '../types';

class PrintSessionStore {
  private dataDir = path.join(process.cwd(), 'data');
  private dataFile = path.join(this.dataDir, 'prints.json');

  async ensureDirectory() {
    await fs.mkdir(this.dataDir, { recursive: true });
  }

  async readAll(): Promise<PrintSession[]> {
    await this.ensureDirectory();
    try {
      const content = await fs.readFile(this.dataFile, 'utf8');
      const parsed = JSON.parse(content) as PrintSession[];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error: any) {
      if (error?.code === 'ENOENT') return [];
      console.warn('⚠️ Impossible de lire prints.json:', error.message);
      return [];
    }
  }

  async getById(id: string): Promise<PrintSession | undefined> {
    const sessions = await this.readAll();
    return sessions.find((session) => session.id === id);
  }

  async upsert(session: PrintSession): Promise<void> {
    const sessions = await this.readAll();
    const index = sessions.findIndex((item) => item.id === session.id);

    if (index >= 0) {
      sessions[index] = session;
    } else {
      sessions.push(session);
    }

    await this.writeAtomic(sessions);
  }

  private async writeAtomic(sessions: PrintSession[]): Promise<void> {
    await this.ensureDirectory();
    const tmpFile = `${this.dataFile}.tmp`;
    const content = JSON.stringify(sessions, null, 2);
    await fs.writeFile(tmpFile, content, 'utf8');
    await fs.rename(tmpFile, this.dataFile);
  }
}

export const printSessionStore = new PrintSessionStore();
