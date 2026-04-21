// api/comps.js — Fetches live eBay/Fanatics comps using Claude web search
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { cardInfo } = req.body;
    const { player, year, brand, series, graded, gradingCompany, grade, autograph, numbered } = cardInfo || {};
    if (!player) return res.status(400).json({ error: 'player required' });

    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API key not configured' });

    const gradeStr  = graded && gradingCompany && grade ? `${gradingCompany} ${grade}` : '';
    const autoStr   = autograph ? 'autograph' : '';
    const baseQuery = [year, brand, series, player, gradeStr, autoStr, numbered].filter(Boolean).join(' ').trim();

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 2500,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        messages: [{
          role: 'user',
          content: `You are a sports card pricing expert. Find REAL recent sold prices for: ${baseQuery}

Search eBay completed/sold listings AND Fanatics for current prices. Extract actual transaction prices only.

Respond ONLY with valid JSON:
{
  "comps": [{"label":"description","price":number,"source":"eBay"|"Fanatics"|"Other","date":"YYYY-MM-DD or null","url":"url or null"}],
  "marketValue": number|null,
  "summary": "1-2 sentence pricing summary",
  "history": [{"period":"30d"|"90d"|"365d","avgPrice":number|null,"minPrice":number|null,"maxPrice":number|null,"salesCount":number|null}]
}`
        }]
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return res.status(response.status).json({ error: err.error?.message || 'API error' });
    }

    const data = await response.json();
    const textBlocks = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    const match = textBlocks.match(/\{[\s\S]*\}/);
    if (!match) return res.status(200).json({ comps: [], marketValue: null, sources: [], summary: '', history: [] });

    const result = JSON.parse(match[0]);
    return res.status(200).json({
      comps: (result.comps || []).slice(0, 6),
      marketValue: result.marketValue || null,
      summary: result.summary || '',
      history: result.history || [],
      sources: [...new Set((result.comps || []).map(c => c.source))]
    });

  } catch (e) {
    console.error('comps error:', e);
    return res.status(500).json({ error: e.message });
  }
}
