import * as https from 'https';
import * as cheerio from 'cheerio';
import { ToolCallResponse } from '../../types';

export const WebSearchModule = {
  name: "websearch.search",
  description: "Search using DuckDuckGo",
  payload: {
    query: "The search query string. Would recommend in the result to also fetch the websites using your websearch.site tool."
  },
  async execute(payload: { query: string }): Promise<ToolCallResponse> {
    const query = payload.query;
    const url = `https://html.duckduckgo.com/html?q=${encodeURIComponent(query)}`;

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

      return { ok: true, payload: { results } };
    } catch (error) {
      console.error('Error fetching or parsing search results:', error);
      return { ok: false, output: (error as Error).message };
    }
  }
}