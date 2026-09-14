// Client für api.bigapi.dev: Key-Verwaltung (Datei oder Umgebungsvariable), Upload, Download.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, basename, extname, resolve } from 'node:path';
import { openAsBlob } from 'node:fs';

export const BASE_URL = (process.env.BIGAPI_URL || 'https://api.bigapi.dev').replace(/\/$/, '');
const CONFIG_DIR = process.env.BIGAPI_CONFIG_DIR || join(homedir(), '.bigapi');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const OUT_DIR = process.env.BIGAPI_OUTPUT_DIR || join(tmpdir(), 'bigapi');

async function readConfig() { try { return JSON.parse(await readFile(CONFIG_FILE, 'utf8')); } catch { return {}; } }
async function writeConfig(c) { await mkdir(CONFIG_DIR, { recursive: true }); await writeFile(CONFIG_FILE, JSON.stringify(c, null, 2), { mode: 0o600 }); }

export async function getKey() {
  if (process.env.BIGAPI_KEY) return process.env.BIGAPI_KEY;
  return (await readConfig()).key || null;
}
export async function saveKey(key) { const c = await readConfig(); c.key = key; c.saved_at = new Date().toISOString(); await writeConfig(c); return CONFIG_FILE; }
export function configPath() { return CONFIG_FILE; }

export class BigapiError extends Error {
  constructor(status, body) { super(body?.error || `http_${status}`); this.status = status; this.body = body; }
}

async function authHeaders() {
  const key = await getKey();
  if (!key) throw new BigapiError(401, { error: 'no_api_key', hint: 'Rufe zuerst das Tool get_access auf (kostenlos, ohne Anmeldung) oder setze BIGAPI_KEY.' });
  return { Authorization: `Bearer ${key}` };
}

function billing(res) {
  const n = (h) => (res.headers.get(h) != null ? Number(res.headers.get(h)) : undefined);
  return { cost_cents: n('x-bigapi-cost'), charged_from: res.headers.get('x-bigapi-charged-from') || undefined,
    balance_cents: n('x-bigapi-balance'), free_operations_remaining: n('x-bigapi-free-ops'), duration_ms: n('x-bigapi-duration-ms'), pages: n('x-bigapi-pages') };
}

async function parseError(res) {
  let body; try { body = await res.json(); } catch { body = { error: `http_${res.status}` }; }
  return new BigapiError(res.status, body);
}

export async function apiJson(method, path, body, { auth = true } = {}) {
  const headers = { 'content-type': 'application/json', ...(auth ? await authHeaders() : {}) };
  const res = await fetch(BASE_URL + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw await parseError(res);
  return res.json();
}

// Operation mit JSON-Body (render, url→md, md→docx) → Datei oder JSON
export async function opJson(path, body, outName, idem) {
  const headers = { 'content-type': 'application/json', ...(await authHeaders()) };
  if (idem) headers['Idempotency-Key'] = idem;
  const res = await fetch(BASE_URL + path, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) throw await parseError(res);
  if ((res.headers.get('content-type') || '').includes('application/json')) return { json: await res.json(), ...billing(res) };
  return saveResponse(res, outName);
}

// Operation mit Datei-Upload(s) (multipart) → Datei oder JSON
export async function opFiles(path, files, fields = {}, outName, idem) {
  const fd = new FormData();
  for (const [field, p] of files) {
    const abs = resolve(p);
    await stat(abs).catch(() => { throw new BigapiError(400, { error: 'file_not_found', path: abs }); });
    fd.append(field, await openAsBlob(abs), basename(abs));
  }
  for (const [k, v] of Object.entries(fields)) if (v != null) fd.append(k, typeof v === 'string' ? v : JSON.stringify(v));
  const headers = { ...(await authHeaders()) };
  if (idem) headers['Idempotency-Key'] = idem;
  const res = await fetch(BASE_URL + path, { method: 'POST', headers, body: fd });
  if (!res.ok) throw await parseError(res);
  if ((res.headers.get('content-type') || '').includes('application/json')) return { json: await res.json(), ...billing(res) };
  return saveResponse(res, outName);
}

async function saveResponse(res, outName) {
  const ct = res.headers.get('content-type') || 'application/octet-stream';
  const ext = ct.includes('pdf') ? '.pdf' : ct.includes('png') ? '.png' : ct.includes('jpeg') ? '.jpg' : ct.includes('webp') ? '.webp' : ct.includes('avif') ? '.avif' : ct.includes('zip') ? '.zip' : ct.includes('tiff') ? '.tiff' : ct.includes('gif') ? '.gif' : ct.includes('markdown') ? '.md' : ct.includes('wordprocessingml') ? '.docx' : ct.includes('csv') ? '.csv' : ct.includes('svg') ? '.svg' : ct.includes('text/html') ? '.html' : ct.includes('text/plain') ? '.txt' : '';
  let out;
  if (outName) { out = resolve(outName); if (!extname(out)) out += ext; }
  else { await mkdir(OUT_DIR, { recursive: true }); out = join(OUT_DIR, `bigapi-${Date.now()}${ext}`); }
  await mkdir(join(out, '..'), { recursive: true });
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(out, buf);
  return { output_path: out, bytes: buf.length, content_type: ct, ...billing(res) };
}
