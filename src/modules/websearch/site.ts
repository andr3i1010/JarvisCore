import * as cheerio from 'cheerio';
import { ToolCallResponse } from '../../types';
import { TTLCache } from '../../util/cache';

const SITE_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CONTENT_CHARS = 20000;
const MAX_HTML_CHARS = 8000;
const ELLIPSIS = "…";
const siteCache = new TTLCache<string, ToolCallResponse>(SITE_CACHE_TTL_MS);

function truncate(value: string, maxLength: number): string {
  if (!value) return value;
  if (maxLength <= 0) return "";
  if (value.length <= maxLength) return value;
  if (maxLength === 1) return value.slice(0, 1);
  return value.slice(0, maxLength - 1) + ELLIPSIS;
}

export const WebSiteModule = {
  name: "websearch.site",
  description: "Fetch page content from a URL (truncated to avoid token limits). Use https:// prefix. MUST be called after websearch.search to get actual page content - do not skip this step! Output ONLY the JSON, no text before it. You are allowed to use this tool independently, without websearch.search, if you have a specific URL to fetch. Returns the page title, truncated text content, truncated HTML, and indicators if truncation occurred.",
  payload: {
    url: "The full URL to fetch (e.g. https://example.com)"
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
      const html = await response.text();
      const $ = cheerio.load(html);

      $('script, style, noscript').remove();
      const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
      const title = $('head > title').text().trim();

      const contentSource = bodyText || html;
      const content = truncate(contentSource, MAX_CONTENT_CHARS);
      const htmlLimited = truncate(html, MAX_HTML_CHARS);
      const truncated = content.length < contentSource.length || htmlLimited.length < html.length;
      const responsePayload: ToolCallResponse = {
        ok: true,
        payload: {
          content,
          title,
          html: htmlLimited,
          truncated,
          contentLength: contentSource.length,
          htmlLength: html.length,
        },
      };
      siteCache.set(cacheKey, responsePayload);

      return responsePayload;
    } catch (error) {
      console.error('Error fetching site content:', error);
      return { ok: false, output: (error as Error).message };
    }
  }
}
