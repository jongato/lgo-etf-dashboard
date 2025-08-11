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

// Portfolio data persistence endpoints
const PORTFOLIO_HISTORY_ENDPOINT = `${API_BASE_URL}/portfolio-history`;
const PORTFOLIO_UPDATE_ENDPOINT = `${API_BASE_URL}/portfolio-update`;

// Market hours configuration (Eastern Time)
const MARKET_OPEN_HOUR = 9;
const MARKET_OPEN_MINUTE = 30;
const MARKET_CLOSE_HOUR = 16;
const MARKET_CLOSE_MINUTE = 0;
const UPDATE_INTERVAL_MINUTES = 5;

// Portfolio tracking variables
let portfolioUpdateTimer = null;
let lastPortfolioUpdate = null;

// Function to clean up duplicate data points
function cleanupDuplicateDataPoints() {
    try {
        const storedHistory = localStorage.getItem('portfolioHistory');
        if (storedHistory) {
            let history = JSON.parse(storedHistory);
            
            // Remove duplicates based on timestamp (within 1 minute = same time slot)
            const cleanedHistory = [];
            const seenTimeSlots = new Set();
            
            history.forEach(record => {
                const recordTime = new Date(record.timestamp);
                const timeSlot = Math.floor(recordTime.getTime() / (60 * 1000)); // Round to nearest minute
                
                if (!seenTimeSlots.has(timeSlot)) {
                    seenTimeSlots.add(timeSlot);
                    cleanedHistory.push(record);
                } else {
                    console.log(`Removing duplicate data point at ${recordTime.toLocaleTimeString()}`);
                }
            });
            
            // Sort by timestamp to ensure chronological order
            cleanedHistory.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            
            // Save cleaned history
            localStorage.setItem('portfolioHistory', JSON.stringify(cleanedHistory));
            
            // Also save to server for persistence
            savePortfolioDataToServer(cleanedHistory);
            
            console.log(`Cleaned up duplicate data points. Before: ${history.length}, After: ${cleanedHistory.length}`);
            
            return cleanedHistory;
        }
    } catch (error) {
        console.error('Error cleaning up duplicate data points:', error);
        return [];
    }
    return [];
}

// Server-side data persistence functions
async function savePortfolioDataToServer(history) {
    try {
        const response = await fetch(PORTFOLIO_UPDATE_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                portfolioHistory: history,
                timestamp: new Date().toISOString(),
                version: '1.0' // Add version for future compatibility
            })
        });
        
        if (response.ok) {
            console.log('Portfolio data saved to server successfully');
            return true;
        } else {
            console.error('Failed to save portfolio data to server:', response.status);
            return false;
        }
    } catch (error) {
        console.error('Error saving portfolio data to server:', error);
        return false;
    }
}

async function loadPortfolioDataFromServer() {
    try {
        const response = await fetch(PORTFOLIO_HISTORY_ENDPOINT);
        
        if (response.ok) {
            const data = await response.json();
            console.log('Portfolio data loaded from server successfully');
            return data.portfolioHistory || [];
        } else {
            console.log('No server data available, using localStorage fallback');
            return null;
        }
    } catch (error) {
        console.log('Error loading from server, using localStorage fallback:', error);
        return null;
    }
}

// Manual sync function to migrate existing localStorage data to server
async function syncLocalDataToServer() {
    try {
        const storedHistory = localStorage.getItem('portfolioHistory');
        if (storedHistory) {
            const history = JSON.parse(storedHistory);
            if (history.length > 0) {
                console.log('Syncing existing localStorage data to server...');
                const success = await savePortfolioDataToServer(history);
                if (success) {
                    console.log('Successfully synced', history.length, 'data points to server');
                } else {
                    console.log('Failed to sync data to server');
                }
            }
        }
    } catch (error) {
        console.error('Error syncing data to server:', error);
    }
}

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
    
    // Clean up any existing duplicate data points
    cleanupDuplicateDataPoints();
    
    // Sync existing localStorage data to server for persistence
    syncLocalDataToServer();
    
    // Start fetching data
    fetchInitialData();
    startPortfolioTracking();
    
    // Add time filter button event listeners
    setupTimeFilterControls();
});

function setupTimeFilterControls() {
    const filterButtons = document.querySelectorAll('.time-filter-btn');
    
    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all buttons
            filterButtons.forEach(btn => btn.classList.remove('active'));
            
            // Add active class to clicked button
            button.classList.add('active');
            
            // Get the filter value
            const filter = button.dataset.filter;
            
            // Update chart with the selected filter
            updateChartWithTimeFilter(filter);
        });
    });
    
    // Add cleanup button event listener
    const cleanupBtn = document.getElementById('cleanup-duplicates');
    if (cleanupBtn) {
        cleanupBtn.addEventListener('click', () => {
            console.log('Manual cleanup requested');
            const cleanedHistory = cleanupDuplicateDataPoints();
            
            // Refresh the chart with cleaned data
            if (cleanedHistory.length > 0) {
                updateChartWithHistory(cleanedHistory);
            }
            
            // Show feedback
            cleanupBtn.textContent = 'Cleaned!';
            setTimeout(() => {
                cleanupBtn.textContent = 'Clean Duplicates';
            }, 2000);
        });
    }
    
    // Add sync button event listener
    const syncBtn = document.getElementById('sync-data');
    if (syncBtn) {
        syncBtn.addEventListener('click', async () => {
            console.log('Manual sync requested');
            syncBtn.textContent = 'Syncing...';
            syncBtn.disabled = true;
            
            await syncLocalDataToServer();
            
            // Show feedback
            syncBtn.textContent = 'Synced!';
            setTimeout(() => {
                syncBtn.textContent = 'Sync Data';
                syncBtn.disabled = false;
            }, 2000);
        });
    }
    
    // Add status toggle button event listener
    const statusToggleBtn = document.getElementById('status-toggle');
    const chartStatus = document.getElementById('chart-status');
    
    if (statusToggleBtn && chartStatus) {
        statusToggleBtn.addEventListener('click', () => {
            const isHidden = chartStatus.style.display === 'none';
            
            if (isHidden) {
                // Show status bar
                chartStatus.style.display = 'block';
                statusToggleBtn.textContent = '-';
                statusToggleBtn.title = 'Hide Status';
            } else {
                // Hide status bar
                chartStatus.style.display = 'none';
                statusToggleBtn.textContent = '+';
                statusToggleBtn.title = 'Show Status';
            }
        });
    }
}

function updateChartWithTimeFilter(filter) {
    try {
        const storedHistory = localStorage.getItem('portfolioHistory');
        if (storedHistory) {
            const history = JSON.parse(storedHistory);
            
            // Never modify existing data points - just display the filtered data
            updateChartWithHistory(history, filter);
        }
    } catch (error) {
        console.error('Error updating chart with time filter:', error);
    }
}

// Market hours and portfolio tracking functions
function isWeekday() {
    const now = new Date();
    const day = now.getDay();
    return day >= 1 && day <= 5; // Monday = 1, Friday = 5
}

function isMarketHours() {
    if (!isWeekday()) return false;
    
    const now = new Date();
    const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    
    const currentHour = easternTime.getHours();
    const currentMinute = easternTime.getMinutes();
    const currentTime = currentHour * 60 + currentMinute;
    
    const openTime = MARKET_OPEN_HOUR * 60 + MARKET_OPEN_MINUTE;
    const closeTime = MARKET_CLOSE_HOUR * 60 + MARKET_CLOSE_MINUTE;
    
    return currentTime >= openTime && currentTime < closeTime;
}

function getNextUpdateTime() {
    const now = new Date();
    const easternTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}));
    
    const currentHour = easternTime.getHours();
    const currentMinute = easternTime.getMinutes();
    
    // Find the next 5-minute interval
    let nextMinute = Math.ceil(currentMinute / UPDATE_INTERVAL_MINUTES) * UPDATE_INTERVAL_MINUTES;
    let nextHour = currentHour;
    
    if (nextMinute >= 60) {
        nextMinute = 0;
        nextHour++;
    }
    
    // If we're past market close, schedule for next market open
    if (nextHour >= MARKET_CLOSE_HOUR) {
        nextHour = MARKET_OPEN_HOUR;
        nextMinute = MARKET_OPEN_MINUTE;
        // Add one day
        easternTime.setDate(easternTime.getDate() + 1);
    }
    
    easternTime.setHours(nextHour, nextMinute, 0, 0);
    
    // Ensure we're not scheduling for the past
    if (easternTime <= now) {
        easternTime.setMinutes(easternTime.getMinutes() + UPDATE_INTERVAL_MINUTES);
    }
    
    console.log(`Current time: ${currentHour}:${currentMinute.toString().padStart(2, '0')}`);
    console.log(`Next update calculated: ${nextHour}:${nextMinute.toString().padStart(2, '0')}`);
    
    return easternTime;
}

function updateStatusIndicators() {
    const nextUpdateEl = document.getElementById('next-update-time');
    const lastUpdateEl = document.getElementById('last-update-time');
    const statusEl = document.getElementById('tracking-status');
    
    if (nextUpdateEl) {
        if (isWeekday() && isMarketHours()) {
            const nextUpdate = getNextUpdateTime();
            nextUpdateEl.textContent = nextUpdate.toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: false 
            });
        } else if (isWeekday()) {
            nextUpdateEl.textContent = 'Next Market Open';
        } else {
            nextUpdateEl.textContent = 'Weekend';
        }
    }
    
    if (lastUpdateEl) {
        if (lastPortfolioUpdate) {
            const lastUpdate = new Date(lastPortfolioUpdate);
            lastUpdateEl.textContent = lastUpdate.toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: false 
            });
        } else {
            lastUpdateEl.textContent = 'No updates yet';
        }
    }
    
    if (statusEl) {
        if (!isWeekday()) {
            statusEl.textContent = 'Weekend - No Tracking';
        } else if (!isMarketHours()) {
            statusEl.textContent = 'Market Closed';
        } else {
            statusEl.textContent = 'Active Tracking';
        }
    }
}

function startPortfolioTracking() {
    if (!isWeekday()) {
        console.log('Not a weekday, portfolio tracking not started');
        updateStatusIndicators();
        return;
    }
    
    if (isMarketHours()) {
        // Start immediate tracking if we're in market hours
        scheduleNextUpdate();
        updateStatusIndicators();
    } else {
        // Schedule for next market open
        const nextMarketOpen = new Date();
        const easternTime = new Date(nextMarketOpen.toLocaleString("en-US", {timeZone: "America/New_York"}));
        easternTime.setHours(MARKET_OPEN_HOUR, MARKET_OPEN_MINUTE, 0, 0);
        
        if (easternTime <= nextMarketOpen) {
            easternTime.setDate(easternTime.getDate() + 1);
        }
        
        const timeUntilOpen = easternTime.getTime() - nextMarketOpen.getTime();
        setTimeout(() => {
            startPortfolioTracking();
        }, timeUntilOpen);
        
        updateStatusIndicators();
    }
}

function scheduleNextUpdate() {
    if (!isWeekday() || !isMarketHours()) {
        return;
    }
    
    const nextUpdate = getNextUpdateTime();
    const now = new Date();
    const timeUntilUpdate = nextUpdate.getTime() - now.getTime();
    
    console.log(`Next portfolio update scheduled for: ${nextUpdate.toLocaleString()}`);
    console.log(`Time until next update: ${Math.round(timeUntilUpdate / 1000 / 60)} minutes and ${Math.round((timeUntilUpdate % (1000 * 60)) / 1000)} seconds`);
    
    setTimeout(() => {
        console.log(`Executing scheduled portfolio update at: ${new Date().toLocaleString()}`);
        updatePortfolioValue();
        scheduleNextUpdate();
    }, timeUntilUpdate);
}

function updatePortfolioValue() {
    if (!isWeekday() || !isMarketHours()) {
        return;
    }
    
    const currentValue = calculateCurrentPortfolioValue();
    const timestamp = new Date().toISOString();
    
    // Add to portfolio history
    let history = [];
    try {
        const storedHistory = localStorage.getItem('portfolioHistory');
        if (storedHistory) {
            history = JSON.parse(storedHistory);
        }
    } catch (error) {
        console.log('Error reading portfolio history, starting fresh');
        history = [];
    }
    
    // Always add a new data point - never modify existing ones
    const today = timestamp.split('T')[0];
    
    // Check if we already have a data point from this exact time (within 30 seconds to avoid duplicates)
    const existingPoint = history.find(record => {
        const recordTime = new Date(record.timestamp);
        const currentTime = new Date(timestamp);
        const timeDiff = Math.abs(currentTime.getTime() - recordTime.getTime());
        return timeDiff < 30 * 1000; // Within 30 seconds
    });
    
    if (!existingPoint) {
        // Add new data point
        history.push({
            timestamp: timestamp,
            value: currentValue,
            date: today,
            isStatic: false
        });
        
        // Keep only last 1000 data points to prevent localStorage from getting too large
        if (history.length > 1000) {
            history = history.slice(-1000);
        }
        
        localStorage.setItem('portfolioHistory', JSON.stringify(history));
        lastPortfolioUpdate = timestamp;
        
        console.log(`Portfolio updated: $${currentValue.toFixed(2)} at ${new Date(timestamp).toLocaleString()}`);
        console.log(`Total data points in history: ${history.length}`);
        console.log(`Next update in ~5 minutes`);
        console.log(`Duplicate check: No existing point found within 30 seconds`);
        console.log(`History:`, history.map(h => ({ time: new Date(h.timestamp).toLocaleTimeString(), value: h.value.toFixed(2) })));
        
        // Clean up any duplicates that might have been created
        const cleanedHistory = cleanupDuplicateDataPoints();
        
        // Save to server for persistence across deployments
        savePortfolioDataToServer(cleanedHistory.length > 0 ? cleanedHistory : history);
        
        // Update status indicators
        updateStatusIndicators();
        
        // Update chart if it exists
        if (etfChart) {
            // Get current time filter selection
            const activeFilter = document.querySelector('.time-filter-btn.active');
            const currentFilter = activeFilter ? activeFilter.dataset.filter : 'all';
            
            // Update chart with current filter to show all accumulated data
            updateChartWithHistory(history, currentFilter);
        }
    } else {
        console.log(`Portfolio update skipped: Duplicate data point detected within 30 seconds`);
        console.log(`Current time: ${new Date(timestamp).toLocaleTimeString()}`);
        console.log(`Existing points:`, history.map(h => ({ time: new Date(h.timestamp).toLocaleTimeString(), value: h.value.toFixed(2) })));
    }
}

function calculateCurrentPortfolioValue() {
    let totalValue = portfolio.cash;
    
    portfolio.stocks.forEach(stock => {
        const stockValue = stock.shares * stock.currentPrice;
        totalValue += stockValue;
    });
    
    return totalValue;
}

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
    
    // Initialize the portfolio with current data to set up all metrics including total gain/loss
    const stockDataForUpdate = portfolio.stocks.map(s => ({ 
        ticker: s.ticker, 
        c: s.currentPrice, 
        d: s.dayChangePerShare 
    }));
    
    renderPortfolioTable();
    updateDashboard(stockDataForUpdate);
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
    
    // Calculate and display total gain/loss from $10,000 starting value
    const totalGainLoss = currentTotalValue - INITIAL_INVESTMENT;
    const totalGainLossEl = document.getElementById('total-gain-loss');
    totalGainLossEl.textContent = `${totalGainLoss >= 0 ? '+' : ''}$${totalGainLoss.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
    totalGainLossEl.className = `value change ${totalGainLoss >= 0 ? 'positive' : 'negative'}`;
    
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
    
    // Try to load from server first, then localStorage as fallback
    loadPortfolioDataFromServer().then(serverHistory => {
        if (serverHistory && serverHistory.length > 0) {
            console.log('Using server data:', serverHistory.length, 'data points');
            history = serverHistory;
        } else {
            // Fallback to localStorage
            try {
                const storedHistory = localStorage.getItem('portfolioHistory');
                if (storedHistory) {
                    history = JSON.parse(storedHistory);
                    console.log('Using localStorage fallback:', history.length, 'data points');
                }
            } catch (error) {
                console.log('Clearing corrupted localStorage data');
                localStorage.removeItem('portfolioHistory');
                history = [];
            }
        }
        
        // If no history exists, create initial static data point
        if (history.length === 0) {
            const now = new Date();
            const today = now.toISOString().split('T')[0];
            
            // Create initial static data point at market open (9:30 AM ET)
            const marketOpenTime = new Date(now);
            marketOpenTime.setHours(9, 30, 0, 0); // 9:30 AM
            
            // If it's before market open today, use yesterday's market open
            if (now.getHours() < 9 || (now.getHours() === 9 && now.getMinutes() < 30)) {
                marketOpenTime.setDate(marketOpenTime.getDate() - 1);
            }
            
            history = [
                { 
                    timestamp: marketOpenTime.toISOString(), 
                    value: prevCloseValue, 
                    date: marketOpenTime.toISOString().split('T')[0],
                    isStatic: true // Mark as static/immutable
                }
            ];
            
            // Save initial history to both localStorage and server
            localStorage.setItem('portfolioHistory', JSON.stringify(history));
            savePortfolioDataToServer(history);
        }
        
        // Update chart with current data
        updateChartWithHistory(history);
    });
}

function updateChartWithHistory(history, timeFilter = 'all') {
    if (!chartCanvasContext) {
        console.error('Chart canvas context not found!');
        return;
    }
    
    // Clean up any duplicates before processing
    const cleanedHistory = cleanupDuplicateDataPoints();
    const historyToUse = cleanedHistory.length > 0 ? cleanedHistory : history;
    
    // Apply time filter
    let filteredHistory = historyToUse;
    const now = new Date();
    
    switch (timeFilter) {
        case 'today':
            const today = now.toISOString().split('T')[0];
            filteredHistory = history.filter(item => item.date === today);
            break;
        case '5days':
            const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
            filteredHistory = history.filter(item => new Date(item.timestamp) >= fiveDaysAgo);
            break;
        case 'month':
            const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            filteredHistory = history.filter(item => new Date(item.timestamp) >= oneMonthAgo);
            break;
        case 'all':
        default:
            filteredHistory = history;
            break;
    }
    
    // Sort by timestamp
    filteredHistory.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    
    // Add current portfolio value as a non-persistent data point for display only
    const currentValue = calculateCurrentPortfolioValue();
    const displayData = [...filteredHistory];
    
    // Only add current value if we have historical data and it's not the same as the last historical point
    if (displayData.length > 0) {
        const lastHistoricalValue = displayData[displayData.length - 1].value;
        if (Math.abs(currentValue - lastHistoricalValue) > 0.01) { // Only add if different by more than 1 cent
            displayData.push({
                timestamp: now.toISOString(),
                value: currentValue,
                date: now.toISOString().split('T')[0],
                isCurrent: true // Mark as current (non-persistent)
            });
        }
    }
    
    // Prepare chart data
    const chartLabels = displayData.map(record => {
        const date = new Date(record.timestamp);
        if (record.isCurrent) {
            return 'Now'; // Show "Now" for current value
        }
        return date.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
        });
    });
    
    const chartData = displayData.map(record => record.value);
    
    // Create gradient
    const gradient = chartCanvasContext.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(74, 105, 189, 0.4)');
    gradient.addColorStop(1, 'rgba(74, 105, 189, 0)');
    
    // Destroy existing chart
    if (etfChart) etfChart.destroy();
    
    // Create new chart
    etfChart = new Chart(chartCanvasContext, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{
                label: 'Portfolio Value',
                data: chartData,
                borderColor: '#4a69bd',
                borderWidth: 2,
                pointRadius: 2,
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
                    callbacks: { 
                        label: (context) => `Value: $${parseFloat(context.raw).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`,
                        title: (context) => {
                            const index = context[0].dataIndex;
                            const record = displayData[index]; // Use displayData here
                            if (record) {
                                const date = new Date(record.timestamp);
                                return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
                            }
                            return context[0].label;
                        }
                    }
                }
            },
            scales: { 
                x: { 
                    display: true,
                    title: {
                        display: false
                    }
                }, 
                y: { 
                    display: true,
                    title: {
                        display: false
                    }
                } 
            }
        }
    });
}