const DEFAULT_USER_AGENT = "LaborLens/0.1 (+https://github.com/Inika-Goyal/UncommonHacks)";

export class HttpError extends Error {
  code = "HTTP_ERROR";

  constructor(
    public readonly status: number,
    public readonly url: string,
    public readonly bodySnippet: string,
  ) {
    super(`HTTP ${status} from ${url}: ${bodySnippet.slice(0, 200)}`);
    this.name = "HttpError";
  }
}

export type FetchOptions = {
  timeoutMs?: number;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: string;
};

export async function httpFetch(url: string, options: FetchOptions = {}): Promise<Response> {
  const { timeoutMs = 15_000, headers = {}, method = "GET", body } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method,
      body,
      signal: controller.signal,
      headers: {
        "User-Agent": DEFAULT_USER_AGENT,
        Accept: "application/json,text/plain,text/html;q=0.9,*/*;q=0.5",
        ...headers,
      },
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new HttpError(response.status, url, text);
    }

    return response;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const response = await httpFetch(url, options);
  return (await response.json()) as T;
}

export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const response = await httpFetch(url, options);
  return response.text();
}
