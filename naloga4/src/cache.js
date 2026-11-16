// Tiny JSON file cache in naloga4/cache/ (not in git).

import fs from 'node:fs/promises';
import path from 'node:path';

const DIR = path.resolve(import.meta.dirname, '..', 'cache');

export async function readCache(name) {
  try {
    return JSON.parse(await fs.readFile(path.join(DIR, name), 'utf8'));
  } catch {
    return null;
  }
}

export async function writeCache(name, data) {
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(path.join(DIR, name), JSON.stringify(data));
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const DAY_MS = 24 * 60 * 60 * 1000;
export const USER_AGENT = 'RiftVault/0.1.0';
