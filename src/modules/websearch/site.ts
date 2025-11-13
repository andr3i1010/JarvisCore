import * as https from 'https';
import { toolCallResponse } from '../../types';

export const WebSiteModule = {
  name: "websearch.site",
  description: "Fetch content from a URL",
  payload: {
    url: "The URL to fetch content from"
  },
  async execute(payload: { url: string }): Promise<toolCallResponse> {
    const url = payload.url;

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

      return { ok: true, payload: { content } };
    } catch (error) {
      console.error('Error fetching site content:', error);
      return { ok: false, output: (error as Error).message };
    }
  }
}
