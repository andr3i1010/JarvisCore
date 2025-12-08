import * as cheerio from 'cheerio';
import { ToolCallResponse } from '../../types';
import { TTLCache } from '../../util/cache';

const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RESULTS = 5;
const MAX_SNIPPET_LENGTH = 320;
const MAX_TITLE_LENGTH = 200;
const MAX_LINK_LENGTH = 300;
const searchCache = new TTLCache<string, ToolCallResponse>(SEARCH_CACHE_TTL_MS);

const ELLIPSIS = "…";

function truncate(value: string, maxLength: number): string {
  if (!value) return value;
  if (maxLength <= 0) return "";
  if (value.length <= maxLength) return value;
  if (maxLength === 1) return value.slice(0, 1);
  return value.slice(0, maxLength - 1) + ELLIPSIS;
}

export const WebSearchModule = {
  name: "websearch.search",
  description: `Search DuckDuckGo. Returns up to ${MAX_RESULTS} URLs with truncated titles/snippets to keep tokens low.

**REQUIRED WORKFLOW:**
1. Call websearch.search → get URLs/snippets
2. Call websearch.site on multiple URL's (if applicable, if too few or no URL's search differently if possible, or fetch the only site. if there is absolutely nothing then report back to the user that nothing has been found about it.) → get full page content (REQUIRED!)
3. Only THEN explain results to user

Example:
User: "What is PolarLearn?"
Step 1: {"cmd":"websearch.search","payload":{"query":"PolarLearn"}}
Step 2 (after results): {"cmd":"websearch.site","payload":{"url":"https://polarlearn.nl"}}
Step 3 (after page content): Explain to user

NEVER skip step 2. NEVER add text before step 2's JSON.`,
  payload: {
    query: "The search query string."
  },
  async execute(payload: { query: string }): Promise<ToolCallResponse> {
    const rawQuery = payload.query?.trim();
    if (!rawQuery) {
      return { ok: false, output: "Query must be a non-empty string" };
    }

    const cacheKey = rawQuery.toLowerCase();
    const cached = searchCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const url = `https://html.duckduckgo.com/html?q=${encodeURIComponent(rawQuery)}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();

      const $ = cheerio.load(html);
      const results: { title: string; link: string; snippet: string }[] = [];

      $('.result__body').each((i, el) => {
        if (results.length >= MAX_RESULTS) return false;

        const titleRaw = $(el).find('.result__title a').text().trim();
        const linkRaw = $(el).find('.result__url').text().trim();
        const snippetRaw = $(el).find('.result__snippet').text().trim();

        const title = truncate(titleRaw, MAX_TITLE_LENGTH);
        const link = truncate(linkRaw, MAX_LINK_LENGTH);
        const snippet = truncate(snippetRaw, MAX_SNIPPET_LENGTH);

        if (title && link) {
          results.push({ title, link, snippet });
        }
      });

      const responsePayload: ToolCallResponse = { ok: true, payload: { results } };
      searchCache.set(cacheKey, responsePayload);
      return responsePayload;
    } catch (error) {
      console.error('Error fetching or parsing search results:', error);
      return { ok: false, output: (error as Error).message };
    }
  }
}