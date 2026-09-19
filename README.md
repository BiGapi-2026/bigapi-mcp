# @bigapi/mcp

[![npm version](https://img.shields.io/npm/v/%40bigapi%2Fmcp)](https://www.npmjs.com/package/@bigapi/mcp)
[![bigapi-mcp MCP server](https://glama.ai/mcp/servers/BiGapi-2026/bigapi-mcp/badges/score.svg)](https://glama.ai/mcp/servers/BiGapi-2026/bigapi-mcp)

MCP server for **[bigapi.dev](https://bigapi.dev)** – *deterministic file operations for AI agents.*

Gives Claude Desktop, Cursor, Cline, Windsurf and any MCP-capable agent the file operations an LLM cannot do itself – over plain HTTPS, with one key, nothing to install server-side.

**$0.01 per operation. 100 free. Free operations and balance never expire. Failed calls are free.** Servers in Germany, GDPR, files deleted after delivery. Every operation ships with a published proof that it does what it promises.

Also listed in the [official MCP Registry](https://registry.modelcontextprotocol.io) as `dev.bigapi/mcp`.

## Lean by default

The server starts **lean**: it lists five tools, so your context stays free.

| Tool | What it does |
|---|---|
| `find_tool` | Describe your task in plain words, get the matching operation with a ready-to-run example. Free, no key. |
| `run_operation` | Run **any** bigapi operation by name, including ones added after your client started. |
| `enable_tools` | Load dedicated tools on demand, e.g. `["pdf_redact","ocr"]` or `["all"]`. |
| `get_access` / `get_balance` | Get a free key, check credit. |

All 40+ operations are available from the first second through `run_operation`; the dedicated
tools are a convenience, not a requirement. Want the full list right away?
Set `BIGAPI_TOOLS=all` in the server environment.

Why: every tool definition costs context in your client, and a model choosing between five
descriptions picks better than one scanning forty-six.

## What you can run

All 40+ operations go through `run_operation` (or their own tool after `enable_tools`).
Ask `find_tool` in plain words instead of memorising this list:

- **PDF basics** — merge, split, rotate, compress, page info, outline, compare, linearize
- **PDF content** — to Markdown, to images, extract tables, extract attachments (**ZUGFeRD / Factur-X invoice XML**)
- **PDF safety** — redact (rasterise and rebuild, text provably gone), sanitize (JavaScript, actions, embedded files), password on/off, verify signature
- **PDF archival** — PDF/A-2b with embedded fonts and an output intent, checked with veraPDF
- **Documents** — Office and e-books to PDF or Markdown (DOCX, XLSX, PPTX, ODT, EPUB), Markdown to Word, .eml to PDF
- **Web and rendering** — HTML/Markdown/URL to PDF or PNG, full-page screenshots with device presets, HTML or URL to clean Markdown, Handlebars templates, charts, QR codes
- **Images** — resize, crop, convert (WebP/AVIF/…), compress, strip metadata, watermark, image info
- **AI transparency** — **C2PA Content Credentials** sign and verify, visible "AI-generated" label with EXIF marking (EU AI Act Art. 50)
- **Text for RAG** — token-based chunking, heading-aware, with overlap
- **Account** — free key, balance, usage, monthly cap, pricing



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
