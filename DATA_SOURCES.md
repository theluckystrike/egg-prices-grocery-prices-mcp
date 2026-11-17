# Data sources

All data is read at call time. No key is needed.

| URL | Used for |
| --- | --- |
| `https://fred.stlouisfed.org/graph/fredgraph.csv?id=APU<area><item>` | the monthly BLS average price series. area 0000 is the U.S. city average, 0100 Northeast, 0200 Midwest, 0300 South, 0400 West; item is the BLS item code (708111 eggs, 703112 ground beef, 717311 coffee, 709112 milk, 74714 regular gasoline, 72610 electricity ...) |

The series are published by the U.S. Bureau of Labor Statistics (CPI Average Price Data, https://www.bls.gov/cpi/factsheets/average-prices.htm) and copied by the Federal Reserve Bank of St. Louis to FRED the day BLS releases them. BLS data are in the public domain.

Why FRED and not the BLS API: from Cloudflare Workers the keyless BLS public API v1 answers `REQUEST_NOT_PROCESSED` (its daily per-IP quota is shared by every Worker on the same egress), and download.bls.gov answers 403 (checked 2026-11-17).

Each CSV is cached at the Cloudflare edge for 6 hours (2xx answers only). The catalog of 31 items in `src/core.ts` was checked against FRED on 2026-11-17: every U.S. series has data through 2026-10, except orange juice (2026-07) and navel oranges (2026-09), which BLS publishes in fewer months.
