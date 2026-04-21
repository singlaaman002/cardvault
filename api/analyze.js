// api/analyze.js — One card per request, proper rate limit handling
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { image, cardIndex } = req.body; // Single image per request
    if (!image?.base64) return res.status(400).json({ error: 'No image provided' });

    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

    console.log(`Analyzing card ${cardIndex}, image size: ${image.base64.length}`);

    // Retry loop with exponential backoff
    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt > 0) {
        const wait = attempt * 15000; // 15s, 30s, 45s, 60s
        console.log(`Retry attempt ${attempt}, waiting ${wait/1000}s...`);
        await new Promise(r => setTimeout(r, wait));
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5',
          max_tokens: 800,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: image.mediaType || 'image/jpeg',
                  data: image.base64
                }
              },
              {
                type: 'text',
                text: `Sports card expert. Analyze this card. If in a graded slab read the label.
Respond ONLY with JSON:
{"cardIndex":${cardIndex || 0},"sport":"soccer"|"basketball"|"baseball"|"unknown","player":string|null,"team":string|null,"year":string|null,"brand":string|null,"series":string|null,"cardNumber":string|null,"graded":boolean,"gradingCompany":string|null,"grade":string|null,"condition":string|null,"rookieCard":boolean,"autograph":boolean,"numbered":string|null,"notes":string|null}`
              }
            ]
          }]
        })
      });

      // Rate limited — retry
      if (response.status === 429) {
        const retryAfter = response.headers.get('retry-after');
        const wait = retryAfter ? parseInt(retryAfter) * 1000 : 20000;
        console.log(`Rate limited, retry-after: ${wait/1000}s`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      // Other error
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error(`API error ${response.status}:`, JSON.stringify(err));
        if (attempt === 4) return res.status(response.status).json({ error: `API error: ${response.status}`, details: err });
        continue;
      }

      const data = await response.json();
      const text = (data.content || []).map(b => b.text || '').join('');
      const match = text.match(/\{[\s\S]*\}/);

      if (!match) {
        console.error('No JSON in response:', text.slice(0, 300));
        if (attempt === 4) return res.status(500).json({ error: 'No JSON in response' });
        continue;
      }

      const result = JSON.parse(match[0]);
      console.log(`Card ${cardIndex} identified as: ${result.player || 'unknown'}`);
      return res.status(200).json({ result });
    }

    return res.status(500).json({ error: 'Failed after all retries' });

  } catch (e) {
    console.error('Handler error:', e.message);
    return res.status(500).json({ error: e.message });
  }
}
