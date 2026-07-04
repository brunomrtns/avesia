#!/usr/bin/env node
/**
 * AI Gateway — failover proxy
 *
 * Listens on port 11435 and routes OpenAI-compatible requests:
 *   - Chat completions → Ollama (if healthy) → fallback NVIDIA NIM
 *   - Embeddings       → always NVIDIA NIM (dimension compatibility)
 *
 * Health checks Ollama every 10s. If Ollama is down, all chat requests
 * go to NVIDIA NIM transparently.
 *
 * Env vars:
 *   GATEWAY_PORT      (default 11435)
 *   OLLAMA_URL        (default http://127.0.0.1:11434)
 *   NVIDIA_NIM_URL    (default https://integrate.api.nvidia.com/v1)
 *   NVIDIA_NIM_KEY    (required — NIM API key)
 *   HEALTH_INTERVAL   (default 10000, in ms)
 */

const http = require('http');
const https = require('https');

const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT || '11435', 10);
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const NVIDIA_NIM_URL = process.env.NVIDIA_NIM_URL || 'https://integrate.api.nvidia.com/v1';
const NVIDIA_NIM_KEY = process.env.NVIDIA_NIM_KEY || '';
const HEALTH_INTERVAL = parseInt(process.env.HEALTH_INTERVAL || '10000', 10);

let ollamaHealthy = false;
let lastCheckTime = 0;

// ── Health check ───────────────────────────────────────────────────────────
async function checkOllama() {
  try {
    const url = new URL(OLLAMA_URL + '/api/tags');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    const wasHealthy = ollamaHealthy;
    ollamaHealthy = res.ok;
    if (wasHealthy !== ollamaHealthy) {
      console.log(`[${new Date().toISOString()}] Ollama ${ollamaHealthy ? 'ONLINE ✓' : 'OFFLINE ✗'} — routing chat to ${ollamaHealthy ? 'Ollama (local)' : 'NVIDIA NIM (cloud)'}`);
    }
  } catch {
    if (ollamaHealthy) {
      console.log(`[${new Date().toISOString()}] Ollama OFFLINE ✗ — routing chat to NVIDIA NIM (cloud)`);
    }
    ollamaHealthy = false;
  }
  lastCheckTime = Date.now();
}

setInterval(checkOllama, HEALTH_INTERVAL);
checkOllama();

// ── Proxy helper ────────────────────────────────────────────────────────────
function proxyRequest(targetUrl, headers, body, res) {
  const url = new URL(targetUrl);
  const isHttps = url.protocol === 'https:';
  const mod = isHttps ? https : http;

  const proxyHeaders = { ...headers };
  delete proxyHeaders['host'];
  delete proxyHeaders['content-length'];
  proxyHeaders['host'] = url.host;

  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname + url.search,
    method: 'POST',
    headers: proxyHeaders,
  };

  const proxyReq = mod.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error(`[${new Date().toISOString()}] Proxy error to ${targetUrl}:`, err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Gateway proxy error', detail: err.message } }));
    }
  });

  proxyReq.write(body);
  proxyReq.end();
}

// ── GET proxy helper (for /models endpoint) ─────────────────────────────────
function proxyGet(targetUrl, headers, res) {
  const url = new URL(targetUrl);
  const isHttps = url.protocol === 'https:';
  const mod = isHttps ? https : http;

  const proxyHeaders = { ...headers };
  delete proxyHeaders['host'];
  proxyHeaders['host'] = url.host;

  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname + url.search,
    method: 'GET',
    headers: proxyHeaders,
  };

  const proxyReq = mod.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Gateway proxy error', detail: err.message } }));
    }
  });

  proxyReq.end();
}

// ── HTTP server ─────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const url = req.url || '';

  // ── GET /v1/models → proxy to Ollama or NIM ─────────────────────────────
  if (req.method === 'GET' && url.includes('/models')) {
    const cleanUrl = url.replace(/^\/v1/, '');
    if (ollamaHealthy) {
      proxyGet(OLLAMA_URL + '/v1/models', {}, res);
    } else {
      proxyGet(NVIDIA_NIM_URL + '/models', { 'authorization': `Bearer ${NVIDIA_NIM_KEY}` }, res);
    }
    return;
  }

  // Only accept POST for other endpoints
  if (req.method !== 'POST') {
    res.writeHead(405, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'Method not allowed' } }));
    return;
  }

  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {

    // ── Embeddings → always NVIDIA NIM ───────────────────────────────────
    if (url.includes('/embeddings')) {
      if (!NVIDIA_NIM_KEY) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'NVIDIA_NIM_KEY not set' } }));
        return;
      }
      const headers = {
        'content-type': 'application/json',
        'authorization': `Bearer ${NVIDIA_NIM_KEY}`,
      };
      proxyRequest(NVIDIA_NIM_URL + url, headers, body, res);
      return;
    }

    // ── Chat completions → Ollama if healthy, else NIM ──────────────────
    if (url.includes('/chat/completions') || url.includes('/completions')) {
      // Normalize path: strip /v1 prefix if present (Ollama has /v1 built-in)
      const cleanUrl = url.replace(/^\/v1/, '');
      if (ollamaHealthy) {
        const headers = { 'content-type': 'application/json' };
        proxyRequest(OLLAMA_URL + '/v1' + cleanUrl, headers, body, res);
      } else {
        if (!NVIDIA_NIM_KEY) {
          res.writeHead(500, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: { message: 'NVIDIA_NIM_KEY not set and Ollama offline' } }));
          return;
        }
        const headers = {
          'content-type': 'application/json',
          'authorization': `Bearer ${NVIDIA_NIM_KEY}`,
        };
        proxyRequest(NVIDIA_NIM_URL + cleanUrl, headers, body, res);
      }
      return;
    }

    // ── Models endpoint → return Ollama models if available ─────────────
    if (url.includes('/models') && req.method === 'GET') {
      if (ollamaHealthy) {
        proxyRequest(OLLAMA_URL + '/v1/models', {}, '', res);
      } else {
        const headers = { 'authorization': `Bearer ${NVIDIA_NIM_KEY}` };
        proxyRequest(NVIDIA_NIM_URL + '/models', headers, '', res);
      }
      return;
    }

    // ── Unknown endpoint ────────────────────────────────────────────────
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: `Unknown endpoint: ${url}` } }));
  });
});

server.listen(GATEWAY_PORT, '0.0.0.0', () => {
  console.log(`[${new Date().toISOString()}] AI Gateway listening on http://127.0.0.1:${GATEWAY_PORT}`);
  console.log(`  Ollama:    ${OLLAMA_URL}`);
  console.log(`  NIM:       ${NVIDIA_NIM_URL}`);
  console.log(`  Strategy:  chat → Ollama (if healthy) → NIM fallback`);
  console.log(`  Embeddings → always NIM (dim compatibility)`);
});
