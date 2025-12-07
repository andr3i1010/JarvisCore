import { ok } from "assert";
import { ModuleObject } from "../types";

export const HttpTool: ModuleObject = {
  name: "http",
  description: "Perform HTTP requests to fetch data from the web.",
  payload: {
    method: 'The HTTP method to use (e.g., GET, POST, PUT, DELETE).',
    url: 'The URL to send the HTTP request to.',
    headers: 'An object representing the HTTP headers to include in the request.',
    body: 'The body of the HTTP request, typically used with POST or PUT methods.',
  },
  execute: async (payload: Record<string, any>) => {
    const { method, url, headers, body } = payload;
    const resp = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
    return {
      ok: true,
      payload: {
        status: resp.status,
        response_headers: Object.fromEntries(resp.headers.entries()),
        content_type: resp.headers.get('content-type'),
        response_body: await resp.text(),
      }
    }
  }
}