// 0.9.0: Tools aus dem Kachelverzeichnis. Mock-Gateway liefert /v1/ops aus einem echten
// Registry-Schnappschuss (test/fixture-ops.json, 64 Kacheln) und spiegelt jede Operation zurueck.
import { createServer } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let fail = 0;
const ok = (n, c, e = '') => { console.log(`${c ? '  ✓' : '  ✗'} ${n}${e && !c ? ' – ' + String(e).slice(0, 200) : ''}`); if (!c) fail++; };
const OPS = JSON.parse(readFileSync(new URL('./fixture-ops.json', import.meta.url)));
const seen = [];
const mock = createServer(async (req, res) => {
  let body = Buffer.alloc(0); for await (const c of req) body = Buffer.concat([body, c]);
  const url = req.url.split('?')[0];
  if (url === '/v1/ops') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify(OPS)); }
  const raw = body.toString('latin1'); const ct = req.headers['content-type'] || '';
  const entry = { url, ct, raw, json: ct.includes('json') ? JSON.parse(body.toString() || '{}') : null };
  seen.push(entry);
  if (url === '/v1/einvoice/validate' && /name="output"\r\n\r\nxlsx/.test(raw)) {
    res.writeHead(200, { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'x-bigapi-cost': '1' }); return res.end('PK\u0003\u0004xlsx');
  }
  res.writeHead(200, { 'content-type': 'application/json', 'x-bigapi-cost': '1' }); res.end(JSON.stringify({ echoed: url }));
});
await new Promise(r => mock.listen(9501, '127.0.0.1', r));
const dir = mkdtempSync(join(tmpdir(), 'bigapi-reg-'));
for (const f of ['a.xml', 'b.xml', 'konto.xml', 'r.pdf']) writeFileSync(join(dir, f), '<x/>');
async function start(env) {
  const t = new StdioClientTransport({ command: 'node', args: ['src/index.js'], env: { ...process.env, BIGAPI_CONFIG_DIR: dir, BIGAPI_KEY: 'bigapi_test', BIGAPI_URL: 'http://127.0.0.1:9501', ...env } });
  const c = new Client({ name: 'reg-test', version: '0.0.1' }); await c.connect(t); return c;
}
const names = async (c) => (await c.listTools()).tools.map(t => t.name);

// 1 Schlank: Registry-Tool auf Abruf
let c = await start({});
ok('schlank: 5 Kern-Tools', (await names(c)).length === 5);
let r = await c.callTool({ name: 'enable_tools', arguments: { names: ['einvoice_validate', 'bank_reconcile', 'pdf_merge', 'gibt_es_nicht'] } });
let list = await names(c);
ok('enable_tools baut einvoice_validate aus der Registry', list.includes('einvoice_validate'), list.join(','));
ok('… und bank_reconcile', list.includes('bank_reconcile'));
ok('handgeschriebenes pdf_merge bleibt', list.includes('pdf_merge'));
ok('unbekannter Name gemeldet', /gibt_es_nicht/.test(r.content[0].text));
const tv = (await c.listTools()).tools.find(t => t.name === 'einvoice_validate');
ok('Beschreibung aus der Registry mit Preis', /\$0\.01/.test(tv.description) && tv.description.length > 60, tv.description);
ok('Parameter aus der Registry (file Pflicht, output mit Auswahl)', tv.inputSchema.required?.includes('file') && JSON.stringify(tv.inputSchema.properties.output).includes('xlsx'), JSON.stringify(tv.inputSchema).slice(0, 300));
// Aufruf mit Datei und Feld, Ergebnis als Datei
r = await c.callTool({ name: 'einvoice_validate', arguments: { file: join(dir, 'a.xml'), output: 'xlsx', output_path: join(dir, 'bericht') } });
ok('einvoice_validate lädt Datei hoch, Ergebnis landet als .xlsx', !r.isError && existsSync(join(dir, 'bericht.xlsx')), r.content[0].text);
let last = seen.at(-1);
ok('… an /v1/einvoice/validate mit Feld output=xlsx und Datei im Feld file', last.url === '/v1/einvoice/validate' && /name="output"\r\n\r\nxlsx/.test(last.raw) && /name="file"; filename="a.xml"/.test(last.raw));
// mehrere Dateien in einem Feld
r = await c.callTool({ name: 'bank_reconcile', arguments: { files: [join(dir, 'a.xml'), join(dir, 'b.xml'), join(dir, 'konto.xml')], direction: 'incoming' } });
last = seen.at(-1);
ok('bank_reconcile: drei Dateien im Feld files, direction übergeben', !r.isError && (last.raw.match(/name="files"/g) || []).length === 3 && /name="direction"\r\n\r\nincoming/.test(last.raw), last.raw.slice(0, 200));
// Pflichtdatei fehlt
r = await c.callTool({ name: 'einvoice_validate', arguments: { output: 'json' } });
ok('fehlende Pflichtdatei: Fehler vom Schema oder klarer Hinweis', r.isError === true, r.content[0].text);
// enable_tools all
await c.callTool({ name: 'enable_tools', arguments: { names: ['all'] } });
list = await names(c);
const regNames = OPS.ops.map(o => o.op);
const missing = regNames.filter(n => !list.includes(n));
ok('all: jede Kachel der Registry hat ein Tool', missing.length === 0, missing.join(','));
ok('all: kein Tool doppelt', new Set(list).size === list.length);
ok(`all: ${list.length} Tools (64 Kacheln plus Kern und Konto)`, list.length >= 64 + 5, list.length);
// JSON-Operation aus der Registry
const create = OPS.ops.find(o => o.op === 'einvoice_create');
if (create && String(create.input).includes('json')) {
  r = await c.callTool({ name: 'einvoice_create', arguments: Object.fromEntries((create.params || []).filter(p => p.required && p.type !== 'file').map(p => [p.name, p.type === 'object' ? { a: 1 } : p.type === 'array' ? [] : p.type === 'integer' || p.type === 'number' ? 1 : p.type === 'boolean' ? true : (p.enum ? p.enum[0] : 'x')])) });
  last = seen.at(-1);
  ok('einvoice_create geht als JSON an /v1/einvoice/create', !r.isError && last.url === '/v1/einvoice/create' && last.ct.includes('json'), r.content[0].text.slice(0, 160));
}
// run_operation akzeptiert jetzt auch Tool-Namen
r = await c.callTool({ name: 'run_operation', arguments: { op: 'pdf_info', files: [join(dir, 'r.pdf')] } });
ok('run_operation versteht pdf_info und pdf/info', !r.isError && seen.at(-1).url === '/v1/pdf/info', r.content[0].text.slice(0, 120));
// render: Seitenzahlen über die Engine, ohne deutsches „Seite“
r = await c.callTool({ name: 'render', arguments: { markdown: '# Hallo', footer_page_numbers: true, output_path: join(dir, 'x') } });
last = seen.at(-1);
ok('render: footer_page_numbers schickt pdf.footer=pages, kein „Seite“', last.url === '/v1/render' && last.json?.pdf?.footer === 'pages' && !JSON.stringify(last.json).includes('Seite'), JSON.stringify(last.json?.pdf));
await c.close();

// 2 BIGAPI_TOOLS=all: Registry-Tools gleich beim Start
c = await start({ BIGAPI_TOOLS: 'all' });
list = await names(c);
ok('BIGAPI_TOOLS=all listet die Registry-Tools von Anfang an', regNames.every(n => list.includes(n)), regNames.filter(n => !list.includes(n)).join(','));
await c.close();
// 3 ohne Netz: Start klappt trotzdem mit den eingebauten Tools
c = await start({ BIGAPI_TOOLS: 'all', BIGAPI_URL: 'http://127.0.0.1:9599' });
list = await names(c);
ok('ohne Verzeichnis: Start klappt, eingebaute Tools da', list.length >= 46 && list.includes('pdf_merge'), list.length);
r = await c.callTool({ name: 'enable_tools', arguments: { names: ['einvoice_validate'] } });
ok('ohne Verzeichnis: enable_tools meldet das ehrlich', /Catalogue not reachable|unknown/i.test(r.content[0].text), r.content[0].text.slice(0, 200));
await c.close();
mock.close();
console.log(fail ? `${fail} fehlgeschlagen` : 'alles ok');
process.exit(fail ? 1 : 0);
