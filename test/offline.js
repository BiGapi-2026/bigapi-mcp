// Offline-Test: startet ein Mock-Gateway auf localhost und prüft die 5 neuen Welle-1-Tools
// (Registrierung, Schema, Request-Aufbau, Datei-Speicherung mit korrekter Endung) ohne Produktion zu berühren.
import { createServer } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const billing = { 'x-bigapi-cost': '1', 'x-bigapi-balance': '9900', 'x-bigapi-free-ops': '97', 'x-bigapi-charged-from': 'free' };

const mock = createServer(async (req, res) => {
  let body = Buffer.alloc(0);
  for await (const c of req) body = Buffer.concat([body, c]);
  const send = (code, headers, payload) => { res.writeHead(code, headers); res.end(payload); };
  const url = req.url.split('?')[0];

  if (url === '/v1/keys') return send(200, { 'content-type': 'application/json' },
    JSON.stringify({ key: 'bigapi_mocktestkey', key_id: 'k_1', free_operations: 100, monthly_cap_cents: 1000, price_per_operation_cents: 1, upgrade_url: 'https://console.bigapi.dev/#k' }));
  if (url === '/v1/balance') return send(200, { 'content-type': 'application/json' },
    JSON.stringify({ key: { id: 'k_1' }, balance_cents: 9900, free_operations_remaining: 97 }));
  if (url === '/v1/pdf/to-markdown') {
    const raw = body.toString('latin1');
    const wantsJson = raw.includes('name="output"') && raw.includes('json');
    if (wantsJson) return send(200, { 'content-type': 'application/json', ...billing, 'x-bigapi-pages': '2' },
      JSON.stringify({ markdown: '# Titel\n\nHallo Welt', pages: 2, total_pages: 2 }));
    return send(200, { 'content-type': 'text/markdown; charset=utf-8', ...billing, 'x-bigapi-pages': '2' }, '# Titel\n\nHallo Welt');
  }
  if (url === '/v1/pdf/extract-tables') return send(200, { 'content-type': 'application/json', ...billing, 'x-bigapi-pages': '1' },
    JSON.stringify({ pages: [{ page: 1, tables: [[['A', 'B'], ['1', '2']]] }], tables_found: 1 }));
  if (url === '/v1/pdf/info') return send(200, { 'content-type': 'application/json', ...billing },
    JSON.stringify({ pages: 2, pdf_version: '1.7', title: 'Mock', encrypted: false }));
  if (url === '/v1/url/to-markdown') {
    const b = JSON.parse(body.toString());
    if (b.output === 'json') return send(200, { 'content-type': 'application/json', ...billing },
      JSON.stringify({ markdown: '# Example\n\nText', title: 'Example', url: b.url }));
    return send(200, { 'content-type': 'text/markdown', ...billing }, '# Example\n\nText');
  }
  if (url === '/v1/md/to-docx') return send(200,
    { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ...billing },
    Buffer.from('PK\x03\x04MOCKDOCX'));
  send(404, { 'content-type': 'application/json' }, JSON.stringify({ error: 'not_found', path: url }));
});

await new Promise(r => mock.listen(0, '127.0.0.1', r));
const port = mock.address().port;
console.log('Mock-Gateway auf Port', port);

const cfg = mkdtempSync(join(tmpdir(), 'bigapi-offline-'));
const testPdf = join(cfg, 'test.pdf');
writeFileSync(testPdf, '%PDF-1.4 mock');

const transport = new StdioClientTransport({ command: 'node', args: ['src/index.js'],
  env: { ...process.env, BIGAPI_CONFIG_DIR: cfg, BIGAPI_URL: `http://127.0.0.1:${port}`, BIGAPI_OUTPUT_DIR: cfg, BIGAPI_KEY: '' } });
const client = new Client({ name: 'offline', version: '0.0.1' });
await client.connect(transport);

let failures = 0;
const check = (name, cond, extra) => { console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? ` – ${extra}` : '')); if (!cond) failures++; };

const tools = await client.listTools();
const names = tools.tools.map(t => t.name);
console.log(`\ntools (${names.length}):`, names.join(', '));
check('22 Tools registriert', names.length === 22, String(names.length));
for (const t of ['pdf_to_markdown', 'pdf_extract_tables', 'pdf_info', 'url_to_markdown', 'md_to_docx'])
  check(`Tool vorhanden: ${t}`, names.includes(t));

const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  return { isError: !!r.isError, text: r.content[0].text };
};

// Key anlegen (Mock)
await call('get_access', { name: 'offline' });

// 1. pdf_to_markdown, output=json
let r = await call('pdf_to_markdown', { file: testPdf });
check('pdf_to_markdown json', !r.isError && r.text.includes('Hallo Welt') && r.text.includes('"pages": 2'), r.isError ? r.text.slice(0, 120) : '');

// 2. pdf_to_markdown, output=md → Datei mit .md-Endung
r = await call('pdf_to_markdown', { file: testPdf, output: 'md' });
const mdPath = !r.isError && JSON.parse(r.text.slice(r.text.indexOf('{'))).output_path;
check('pdf_to_markdown md-Datei', mdPath && mdPath.endsWith('.md') && existsSync(mdPath), mdPath || r.text.slice(0, 120));

// 3. pdf_extract_tables
r = await call('pdf_extract_tables', { file: testPdf });
check('pdf_extract_tables', !r.isError && r.text.includes('tables_found'), r.isError ? r.text.slice(0, 120) : '');

// 4. pdf_info
r = await call('pdf_info', { file: testPdf });
check('pdf_info', !r.isError && r.text.includes('"pdf_version"'), r.isError ? r.text.slice(0, 120) : '');

// 5. url_to_markdown json
r = await call('url_to_markdown', { url: 'https://example.com' });
check('url_to_markdown json', !r.isError && r.text.includes('"title"'), r.isError ? r.text.slice(0, 120) : '');

// 6. md_to_docx → .docx-Datei
r = await call('md_to_docx', { markdown: '# Hi\n\n**fett**' });
const docxPath = !r.isError && JSON.parse(r.text.slice(r.text.indexOf('{'))).output_path;
check('md_to_docx docx-Datei', docxPath && docxPath.endsWith('.docx') && readFileSync(docxPath).length > 0, docxPath || r.text.slice(0, 120));

// 7. Fehlerfall: Datei existiert nicht
r = await call('pdf_info', { file: '/nirgendwo/fehlt.pdf' });
check('sauberer Fehler bei fehlender Datei', r.isError && r.text.includes('file_not_found'));

await client.close();
mock.close();
console.log(failures === 0 ? '\noffline ok' : `\n${failures} FEHLER`);
process.exit(failures === 0 ? 0 : 1);
