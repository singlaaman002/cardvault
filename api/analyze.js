// api/analyze.js — Analyzes up to 5 card images in one Claude call
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { images } = req.body; // array of { base64, mediaType }
    if (!images?.length) return res.status(400).json({ error: 'No images provided' });

    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API key not configured' });

    // Build content with all images (up to 5 per batch)
    const batch = images.slice(0, 5);
    const content = [];

    batch.forEach((img, i) => {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: img.mediaType || 'image/jpeg', data: img.base64 }
      });
      content.push({ type: 'text', text: `[Card ${i}]` });
    });

    content.push({
      type: 'text',
      text: `You are a sports card expert. Analyze each card image above labeled [Card 0] through [Card ${batch.length - 1}].

If any card is inside a graded slab (BGS/Beckett, PSA, CGC, SGC): read the label at top for year/brand/series/number/player and grade.

Respond ONLY with a valid JSON array, one object per card, no markdown:
[
  {
    "cardIndex": 0,
    "sport": "soccer"|"basketball"|"baseball"|"unknown",
    "player": string|null,
    "team": string|null,
    "year": string|null,
    "brand": string|null,
    "series": string|null,
    "cardNumber": string|null,
    "graded": boolean,
    "gradingCompany": string|null,
    "grade": string|null,
    "condition": string|null,
    "rookieCard": boolean,
    "autograph": boolean,
    "numbered": string|null,
    "notes": string|null
  }
]`
    });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        messages: [{ role: 'user', content }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || 'Anthropic API error', status: response.status });
    }

    const data = await response.json();
    const text = (data.content || []).map(b => b.text || '').join('');
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return res.status(500).json({ error: 'No JSON array in response', raw: text.slice(0, 200) });

    const results = JSON.parse(match[0]);
    return res.status(200).json({ results });

  } catch (e) {
    console.error('analyze error:', e);
    return res.status(500).json({ error: e.message });
  }
}
