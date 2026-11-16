// Downloads the PC-Axis table from SURS (pxweb.stat.si) and keeps it in memory.
// Every API request checks for a newer version with a conditional GET
// (If-None-Match / If-Modified-Since), so the 7 MB file is only re-downloaded
// when SURS actually publishes new data. A copy is stored in cache/ as a
// fallback for when SURS is unreachable.

import fs from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import Px from 'px';

export const TABLE_ID = '0400608S';
export const PX_URL = `https://pxweb.stat.si/SiStatData/Resources/PX/Databases/Data/${TABLE_ID}.px`;
export const TABLE_PAGE = `https://pxweb.stat.si/SiStatData/pxweb/sl/Data/-/${TABLE_ID}.px`;

const USER_AGENT = 'RiftVault/0.1.0 (TIDS student project)';
const MIN_CHECK_INTERVAL_MS = 30_000; // don't ask SURS more often than this
const CACHE_DIR = path.resolve(import.meta.dirname, '..', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, `${TABLE_ID}.px`);
const CACHE_META = path.join(CACHE_DIR, `${TABLE_ID}.json`);

const state = {
  px: null,            // parsed Px object
  etag: null,
  lastModified: null,
  downloadedAt: null,  // when the file content was last downloaded
  checkedAt: null,     // when SURS was last asked
  lastStatus: null,    // 'downloaded' | 'not-modified' | 'stale'
  lastError: null,
  version: 0,          // increases whenever new content is parsed
};

let inFlight = null;

// Plain node:https GET. (SURS's IIS answers conditional requests from
// global fetch/undici with 200 instead of 304, so fetch is not used here.)
function httpGet(url, headers, timeoutMs = 60_000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

function parse(buffer) {
  // SURS files declare CODEPAGE="windows-1250" (Slovene characters).
  const head = buffer.subarray(0, 2000).toString('latin1');
  const codepage = head.match(/CODEPAGE="([^"]+)"/)?.[1] ?? 'windows-1250';
  const text = new TextDecoder(codepage).decode(buffer);
  return new Px(text);
}

async function loadCacheFile() {
  try {
    const [buffer, metaRaw] = await Promise.all([
      fs.readFile(CACHE_FILE),
      fs.readFile(CACHE_META, 'utf8'),
    ]);
    const meta = JSON.parse(metaRaw);
    state.px = parse(buffer);
    state.etag = meta.etag;
    state.lastModified = meta.lastModified;
    state.downloadedAt = meta.downloadedAt;
    state.version++;
    return true;
  } catch {
    return false;
  }
}

async function saveCacheFile(buffer) {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    await fs.writeFile(CACHE_FILE, buffer);
    await fs.writeFile(CACHE_META, JSON.stringify({
      etag: state.etag,
      lastModified: state.lastModified,
      downloadedAt: state.downloadedAt,
    }, null, 2));
  } catch (err) {
    console.warn('Could not write cache:', err.message);
  }
}

async function refresh() {
  if (!state.px) await loadCacheFile();

  const headers = { 'User-Agent': USER_AGENT };
  if (state.px && state.etag) headers['If-None-Match'] = state.etag;
  if (state.px && state.lastModified) headers['If-Modified-Since'] = state.lastModified;

  try {
    const res = await httpGet(PX_URL, headers);
    state.checkedAt = new Date().toISOString();

    if (res.status === 304 && state.px) {
      state.lastStatus = 'not-modified';
      state.lastError = null;
      return;
    }
    if (res.status !== 200) throw new Error(`SURS responded with HTTP ${res.status}`);

    const buffer = res.body;
    const t0 = performance.now();
    state.px = parse(buffer);
    console.log(`Parsed ${TABLE_ID}.px (${(buffer.length / 1e6).toFixed(1)} MB) in ${Math.round(performance.now() - t0)} ms`);
    state.etag = res.headers.etag ?? null;
    state.lastModified = res.headers['last-modified'] ?? null;
    state.downloadedAt = state.checkedAt;
    state.lastStatus = 'downloaded';
    state.lastError = null;
    state.version++;
    await saveCacheFile(buffer);
  } catch (err) {
    state.lastError = err.message;
    if (!state.px) throw new Error(`Cannot load data from SURS: ${err.message}`);
    state.lastStatus = 'stale';
    console.warn('SURS unreachable, using cached data:', err.message);
  }
}

/** Returns the parsed table, refreshing it from SURS if needed. */
export async function getTable() {
  const fresh = state.checkedAt && Date.now() - Date.parse(state.checkedAt) < MIN_CHECK_INTERVAL_MS;
  if (!state.px || !fresh) {
    inFlight ??= refresh().finally(() => { inFlight = null; });
    await inFlight;
  }
  return state;
}
