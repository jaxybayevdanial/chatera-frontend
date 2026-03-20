/**
 * Dev proxy для web:
 * 1) /api/proxy-image?url=... (как раньше)
 * 2) /api/* -> backend (по умолчанию прод) с прокидкой Cookie/Set-Cookie
 */
const express = require('express');

const app = express();
const PORT = Number(process.env.PORT || 3002);
const BACKEND_ORIGIN = String(process.env.BACKEND_ORIGIN || 'https://app.chatera.ai').replace(
  /\/+$/,
  '',
);

// Берём тело как raw для любых content-type и методов.
app.use(express.raw({ type: '*/*', limit: '10mb' }));

function setCors(req, res) {
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    );
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
}

app.use((req, res, next) => {
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  return next();
});

app.get('/api/proxy-image', async (req, res) => {
  const url = req.query.url;
  if (!url || typeof url !== 'string') {
    return res.status(400).send('Missing url query');
  }
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ChateraProxy/1.0)',
      },
    });
    if (!response.ok) {
      return res.status(response.status).send('Upstream error');
    }
    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(buffer);
  } catch (err) {
    console.error('Image proxy error:', err?.message || err);
    return res.status(502).send('Proxy error');
  }
});

app.use('/api', async (req, res) => {
  try {
    const upstreamUrl = `${BACKEND_ORIGIN}${req.originalUrl}`;
    const headers = {
      Accept: req.headers.accept || 'application/json',
    };

    if (req.headers['content-type']) {
      headers['Content-Type'] = req.headers['content-type'];
    }
    if (req.headers.cookie) {
      headers.Cookie = req.headers.cookie;
    }
    if (req.headers.authorization) {
      headers.Authorization = req.headers.authorization;
    }

    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const body = hasBody && req.body && req.body.length ? req.body : undefined;

    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body,
      redirect: 'manual',
    });

    const setCookie = upstream.headers.getSetCookie?.() || [];
    if (setCookie.length > 0) {
      res.setHeader('Set-Cookie', setCookie);
    }

    const contentType = upstream.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }
    res.status(upstream.status);

    const buffer = Buffer.from(await upstream.arrayBuffer());
    return res.send(buffer);
  } catch (err) {
    console.error('API proxy error:', err?.message || err);
    return res.status(502).json({ success: false, message: 'Proxy error' });
  }
});

app.listen(PORT, () => {
  console.log(`Proxy server started on http://localhost:${PORT}`);
  console.log(`API proxy:   http://localhost:${PORT}/api/* -> ${BACKEND_ORIGIN}/api/*`);
  console.log(`Image proxy: http://localhost:${PORT}/api/proxy-image?url=...`);
});
