const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com';

export interface GeminiProxyRequest {
  path: string;
  method: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
}

export interface GeminiProxyResult {
  response: Response;
  usedFallback: boolean;
}

const isFallbackStatus = (status: number): boolean => status === 429 || status >= 500;

const buildGeminiUrl = (path: string, apiKey: string): string => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(`${GEMINI_BASE_URL}${normalizedPath}`);
  url.searchParams.set('key', apiKey);
  return url.toString();
};

const callGemini = async (apiKey: string, request: GeminiProxyRequest): Promise<Response> => {
  return fetch(buildGeminiUrl(request.path, apiKey), {
    method: request.method,
    headers: request.headers,
    body: request.body
  });
};

export const callGeminiWithFallback = async (request: GeminiProxyRequest): Promise<GeminiProxyResult> => {
  const apiKey = process.env.GEMINI_API_KEY;
  const fallbackKey = process.env.GEMINI_API_KEY_FALLBACK;

  if (!apiKey) {
    throw new Error('Missing GEMINI_API_KEY server secret.');
  }

  let primaryResponse = await callGemini(apiKey, request);
  if (primaryResponse.ok || !fallbackKey || !isFallbackStatus(primaryResponse.status)) {
    return {
      response: primaryResponse,
      usedFallback: false
    };
  }

  const fallbackResponse = await callGemini(fallbackKey, request);
  return {
    response: fallbackResponse,
    usedFallback: true
  };
};
