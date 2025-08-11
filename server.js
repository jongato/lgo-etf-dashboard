const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

const cache = new Map();
app.use(cors());

// PASTE YOUR FINNHUB API KEY HERE
const API_KEY = 'd2cj7nhr01qihtcs2e90d2cj7nhr01qihtcs2e9g';

const isCacheValid = (cacheEntry) => {
    if (!cacheEntry) return false;
    const oneHour = 60 * 60 * 1000;
    return (new Date() - cacheEntry.timestamp) < oneHour;
};

// Route to handle quote requests from Finnhub
app.get('/quote/:ticker', async (req, res) => {
    const ticker = req.params.ticker;
    const cacheKey = `quote_${ticker}`;

    if (isCacheValid(cache.get(cacheKey))) {
        return res.json(cache.get(cacheKey).data);
    }
    
    const url = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${API_KEY}`;
    try {
        const apiRes = await fetch(url);
        if (!apiRes.ok) throw new Error(`Finnhub API error: ${apiRes.status}`);
        const data = await apiRes.json();
        cache.set(cacheKey, { timestamp: new Date(), data: data });
        res.json(data);
    } catch (error) {
        console.error(`Failed to fetch quote for ${ticker}`, error);
        res.status(500).json({ error: 'Failed to fetch quote' });
    }
});

// --- UPDATED NEWS ENDPOINT WITH DETAILED LOGGING ---
app.get('/news/:ticker', async (req, res) => {
    const ticker = req.params.ticker;
    const cacheKey = `news_${ticker}`;
    console.log(`[SERVER LOG] Received request for news: ${ticker}`); // LOG 1

    if (isCacheValid(cache.get(cacheKey))) {
        console.log(`[SERVER LOG] Serving news for ${ticker} from cache.`); // LOG 2
        return res.json(cache.get(cacheKey).data);
    }
    
    console.log(`[SERVER LOG] Fetching news for ${ticker} from Finnhub...`); // LOG 3
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // Extended to 30 days
    const url = `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${API_KEY}`;

    try {
        const apiRes = await fetch(url);
        if (!apiRes.ok) throw new Error(`Finnhub API error: ${apiRes.status}`);
        
        const data = await apiRes.json();
        console.log(`[SERVER LOG] Finnhub response for ${ticker} news contains ${data.length} articles.`); // LOG 4
        
        cache.set(cacheKey, { timestamp: new Date(), data: data });
        res.json(data);
    } catch (error) {
        console.error(`[SERVER LOG] Failed to fetch news for ${ticker}`, error); // LOG 5
        res.status(500).json({ error: 'Failed to fetch news' });
    }
});


app.listen(PORT, () => {
    console.log(`LGO ETF Backend server (Finnhub) with caching is running on http://localhost:${PORT}`);
});