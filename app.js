// --- Configuration ---
const STOCKS = [
    { ticker: 'GOOGL', name: 'Alphabet (Google)' }, { ticker: 'AMZN', name: 'Amazon' },
    { ticker: 'AMGN', name: 'Amgen' }, { ticker: 'BA', name: 'Boeing' },
    { ticker: 'CAT', name: 'Caterpillar' }, { ticker: 'JNJ', name: 'Johnson & Johnson' },
    { ticker: 'NEE', name: 'NextEra Energy' }, { ticker: 'NKE', name: 'Nike, Inc.' },
    { ticker: 'NOC', name: 'Northrop Grumman' }, { ticker: 'RMD', name: 'ResMed' },
    { ticker: 'RIVN', name: 'Rivian' }, { ticker: 'RTX', name: 'RTX' },
    { ticker: 'SWK', name: 'Stanley Black & Decker' }, { ticker: 'SYK', name: 'Stryker' },
    { ticker: 'TGT', name: 'Target' }, { ticker: 'VZ', name: 'Verizon' }
];
const INITIAL_INVESTMENT = 10000;
const API_BASE_URL = 'https://lgo-etf-backend.onrender.com';

// --- DOM Elements & State ---
const portfolioBody = document.getElementById('portfolio-body');
const newsList = document.getElementById('news-list');
const chartCanvasContext = document.getElementById('etfChart').getContext('2d');
const portfolio = { 
    stocks: [],
    cash: 0
};
let etfChart = null;

// --- Main App Logic ---
document.addEventListener('DOMContentLoaded', () => {
    // Clear any corrupted localStorage data
    try {
        const storedHistory = localStorage.getItem('portfolioHistory');
        if (storedHistory) {
            JSON.parse(storedHistory); // Test if it's valid JSON
        }
    } catch (error) {
        console.log('Clearing corrupted localStorage data at startup');
        localStorage.removeItem('portfolioHistory');
    }
    
    fetchInitialData();
});

async function fetchInitialData() {
    try {
        const requests = STOCKS.map(stock => fetch(`${API_BASE_URL}/quote/${stock.ticker}`).then(res => res.json()).then(data => ({ ...data, ticker: stock.ticker, name: stock.name })));
        const results = await Promise.all(requests);
        initializePortfolio(results);
        updateDashboard(results);
        fetchNews();
    } catch (error) { console.error('Error fetching initial data:', error); }
}

function initializePortfolio(stockData) {
    portfolio.stocks = stockData.map(data => {
        const previousClose = data.c - data.d;
        if (!previousClose) return null;
        const equalValue = INITIAL_INVESTMENT / stockData.length;
        return {
            ticker: data.ticker,
            name: data.name,
            shares: equalValue / previousClose,
            currentPrice: data.c,
            dayChangePerShare: data.d,
        };
    }).filter(Boolean);
    renderPortfolioTable();
}

function renderPortfolioTable() {
    portfolioBody.innerHTML = '';
    portfolio.stocks.forEach(stock => {
        const row = document.createElement('tr');
        const dayChangePercent = ((stock.dayChangePerShare / (stock.currentPrice - stock.dayChangePerShare)) * 100);
        const holdingValue = stock.shares * stock.currentPrice;
        const weight = (holdingValue / (portfolio.stocks.reduce((sum, s) => sum + (s.shares * s.currentPrice), 0) + portfolio.cash)) * 100;
        const holdingDayChange = stock.shares * stock.dayChangePerShare;
        
        row.innerHTML = `
            <td><div class="company-name">${stock.name}</div><div class="ticker">${stock.ticker}</div></td>
            <td class="price">$${stock.currentPrice.toFixed(2)}</td>
            <td class="day-change-percent ${dayChangePercent >= 0 ? 'positive' : 'negative'}">${dayChangePercent >= 0 ? '+' : ''}${dayChangePercent.toFixed(2)}%</td>
            <td class="day-change-dollar ${stock.dayChangePerShare >= 0 ? 'positive' : 'negative'}">${stock.dayChangePerShare >= 0 ? '+' : ''}$${stock.dayChangePerShare.toFixed(2)}</td>
            <td class="shares">${stock.shares.toFixed(4)}</td>
            <td class="value">$${holdingValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
            <td class="weight">${weight.toFixed(2)}%</td>
            <td>
                <button class="action-btn buy-btn" data-ticker="${stock.ticker}">Buy</button>
                <button class="action-btn sell-btn" data-ticker="${stock.ticker}">Sell</button>
            </td>
        `;
        portfolioBody.appendChild(row);
    });
    
    document.querySelectorAll('.buy-btn').forEach(btn => btn.addEventListener('click', handleTrade));
    document.querySelectorAll('.sell-btn').forEach(btn => btn.addEventListener('click', handleTrade));
}

function updateDashboard(stockData) {
    portfolio.stocks.forEach(stock => {
        const data = stockData.find(d => d.ticker === stock.ticker);
        if (data) {
            stock.currentPrice = data.c;
            stock.dayChangePerShare = data.d;
        }
    });

    const portfolioValueAtPrevClose = portfolio.stocks.reduce((sum, stock) => {
        const prevClose = stock.currentPrice - stock.dayChangePerShare;
        return sum + (stock.shares * prevClose);
    }, 0);
    
    const totalDayChange = portfolio.stocks.reduce((sum, stock) => sum + (stock.shares * stock.dayChangePerShare), 0);
    const currentTotalValue = portfolioValueAtPrevClose + totalDayChange + portfolio.cash;

    portfolio.stocks.forEach(stock => {
        const row = portfolioBody.querySelector(`button[data-ticker="${stock.ticker}"]`).closest('tr');
        if (!row) return;
        
        const holdingValue = stock.shares * stock.currentPrice;
        const weight = (holdingValue / currentTotalValue) * 100;
        const dayChangePercent = ((stock.dayChangePerShare / (stock.currentPrice - stock.dayChangePerShare)) * 100);
        
        // Update all columns with current data
        row.querySelector('.price').textContent = `$${stock.currentPrice.toFixed(2)}`;
        row.querySelector('.day-change-percent').textContent = `${dayChangePercent >= 0 ? '+' : ''}${dayChangePercent.toFixed(2)}%`;
        row.querySelector('.day-change-percent').className = `day-change-percent ${dayChangePercent >= 0 ? 'positive' : 'negative'}`;
        row.querySelector('.day-change-dollar').textContent = `${stock.dayChangePerShare >= 0 ? '+' : ''}$${stock.dayChangePerShare.toFixed(2)}`;
        row.querySelector('.day-change-dollar').className = `day-change-dollar ${stock.dayChangePerShare >= 0 ? 'positive' : 'negative'}`;
        row.querySelector('.shares').textContent = stock.shares.toFixed(4);
        row.querySelector('.value').textContent = `$${holdingValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        row.querySelector('.weight').textContent = `${weight.toFixed(2)}%`;
    });

    document.getElementById('total-value').textContent = `$${currentTotalValue.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    document.getElementById('cash-value').textContent = `$${portfolio.cash.toFixed(2)}`;
    const dayChangeEl = document.getElementById('day-change');
    dayChangeEl.textContent = `${totalDayChange >= 0 ? '+' : ''}$${totalDayChange.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    
    // --- THIS IS THE FIX ---
    // This line adds the 'positive' or 'negative' class back to the summary card
    dayChangeEl.className = `value change ${totalDayChange >= 0 ? 'positive' : 'negative'}`;
    
    updateAndRenderChart(currentTotalValue, portfolioValueAtPrevClose);
}

function handleTrade(event) {
    const ticker = event.target.dataset.ticker;
    const type = event.target.classList.contains('buy-btn') ? 'buy' : 'sell';
    
    const sharesToTradeStr = prompt(`How many shares of ${ticker} would you like to ${type}?`);
    if (sharesToTradeStr === null || isNaN(sharesToTradeStr) || +sharesToTradeStr <= 0) return;
    
    const sharesToTrade = parseFloat(sharesToTradeStr);
    executeTrade(ticker, sharesToTrade, type);
}

function executeTrade(ticker, shares, type) {
    const stock = portfolio.stocks.find(s => s.ticker === ticker);
    if (!stock) return;
    const tradeValue = shares * stock.currentPrice;
    if (type === 'buy') {
        if (portfolio.cash < tradeValue) {
            alert("Not enough cash to complete this purchase.");
            return;
        }
        portfolio.cash -= tradeValue;
        stock.shares += shares;
    } else {
        if (stock.shares < shares) {
            alert(`You only have ${stock.shares.toFixed(4)} shares to sell.`);
            return;
        }
        portfolio.cash += tradeValue;
        stock.shares -= shares;
    }
    // Create proper stock data structure for updateDashboard
    const stockData = portfolio.stocks.map(s => ({ 
        ticker: s.ticker, 
        c: s.currentPrice, 
        d: s.dayChangePerShare 
    }));
    updateDashboard(stockData);
}

async function fetchNews() {
    try {
        newsList.innerHTML = '<li>Loading news...</li>';
        const requests = portfolio.stocks.map(stock => fetch(`${API_BASE_URL}/news/${stock.ticker}`).then(res => res.json()));
        const results = await Promise.all(requests);
        const allArticles = results.flat().filter(a => a && a.headline).sort((a, b) => b.datetime - a.datetime);
        
        // Deduplicate news articles by headline
        const uniqueArticles = allArticles.filter((article, index, self) => 
            index === self.findIndex(a => a.headline === article.headline)
        );
        
        renderNews(uniqueArticles.slice(0, 7));
    } catch (error) { console.error('Error fetching news:', error); }
}

function renderNews(articles) {
    newsList.innerHTML = '';
    if (!articles || articles.length === 0) { newsList.innerHTML = '<li>No recent news available.</li>'; return; }
    articles.forEach(article => {
        const articleElement = document.createElement('article');
        articleElement.className = 'news-article';
        articleElement.innerHTML = `<h4><a href="${article.url}" target="_blank">${article.headline}</a></h4><div class="source">${article.source} - ${new Date(article.datetime * 1000).toLocaleDateString()}</div>`;
        newsList.appendChild(articleElement);
    });
}

function updateAndRenderChart(currentValue, prevCloseValue) {
    let history = [];
    
    try {
        const storedHistory = localStorage.getItem('portfolioHistory');
        if (storedHistory) {
            history = JSON.parse(storedHistory);
        }
    } catch (error) {
        console.log('Clearing corrupted localStorage data');
        localStorage.removeItem('portfolioHistory');
        history = [];
    }
    
    const today = new Date().toISOString().split('T')[0];
    
    if (history.length <= 1) {
        history = [
            { date: 'Start', value: prevCloseValue },
            { date: today, value: currentValue }
        ];
    } else {
        const todayIndex = history.findIndex(record => record.date === today);
        if (todayIndex > -1) {
            history[todayIndex].value = currentValue;
        } else {
            history.push({ date: today, value: currentValue });
        }
    }

    localStorage.setItem('portfolioHistory', JSON.stringify(history));

    const chartLabels = history.map(record => record.date);
    const chartData = history.map(record => record.value);

    const gradient = chartCanvasContext.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(74, 105, 189, 0.4)');
    gradient.addColorStop(1, 'rgba(74, 105, 189, 0)');

    if (etfChart) etfChart.destroy();
    
    etfChart = new Chart(chartCanvasContext, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{
                label: 'Portfolio Value',
                data: chartData,
                borderColor: '#4a69bd',
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.1,
                fill: true,
                backgroundColor: gradient,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: { label: (context) => `Value: $${parseFloat(context.raw).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}` }
                }
            },
            scales: { x: { display: false }, y: { display: false } }
        }
    });
}