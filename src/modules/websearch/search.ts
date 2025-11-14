import * as cheerio from 'cheerio';
import { ToolCallResponse } from '../../types';
import { TTLCache } from '../../util/cache';

const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const searchCache = new TTLCache<string, ToolCallResponse>(SEARCH_CACHE_TTL_MS);

export const WebSearchModule = {
  name: "websearch.search",
  description: "Search using DuckDuckGo. Recommended to keep queries concise, and use websearch.site on the provided sites to gain more context/knowledge.",
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
        const title = $(el).find('.result__title a').text().trim();
        const link = $(el).find('.result__url').text().trim();
        const snippet = $(el).find('.result__snippet').text().trim();
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