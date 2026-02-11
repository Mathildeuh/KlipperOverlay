import fs from 'fs';
import path from 'path';
import { PrintSession } from '../types';

const DATA_DIR = path.join(process.cwd(), 'data');
const FILE_PATH = path.join(DATA_DIR, 'prints.json');

function ensureDirectory() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readAll(): PrintSession[] {
  try {
    ensureDirectory();
    if (!fs.existsSync(FILE_PATH)) return [];
    const raw = fs.readFileSync(FILE_PATH, 'utf8');
    if (!raw) return [];
    return JSON.parse(raw) as PrintSession[];
  } catch (err) {
    console.error('Erreur lecture prints.json:', (err as Error).message);
    return [];
  }
}

function writeAtomic(data: PrintSession[]) {
  ensureDirectory();
  const tmp = `${FILE_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, FILE_PATH);
}

function upsert(session: PrintSession) {
  const all = readAll();
  const idx = all.findIndex(s => s.id === session.id);
  if (idx >= 0) {
    all[idx] = session;
  } else {
    all.push(session);
  }
  writeAtomic(all);
}

function getById(id: string): PrintSession | null {
  const all = readAll();
  return all.find(s => s.id === id) || null;
}

export const printSessionStore = {
  ensureDirectory,
  readAll,
  upsert,
  getById,
};
