#!/usr/bin/env node
// bigapi MCP-Server – macht api.bigapi.dev als Werkzeuge für Claude Desktop, Cursor, Cline & Co. verfügbar.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { apiJson, opJson, opFiles, getKey, saveKey, configPath, BigapiError, BASE_URL } from './client.js';

const server = new McpServer({ name: 'bigapi', version: '0.1.0' }, {
  instructions: `bigapi.dev – the output layer for AI agents. Deterministic file operations an LLM cannot do itself:
render HTML/Markdown/URLs to PDF or PNG, merge/split/rotate/compress PDFs, turn PDF pages into images, resize/convert/watermark images.
Pricing: 1 cent per operation, 100 free operations per new key (no signup), balance never expires, failed calls are free.
If no API key is configured, call get_access first – it is free and instant. Files are given and returned as local paths.`,
});

// Einheitliche Ergebnis-/Fehlerdarstellung
function ok(obj, text) {
  return { content: [{ type: 'text', text: text ? `${text}\n\n${JSON.stringify(obj, null, 2)}` : JSON.stringify(obj, null, 2) }] };
}
function fail(e) {
  if (e instanceof BigapiError) {
    const b = e.body || {};
    let hint = '';
    if (b.error === 'balance_empty') hint = `\nGuthaben leer. Aufladen (ab 5 €, verfällt nie): ${b.upgrade_url}`;
    if (b.error === 'cap_reached') hint = `\nMonatsobergrenze dieses Keys erreicht (${b.monthly_cap_cents} ct). Mit set_monthly_cap anheben.`;
    if (b.error === 'rate_limited') hint = `\nZu viele Anfragen. In ${b.retry_after ?? 1} s erneut versuchen.`;
    if (b.error === 'no_api_key' || e.status === 401) hint = `\nKein gültiger Key. Tool get_access aufrufen (kostenlos).`;
    return { isError: true, content: [{ type: 'text', text: `bigapi error ${e.status}: ${b.error}${hint}\n${JSON.stringify(b)}` }] };
  }
  return { isError: true, content: [{ type: 'text', text: `error: ${e.message}` }] };
}
const run = (fn) => async (args) => { try { return await fn(args); } catch (e) { return fail(e); } };

// ---- Zugang -----------------------------------------------------------------
server.tool('get_access',
  'Get a free bigapi API key instantly – no signup, no credit card. 100 free operations for 7 days, then 1 cent per operation. The key is stored locally and used by all other tools. Call this once if no key is configured.',
  { name: z.string().optional().describe('Optional label for the key, e.g. "claude-desktop"') },
  run(async ({ name }) => {
    const existing = await getKey();
    if (existing) return ok({ status: 'already_configured', config: configPath(), hint: 'Use get_balance to see credit, or force_new=true is not supported – revoke via console.' }, 'A key is already configured.');
    const r = await apiJson('POST', '/v1/keys', { name: name || 'mcp' }, { auth: false });
    const path = await saveKey(r.key);
    return ok({ key_id: r.key_id, free_operations: r.free_operations, free_until: r.free_until, monthly_cap_cents: r.monthly_cap_cents,
      price_per_operation_cents: r.price_per_operation_cents, upgrade_url: r.upgrade_url, stored_at: path },
      'Key created and stored. Keep the upgrade_url – it is where credit is added when the free operations run out.');
  }));

server.tool('get_balance',
  'Show credit, free operations remaining, monthly cap and spend of the configured key.',
  {}, run(async () => ok(await apiJson('GET', '/v1/balance'))));

server.tool('get_usage', 'Operations and cost this month, grouped by operation.', {}, run(async () => ok(await apiJson('GET', '/v1/usage'))));

server.tool('set_monthly_cap',
  'Raise or lower the monthly spending cap (in cents) of the configured key. Default is 1000 (10 €). Protects against runaway loops.',
  { monthly_cap_cents: z.number().int().min(0).max(1_000_000) },
  run(async ({ monthly_cap_cents }) => {
    const bal = await apiJson('GET', '/v1/balance');
    return ok(await apiJson('PATCH', `/v1/keys/${bal.key.id}`, { monthly_cap_cents }));
  }));

server.tool('get_pricing', 'Current price list of bigapi.dev (machine-readable).', {}, run(async () => ok(await apiJson('GET', '/v1/pricing', null, { auth: false }))));

// ---- Render -------------------------------------------------------------------
server.tool('render',
  'Render HTML, Markdown or a URL to a PDF (default) or PNG file. Use for reports, invoices, offers, documentation, screenshots. Returns the local output path. 1 cent.',
  {
    markdown: z.string().optional().describe('Markdown source (a clean print stylesheet is applied)'),
    html: z.string().optional().describe('Full or partial HTML'),
    url: z.string().url().optional().describe('Public URL to render'),
    format: z.enum(['pdf', 'png']).default('pdf'),
    output_path: z.string().optional().describe('Where to save the result (extension optional). Default: temp dir'),
    css: z.string().optional().describe('Extra CSS'),
    page_format: z.enum(['A4', 'A3', 'Letter', 'Legal']).default('A4'),
    landscape: z.boolean().default(false),
    margin_mm: z.number().min(0).max(60).optional().describe('Uniform page margin in mm (default 20/18)'),
    footer_page_numbers: z.boolean().default(false).describe('Add "Seite X/Y" footer'),
    png_width: z.number().int().min(200).max(4000).optional(),
    png_height: z.number().int().min(200).max(4000).optional(),
    png_full_page: z.boolean().default(true),
    idempotency_key: z.string().optional(),
  },
  run(async (a) => {
    if (!a.markdown && !a.html && !a.url) throw new BigapiError(400, { error: 'missing_source', hint: 'Provide markdown, html or url' });
    const body = { markdown: a.markdown, html: a.html, url: a.url, format: a.format, css: a.css,
      pdf: { format: a.page_format, landscape: a.landscape,
        margin: a.margin_mm != null ? { top: `${a.margin_mm}mm`, right: `${a.margin_mm}mm`, bottom: `${a.margin_mm}mm`, left: `${a.margin_mm}mm` } : undefined,
        footerTemplate: a.footer_page_numbers ? '<div style="font-size:8px;width:100%;text-align:center;color:#666">Seite <span class="pageNumber"></span>/<span class="totalPages"></span></div>' : undefined },
      png: { width: a.png_width, height: a.png_height, fullPage: a.png_full_page } };
    return ok(await opJson('/v1/render', body, a.output_path, a.idempotency_key), 'Rendered.');
  }));

// ---- PDF ------------------------------------------------------------------------
server.tool('pdf_merge', 'Merge two or more PDF files (local paths, in order) into one. 1 cent.',
  { files: z.array(z.string()).min(2).describe('Local PDF paths in order'), output_path: z.string().optional(), idempotency_key: z.string().optional() },
  run(async (a) => ok(await opFiles('/v1/pdf/merge', a.files.map(f => ['files', f]), {}, a.output_path, a.idempotency_key), 'Merged.')));

server.tool('pdf_split', 'Extract pages from a PDF. Page ranges like "1-3,7,9-z" (z = last page). 1 cent.',
  { file: z.string(), pages: z.string().default('1-z'), output_path: z.string().optional(), idempotency_key: z.string().optional() },
  run(async (a) => ok(await opFiles('/v1/pdf/split', [['file', a.file]], { pages: a.pages }, a.output_path, a.idempotency_key), 'Split.')));

server.tool('pdf_rotate', 'Rotate PDF pages by 90, 180 or 270 degrees. 1 cent.',
  { file: z.string(), angle: z.enum(['90', '180', '270']).default('90'), pages: z.string().default('1-z'), output_path: z.string().optional(), idempotency_key: z.string().optional() },
  run(async (a) => ok(await opFiles('/v1/pdf/rotate', [['file', a.file]], { angle: a.angle, pages: a.pages }, a.output_path, a.idempotency_key), 'Rotated.')));

server.tool('pdf_compress', 'Shrink a PDF. Levels: screen (smallest), ebook (default, good for sharing), printer, prepress (largest, best quality). 1 cent.',
  { file: z.string(), level: z.enum(['screen', 'ebook', 'printer', 'prepress']).default('ebook'), output_path: z.string().optional(), idempotency_key: z.string().optional() },
  run(async (a) => ok(await opFiles('/v1/pdf/compress', [['file', a.file]], { level: a.level }, a.output_path, a.idempotency_key), 'Compressed.')));

server.tool('pdf_to_images', 'Render PDF pages as JPEG (default) or PNG images – e.g. to look at a document with a vision model. Single page → image file, multiple pages → ZIP. 1 cent.',
  { file: z.string(), dpi: z.number().int().min(36).max(600).default(150), first_page: z.number().int().min(1).optional(), last_page: z.number().int().min(1).optional(),
    format: z.enum(['jpeg', 'png']).default('jpeg'), quality: z.number().int().min(30).max(100).default(85), output_path: z.string().optional(), idempotency_key: z.string().optional() },
  run(async (a) => ok(await opFiles('/v1/pdf/pages', [['file', a.file]], { dpi: String(a.dpi), first: a.first_page && String(a.first_page), last: a.last_page && String(a.last_page), format: a.format, quality: String(a.quality) }, a.output_path, a.idempotency_key), 'Pages rendered.')));

// ---- Images --------------------------------------------------------------------
server.tool('image_process', 'Resize, crop, rotate, convert (jpeg/png/webp/avif/tiff), compress, strip EXIF and/or watermark an image in one call. 1 cent.',
  { file: z.string(),
    resize_width: z.number().int().min(1).max(10000).optional(), resize_height: z.number().int().min(1).max(10000).optional(),
    fit: z.enum(['inside', 'cover', 'contain', 'outside', 'fill']).default('inside'),
    crop: z.object({ left: z.number().int(), top: z.number().int(), width: z.number().int(), height: z.number().int() }).optional(),
    rotate: z.union([z.literal('auto'), z.number()]).optional().describe('"auto" = fix EXIF orientation, or degrees'),
    format: z.enum(['jpeg', 'png', 'webp', 'avif', 'tiff', 'gif']).optional(), quality: z.number().int().min(1).max(100).optional(),
    keep_metadata: z.boolean().default(false).describe('Keep EXIF/ICC (default: stripped)'),
    watermark_text: z.string().optional(), watermark_gravity: z.enum(['southeast', 'southwest', 'northeast', 'northwest', 'center']).default('southeast'), watermark_opacity: z.number().min(0).max(1).default(0.55),
    output_path: z.string().optional(), idempotency_key: z.string().optional() },
  run(async (a) => {
    const ops = {};
    if (a.resize_width || a.resize_height) ops.resize = { width: a.resize_width, height: a.resize_height, fit: a.fit };
    if (a.crop) ops.crop = a.crop;
    if (a.rotate !== undefined) ops.rotate = a.rotate;
    if (a.format) ops.format = a.format;
    if (a.quality) ops.quality = a.quality;
    if (a.keep_metadata) ops.keepMetadata = true;
    if (a.watermark_text) ops.watermark = { text: a.watermark_text, gravity: a.watermark_gravity, opacity: a.watermark_opacity };
    return ok(await opFiles('/v1/image', [['file', a.file]], { ops }, a.output_path, a.idempotency_key), 'Image processed.');
  }));

server.tool('image_info', 'Read format, dimensions, color space, EXIF/ICC presence of an image. 1 cent.',
  { file: z.string() }, run(async (a) => ok(await opFiles('/v1/image/info', [['file', a.file]]))));

// ---- Start ---------------------------------------------------------------------
const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write(`bigapi MCP server ready (${BASE_URL})\n`);
