// api/duplicate.js — Check if uploaded card is a duplicate
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { base64, mediaType, existingCards } = req.body;
    if (!base64 || !existingCards?.length) return res.status(200).json({ isDuplicate: false });

    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API key not configured' });

    const existing = existingCards
      .slice(0, 20) // limit to 20 to keep prompt small
      .map((c, i) => `[${i}] ${[c.player, c.year, c.brand, c.series, c.cardNumber, c.graded ? `${c.gradingCompany} ${c.grade}` : ''].filter(Boolean).join(' ')}`)
      .join('\n');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: base64 } },
            { type: 'text', text: `Does this card exactly match any card in this list? Check player, year, brand, series, card number, grade.\n\nExisting cards:\n${existing}\n\nRespond ONLY with JSON: {"isDuplicate":boolean,"matchIndex":number|null,"confidence":"high"|"medium"|"low","reason":"brief reason"}` }
          ]
        }]
      })
    });

    if (!response.ok) return res.status(200).json({ isDuplicate: false });
    const data = await response.json();
    const text = (data.content || []).map(b => b.text || '').join('');
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return res.status(200).json({ isDuplicate: false });
    return res.status(200).json(JSON.parse(match[0]));

  } catch (e) {
    return res.status(200).json({ isDuplicate: false });
  }
}
