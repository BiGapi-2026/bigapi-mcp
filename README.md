# @bigapi/mcp

MCP server for **[bigapi.dev](https://bigapi.dev)** – *the output layer for AI agents.*

Gives Claude Desktop, Cursor, Cline, Windsurf and any MCP-capable agent the file operations an LLM cannot do itself:

| Tool | What it does |
|---|---|
| `render` | HTML / Markdown / URL → **PDF** or **PNG** (reports, invoices, offers, screenshots) |
| `pdf_merge` · `pdf_split` · `pdf_rotate` · `pdf_compress` | The PDF basics |
| `pdf_to_images` | PDF pages → JPEG/PNG, e.g. to look at a document with a vision model |
| `image_process` | Resize, crop, rotate, convert (webp/avif/…), compress, strip EXIF, watermark – one call |
| `image_info` | Format, dimensions, color space, EXIF/ICC presence |
| `get_access` | Free API key, instantly, no signup – 100 free operations |
| `get_balance` · `get_usage` · `set_monthly_cap` · `get_pricing` | Account |

**1 cent per operation. 100 free. Balance never expires. Failed calls are free.** Servers in Germany, files deleted after delivery.

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

OpenAPI: https://api.bigapi.dev/openapi.json · Docs: https://api.bigapi.dev/docs · llms.txt: https://api.bigapi.dev/llms.txt

## License

MIT
