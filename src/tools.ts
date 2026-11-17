// Tool registry shared by the stdio and Worker entries.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { InputError, REPO, SITE, groceryPrice, groceryPriceHistory, groceryPriceItems, groceryPricesCompare } from './core.js';
import type { FetchText } from './types.js';

export const VERSION = '1.0.0';

export const META = {
  alias: 'egg-prices',
  metaDescription: 'MCP server for egg prices and grocery prices: the BLS average price of a dozen eggs, ground beef, steak, chicken, bacon, coffee, milk, bread, butter, gasoline and electricity in the US by month, with the change from last month and last year, record highs, history since 1980 and regional averages.',
  intro: 'US egg prices and grocery prices for AI assistants: the BLS monthly average retail prices behind the Consumer Price Index, read live from FRED.',
};

export const TOOL_INFO = [
  { name: 'grocery_price', blurb: 'Latest BLS average price of one item (eggs, beef, coffee, milk, gasoline...) with the change from last month, last year and five years ago, and the record high; by region or all regions.' },
  { name: 'grocery_price_history', blurb: 'Monthly average prices of one item between two months (back to 1980 for most items), with the high, low and yearly averages.' },
  { name: 'grocery_prices_compare', blurb: 'Several items side by side: latest price and 12-month change, the biggest increases and decreases, and items at a record high.' },
  { name: 'grocery_price_items', blurb: 'The catalog of 31 BLS average price items with units, aliases and series ids.' },
];

const RO = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;

function ok(data: Record<string, unknown> & { summary: string }) {
  return { content: [{ type: 'text' as const, text: `${data.summary}\n\n${JSON.stringify(data, null, 2)}` }], structuredContent: data };
}
function fail(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return { isError: true, content: [{ type: 'text' as const, text: `${e instanceof InputError ? 'Error' : 'Upstream FRED/BLS error'}: ${msg}` }] };
}
const wrap = <A>(fn: (a: A) => unknown) => async (a: A) => { try { return ok((await fn(a)) as any); } catch (e) { return fail(e); } };

const ITEM = z.string().describe('Item: eggs, milk, butter, cheddar_cheese, ice_cream, ground_beef, sirloin_steak, round_steak, chicken_whole, chicken_breast, bacon, pork_chops, bread, flour, rice, cookies, coffee, orange_juice, beer, sugar, bananas, oranges, lemons, tomatoes, potatoes, lettuce, gasoline, gasoline_premium, diesel, electricity, natural_gas. Plain words such as "egg prices", "beef" or "gas" also work.');
const REGION = z.string().optional().describe('us (default, U.S. city average), northeast, midwest, south, west, or a US state (mapped to its census region; BLS has no state averages). grocery_price also takes "all".');

export function createServer(fetchText: FetchText): McpServer {
  const server = new McpServer({ name: REPO, version: VERSION, websiteUrl: SITE } as any, {
    instructions:
      'US average retail prices from the Bureau of Labor Statistics (the CPI average price data), read at call time from FRED. Monthly; the newest month is about two weeks old. ' +
      'A model cannot know last month\'s price. Use grocery_price for "how much are eggs now" or "are beef prices at a record", grocery_price_history for a trend or a past month, ' +
      'grocery_prices_compare for a basket or "what got more expensive", grocery_price_items for the list. These are averages across stores, not a quote from a particular store.',
  });

  server.registerTool('grocery_price', {
    title: 'Average price of one grocery item',
    description:
      'The latest BLS average retail price of one item in the US (or a census region): eggs per dozen, ground beef, steak, chicken, bacon per lb, milk per gallon, coffee, bread, butter, ' +
      'gasoline per gallon, electricity per kWh and more. Returns the month, the price, the change from the month before, a year before and five years before, the record high and when, and the last 13 months. ' +
      'region "all" lists the U.S. average next to the Northeast, Midwest, South and West where BLS publishes them. month gives the price as of a past month.',
    inputSchema: {
      item: ITEM,
      region: REGION,
      month: z.string().optional().describe('A past month (YYYY-MM or "March 2025"). Default the latest published month.'),
    },
    annotations: { title: 'Grocery price', ...RO },
  }, wrap((a: any) => groceryPrice(fetchText, a)));

  server.registerTool('grocery_price_history', {
    title: 'Grocery price history',
    description:
      'Monthly BLS average prices of one item between two months (most items go back to 1980): every month, the first and last price and the change, the high and low with their months, and yearly averages. ' +
      'Default the last 24 published months.',
    inputSchema: {
      item: ITEM,
      region: REGION,
      from: z.string().optional().describe('First month, YYYY-MM or a year. Default 23 months before to.'),
      to: z.string().optional().describe('Last month, YYYY-MM or a year. Default the latest published month.'),
    },
    annotations: { title: 'Grocery price history', ...RO },
  }, wrap((a: any) => groceryPriceHistory(fetchText, a)));

  server.registerTool('grocery_prices_compare', {
    title: 'Compare grocery prices',
    description:
      'Several items side by side from BLS average price data: the latest monthly price and unit, the change from last month and from a year ago, the biggest 12-month increases and decreases, and any item at a record high. ' +
      'Without items it uses an everyday basket (eggs, milk, bread, ground beef, chicken breast, bacon, coffee, butter, cheddar, bananas, sugar, rice).',
    inputSchema: {
      items: z.array(z.string()).max(31).optional().describe('Items to compare (ids or plain words). Default the everyday basket.'),
      region: z.string().optional().describe('us (default), northeast, midwest, south, west, or a state (its census region).'),
      sort: z.enum(['basket', 'change', 'price', 'name']).optional().describe('Order: basket (as given, default), change (largest 12-month increase first), price or name.'),
    },
    annotations: { title: 'Compare grocery prices', ...RO },
  }, wrap((a: any) => groceryPricesCompare(fetchText, a)));

  server.registerTool('grocery_price_items', {
    title: 'Grocery price items',
    description:
      'The 31 items this server tracks (foods, drinks, gasoline, diesel, electricity, natural gas) with their BLS names, units, plain-word aliases, categories and FRED series ids, and the four census regions.',
    inputSchema: {
      category: z.string().optional().describe('Filter: dairy and eggs, meat, bakery and cereals, beverages, other foods, fruits and vegetables, energy.'),
    },
    annotations: { title: 'Grocery price items', ...RO },
  }, wrap((a: any) => groceryPriceItems(a ?? {})));

  return server;
}
