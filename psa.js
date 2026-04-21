// api/psa.js — PSA cert lookup (server-side, no CORS issues)
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { certNumber, psaToken } = req.body;
    if (!certNumber) return res.status(400).json({ error: 'certNumber required' });

    const token = psaToken || process.env.PSA_API_TOKEN;
    if (!token) return res.status(400).json({ error: 'PSA token not configured' });

    const clean = certNumber.replace(/[^0-9]/g, '');
    const response = await fetch(`https://api.psacard.com/publicapi/cert/GetByCertNumber/${clean}`, {
      headers: { 'Authorization': `bearer ${token}`, 'Accept': 'application/json' }
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `PSA API error: ${response.status}` });
    }

    const data = await response.json();
    const cert = data?.PSACert || data?.Cert || data;
    return res.status(200).json({ cert });

  } catch (e) {
    console.error('PSA error:', e);
    return res.status(500).json({ error: e.message });
  }
}
