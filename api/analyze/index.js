const fetch = require('node-fetch');
const FormData = require('form-data');

const API_KEY    = 'acc_5605ea1d260dffa';
const API_SECRET = '468ebc22aa432815a2e6e95c127d6976';
const AUTH       = 'Basic ' + Buffer.from(`${API_KEY}:${API_SECRET}`).toString('base64');

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

module.exports = async function (context, req) {
  // Handle preflight
  if (req.method === 'OPTIONS') {
    context.res = { status: 204, headers: CORS, body: '' };
    return;
  }

  try {
    // req.body is a Buffer when rawBody is enabled, otherwise use req.rawBody
    const imageBuffer = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(req.rawBody || req.body || '', 'binary');

    const contentType = req.headers['content-type'] || 'image/jpeg';

    if (!imageBuffer || imageBuffer.length === 0) {
      context.res = {
        status: 400, headers: CORS,
        body: JSON.stringify({ error: 'No image data received.' })
      };
      return;
    }

    context.log(`Image received: ${imageBuffer.length} bytes, type: ${contentType}`);

    // Build two FormData payloads (can't reuse same stream)
    const makeForm = () => {
      const fd = new FormData();
      fd.append('image', imageBuffer, {
        filename: 'upload.jpg',
        contentType: contentType,
        knownLength: imageBuffer.length
      });
      return fd;
    };

    const form1 = makeForm();
    const form2 = makeForm();

    // Fire both requests in parallel
    const [tagsRes, colorsRes] = await Promise.all([
      fetch('https://api.imagga.com/v2/tags', {
        method: 'POST',
        headers: { Authorization: AUTH, ...form1.getHeaders() },
        body: form1
      }),
      fetch('https://api.imagga.com/v2/colors', {
        method: 'POST',
        headers: { Authorization: AUTH, ...form2.getHeaders() },
        body: form2
      })
    ]);

    if (!tagsRes.ok) {
      const errText = await tagsRes.text();
      context.log.error('Imagga tags error:', tagsRes.status, errText);
      context.res = {
        status: tagsRes.status, headers: CORS,
        body: JSON.stringify({ error: `Imagga API error ${tagsRes.status}: ${errText}` })
      };
      return;
    }

    const tagsData   = await tagsRes.json();
    const colorsData = colorsRes.ok ? await colorsRes.json() : null;

    context.log(`Tags returned: ${tagsData?.result?.tags?.length ?? 0}`);

    context.res = {
      status: 200, headers: CORS,
      body: JSON.stringify({ tags: tagsData, colors: colorsData })
    };

  } catch (err) {
    context.log.error('Proxy error:', err.message);
    context.res = {
      status: 500, headers: CORS,
      body: JSON.stringify({ error: 'Internal server error: ' + err.message })
    };
  }
};
