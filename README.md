# CardVault — Setup Guide

## What this is
Sports card collection manager with AI identification, live pricing, PSA lookup.

## Deploy in 5 steps

### Step 1 — Push to GitHub
1. Go to github.com → New repository → name it `cardvault` → Create
2. Upload all these files (drag and drop the whole folder)

### Step 2 — Connect to Vercel
1. Go to vercel.com → Sign up with GitHub (free)
2. Click "Add New Project" → Import your `cardvault` repo
3. Click Deploy — done

### Step 3 — Add your API key in Vercel
1. In Vercel dashboard → your project → Settings → Environment Variables
2. Add these:
   - `ANTHROPIC_API_KEY` = your key from console.anthropic.com
   - `PSA_API_TOKEN` = your PSA bearer token (optional)
3. Click Save → Redeploy

### Step 4 — Open your app
Vercel gives you a URL like `cardvault-aman.vercel.app`
Open it on any device, anywhere.

### Step 5 — Bookmark it
Works on phone, tablet, laptop. No installation needed.

## How it's fast now
- Analyzes 5 cards in ONE API call (batching)
- Fetches prices for 3 cards simultaneously (parallel)
- All API calls are server-side — no browser rate limits
- 20 cards takes ~2 minutes instead of 20 minutes

## Files
- `api/analyze.js` — batch card identification (5 at a time)
- `api/comps.js` — live eBay/Fanatics pricing
- `api/psa.js` — PSA cert lookup
- `api/duplicate.js` — duplicate detection
- `public/index.html` — the full dashboard
- `vercel.json` — routing config
- `package.json` — node config
