import { ToolCallResponse } from '../../types';
import { TTLCache } from '../../util/cache';

const SITE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const siteCache = new TTLCache<string, ToolCallResponse>(SITE_CACHE_TTL_MS);

export const WebSiteModule = {
  name: "websearch.site",
  description: "Fetch content from a URL",
  payload: {
    url: "The URL to fetch content from"
  },
  async execute(payload: { url: string }): Promise<ToolCallResponse> {
    const rawUrl = payload.url?.trim();
    if (!rawUrl) {
      return { ok: false, output: "URL must be a non-empty string" };
    }

    const cacheKey = rawUrl.toLowerCase();
    const cached = siteCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const url = rawUrl;

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
      const content = await response.text();
      const responsePayload: ToolCallResponse = { ok: true, payload: { content } };
      siteCache.set(cacheKey, responsePayload);

      return responsePayload;
    } catch (error) {
      console.error('Error fetching site content:', error);
      return { ok: false, output: (error as Error).message };
    }
  }
}
