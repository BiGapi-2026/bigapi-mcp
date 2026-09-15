# @bigapi/mcp

[![npm version](https://img.shields.io/npm/v/%40bigapi%2Fmcp)](https://www.npmjs.com/package/@bigapi/mcp)
[![bigapi-mcp MCP server](https://glama.ai/mcp/servers/BiGapi-2026/bigapi-mcp/badges/score.svg)](https://glama.ai/mcp/servers/BiGapi-2026/bigapi-mcp)

MCP server for **[bigapi.dev](https://bigapi.dev)** – *deterministic file operations for AI agents.*

Gives Claude Desktop, Cursor, Cline, Windsurf and any MCP-capable agent the file operations an LLM cannot do itself – over plain HTTPS, with one key, nothing to install server-side:

| Tool | What it does |
|---|---|
| `render` | HTML / Markdown / URL → **PDF** or **PNG** via server-side Chromium (reports, invoices, offers, documentation) |
| `screenshot` | Any public URL, real device presets (desktop / laptop / tablet / mobile), full page |
| `ocr` | Scanned PDF or photo → searchable PDF, plain text, or per-page JSON (`deu`, `eng`, `deu+eng`, …) |
| `office_to_pdf` | DOCX, XLSX, PPTX, ODT, RTF, CSV, TXT → PDF via server-side LibreOffice |
| `pdf_to_pdfa` | PDF → archival **PDF/A-2b** with embedded fonts (long-term storage, compliance) |
| `pdf_merge` · `pdf_split` · `pdf_rotate` · `pdf_compress` | The PDF basics |
| `pdf_to_images` | PDF pages → JPEG/PNG, e.g. to look at a document with a vision model |
| `pdf_to_markdown` | PDF → clean, reflowed **Markdown** (summarising, RAG ingestion) |
| `pdf_extract_tables` | Tables out of a PDF as **JSON rows or CSV** (invoices, reports, statements) |
| `pdf_info` | Page count, title, PDF version, encryption, page size – as JSON |
| `url_to_markdown` | Any public web page (JavaScript included) → GitHub-flavoured Markdown |
| `md_to_docx` | Markdown – e.g. an LLM answer – → formatted **Word** document |
| `find_tool` | **Describe your task in plain words** → the matching operation with example, price and guide. Free, no key |
| `text_chunk` | Text/Markdown → **RAG-ready chunks** (token-based, heading-aware, overlap) |
| `docx_to_markdown` / `xlsx_to_markdown` / `pptx_to_markdown` / `epub_to_markdown` | Office files & e-books → clean Markdown |
| `pdf_outline` | Bookmark/chapter outline with target pages as JSON |
| `pdf_attachments` | Embedded files out of a PDF – **ZUGFeRD / Factur-X e-invoice XML**, CSVs, images. JSON or ZIP |
| `html_to_markdown` | HTML you already have → readable Markdown, navigation stripped. No browser, milliseconds |
| `pdf_protect` / `pdf_unlock` | AES-256 password protection on and off |
| `pdf_compare` | Page-by-page visual diff – JSON report or red-highlighted diff PDF |
| `pdf_redact` | **Guaranteed removal**: rasterise, black out, rebuild – text provably gone |
| `pdf_sanitize` | Strip the invisible: JavaScript, open-actions, form fields, embedded files – rewritten, so orphaned objects go too |
| `pdf_linearize` | Fast web view: browsers show page one before the whole file has loaded |
| `pdf_verify_signature` | Who signed, when, unchanged since? (integrity, no CA chain) |
| `email_to_pdf` | .eml emails → clean archive PDFs |
| `template_render` | Handlebars + JSON data → PDF / PNG / HTML |
| `chart_render` | Chart.js config → chart PNG, server-side |
| `qr_code` | Text/URL → QR code (PNG/SVG) |
| `image_to_pdf` | Images → one PDF (auto size or A4/Letter) |
| `image_c2pa_sign` / `image_c2pa_verify` | **C2PA Content Credentials** for AI images (EU AI Act Art. 50) |
| `image_ai_label` | Visible "AI-generated" stamp + EXIF marking |
| `image_process` | Resize, crop, rotate, convert (webp/avif/…), compress, strip EXIF, watermark – one call |
| `image_info` | Format, dimensions, color space, EXIF/ICC presence |
| `get_access` | Free API key, instantly, no signup – 100 free operations that **never expire** |
| `get_balance` · `get_usage` · `set_monthly_cap` · `get_pricing` | Account |

**$0.01 per operation. 100 free. Free operations and balance never expire. Failed calls are free.** Servers in Germany, GDPR, files deleted after delivery.

Also listed in the [official MCP Registry](https://registry.modelcontextprotocol.io) as `dev.bigapi/mcp`.

## Install

Requires Node 18+. No API key needed up front – the agent can call `get_access` itself.

### Claude Desktop

`claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "bigapi": {
      "command": "npx",
      "args": ["-y", "@bigapi/mcp"]
    }
  }
}
```

Restart Claude Desktop. Then: *"Get bigapi access and render this text as a PDF on my Desktop."*

### Cursor / Windsurf / Cline

Same block in the respective MCP settings (`.cursor/mcp.json`, `~/.codeium/windsurf/mcp_config.json`, Cline → MCP Servers → Configure).

### With an existing key

```json
"bigapi": { "command": "npx", "args": ["-y", "@bigapi/mcp"], "env": { "BIGAPI_KEY": "bigapi_..." } }
```

## How files work

Inputs are local paths (`/Users/me/report.pdf`, `C:\Users\me\scan.pdf`). Outputs are written to `output_path` if given, otherwise to a temp folder (`BIGAPI_OUTPUT_DIR` to change). Every result includes the cost, what it was charged from, and the remaining balance.

## Pricing

Flat **$0.01 per operation** – every operation, no exceptions (per page for `ocr`, `office_to_pdf`, `pdf_to_markdown`, `pdf_extract_tables`, `pdf_compare` and `pdf_redact`). Prepaid from $5 – no subscription, no signup, balance never expires, failed calls are free. Machine-readable: `get_pricing` or `GET /v1/pricing`.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `BIGAPI_KEY` | – | Use this key instead of the stored one |
| `BIGAPI_CONFIG_DIR` | `~/.bigapi` | Where `get_access` stores the key (`config.json`, mode 600) |
| `BIGAPI_OUTPUT_DIR` | OS temp dir | Default output folder |
| `BIGAPI_URL` | `https://api.bigapi.dev` | API base (for self-hosting / testing) |

## Without MCP

Plain HTTP works everywhere (n8n, Make, Zapier, LangChain, your code):

```bash
curl -X POST https://api.bigapi.dev/v1/keys                       # → key
curl -o out.pdf https://api.bigapi.dev/v1/render \
  -H "Authorization: Bearer $KEY" -H "content-type: application/json" \
  -d '{"markdown":"# Hello from an agent"}'
```

OpenAPI: https://api.bigapi.dev/openapi.json · Docs: https://api.bigapi.dev/docs · Guides: https://bigapi.dev/guides/ · llms.txt: https://api.bigapi.dev/llms.txt

## License

MIT
