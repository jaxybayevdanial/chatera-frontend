/**
 * Proxy-сервер для картинок Instagram.
 * Обходит CORS: клиент запрашивает /api/proxy-image?url=..., сервер качает картинку и отдаёт.
 */

const express = require('express');
const app = express();
const PORT = process.env.PORT || 3001;

// Разрешаем запросы с web-клиента (любой origin в dev)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
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
    res.setHeader('Cache-Control', 'public, max-age=86400'); // кэш 1 день
    res.send(buffer);
  } catch (err) {
    console.error('Proxy error:', err.message);
    res.status(502).send('Proxy error');
  }
});

app.listen(PORT, () => {
  console.log(`Image proxy: http://localhost:${PORT}/api/proxy-image?url=...`);
});
