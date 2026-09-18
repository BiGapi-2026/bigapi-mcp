// Prueft den schlanken Modus, ohne Gateway: nur Tool-Liste und Umschalten.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ok = (n, c, e='') => console.log(`${c ? '  ✓' : '  ✗'} ${n}${e ? ' – ' + e : ''}`);
async function start(env) {
  const cfg = mkdtempSync(join(tmpdir(), 'bigapi-cfg-'));
  const t = new StdioClientTransport({ command: 'node', args: ['src/index.js'], env: { ...process.env, BIGAPI_CONFIG_DIR: cfg, BIGAPI_KEY: '', ...env } });
  const c = new Client({ name: 'lean-test', version: '0.0.1' });
  await c.connect(t);
  return c;
}

let c = await start({});
let list = (await c.listTools()).tools.map(t => t.name);
ok('Schlank ist der Standard: nur der Kern', list.length === 5, list.join(', '));
ok('find_tool und run_operation dabei', list.includes('find_tool') && list.includes('run_operation'));
ok('Einzelkacheln nicht gelistet', !list.includes('pdf_merge') && !list.includes('ocr'));

let r = await c.callTool({ name: 'enable_tools', arguments: { names: ['pdf_merge', 'ocr', 'gibt_es_nicht'] } });
list = (await c.listTools()).tools.map(t => t.name);
ok('enable_tools schaltet genannte Tools frei', list.includes('pdf_merge') && list.includes('ocr'), `${list.length} Tools`);
ok('Unbekannter Name wird gemeldet', /gibt_es_nicht/.test(r.content[0].text));

await c.callTool({ name: 'enable_tools', arguments: { names: ['all'] } });
list = (await c.listTools()).tools.map(t => t.name);
ok('enable_tools all zeigt die volle Liste', list.length >= 46, `${list.length} Tools`);

r = await c.callTool({ name: 'run_operation', arguments: { op: 'gibt/es/nicht', params: {} } });
ok('run_operation meldet unbekannte Operation sauber', r.isError === true && /unknown operation/.test(r.content[0].text));
await c.close();

c = await start({ BIGAPI_TOOLS: 'all' });
list = (await c.listTools()).tools.map(t => t.name);
ok('BIGAPI_TOOLS=all listet von Anfang an alles', list.length >= 46, `${list.length} Tools`);
await c.close();
process.exit(0);
