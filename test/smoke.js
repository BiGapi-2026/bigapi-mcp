// Smoke-Test: startet den MCP-Server per stdio, ruft Tools auf. Erwartet laufendes Gateway unter BIGAPI_URL.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cfg = mkdtempSync(join(tmpdir(), 'bigapi-cfg-'));
const transport = new StdioClientTransport({ command: 'node', args: ['src/index.js'], env: { ...process.env, BIGAPI_CONFIG_DIR: cfg, BIGAPI_KEY: '' } });
const client = new Client({ name: 'smoke', version: '0.0.1' });
await client.connect(transport);

const tools = await client.listTools();
console.log('tools:', tools.tools.map(t => t.name).join(', '));

const call = async (name, args = {}) => { const r = await client.callTool({ name, arguments: args }); const t = r.content[0].text; console.log(`\n[${name}]${r.isError ? ' ERROR' : ''}\n${t.slice(0, 400)}`); return t; };

await call('get_balance');                       // ohne Key → Fehler mit Hinweis
await call('get_access', { name: 'smoke' });
await call('get_balance');
const r = await call('render', { markdown: '# MCP-Test\n\nErzeugt über den bigapi-MCP-Server.', footer_page_numbers: true, output_path: join(cfg, 'test') });
const pdf = JSON.parse(r.slice(r.indexOf('{'))).output_path;
await call('pdf_merge', { files: [pdf, pdf], output_path: join(cfg, 'merged') });
await call('pdf_to_images', { file: pdf, dpi: 72, output_path: join(cfg, 'page') });
await call('pdf_split', { file: '/etc/hostname' });  // kein PDF → sauberer Fehler
await call('get_usage');
await client.close();
console.log('\nsmoke ok');
