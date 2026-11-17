# egg-prices-grocery-prices-mcp

US egg prices and grocery prices for AI assistants: what a dozen eggs, a pound of ground beef or coffee, a gallon of milk or regular gasoline and a kilowatt-hour of electricity cost on average last month, how that compares with last month, last year and five years ago, whether it is a record, the monthly history back to 1980 and the four census regions.

This is a Model Context Protocol (MCP) server. It reads the Bureau of Labor Statistics average price series (the CPI average price data) from the St. Louis Fed's FRED at call time. BLS publishes each month about two weeks after it ends. It needs no API key.

## Tools

| Tool | What it returns |
| --- | --- |
| `grocery_price` | One item's latest BLS average price (eggs per dozen, ground beef per lb, milk per gallon, gasoline per gallon...), the change from the month before, a year before and five years before, the record high and when, the last 13 months; `region` can be a census region, a state (mapped to its region) or `all`; `month` gives the price as of a past month. |
| `grocery_price_history` | Monthly prices of one item between two months (most items back to 1980), with the high and low and yearly averages. Default the last 24 published months. |
| `grocery_prices_compare` | Several items side by side (default: eggs, milk, bread, ground beef, chicken breast, bacon, coffee, butter, cheddar, bananas, sugar, rice): latest price, month and 12-month change, the biggest increases and decreases, items at a record high. |
| `grocery_price_items` | The 31 tracked items with BLS names, units, plain-word aliases, categories and FRED series ids, and the four census regions. |

Every result has structured JSON, a plain-text summary, `as_of`, `source` and `more` (a page on [mcpstamp.com](https://www.mcpstamp.com/servers/?utm_source=mcp&utm_medium=egg-prices-grocery-prices-mcp)). Every tool is marked read-only.

## What it knows that your model does not

- Last month's US average price of a dozen grade A large eggs (October 2026: $2.32, down 33.5% from September 2025 and far below the $6.23 record of March 2025), a figure that changes every month.
- The same monthly BLS averages for 30 more items: ground beef, steak, chicken, bacon, pork chops, milk, butter, cheese, bread, flour, rice, coffee, orange juice, sugar, fruit and vegetables, gasoline, diesel, electricity and natural gas.
- Which months are missing and why (BLS published no October 2025 prices during the federal government shutdown), and which regional averages BLS still publishes for each item.

## Install

### Hosted (custom connector, ChatGPT developer mode, any remote MCP client)

Paste this URL. No token, no sign-up.

```
https://egg-prices-grocery-prices-mcp.lipmichal.workers.dev/mcp
```

### Cursor

Add to `~/.cursor/mcp.json`.

```json
{
  "mcpServers": {
    "egg-prices": { "url": "https://egg-prices-grocery-prices-mcp.lipmichal.workers.dev/mcp" }
  }
}
```

### VS Code

Add to `.vscode/mcp.json`.

```json
{
  "servers": {
    "egg-prices": { "type": "http", "url": "https://egg-prices-grocery-prices-mcp.lipmichal.workers.dev/mcp" }
  }
}
```

### Local stdio

The npm package is not published. Build it from this repository with Node 20 or newer, then point your MCP client at `node /path/to/egg-prices-grocery-prices-mcp/dist/stdio.js`.

```
git clone https://github.com/theluckystrike/egg-prices-grocery-prices-mcp && cd egg-prices-grocery-prices-mcp
npm install && npm run build
node dist/stdio.js
```

## Example prompts

- "How much is a dozen eggs right now, and how does that compare with last year?"
- "Are beef prices at a record high?"
- "What were egg prices in March 2025?"
- "Which grocery prices went up the most over the last year?"
- "How much does coffee cost per pound in the US now, and how has it changed since 2021?"
- "Are eggs cheaper in the South or the Northeast?"

## Data sources

Full list in [DATA_SOURCES.md](DATA_SOURCES.md).

- U.S. Bureau of Labor Statistics, CPI Average Price Data (series APU0000708111 and the other APU series): https://www.bls.gov/cpi/factsheets/average-prices.htm
- Read from the St. Louis Fed FRED series CSV: https://fred.stlouisfed.org/graph/fredgraph.csv?id=APU0000708111

## Limitations

- These are monthly averages across stores in US urban areas, not the price at a particular store, and the newest month is about two weeks old when it appears.
- BLS publishes averages for the nation and the four census regions only (no states or cities), and many regional series have stopped; the tools say when a region has no current average.
- BLS published no average prices for October 2025 (federal government shutdown). Comparisons that need that month use the nearest published month and say so.
- Discontinued BLS items (for example Red Delicious apples after 2017 and smoked ham after 2016) are not in the catalog.

## More

More MCP servers that answer questions your assistant cannot answer alone are on [mcpstamp.com](https://www.mcpstamp.com/servers/?utm_source=mcp&utm_medium=egg-prices-grocery-prices-mcp).

Part of the Zovo MCP collection at https://mcp.zovo.one

Built by [theluckystrike](https://github.com/theluckystrike).

## Development

```
npm install
npm test                              # builds, then runs the fixture tests and an offline stdio test
node scripts/stdio-transcript.mjs     # live stdio round trip, writes .live/stdio-transcript.jsonl
```

CI (`.github/workflows/bundle.yml`) runs the tests, the type check and `wrangler deploy --dry-run --outdir out`, and uploads the Worker bundle as an artifact.

## License

MIT
