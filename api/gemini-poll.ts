const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 60;

const rateLimits = new Map<string, { count: number; resetAt: number }>();

const getClientIp = (req: any) => {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || 'unknown';
};

const isRateLimited = (ip: string) => {
  const now = Date.now();
  const record = rateLimits.get(ip);
  if (!record || now > record.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  record.count += 1;
  return record.count > RATE_LIMIT_MAX;
};

const parseBody = (body: any) => {
  if (!body) return null;
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  return body;
};

const pollFile = async (apiKey: string, fileName: string) => {
  const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`;
  return fetch(pollUrl, { method: 'GET' });
};

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = parseBody(req.body);
  const fileName = body?.fileName;

  if (!fileName) {
    res.status(400).json({ error: 'Missing fileName.' });
    return;
  }

  const ip = getClientIp(req);
  if (isRateLimited(ip)) {
    res.status(429).json({ error: 'Rate limit exceeded.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const fallbackKey = process.env.GEMINI_API_KEY_FALLBACK;

  if (!apiKey) {
    res.status(500).json({ error: 'Missing GEMINI_API_KEY server secret.' });
    return;
  }

  try {
    let response = await pollFile(apiKey, fileName);

    if (!response.ok && fallbackKey && (response.status === 429 || response.status >= 500)) {
      response = await pollFile(fallbackKey, fileName);
    }

    const text = await response.text();
    res.status(response.status).send(text);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || 'Polling failed.' });
  }
}
