const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');

const app = express();
const PORT = 3000;

// This will be our simple in-memory cache
const cache = new Map();

app.use(cors());

// PASTE YOUR FINNHUB API KEY HERE
const API_KEY = 'd2cj7nhr01qihtcs2e90d2cj7nhr01qihtcs2e9g';

/**
 * A helper function to check if a cache entry is still valid.
 * @param {object} cacheEntry The cache entry object { timestamp, data }
 * @param {number} maxAgeInMs The maximum age in milliseconds
 */
const isCacheValid = (cacheEntry, maxAgeInMs) => {
    if (!cacheEntry) return false;
    return (new Date() - cacheEntry.timestamp) < maxAgeInMs;
};

// Route to handle quote requests from Finnhub
app.get('/quote/:ticker', async (req, res) => {
    const { ticker } = req.params;
    const cacheKey = `quote_${ticker}`;
    const fiveMinutes = 5 * 60 * 1000;

    if (isCacheValid(cache.get(cacheKey), fiveMinutes)) {
        return res.json(cache.get(cacheKey).data);
    }
    
    try {
        const url = `https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${API_KEY}`;
        const apiRes = await fetch(url);
        if (!apiRes.ok) { // Handles errors like 429, 403, etc.
            throw new Error(`Finnhub API error: ${apiRes.status}`);
        }
        const data = await apiRes.json();
        
        // Don't cache empty results from the API
        if (data.c === 0 && data.d === 0) {
            return res.json(data);
        }

        cache.set(cacheKey, { timestamp: new Date(), data: data });
        res.json(data);
    } catch (error) {
        console.error(`[SERVER] Failed to fetch quote for ${ticker}:`, error);
        // Send a default structure on error so the frontend doesn't break
        res.status(500).json({ c: 0, d: 0, dp: 0, error: 'Failed to fetch quote' });
    }
});

// Route to handle news requests from Finnhub
app.get('/news/:ticker', async (req, res) => {
    const { ticker } = req.params;
    const cacheKey = `news_${ticker}`;
    const oneHour = 60 * 60 * 1000;
    
    if (isCacheValid(cache.get(cacheKey), oneHour)) {
        return res.json(cache.get(cacheKey).data);
    }
    
    const to = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const url = `https://finnhub.io/api/v1/company-news?symbol=${ticker}&from=${from}&to=${to}&token=${API_KEY}`;

    try {
        const apiRes = await fetch(url);
        if (!apiRes.ok) {
            throw new Error(`Finnhub API error: ${apiRes.status}`);
        }
        const data = await apiRes.json();
        
        cache.set(cacheKey, { timestamp: new Date(), data: data });
        res.json(data);
    } catch (error) {
        console.error(`[SERVER] Failed to fetch news for ${ticker}:`, error);
        res.status(500).json([]); // Send an empty array on error
    }
});

app.listen(PORT, () => {
    console.log(`LGO ETF Backend server (Finnhub) with caching is running on http://localhost:${PORT}`);
});