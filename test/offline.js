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
  if (url.startsWith('/v1/discover')) return send(200, { 'content-type': 'application/json' },
    JSON.stringify({ query: 'mock', confident: true, count: 1, matches: [{ op: 'image', method: 'POST',
      path: '/v1/image', title: 'Resize · crop · convert · watermark', summary: 'PNG to WebP …',
      price_cents: 1, unit: 'operation', example: 'curl -X POST …', guide: 'https://bigapi.dev/guides/image.html',
      confidence: 1, matched_terms: ['png', 'webp'] }], next_step: 'POST /v1/image …' }));
  if (url === '/v1/text/chunk') return send(200, { 'content-type': 'application/json', ...billing },
    JSON.stringify({ chunks: [{ text: 'Hallo', tokens: 2, page: 1, heading_path: [] }], chunk_count: 1, total_tokens: 2 }));
  if (['/v1/docx/to-markdown', '/v1/xlsx/to-markdown', '/v1/pptx/to-markdown', '/v1/epub/to-markdown'].includes(url))
    return send(200, { 'content-type': 'application/json', ...billing }, JSON.stringify({ markdown: '# Mock' }));
  if (url === '/v1/pdf/outline') return send(200, { 'content-type': 'application/json', ...billing },
    JSON.stringify({ has_outline: true, entries: 1, flat: [{ title: 'K1', page: 1, depth: 1 }] }));
  if (url === '/v1/pdf/protect' || url === '/v1/pdf/unlock') return send(200,
    { 'content-type': 'application/pdf', ...billing }, Buffer.from('%PDF-mockprot'));
  if (url === '/v1/pdf/compare') return send(200, { 'content-type': 'application/json', ...billing, 'x-bigapi-pages': '1' },
    JSON.stringify({ pages_compared: 1, pages_changed: 0, identical: true, per_page: [] }));
  if (url === '/v1/pdf/redact') return send(200,
    { 'content-type': 'application/pdf', ...billing, 'x-bigapi-pages': '1', 'x-bigapi-redactions': '2' }, Buffer.from('%PDF-mockredact'));
  if (url === '/v1/pdf/verify-signature') return send(200, { 'content-type': 'application/json', ...billing },
    JSON.stringify({ signed: false, signatures: [] }));
  if (url === '/v1/email/to-pdf') return send(200, { 'content-type': 'application/pdf', ...billing }, Buffer.from('%PDF-mockmail'));
  if (url === '/v1/template/render') return send(200, { 'content-type': 'application/pdf', ...billing }, Buffer.from('%PDF-mocktpl'));
  if (url === '/v1/chart') return send(200, { 'content-type': 'image/png', ...billing }, Buffer.from('\x89PNGmock', 'latin1'));
  if (url === '/v1/qr') {
    const b = JSON.parse(body.toString());
    if (b.format === 'svg') return send(200, { 'content-type': 'image/svg+xml', ...billing }, '<svg xmlns="http://www.w3.org/2000/svg"/>');
    return send(200, { 'content-type': 'image/png', ...billing }, Buffer.from('\x89PNGmock', 'latin1'));
  }
  if (url === '/v1/image/to-pdf') return send(200, { 'content-type': 'application/pdf', ...billing }, Buffer.from('%PDF-mockimg'));
  if (url === '/v1/image/c2pa/sign') return send(200,
    { 'content-type': 'image/jpeg', ...billing, 'x-bigapi-c2pa-cert': 'bigapi-cert' }, Buffer.from('\xff\xd8mock', 'latin1'));
  if (url === '/v1/image/c2pa/verify') return send(200, { 'content-type': 'application/json', ...billing },
    JSON.stringify({ has_credentials: true, active_manifest: { ai_generated: true } }));
  if (url === '/v1/image/ai-label') return send(200, { 'content-type': 'image/jpeg', ...billing }, Buffer.from('\xff\xd8mock', 'latin1'));
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
check('42 Tools registriert', names.length === 42, String(names.length));
for (const t of ['find_tool', 'pdf_to_markdown', 'pdf_extract_tables', 'pdf_info', 'url_to_markdown', 'md_to_docx', 'text_chunk', 'docx_to_markdown', 'xlsx_to_markdown', 'pptx_to_markdown', 'epub_to_markdown', 'pdf_outline', 'pdf_protect', 'pdf_unlock', 'pdf_compare', 'pdf_redact', 'pdf_verify_signature', 'email_to_pdf', 'template_render', 'chart_render', 'qr_code', 'image_to_pdf', 'image_c2pa_sign', 'image_c2pa_verify', 'image_ai_label'])
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

r = await call('find_tool', { query: 'convert a png to webp' });
check('find_tool findet Operation', !r.isError && r.text.includes('"op": "image"') || r.text.includes('"op":"image"'), r.isError ? r.text.slice(0, 120) : '');
check('find_tool liefert Beispiel mit', !r.isError && r.text.includes('curl'));

// --- 0.5.0-Tools ---

r = await call('text_chunk', { text: '# A\n\nHallo Welt.' });
check('text_chunk', !r.isError && r.text.includes('chunk_count'), r.isError ? r.text.slice(0, 120) : '');

r = await call('docx_to_markdown', { file: testPdf });
check('docx_to_markdown', !r.isError && r.text.includes('# Mock'));

r = await call('pdf_outline', { file: testPdf });
check('pdf_outline', !r.isError && r.text.includes('has_outline'));

r = await call('pdf_protect', { file: testPdf, password: 'geheim123' });
const protPath = !r.isError && JSON.parse(r.text.slice(r.text.indexOf('{'))).output_path;
check('pdf_protect Datei', protPath && protPath.endsWith('.pdf'));

r = await call('pdf_compare', { file_a: testPdf, file_b: testPdf });
check('pdf_compare', !r.isError && r.text.includes('identical'));

r = await call('pdf_redact', { file: testPdf, terms: ['geheim'] });
const redPath = !r.isError && JSON.parse(r.text.slice(r.text.indexOf('{'))).output_path;
check('pdf_redact Datei', redPath && redPath.endsWith('.pdf'));

r = await call('template_render', { template: '<h1>{{t}}</h1>', data: { t: 'x' } });
check('template_render', !r.isError && r.text.includes('.pdf'));

r = await call('chart_render', { config: { type: 'bar', data: {} } });
check('chart_render', !r.isError && r.text.includes('.png'));

r = await call('qr_code', { text: 'https://bigapi.dev', format: 'svg' });
const qrPath = !r.isError && JSON.parse(r.text.slice(r.text.indexOf('{'))).output_path;
check('qr_code svg-Endung', qrPath && qrPath.endsWith('.svg'), qrPath || r.text.slice(0, 120));

r = await call('image_to_pdf', { files: [testPdf] });
check('image_to_pdf', !r.isError && r.text.includes('.pdf'));

r = await call('image_c2pa_sign', { file: testPdf });
check('image_c2pa_sign', !r.isError && r.text.includes('.jpg'));

r = await call('image_c2pa_verify', { file: testPdf });
check('image_c2pa_verify', !r.isError && r.text.includes('has_credentials'));

r = await call('image_ai_label', { file: testPdf });
check('image_ai_label', !r.isError && r.text.includes('.jpg'));

// 7. Fehlerfall: Datei existiert nicht

r = await call('pdf_info', { file: '/nirgendwo/fehlt.pdf' });
check('sauberer Fehler bei fehlender Datei', r.isError && r.text.includes('file_not_found'));

await client.close();
mock.close();
console.log(failures === 0 ? '\noffline ok' : `\n${failures} FEHLER`);
process.exit(failures === 0 ? 0 : 1);
