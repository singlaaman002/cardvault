// api/analyze.js — Analyzes up to 5 card images in one Claude call
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { images } = req.body;
    if (!images?.length) return res.status(400).json({ error: 'No images provided' });

    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set in environment variables' });

    // Process one card at a time to avoid size limits and rate limits
    const batch = images.slice(0, 5);
    const results = [];

    for (let i = 0; i < batch.length; i++) {
      const img = batch[i];
      
      // Validate base64
      if (!img.base64 || img.base64.length < 100) {
        results.push({ cardIndex: i, sport: 'unknown', player: null, error: 'Invalid image data' });
        continue;
      }

      // Log image size for debugging
      console.log(`Card ${i}: base64 length = ${img.base64.length}, mediaType = ${img.mediaType}`);

      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-5',
            max_tokens: 1000,
            messages: [{
              role: 'user',
              content: [
                {
                  type: 'image',
                  source: { type: 'base64', media_type: img.mediaType || 'image/jpeg', data: img.base64 }
                },
                {
                  type: 'text',
                  text: `You are a sports card expert. Analyze this card image carefully.
If inside a graded slab (BGS/Beckett, PSA, CGC, SGC): read the label at top for year/brand/series/number/player and grade.
Respond ONLY with valid JSON, no markdown:
{
  "cardIndex": ${i},
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
}`
                }
              ]
            }]
          })
        });

        if (!response.ok) {
          const errBody = await response.json().catch(() => ({}));
          console.error(`Card ${i} API error:`, response.status, JSON.stringify(errBody));
          
          // Rate limit — wait and retry once
          if (response.status === 429) {
            console.log('Rate limited, waiting 15s...');
            await new Promise(r => setTimeout(r, 15000));
            // retry
            const retry = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
              body: JSON.stringify({
                model: 'claude-sonnet-4-5', max_tokens: 1000,
                messages: [{ role: 'user', content: [
                  { type: 'image', source: { type: 'base64', media_type: img.mediaType || 'image/jpeg', data: img.base64 } },
                  { type: 'text', text: `Analyze this sports card. Respond ONLY with JSON: {"cardIndex":${i},"sport":"soccer"|"basketball"|"baseball"|"unknown","player":string|null,"team":string|null,"year":string|null,"brand":string|null,"series":string|null,"cardNumber":string|null,"graded":boolean,"gradingCompany":string|null,"grade":string|null,"condition":string|null,"rookieCard":boolean,"autograph":boolean,"numbered":string|null,"notes":string|null}` }
                ]}]
              })
            });
            if (retry.ok) {
              const retryData = await retry.json();
              const retryText = (retryData.content || []).map(b => b.text || '').join('');
              const retryMatch = retryText.match(/\{[\s\S]*\}/);
              if (retryMatch) { results.push(JSON.parse(retryMatch[0])); continue; }
            }
          }
          
          results.push({ cardIndex: i, sport: 'unknown', player: null, error: `API error ${response.status}` });
          continue;
        }

        const data = await response.json();
        const text = (data.content || []).map(b => b.text || '').join('');
        const match = text.match(/\{[\s\S]*\}/);
        
        if (!match) {
          console.error(`Card ${i} no JSON in response:`, text.slice(0, 200));
          results.push({ cardIndex: i, sport: 'unknown', player: null, error: 'No JSON in response' });
          continue;
        }

        results.push(JSON.parse(match[0]));

      } catch (cardError) {
        console.error(`Card ${i} error:`, cardError.message);
        results.push({ cardIndex: i, sport: 'unknown', player: null, error: cardError.message });
      }

      // Small delay between cards to respect rate limits
      if (i < batch.length - 1) await new Promise(r => setTimeout(r, 2000));
    }

    return res.status(200).json({ results });

  } catch (e) {
    console.error('analyze handler error:', e);
    return res.status(500).json({ error: e.message, stack: e.stack?.slice(0, 500) });
  }
}
