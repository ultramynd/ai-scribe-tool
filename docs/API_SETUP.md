# API Setup Guide

This project supports two runtime modes for Gemini.

## Mode 1: Local Fast Mode (Direct API Key)
Use this for quick local debugging only.

1. Create `.env.local`.
2. Set:

```bash
VITE_GEMINI_USE_PROXY=false
VITE_GEMINI_API_KEY=your_ai_studio_key
VITE_GEMINI_API_KEY_FALLBACK=optional_backup_key
```

3. Run `npm run dev`.

Notes:
- The Gemini key is exposed to the browser in this mode.
- Do not use this mode for production.

## Mode 2: Hosted Secure Mode (Proxy-Only)
Use this for Vercel production/staging.

1. Configure server env vars (Vercel Project Settings):

```bash
GEMINI_API_KEY=primary_server_key
GEMINI_API_KEY_FALLBACK=optional_backup_server_key
APP_ORIGIN=https://yourapp.com,https://staging.yourapp.com
RATE_LIMIT_PREFIX=scrybe
RATE_LIMIT_GEMINI_MAX=30
RATE_LIMIT_GEMINI_WINDOW_SECONDS=60
RATE_LIMIT_UPLOAD_MAX=30
RATE_LIMIT_UPLOAD_WINDOW_SECONDS=60
RATE_LIMIT_POLL_MAX=60
RATE_LIMIT_POLL_WINDOW_SECONDS=60
MAX_GEMINI_PAYLOAD_BYTES=31457280
MAX_UPLOAD_SIZE_BYTES=2147483648
ERROR_ALERT_THRESHOLD=5
```

2. Configure optional distributed rate limiting (Upstash Redis-compatible REST):

```bash
REDIS_URL=https://<your-upstash-endpoint>
REDIS_TOKEN=<your-upstash-token>
```

3. Configure client env vars:

```bash
VITE_GEMINI_USE_PROXY=true
VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id
```

4. Deploy. Frontend calls `/api/gemini`, `/api/gemini-upload-init`, and `/api/gemini-poll`.

## Health Endpoint
Check API readiness:

```bash
GET /api/health
```

Returns status, timestamp, request id, and whether key dependencies are configured.

## Google Drive Setup Checklist
Drive access requires Google Cloud OAuth setup (separate from Gemini API key setup).

1. Create or select a Google Cloud project.
2. Enable Google Drive API.
3. Configure OAuth consent screen.
4. Create OAuth Client ID (Web application).
5. Add authorized JavaScript origins:
   - `http://localhost:3000`
   - `https://yourapp.com`
6. Set `VITE_GOOGLE_CLIENT_ID` in client env.

If `VITE_GOOGLE_CLIENT_ID` is missing, Drive actions are disabled gracefully.

## Operational Alerts
API handlers log structured JSON events and emit warning logs when 429 or 5xx responses are sustained within a 5-minute window. Tune threshold with `ERROR_ALERT_THRESHOLD`.
