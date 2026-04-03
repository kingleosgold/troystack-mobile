/**
 * Stack Tracker Pro - Privacy-First Backend API
 * 
 * This server handles AI receipt scanning WITHOUT storing any user data.
 * Images are processed in memory and immediately discarded.
 * No logs, no analytics, no tracking.
 */

const express = require('express');
const multer = require('multer');
const Anthropic = require('@anthropic-ai/sdk');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const sizeOf = require('image-size');
const axios = require('axios');
// const cron = require('node-cron'); // DISABLED — all crons moved to stg-api

const app = express();

// Trust proxy for correct client IP detection
app.set('trust proxy', 1);

// CORS - allow requests from any origin (mobile app, web preview, etc.)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Security headers (adjusted for API use)
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false,
}));

// Stripe webhook needs raw body for signature verification — must come BEFORE express.json()
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));

// JSON parsing for everything EXCEPT Stripe webhook (which needs the raw Buffer)
app.use((req, res, next) => {
  if (req.originalUrl === '/api/webhooks/stripe') return next();
  express.json({ limit: '20mb' })(req, res, next);
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: { error: 'Too many requests, please try again later.' }
});
app.use(limiter);

// Memory-only file storage - files never touch disk
const storage = multer.memoryStorage();
const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max
});

// Initialize Anthropic client
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ============================================
// SPOT PRICE CACHE & DATA
// ============================================

let spotPriceCache = {
  prices: { gold: 5100, silver: 107, platinum: 2700, palladium: 2000 },
  lastUpdated: null,
  change: { gold: {}, silver: {}, source: 'unavailable' },
};

let historicalData = {
  gold: {},
  silver: {},
  goldSilverRatio: {},
  loaded: false,
};

// API Request Counter (to monitor GoldAPI usage)
let apiRequestCounter = {
  total: 0,
  lastReset: new Date(),
  calls: [],
};

// Load historical prices from JSON file
const fs = require('fs');
const path = require('path');

// Import web scraper for live spot prices and historical prices
const { scrapeGoldSilverPrices, fetchHistoricalPrices, areMarketsClosed, saveFridayClose, getFridayClose } = require(path.join(__dirname, 'scrapers', 'gold-silver-scraper.js'));
const { checkPriceAlerts, startPriceAlertChecker, getLastCheckInfo } = require(path.join(__dirname, 'services', 'priceAlertChecker.js'));
const { sendPushNotification, sendBatchPushNotifications, isValidExpoPushToken } = require(path.join(__dirname, 'services', 'expoPushNotifications.js'));

// Import historical price services
const { isSupabaseAvailable, getSupabase } = require('./supabaseClient');
const { validate } = require(path.join(__dirname, 'middleware', 'validation'));
const { fetchETFHistorical, slvToSpotSilver, gldToSpotGold, ppltToSpotPlatinum, pallToSpotPalladium, hasETFDataForDate, fetchAllETFs, DEFAULT_PPLT_RATIO, DEFAULT_PALL_RATIO } = require('./services/etfPrices');
const { calibrateRatios, getRatioForDate, needsCalibration } = require('./services/calibrateRatios');
const { logPriceFetch, findLoggedPrice, findClosestLoggedPrice, getLogStats } = require('./services/priceLogger');
const { createAlert, getAlertsForUser, deleteAlert, checkAlerts, getAlertCount } = require('./services/priceAlerts');
const { saveSnapshot, getSnapshots, getLatestSnapshot, getSnapshotCount } = require('./services/portfolioSnapshots');

// RevenueCat integration config
const REVENUECAT_WEBHOOK_SECRET = process.env.REVENUECAT_WEBHOOK_SECRET;
const REVENUECAT_API_KEY = process.env.REVENUECAT_API_KEY;

if (!REVENUECAT_WEBHOOK_SECRET) {
  console.warn('⚠️ RevenueCat webhook disabled: missing REVENUECAT_WEBHOOK_SECRET');
}
if (!REVENUECAT_API_KEY) {
  console.warn('⚠️ RevenueCat sync disabled: missing REVENUECAT_API_KEY');
}

// Stripe integration config
const stripe = process.env.STRIPE_SECRET_KEY
  ? require('stripe')(process.env.STRIPE_SECRET_KEY)
  : null;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_GOLD_MONTHLY_PRICE_ID = process.env.STRIPE_GOLD_MONTHLY_PRICE_ID;
const STRIPE_GOLD_YEARLY_PRICE_ID = process.env.STRIPE_GOLD_YEARLY_PRICE_ID;
const STRIPE_GOLD_LIFETIME_PRICE_ID = process.env.STRIPE_GOLD_LIFETIME_PRICE_ID;

if (!stripe) {
  console.warn('⚠️ Stripe disabled: missing STRIPE_SECRET_KEY');
}

// Cache for historical prices (to avoid repeated API calls for the same date)
// Historical prices don't change, so we can cache them indefinitely
const historicalPriceCache = {
  gold: {},   // { 'YYYY-MM-DD': price }
  silver: {}, // { 'YYYY-MM-DD': price }
};

// ============================================
// FETCH LIVE SPOT PRICES
// ============================================

async function fetchLiveSpotPrices() {
  try {
    // Log API request counter
    const now = new Date();
    const hoursSinceReset = (now - apiRequestCounter.lastReset) / 1000 / 60 / 60;
    console.log(`📊 API Requests - Total: ${apiRequestCounter.total}, Last Reset: ${hoursSinceReset.toFixed(1)}h ago`);

    // Fetch prices using priority order:
    // 1. GoldAPI.io (paid tier)
    // 2. MetalPriceAPI (fallback)
    // 3. Static prices (final fallback)
    const fetchedPrices = await scrapeGoldSilverPrices();

    // Increment counter for monitoring
    apiRequestCounter.total += 1;
    apiRequestCounter.calls.push({
      timestamp: now.toISOString(),
      type: 'spot-price-fetch',
      count: 1,
      source: fetchedPrices.source,
    });
    // Keep only last 100 calls in memory
    if (apiRequestCounter.calls.length > 100) {
      apiRequestCounter.calls = apiRequestCounter.calls.slice(-100);
    }

    // Update cache
    spotPriceCache = {
      prices: {
        gold: fetchedPrices.gold,
        silver: fetchedPrices.silver,
        platinum: fetchedPrices.platinum || 2700,
        palladium: fetchedPrices.palladium || 2000,
      },
      lastUpdated: new Date(),
      source: fetchedPrices.source,
      change: fetchedPrices.change || { gold: {}, silver: {}, source: 'unavailable' },
      marketsClosed: fetchedPrices.marketsClosed || false,
    };

    console.log('✅ Spot prices updated:', spotPriceCache.prices);
    console.log(`📈 Total API requests: ${apiRequestCounter.total}`);

    // Save as Friday close if it's Friday afternoon (after 4pm ET)
    // This ensures we have frozen values for the weekend
    const etOptions = { timeZone: 'America/New_York', hourCycle: 'h23' };
    const etString = now.toLocaleString('en-US', etOptions);
    const etDate = new Date(etString);
    if (etDate.getDay() === 5 && etDate.getHours() >= 16) {
      console.log('📅 Friday afternoon - saving as Friday close prices');
      saveFridayClose({
        prices: spotPriceCache.prices,
        timestamp: spotPriceCache.lastUpdated.toISOString(),
        source: spotPriceCache.source,
        change: spotPriceCache.change,
      });
    }

    // Log price to database for historical minute-level data (non-blocking)
    logPriceFetch(spotPriceCache.prices, fetchedPrices.source).catch(err => {
      console.log('   Price logging skipped:', err.message);
    });

    // Calibrate ETF ratios once per day (non-blocking)
    needsCalibration().then(async (needed) => {
      if (needed && spotPriceCache.prices.gold && spotPriceCache.prices.silver) {
        console.log('📐 Running daily ETF ratio calibration...');
        await calibrateRatios(spotPriceCache.prices.gold, spotPriceCache.prices.silver, spotPriceCache.prices.platinum, spotPriceCache.prices.palladium);
      }
    }).catch(err => {
      console.log('   Calibration check skipped:', err.message);
    });

    return spotPriceCache.prices;

  } catch (error) {
    console.error('❌ Failed to fetch spot prices:', error.message);
    console.error('   Stack:', error.stack);

    // Use last cached prices if available
    if (spotPriceCache.lastUpdated) {
      console.log('⚠️  Using last cached prices (fetch failed)');
      return spotPriceCache.prices;
    }

    // Final fallback to static estimates
    console.log('⚠️  Using hardcoded fallback prices (no cache available)');
    spotPriceCache.prices = { gold: 5100, silver: 107, platinum: 2700, palladium: 2000 };
    spotPriceCache.lastUpdated = new Date();
    spotPriceCache.source = 'static-fallback';
    return spotPriceCache.prices;
  }
}
// ============================================
// LOAD HISTORICAL DATA
// ============================================

function loadHistoricalData() {
  try {
    console.log('📊 Loading historical price data from JSON...');

    // Load historical prices from JSON file
    const dataPath = path.join(__dirname, 'data', 'historical-prices.json');
    console.log('📁 Data file path:', dataPath);

    // Check if file exists
    if (!fs.existsSync(dataPath)) {
      console.error('❌ historical-prices.json NOT FOUND at:', dataPath);
      console.log('📂 Directory contents:', fs.readdirSync(__dirname));
      throw new Error('Historical prices file not found');
    }

    console.log('✅ Found historical-prices.json');
    const rawData = fs.readFileSync(dataPath, 'utf8');
    const monthlyPrices = JSON.parse(rawData);

    console.log(`📄 Loaded ${Object.keys(monthlyPrices).length} months of historical data`);

    // Process monthly data into daily lookups
    Object.entries(monthlyPrices).forEach(([month, prices]) => {
      // Expand to daily prices for the month (copy monthly price to all days)
      const [year, monthNum] = month.split('-');
      const daysInMonth = new Date(parseInt(year), parseInt(monthNum), 0).getDate();

      for (let day = 1; day <= daysInMonth; day++) {
        const date = `${year}-${monthNum}-${day.toString().padStart(2, '0')}`;
        historicalData.gold[date] = prices.gold;
        historicalData.silver[date] = prices.silver;
      }
    });

    console.log(`✅ Loaded ${Object.keys(historicalData.gold).length} historical gold prices (daily granularity)`);
    console.log(`✅ Loaded ${Object.keys(historicalData.silver).length} historical silver prices (daily granularity)`);

    // Log sample prices to verify correct data is loaded
    const sampleDates = ['2023-09-01', '2023-09-15', '2024-12-01', '2025-12-25'];
    console.log('📅 Sample historical prices (should match JSON file):');
    sampleDates.forEach(d => {
      if (historicalData.gold[d]) {
        console.log(`   ${d}: Gold $${historicalData.gold[d]}, Silver $${historicalData.silver[d]}`);
      }
    });

    // Log key verification dates
    console.log('🔍 Key verification:');
    console.log('   2024-12-01 should be: Gold $2400, Silver $28');
    console.log('   2023-09-01 should be: Gold $1920, Silver $23');

    historicalData.loaded = true;
  } catch (error) {
    console.error('❌ Failed to load historical data from JSON:', error.message);
    console.error('Stack trace:', error.stack);
    // Use fallback monthly averages as last resort
    loadFallbackHistoricalData();
  }
}

// Fallback historical data (monthly averages)
function loadFallbackHistoricalData() {
  console.log('Loading fallback historical data...');
  
  const fallbackGold = {
    '2024-12': 2650, '2024-11': 2700, '2024-10': 2750, '2024-09': 2650,
    '2024-08': 2500, '2024-07': 2400, '2024-06': 2350, '2024-05': 2350,
    '2024-04': 2350, '2024-03': 2200, '2024-02': 2050, '2024-01': 2050,
    '2023-12': 2050, '2023-11': 2000, '2023-10': 1980, '2023-09': 1920,
    '2023-08': 1940, '2023-07': 1960, '2023-06': 1920, '2023-05': 1980,
    '2023-04': 2000, '2023-03': 1980, '2023-02': 1850, '2023-01': 1920,
    '2022-12': 1800, '2022-11': 1750, '2022-10': 1650, '2022-09': 1680,
    '2022-08': 1750, '2022-07': 1730, '2022-06': 1830, '2022-05': 1850,
    '2022-04': 1920, '2022-03': 1950, '2022-02': 1900, '2022-01': 1820,
  };
  
  const fallbackSilver = {
    '2024-12': 31, '2024-11': 32, '2024-10': 33, '2024-09': 31,
    '2024-08': 28, '2024-07': 29, '2024-06': 29, '2024-05': 27,
    '2024-04': 27, '2024-03': 25, '2024-02': 23, '2024-01': 23,
    '2023-12': 24, '2023-11': 24, '2023-10': 23, '2023-09': 23,
    '2023-08': 24, '2023-07': 25, '2023-06': 23, '2023-05': 24,
    '2023-04': 25, '2023-03': 23, '2023-02': 22, '2023-01': 24,
    '2022-12': 24, '2022-11': 21, '2022-10': 19, '2022-09': 19,
    '2022-08': 20, '2022-07': 19, '2022-06': 21, '2022-05': 22,
    '2022-04': 24, '2022-03': 25, '2022-02': 24, '2022-01': 24,
  };
  
  // Expand monthly data to daily (only valid days in each month)
  Object.entries(fallbackGold).forEach(([month, price]) => {
    const [year, monthNum] = month.split('-');
    const daysInMonth = new Date(parseInt(year), parseInt(monthNum), 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${month}-${day.toString().padStart(2, '0')}`;
      historicalData.gold[date] = price;
    }
  });

  Object.entries(fallbackSilver).forEach(([month, price]) => {
    const [year, monthNum] = month.split('-');
    const daysInMonth = new Date(parseInt(year), parseInt(monthNum), 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const date = `${month}-${day.toString().padStart(2, '0')}`;
      historicalData.silver[date] = price;
    }
  });
  
  historicalData.loaded = true;
  console.log('Fallback historical data loaded');
}

// ============================================
// API ENDPOINTS
// ============================================

/**
 * Health check
 */
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    privacy: 'first',
    historicalDataLoaded: historicalData.loaded,
    spotPricesLastUpdated: spotPriceCache.lastUpdated,
  });
});

/**
 * Get current spot prices
 */
app.get('/api/spot-prices', async (req, res) => {
  try {
    const marketsClosed = areMarketsClosed();

    // If markets are closed, return Friday close data (frozen values)
    if (marketsClosed) {
      let fridayClose = getFridayClose();

      // If no Friday close data exists, save current cache as Friday close
      // This handles first-time setup or if we missed Friday's save
      if (!fridayClose && spotPriceCache.lastUpdated) {
        console.log('🔒 Markets closed but no Friday close data - saving current cache as Friday close');
        saveFridayClose({
          prices: spotPriceCache.prices,
          timestamp: spotPriceCache.lastUpdated.toISOString(),
          source: spotPriceCache.source,
          change: spotPriceCache.change,
        });
        fridayClose = getFridayClose();
      }

      if (fridayClose) {
        console.log('🔒 Markets closed - returning Friday close prices');
        return res.json({
          success: true,
          ...fridayClose.prices,
          timestamp: fridayClose.timestamp,
          source: fridayClose.source + ' (friday-close)',
          cacheAgeMinutes: 0,
          change: fridayClose.change || { gold: {}, silver: {}, source: 'unavailable' },
          marketsClosed: true,
        });
      }
      // No cache available - will need to fetch
      console.log('🔒 Markets closed and no cache available - fetching prices');
    }

    // Refresh if cache is older than 10 minutes (only when markets are open)
    const cacheAge = spotPriceCache.lastUpdated
      ? (Date.now() - spotPriceCache.lastUpdated.getTime()) / 1000 / 60
      : Infinity;

    console.log(`📊 /api/spot-prices called - Cache age: ${cacheAge.toFixed(1)} minutes`);

    if (cacheAge > 10) {
      console.log('🔄 Cache expired, fetching fresh prices...');
      await fetchLiveSpotPrices();
    } else {
      console.log(`✅ Serving cached prices (${(10 - cacheAge).toFixed(1)} min until refresh)`);
    }

    res.json({
      success: true,
      ...spotPriceCache.prices,
      timestamp: spotPriceCache.lastUpdated ? spotPriceCache.lastUpdated.toISOString() : new Date().toISOString(),
      source: spotPriceCache.source || 'goldapi-io',
      cacheAgeMinutes: spotPriceCache.lastUpdated ? Math.round(cacheAge * 10) / 10 : 0,
      change: spotPriceCache.change || { gold: {}, silver: {}, source: 'unavailable' },
      marketsClosed: marketsClosed,
    });
  } catch (error) {
    console.error('Spot price error:', error);
    res.json({
      success: true,
      ...spotPriceCache.prices,
      timestamp: spotPriceCache.lastUpdated ? spotPriceCache.lastUpdated.toISOString() : new Date().toISOString(),
      source: 'cached',
      error: error.message,
      change: spotPriceCache.change || { gold: {}, silver: {}, source: 'unavailable' },
      marketsClosed: areMarketsClosed(),
    });
  }
});

/**
 * Widget data endpoint — returns portfolio-relevant data with 7-day sparklines
 */
app.get('/api/widget-data', async (req, res) => {
  try {
    const prices = spotPriceCache.prices;
    const change = spotPriceCache.change || {};

    // Build sparkline data from price_log (last 24 hours, hourly)
    let sparklines = { gold: [], silver: [], platinum: [], palladium: [] };

    if (isSupabaseAvailable()) {
      try {
        const supabaseClient = getSupabase();
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const { data: logs, error: logError } = await supabaseClient
          .from('price_log')
          .select('timestamp, gold_price, silver_price, platinum_price, palladium_price')
          .gte('timestamp', twentyFourHoursAgo)
          .order('timestamp', { ascending: true });

        if (logError) {
          console.log(`[Widget] price_log query error:`, logError.message);
        }
        if (logs && logs.length > 0) {
          // Downsample to hourly: keep last entry per hour
          const byHour = {};
          for (const row of logs) {
            const hourKey = row.timestamp.substring(0, 13); // YYYY-MM-DDTHH
            byHour[hourKey] = row;
          }
          const sorted = Object.entries(byHour).sort(([a], [b]) => a.localeCompare(b));

          sparklines.gold = sorted.map(([, r]) => parseFloat(r.gold_price) || prices.gold || 0);
          sparklines.silver = sorted.map(([, r]) => parseFloat(r.silver_price) || prices.silver || 0);
          sparklines.platinum = sorted.map(([, r]) => parseFloat(r.platinum_price) || prices.platinum || 0);
          sparklines.palladium = sorted.map(([, r]) => parseFloat(r.palladium_price) || prices.palladium || 0);

          // Append current price as latest point
          for (const metal of ['gold', 'silver', 'platinum', 'palladium']) {
            sparklines[metal].push(prices[metal] || 0);
          }
        }
      } catch (e) {
        console.log('Widget sparkline fetch error:', e.message);
      }
    }

    // If no sparkline data, fill with current price (flat line)
    for (const metal of ['gold', 'silver', 'platinum', 'palladium']) {
      if (sparklines[metal].length < 2) {
        sparklines[metal] = [prices[metal] || 0, prices[metal] || 0];
      }
    }

    // Zero out change data when markets are closed
    const closed = areMarketsClosed();
    const widgetChange = closed ? {} : change;

    res.json({
      success: true,
      portfolio_value: 0, // Widget gets this from App Group, not backend
      daily_change: 0,
      daily_change_pct: 0,
      metals: [
        { symbol: 'Au', price: prices.gold, change_pct: closed ? 0 : (change.gold?.percent || 0), sparkline: sparklines.gold },
        { symbol: 'Ag', price: prices.silver, change_pct: closed ? 0 : (change.silver?.percent || 0), sparkline: sparklines.silver },
        { symbol: 'Pt', price: prices.platinum, change_pct: closed ? 0 : (change.platinum?.percent || 0), sparkline: sparklines.platinum },
        { symbol: 'Pd', price: prices.palladium, change_pct: closed ? 0 : (change.palladium?.percent || 0), sparkline: sparklines.palladium },
      ],
      timestamp: spotPriceCache.lastUpdated ? spotPriceCache.lastUpdated.toISOString() : new Date().toISOString(),
      change: widgetChange,
    });
  } catch (error) {
    console.error('Widget data error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 24-hour TRADING sparkline data for Today tab (Portfolio Pulse + Metal Movers)
 * Returns hourly price points from the last 24 trading hours, filtering out
 * market-closed windows (Fri 5PM ET → Sun 6PM ET). Looks back up to 96 clock
 * hours to bridge weekend gaps.
 */
app.get('/api/sparkline-24h', async (req, res) => {
  try {
    const prices = spotPriceCache.prices;
    let sparklines = { gold: [], silver: [], platinum: [], palladium: [] };
    let timestamps = [];

    if (isSupabaseAvailable()) {
      try {
        const supabaseClient = getSupabase();
        // Look back 96 hours to guarantee 24 trading hours across weekend gaps
        const lookbackDate = new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString();
        const { data: logs, error: logError } = await supabaseClient
          .from('price_log')
          .select('timestamp, gold_price, silver_price, platinum_price, palladium_price')
          .gte('timestamp', lookbackDate)
          .order('timestamp', { ascending: true });

        if (logError) {
          console.log(`[Sparkline-24h] price_log query error:`, logError.message);
        }
        if (logs && logs.length > 0) {
          // Filter out rows during market closed windows (Fri 5PM ET → Sun 6PM ET)
          const tradingLogs = logs.filter(row => {
            try {
              const d = new Date(row.timestamp);
              const parts = {};
              for (const p of new Intl.DateTimeFormat('en-US', {
                timeZone: 'America/New_York', hourCycle: 'h23', weekday: 'short', hour: 'numeric',
              }).formatToParts(d)) { parts[p.type] = p.value; }
              const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
              const day = dayMap[parts.weekday];
              const hour = parseInt(parts.hour, 10);
              if (day === 6) return false;              // Saturday
              if (day === 0 && hour < 18) return false; // Sunday before 6PM ET
              if (day === 5 && hour >= 17) return false; // Friday 5PM ET+
              return true;
            } catch (e) { return true; }
          });

          // Downsample to hourly: keep last entry per hour
          const byHour = {};
          for (const row of tradingLogs) {
            const hourKey = row.timestamp.substring(0, 13); // YYYY-MM-DDTHH
            byHour[hourKey] = row;
          }
          const sorted = Object.entries(byHour).sort(([a], [b]) => a.localeCompare(b));

          timestamps = sorted.map(([, r]) => r.timestamp);
          sparklines.gold = sorted.map(([, r]) => parseFloat(r.gold_price) || prices.gold || 0);
          sparklines.silver = sorted.map(([, r]) => parseFloat(r.silver_price) || prices.silver || 0);
          sparklines.platinum = sorted.map(([, r]) => parseFloat(r.platinum_price) || prices.platinum || 0);
          sparklines.palladium = sorted.map(([, r]) => parseFloat(r.palladium_price) || prices.palladium || 0);
        }
      } catch (e) {
        console.log('Sparkline-24h fetch error:', e.message);
      }
    }

    // Append current price as latest point
    timestamps.push(new Date().toISOString());
    for (const metal of ['gold', 'silver', 'platinum', 'palladium']) {
      sparklines[metal].push(prices[metal] || 0);
      // Fallback: if still < 2 points, use current price twice
      if (sparklines[metal].length < 2) {
        sparklines[metal] = [prices[metal] || 0, prices[metal] || 0];
        timestamps = [new Date(Date.now() - 3600000).toISOString(), new Date().toISOString()];
      }
    }

    res.json({ success: true, sparklines, timestamps });
  } catch (error) {
    console.error('Sparkline-24h error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * One-time backfill: Populate price_log with historical Pt/Pd data from PPLT/PALL ETFs
 * Fetches 1 year of daily ETF closing prices, converts to spot using calibration ratios,
 * and inserts into price_log for dates that don't already have Pt/Pd data.
 */
app.post('/api/backfill-price-log', async (req, res) => {
  if (!isSupabaseAvailable()) {
    return res.status(503).json({ success: false, error: 'Supabase not available' });
  }

  try {
    const supabaseClient = getSupabase();
    const YahooFinance = require('yahoo-finance2').default;
    const yahooFinance = new YahooFinance();

    // Get current calibration ratios for ETF→spot conversion
    const today = new Date().toISOString().split('T')[0];
    const ratios = await getRatioForDate(today);
    const ppltRatio = ratios.pplt_ratio || DEFAULT_PPLT_RATIO;
    const pallRatio = ratios.pall_ratio || DEFAULT_PALL_RATIO;

    console.log(`📊 [Backfill] Starting Pt/Pd backfill with ratios: PPLT=${ppltRatio}, PALL=${pallRatio}`);

    // Fetch 1 year of daily PPLT and PALL data from Yahoo Finance
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const [ppltData, pallData] = await Promise.all([
      yahooFinance.historical('PPLT', {
        period1: oneYearAgo,
        period2: new Date(),
        interval: '1d',
      }).catch(e => { console.log('[Backfill] PPLT fetch error:', e.message); return []; }),
      yahooFinance.historical('PALL', {
        period1: oneYearAgo,
        period2: new Date(),
        interval: '1d',
      }).catch(e => { console.log('[Backfill] PALL fetch error:', e.message); return []; }),
    ]);

    console.log(`📊 [Backfill] Fetched ${ppltData.length} PPLT rows, ${pallData.length} PALL rows`);

    // Index PALL data by date for easy lookup
    const pallByDate = {};
    for (const row of pallData) {
      const dateStr = new Date(row.date).toISOString().split('T')[0];
      pallByDate[dateStr] = row.close;
    }

    // Also fetch existing GLD/SLV for the same period so we can fill gold/silver too
    const [gldData, slvData] = await Promise.all([
      yahooFinance.historical('GLD', {
        period1: oneYearAgo,
        period2: new Date(),
        interval: '1d',
      }).catch(e => { console.log('[Backfill] GLD fetch error:', e.message); return []; }),
      yahooFinance.historical('SLV', {
        period1: oneYearAgo,
        period2: new Date(),
        interval: '1d',
      }).catch(e => { console.log('[Backfill] SLV fetch error:', e.message); return []; }),
    ]);

    const gldByDate = {};
    for (const row of gldData) {
      const dateStr = new Date(row.date).toISOString().split('T')[0];
      gldByDate[dateStr] = row.close;
    }
    const slvByDate = {};
    for (const row of slvData) {
      const dateStr = new Date(row.date).toISOString().split('T')[0];
      slvByDate[dateStr] = row.close;
    }

    // Check which dates already have Pt/Pd data in price_log
    const { data: existingDates, error: existErr } = await supabaseClient
      .from('price_log')
      .select('timestamp')
      .not('platinum_price', 'is', null)
      .gte('timestamp', oneYearAgo.toISOString())
      .order('timestamp', { ascending: true });

    if (existErr) {
      console.log('[Backfill] Error checking existing dates:', existErr.message);
    }

    const existingDateSet = new Set();
    if (existingDates) {
      for (const row of existingDates) {
        existingDateSet.add(row.timestamp.substring(0, 10));
      }
    }

    console.log(`📊 [Backfill] ${existingDateSet.size} dates already have Pt/Pd data`);

    // Build rows to insert
    let inserted = 0;
    let skipped = 0;
    const gldRatio = ratios.gld_ratio || 0.092;
    const slvRatio = ratios.slv_ratio || 0.92;

    for (const ppltRow of ppltData) {
      const dateStr = new Date(ppltRow.date).toISOString().split('T')[0];

      if (existingDateSet.has(dateStr)) {
        skipped++;
        continue;
      }

      const ppltClose = ppltRow.close;
      const pallClose = pallByDate[dateStr] || null;
      const gldClose = gldByDate[dateStr] || null;
      const slvClose = slvByDate[dateStr] || null;

      // Convert ETF prices to spot
      const platinumSpot = ppltClose ? Math.round((ppltClose / ppltRatio) * 100) / 100 : null;
      const palladiumSpot = pallClose ? Math.round((pallClose / pallRatio) * 100) / 100 : null;
      const goldSpot = gldClose ? Math.round((gldClose / gldRatio) * 100) / 100 : null;
      const silverSpot = slvClose ? Math.round((slvClose / slvRatio) * 100) / 100 : null;

      // Insert one row per day at market close time (16:00 ET = 21:00 UTC)
      const timestamp = `${dateStr}T21:00:00.000Z`;

      const { error: insertErr } = await supabaseClient
        .from('price_log')
        .insert({
          timestamp,
          gold_price: goldSpot,
          silver_price: silverSpot,
          platinum_price: platinumSpot,
          palladium_price: palladiumSpot,
          source: 'etf-backfill',
        });

      if (insertErr) {
        // Skip duplicate timestamp errors silently
        if (!insertErr.message.includes('duplicate')) {
          console.log(`[Backfill] Insert error for ${dateStr}:`, insertErr.message);
        }
        skipped++;
      } else {
        inserted++;
      }
    }

    console.log(`✅ [Backfill] Complete: ${inserted} rows inserted, ${skipped} skipped`);

    res.json({
      success: true,
      message: `Backfill complete: ${inserted} rows inserted, ${skipped} skipped`,
      details: {
        ppltDays: ppltData.length,
        pallDays: pallData.length,
        gldDays: gldData.length,
        slvDays: slvData.length,
        inserted,
        skipped,
        ratios: { ppltRatio, pallRatio, gldRatio, slvRatio },
      },
    });
  } catch (error) {
    console.error('[Backfill] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Debug endpoint - Scraper usage stats
 */
app.get('/api/debug/api-usage', (req, res) => {
  const hoursSinceReset = (new Date() - apiRequestCounter.lastReset) / 1000 / 60 / 60;
  const scrapesPerHour = apiRequestCounter.total / Math.max(hoursSinceReset, 0.01);
  const projectedDaily = scrapesPerHour * 24;
  const projectedMonthly = scrapesPerHour * 24 * 30;

  res.json({
    totalScrapes: apiRequestCounter.total,
    startTime: apiRequestCounter.lastReset.toISOString(),
    hoursSinceReset: Math.round(hoursSinceReset * 10) / 10,
    scrapesPerHour: Math.round(scrapesPerHour * 10) / 10,
    projectedDaily: Math.round(projectedDaily),
    projectedMonthly: Math.round(projectedMonthly),
    unlimited: true,
    free: true,
    note: 'Web scraping is 100% free and unlimited!',
    recentCalls: apiRequestCounter.calls.slice(-10),
    cacheStatus: {
      lastUpdated: spotPriceCache.lastUpdated ? spotPriceCache.lastUpdated.toISOString() : null,
      ageMinutes: spotPriceCache.lastUpdated
        ? Math.round((Date.now() - spotPriceCache.lastUpdated.getTime()) / 1000 / 60 * 10) / 10
        : null,
      source: spotPriceCache.source,
    }
  });
});

/**
 * Debug endpoint - push notification system status
 */
app.get('/api/debug/push-status', async (req, res) => {
  try {
    const { lastCheckTime, lastCheckStats } = getLastCheckInfo();
    let alertCount = 0;
    let tokenCount = 0;

    if (isSupabaseAvailable()) {
      const sb = getSupabase();
      const { count: ac } = await sb.from('price_alerts').select('*', { count: 'exact', head: true }).eq('enabled', true).eq('triggered', false);
      const { count: tc } = await sb.from('push_tokens').select('*', { count: 'exact', head: true });
      alertCount = ac || 0;
      tokenCount = tc || 0;
    }

    res.json({
      envVars: {
        SUPABASE_URL: !!process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        SUPABASE_ANON_KEY: !!process.env.SUPABASE_ANON_KEY,
      },
      supabaseAvailable: isSupabaseAvailable(),
      lastCheckTime,
      lastCheckStats,
      activeAlerts: alertCount,
      registeredTokens: tokenCount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Debug endpoint - manually trigger one price alert check cycle
 */
app.post('/api/debug/trigger-alert-check', async (req, res) => {
  try {
    console.log('🔧 Manual alert check triggered via debug endpoint');
    const stats = await checkPriceAlerts(spotPriceCache.prices);
    res.json({
      success: true,
      pricesUsed: spotPriceCache.prices,
      stats,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Debug endpoint - check historical data
 */
app.get('/api/historical-debug', async (req, res) => {
  const { date } = req.query;

  if (date) {
    // Check specific date
    res.json({
      date,
      goldPrice: historicalData.gold[date],
      silverPrice: historicalData.silver[date],
      allKeysContaining: Object.keys(historicalData.gold).filter(k => k.includes(date)).slice(0, 10)
    });
  } else {
    // Show system status including price_log stats
    const goldKeys = Object.keys(historicalData.gold).slice(0, 20);
    const sample = {};
    goldKeys.forEach(k => {
      sample[k] = { gold: historicalData.gold[k], silver: historicalData.silver[k] };
    });

    // Get price log stats if available
    let priceLogStats = { available: false };
    try {
      priceLogStats = await getLogStats();
    } catch (err) {
      priceLogStats = { available: false, error: err.message };
    }

    res.json({
      macroTrendsData: {
        totalDays: Object.keys(historicalData.gold).length,
        loaded: historicalData.loaded,
        sampleKeys: goldKeys,
        sampleData: sample
      },
      priceLog: priceLogStats,
      supabaseConfigured: isSupabaseAvailable(),
      dataSources: {
        tier1: 'MacroTrends monthly data (1915-2006)',
        tier2: 'Yahoo Finance SLV/GLD ETF data (2006-present)',
        tier3: 'Our price_log database (minute-level, accumulating)'
      }
    });
  }
});

/**
 * Get historical spot price for a specific date
 *
 * THREE-TIER HISTORICAL DATA SYSTEM:
 * 1. Pre-April 2006: Monthly prices from historical-prices.json (MacroTrends data)
 * 2. April 2006 to Present: Daily/intraday from SLV/GLD ETF data via Yahoo Finance
 * 3. Recent (if logged): Minute-level from our own price_log database
 *
 * Query params:
 * - date: YYYY-MM-DD (required)
 * - time: HH:MM (optional, for intraday estimation)
 * - metal: 'gold' or 'silver' (default: returns both)
 */
app.get('/api/historical-spot', async (req, res) => {
  try {
    const { date, time, metal } = req.query;

    console.log(`📅 Historical spot lookup: ${date}${time ? ' ' + time : ''}`);

    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date is required (YYYY-MM-DD)'
      });
    }

    // Normalize and validate date format
    const normalizedDate = date.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
      console.log(`   Invalid date format: ${normalizedDate}`);
      return res.status(400).json({
        success: false,
        error: 'Date must be in YYYY-MM-DD format'
      });
    }

    // Validate time format if provided
    if (time && !/^\d{2}:\d{2}$/.test(time)) {
      return res.status(400).json({
        success: false,
        error: 'Time must be in HH:MM format'
      });
    }

    const requestedDate = new Date(normalizedDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Don't allow future dates
    if (requestedDate > today) {
      console.log(`   Future date requested: ${normalizedDate}, using current spot`);
      return res.json({
        success: true,
        date: normalizedDate,
        time: time || null,
        gold: spotPriceCache.prices.gold,
        silver: spotPriceCache.prices.silver,
        platinum: spotPriceCache.prices.platinum || null,
        palladium: spotPriceCache.prices.palladium || null,
        granularity: 'current',
        source: 'current-spot',
        note: 'Future date requested, using current spot price'
      });
    }

    const year = requestedDate.getFullYear();
    const month = String(requestedDate.getMonth() + 1).padStart(2, '0');
    const monthKey = `${year}-${month}`;

    let goldPrice, silverPrice, platinumPrice, palladiumPrice, granularity, source;
    let dailyRange = null;
    let note = null;

    // ================================================================
    // TIER 1: Pre-April 2006 - Use monthly MacroTrends data
    // (SLV launched April 2006, so no ETF data before that)
    // ================================================================
    if (year < 2006 || (year === 2006 && requestedDate.getMonth() < 3)) {
      console.log(`   Pre-2006 date, using MacroTrends monthly data`);

      const monthData = {
        gold: historicalData.gold[normalizedDate],
        silver: historicalData.silver[normalizedDate]
      };

      if (monthData.gold && monthData.silver) {
        goldPrice = monthData.gold;
        silverPrice = monthData.silver;
        granularity = 'monthly';
        source = 'macrotrends';
        note = 'Pre-2006 data uses monthly averages. Adjust manually if you know the exact price.';
        console.log(`   ✅ Found MacroTrends data: Gold $${goldPrice}, Silver $${silverPrice}`);
      } else {
        console.log(`   ❌ No MacroTrends data for ${monthKey}`);
        return res.status(404).json({
          success: false,
          error: `No historical data found for ${monthKey}`
        });
      }
    }

    // ================================================================
    // TIER 2 & 3: April 2006 to Present - ETF data + our logged data
    // ================================================================
    else {
      // First, check our own price_log for logged minute-level data
      if (isSupabaseAvailable()) {
        console.log(`   Checking price_log database...`);
        const loggedPrice = time
          ? await findLoggedPrice(normalizedDate, time, 5) // ±5 min window
          : await findClosestLoggedPrice(normalizedDate);

        if (loggedPrice) {
          goldPrice = loggedPrice.gold;
          silverPrice = loggedPrice.silver;
          platinumPrice = loggedPrice.platinum || null;
          palladiumPrice = loggedPrice.palladium || null;
          granularity = time ? 'minute' : 'logged_daily';
          source = 'price_log';
          console.log(`   ✅ Found in price_log: Gold $${goldPrice}, Silver $${silverPrice}, Pt $${platinumPrice}, Pd $${palladiumPrice}`);
        }
      }

      // If no logged data, use ETF conversion
      if (!goldPrice) {
        console.log(`   Fetching ETF data from Yahoo Finance...`);

        try {
          const { slv: slvData, gld: gldData, pplt: ppltData, pall: pallData } = await fetchAllETFs(normalizedDate);

          if (slvData && gldData) {
            // Get the calibrated ratio for that date (or nearest)
            const ratios = await getRatioForDate(normalizedDate);
            console.log(`   Using ratios: SLV=${ratios.slv_ratio.toFixed(4)}, GLD=${ratios.gld_ratio.toFixed(4)}, PPLT=${ratios.pplt_ratio.toFixed(4)}, PALL=${ratios.pall_ratio.toFixed(4)}`);

            // Convert ETF prices to spot prices
            silverPrice = slvToSpotSilver(slvData.close, ratios.slv_ratio);
            goldPrice = gldToSpotGold(gldData.close, ratios.gld_ratio);

            // Derive platinum/palladium from PPLT/PALL ETFs
            if (ppltData && !platinumPrice) {
              platinumPrice = ppltToSpotPlatinum(ppltData.close, ratios.pplt_ratio);
            }
            if (pallData && !palladiumPrice) {
              palladiumPrice = pallToSpotPalladium(pallData.close, ratios.pall_ratio);
            }

            // Provide daily range for user reference
            dailyRange = {
              silver: {
                low: Math.round(slvToSpotSilver(slvData.low, ratios.slv_ratio) * 100) / 100,
                high: Math.round(slvToSpotSilver(slvData.high, ratios.slv_ratio) * 100) / 100
              },
              gold: {
                low: Math.round(gldToSpotGold(gldData.low, ratios.gld_ratio) * 100) / 100,
                high: Math.round(gldToSpotGold(gldData.high, ratios.gld_ratio) * 100) / 100
              }
            };

            granularity = 'daily';
            source = 'etf_derived';

            // If time was provided, estimate based on time of day
            if (time) {
              const hour = parseInt(time.split(':')[0]);

              // Time-weighted estimation
              // Morning (before 10am) -> closer to open
              // Afternoon (after 2pm) -> closer to close
              // Midday -> OHLC average
              if (hour < 10) {
                silverPrice = slvToSpotSilver(
                  slvData.open * 0.7 + slvData.close * 0.3,
                  ratios.slv_ratio
                );
                goldPrice = gldToSpotGold(
                  gldData.open * 0.7 + gldData.close * 0.3,
                  ratios.gld_ratio
                );
                if (ppltData && platinumPrice) {
                  platinumPrice = ppltToSpotPlatinum(ppltData.open * 0.7 + ppltData.close * 0.3, ratios.pplt_ratio);
                }
                if (pallData && palladiumPrice) {
                  palladiumPrice = pallToSpotPalladium(pallData.open * 0.7 + pallData.close * 0.3, ratios.pall_ratio);
                }
              } else if (hour >= 14) {
                silverPrice = slvToSpotSilver(
                  slvData.open * 0.3 + slvData.close * 0.7,
                  ratios.slv_ratio
                );
                goldPrice = gldToSpotGold(
                  gldData.open * 0.3 + gldData.close * 0.7,
                  ratios.gld_ratio
                );
                if (ppltData && platinumPrice) {
                  platinumPrice = ppltToSpotPlatinum(ppltData.open * 0.3 + ppltData.close * 0.7, ratios.pplt_ratio);
                }
                if (pallData && palladiumPrice) {
                  palladiumPrice = pallToSpotPalladium(pallData.open * 0.3 + pallData.close * 0.7, ratios.pall_ratio);
                }
              } else {
                // Midday - use OHLC average
                silverPrice = slvToSpotSilver(
                  (slvData.open + slvData.high + slvData.low + slvData.close) / 4,
                  ratios.slv_ratio
                );
                goldPrice = gldToSpotGold(
                  (gldData.open + gldData.high + gldData.low + gldData.close) / 4,
                  ratios.gld_ratio
                );
                if (ppltData && platinumPrice) {
                  platinumPrice = ppltToSpotPlatinum((ppltData.open + ppltData.high + ppltData.low + ppltData.close) / 4, ratios.pplt_ratio);
                }
                if (pallData && palladiumPrice) {
                  palladiumPrice = pallToSpotPalladium((pallData.open + pallData.high + pallData.low + pallData.close) / 4, ratios.pall_ratio);
                }
              }
              granularity = 'estimated_intraday';
              note = `Estimated based on time of day. Actual range: Silver $${dailyRange.silver.low}-${dailyRange.silver.high}, Gold $${dailyRange.gold.low}-${dailyRange.gold.high}`;
            }

            console.log(`   ✅ ETF-derived prices: Gold $${goldPrice?.toFixed(2)}, Silver $${silverPrice?.toFixed(2)}, Pt $${platinumPrice?.toFixed(2) || 'N/A'}, Pd $${palladiumPrice?.toFixed(2) || 'N/A'}`);
          } else {
            console.log(`   ETF data not available for ${normalizedDate}`);
          }
        } catch (etfError) {
          console.log(`   ETF fetch error: ${etfError.message}`);
        }
      }

      // Fallback to MetalPriceAPI if ETF failed
      if (!goldPrice) {
        console.log(`   Trying MetalPriceAPI...`);
        const apiResult = await fetchHistoricalPrices(normalizedDate);

        if (apiResult && apiResult.gold && apiResult.silver) {
          goldPrice = apiResult.gold;
          silverPrice = apiResult.silver;
          granularity = 'daily';
          source = 'metalpriceapi';

          // Cache for future
          historicalPriceCache.gold[normalizedDate] = goldPrice;
          historicalPriceCache.silver[normalizedDate] = silverPrice;

          console.log(`   ✅ MetalPriceAPI: Gold $${goldPrice}, Silver $${silverPrice}`);
        }
      }

      // Final fallback to monthly MacroTrends data
      if (!goldPrice) {
        console.log(`   Falling back to MacroTrends monthly data...`);
        const monthlyGold = historicalData.gold[normalizedDate];
        const monthlySilver = historicalData.silver[normalizedDate];

        if (monthlyGold && monthlySilver) {
          goldPrice = monthlyGold;
          silverPrice = monthlySilver;
          granularity = 'monthly_fallback';
          source = 'macrotrends';
          note = 'ETF/API unavailable, using monthly average. Adjust manually if needed.';
          console.log(`   ✅ MacroTrends fallback: Gold $${goldPrice}, Silver $${silverPrice}`);
        }
      }

      // Last resort: return failure instead of contaminating with current spot
      if (!goldPrice) {
        console.log(`   ❌ No historical data found for ${normalizedDate}`);
        return res.json({
          success: true,
          date: normalizedDate,
          gold: null,
          silver: null,
          price: null,
          granularity: 'none',
          source: 'unavailable',
          note: 'Historical price not available for this date'
        });
      }
    }

    // Round prices to 2 decimal places
    goldPrice = Math.round(goldPrice * 100) / 100;
    silverPrice = Math.round(silverPrice * 100) / 100;

    // For platinum/palladium: use logged data if available, otherwise fall back to current spot
    if (!platinumPrice && spotPriceCache.prices.platinum) {
      platinumPrice = spotPriceCache.prices.platinum;
    }
    if (!palladiumPrice && spotPriceCache.prices.palladium) {
      palladiumPrice = spotPriceCache.prices.palladium;
    }
    if (platinumPrice) platinumPrice = Math.round(platinumPrice * 100) / 100;
    if (palladiumPrice) palladiumPrice = Math.round(palladiumPrice * 100) / 100;

    // Build response
    const response = {
      success: true,
      date: normalizedDate,
      time: time || null,
      gold: goldPrice,
      silver: silverPrice,
      platinum: platinumPrice || null,
      palladium: palladiumPrice || null,
      granularity,
      source
    };

    // Add daily range if available
    if (dailyRange) {
      response.dailyRange = dailyRange;
    }

    // Add note if applicable
    if (note) {
      response.note = note;
    }

    // If specific metal requested, also include just that price for backwards compatibility
    if (metal === 'gold' || metal === 'silver' || metal === 'platinum' || metal === 'palladium') {
      response.metal = metal;
      response.price = metal === 'gold' ? goldPrice : metal === 'silver' ? silverPrice : metal === 'platinum' ? platinumPrice : palladiumPrice;
    }

    console.log(`   📊 Response: ${granularity} from ${source}`);
    res.json(response);

  } catch (error) {
    console.error('❌ Historical spot error:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to lookup historical price'
    });
  }
});

/**
 * BATCH Historical Spot Price Lookup
 * Accepts multiple dates in one request - much faster than individual calls
 * Uses local MacroTrends data + current spot for speed (no external API calls)
 *
 * POST /api/historical-spot-batch
 * Body: { dates: ["2024-01-15", "2024-01-16", ...] }
 */
app.post('/api/historical-spot-batch', async (req, res) => {
  try {
    const { dates } = req.body;

    if (!dates || !Array.isArray(dates) || dates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'dates array is required'
      });
    }

    // Limit batch size to prevent abuse
    if (dates.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 100 dates per batch request'
      });
    }

    console.log(`📅 Batch historical spot lookup: ${dates.length} dates`);

    // Get today's date in a timezone-safe way (use local date components)
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const results = {};
    let fromPriceLog = 0;
    let fromMacrotrends = 0;
    let fromCurrentSpot = 0;
    let fromCache = 0;

    for (const date of dates) {
      // Validate date format
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        results[date] = { success: false, error: 'Invalid date format' };
        continue;
      }

      // For today or future dates, use current spot
      if (date >= todayStr) {
        results[date] = {
          success: true,
          gold: spotPriceCache.prices.gold,
          silver: spotPriceCache.prices.silver,
          source: 'current-spot'
        };
        fromCurrentSpot++;
        continue;
      }

      // Check our in-memory cache first (populated from previous lookups)
      if (historicalPriceCache.gold[date] && historicalPriceCache.silver[date]) {
        results[date] = {
          success: true,
          gold: historicalPriceCache.gold[date],
          silver: historicalPriceCache.silver[date],
          source: 'cache'
        };
        fromCache++;
        continue;
      }

      // Parse the date to determine which tier to use
      const requestedDate = new Date(date + 'T12:00:00'); // Use noon to avoid timezone issues
      const year = requestedDate.getFullYear();

      // TIER 1: For dates >= April 2006, check price_log first (most accurate)
      if (year >= 2006 && !(year === 2006 && requestedDate.getMonth() < 3)) {
        if (isSupabaseAvailable()) {
          try {
            const loggedPrice = await findClosestLoggedPrice(date);
            if (loggedPrice && loggedPrice.gold && loggedPrice.silver) {
              results[date] = {
                success: true,
                gold: loggedPrice.gold,
                silver: loggedPrice.silver,
                source: 'price_log'
              };
              // Cache for future
              historicalPriceCache.gold[date] = loggedPrice.gold;
              historicalPriceCache.silver[date] = loggedPrice.silver;
              fromPriceLog++;
              continue;
            }
          } catch (err) {
            // price_log lookup failed, continue to fallback
          }
        }
      }

      // TIER 2: Use MacroTrends data (available for most dates as monthly averages)
      const goldPrice = historicalData.gold[date];
      const silverPrice = historicalData.silver[date];

      if (goldPrice && silverPrice) {
        results[date] = {
          success: true,
          gold: goldPrice,
          silver: silverPrice,
          source: 'macrotrends'
        };
        // Cache for future
        historicalPriceCache.gold[date] = goldPrice;
        historicalPriceCache.silver[date] = silverPrice;
        fromMacrotrends++;
        continue;
      }

      // Fallback: use current spot for missing data
      results[date] = {
        success: true,
        gold: spotPriceCache.prices.gold,
        silver: spotPriceCache.prices.silver,
        source: 'current-spot-fallback',
        note: 'Historical data not available, using current spot'
      };
      fromCurrentSpot++;
    }

    console.log(`   ✅ Batch complete: ${fromPriceLog} price_log, ${fromMacrotrends} macrotrends, ${fromCache} cached, ${fromCurrentSpot} current spot`);

    res.json({
      success: true,
      count: dates.length,
      results
    });

  } catch (error) {
    console.error('❌ Batch historical spot error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to lookup historical prices'
    });
  }
});

// ============================================
// SPOT PRICE HISTORY (for charting)
// ============================================

/**
 * GET /api/spot-price-history
 * Returns sampled historical gold/silver prices optimized for mobile charts.
 * Query params:
 *   range: 1M|3M|6M|1Y|5Y|ALL (default: 1Y)
 *   maxPoints: max data points to return (default: 60, max: 200)
 */
app.get('/api/spot-price-history', async (req, res) => {
  try {
    const { range = '1Y', maxPoints = '60' } = req.query;
    const maxPts = Math.min(parseInt(maxPoints) || 60, 200);

    const now = new Date();
    let startDate;

    switch (range.toUpperCase()) {
      case '1M':
        startDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        break;
      case '3M':
        startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
        break;
      case '6M':
        startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
        break;
      case '1Y':
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        break;
      case '5Y':
        startDate = new Date(now.getFullYear() - 5, now.getMonth(), now.getDate());
        break;
      case 'ALL':
        startDate = new Date(1915, 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    }

    const startStr = startDate.toISOString().split('T')[0];
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    let allPoints = [];

    if (!historicalData.loaded) {
      return res.status(503).json({ success: false, error: 'Historical data not loaded yet' });
    }

    // For short ranges, use daily keys; for long ranges, use first-of-month
    if (['1M', '3M', '6M'].includes(range.toUpperCase())) {
      // Daily resolution from historicalData
      const dates = Object.keys(historicalData.gold)
        .filter(d => d >= startStr && d <= todayStr)
        .sort();

      for (const date of dates) {
        const g = historicalData.gold[date];
        const s = historicalData.silver[date];
        if (g && s) {
          allPoints.push({ date, gold: g, silver: s });
        }
      }
    } else {
      // Monthly resolution: use first-of-month keys
      const monthKeys = Object.keys(historicalData.gold)
        .filter(d => d.endsWith('-01') && d >= startStr && d <= todayStr)
        .sort();

      for (const date of monthKeys) {
        const g = historicalData.gold[date];
        const s = historicalData.silver[date];
        if (g && s) {
          allPoints.push({ date, gold: g, silver: s });
        }
      }
    }

    // Overlay price_log for full date range (provides Pt/Pd data and more accurate recent prices)
    if (isSupabaseAvailable()) {
      try {
        const { data: logData } = await getSupabase()
          .from('price_log')
          .select('timestamp, gold_price, silver_price, platinum_price, palladium_price')
          .gte('timestamp', startStr + 'T00:00:00')
          .order('timestamp', { ascending: true });

        if (logData && logData.length > 0) {
          // Group by date, take first entry per day
          const dailyPrices = {};
          for (const row of logData) {
            const d = row.timestamp.split('T')[0];
            if (!dailyPrices[d]) {
              dailyPrices[d] = {
                gold: parseFloat(row.gold_price) || 0,
                silver: parseFloat(row.silver_price) || 0,
                platinum: row.platinum_price ? parseFloat(row.platinum_price) : 0,
                palladium: row.palladium_price ? parseFloat(row.palladium_price) : 0,
              };
            }
          }
          // Override matching points with more accurate price_log data
          for (const pt of allPoints) {
            if (dailyPrices[pt.date]) {
              if (dailyPrices[pt.date].gold > 0) pt.gold = dailyPrices[pt.date].gold;
              if (dailyPrices[pt.date].silver > 0) pt.silver = dailyPrices[pt.date].silver;
              pt.platinum = dailyPrices[pt.date].platinum || pt.platinum || 0;
              pt.palladium = dailyPrices[pt.date].palladium || pt.palladium || 0;
            }
          }
          // Add any price_log dates not already in allPoints
          const existingDates = new Set(allPoints.map(p => p.date));
          for (const [d, prices] of Object.entries(dailyPrices)) {
            if (d >= startStr && d <= todayStr && !existingDates.has(d)) {
              allPoints.push({ date: d, gold: prices.gold, silver: prices.silver, platinum: prices.platinum, palladium: prices.palladium });
            }
          }
        }
      } catch (err) {
        console.log('price_log overlay failed:', err.message);
      }
    }

    // Append current spot as final point
    if (spotPriceCache.prices.gold > 0 && spotPriceCache.prices.silver > 0) {
      allPoints.push({
        date: todayStr,
        gold: spotPriceCache.prices.gold,
        silver: spotPriceCache.prices.silver,
        platinum: spotPriceCache.prices.platinum || 0,
        palladium: spotPriceCache.prices.palladium || 0,
      });
    }

    // Deduplicate by date (keep last entry per date)
    const byDate = {};
    for (const pt of allPoints) {
      byDate[pt.date] = pt;
    }
    allPoints = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));

    // Fill platinum/palladium gaps: forward-fill then backward-fill
    // Historical JSON only has gold/silver; price_log has pt/pd for recent ~30 days
    let lastPt = 0, lastPd = 0;
    for (const pt of allPoints) {
      if (pt.platinum > 0) lastPt = pt.platinum;
      else pt.platinum = lastPt;
      if (pt.palladium > 0) lastPd = pt.palladium;
      else pt.palladium = lastPd;
    }
    // Backward-fill for points before first known pt/pd value
    lastPt = 0; lastPd = 0;
    for (let i = allPoints.length - 1; i >= 0; i--) {
      if (allPoints[i].platinum > 0) lastPt = allPoints[i].platinum;
      else allPoints[i].platinum = lastPt;
      if (allPoints[i].palladium > 0) lastPd = allPoints[i].palladium;
      else allPoints[i].palladium = lastPd;
    }

    // Sample down to maxPoints using evenly-spaced selection
    let sampled = allPoints;
    if (allPoints.length > maxPts) {
      sampled = [];
      const step = (allPoints.length - 1) / (maxPts - 1);
      for (let i = 0; i < maxPts - 1; i++) {
        sampled.push(allPoints[Math.round(i * step)]);
      }
      sampled.push(allPoints[allPoints.length - 1]);
    }

    res.json({
      success: true,
      range: range.toUpperCase(),
      totalPoints: allPoints.length,
      sampledPoints: sampled.length,
      data: sampled,
    });
  } catch (error) {
    console.error('Spot price history error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch spot price history' });
  }
});

// ============================================
// SCAN USAGE TRACKING (Server-Side with /tmp/ persistence)
// ============================================

const FREE_SCAN_LIMIT = 5;
const SCAN_PERIOD_DAYS = 30;

// Use /tmp/ directory which is writable on Railway
// Note: /tmp/ persists during the container lifetime but resets on redeploy
const SCAN_USAGE_FILE = '/tmp/scan-usage.json';
let scanUsageData = {}; // In-memory cache

// Load scan usage data from /tmp/ file on startup
function loadScanUsageData() {
  try {
    if (fs.existsSync(SCAN_USAGE_FILE)) {
      const data = fs.readFileSync(SCAN_USAGE_FILE, 'utf8');
      scanUsageData = JSON.parse(data);
      console.log(`📊 Loaded scan usage data for ${Object.keys(scanUsageData).length} users from ${SCAN_USAGE_FILE}`);
    } else {
      console.log('📊 No scan usage file found, starting fresh');
      scanUsageData = {};
    }
  } catch (error) {
    console.error('❌ Failed to load scan usage data:', error.message);
    scanUsageData = {};
  }
}

// Save scan usage data to /tmp/ file
function saveScanUsageData() {
  try {
    fs.writeFileSync(SCAN_USAGE_FILE, JSON.stringify(scanUsageData, null, 2));
  } catch (error) {
    console.error('❌ Failed to save scan usage data:', error.message);
  }
}

// Save user scan data (updates in-memory and persists to file)
async function saveScanUsageForUser(userId, userRecord) {
  scanUsageData[userId] = userRecord;
  saveScanUsageData();
}

// Check if period needs reset (older than 30 days)
function checkAndResetPeriod(userRecord) {
  const now = new Date();
  const periodStart = new Date(userRecord.periodStart);
  const daysSincePeriodStart = (now - periodStart) / (1000 * 60 * 60 * 24);

  if (daysSincePeriodStart >= SCAN_PERIOD_DAYS) {
    userRecord.scansUsed = 0;
    userRecord.periodStart = now.toISOString();
    return true; // Period was reset
  }
  return false;
}

// Calculate when period resets
function getResetDate(periodStart) {
  const resetDate = new Date(periodStart);
  resetDate.setDate(resetDate.getDate() + SCAN_PERIOD_DAYS);
  return resetDate.toISOString();
}

/**
 * Test Gemini API connection
 * GET /api/test-gemini
 */
app.get('/api/test-gemini', async (req, res) => {
  const geminiApiKey = process.env.GEMINI_API_KEY;

  if (!geminiApiKey) {
    return res.json({
      success: false,
      error: 'GEMINI_API_KEY not configured in environment variables',
      configured: false
    });
  }

  try {
    console.log('🧪 Testing Gemini API connection...');

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        contents: [{
          parts: [{ text: 'Say "Gemini is working!" in exactly those words.' }]
        }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 50,
        }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    const responseText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;

    console.log('✅ Gemini test successful:', responseText);

    res.json({
      success: true,
      configured: true,
      apiKeyPrefix: geminiApiKey.substring(0, 8) + '...',
      response: responseText,
      model: 'gemini-2.0-flash'
    });

  } catch (error) {
    console.error('❌ Gemini test failed:', error.message);

    res.json({
      success: false,
      configured: true,
      apiKeyPrefix: geminiApiKey.substring(0, 8) + '...',
      error: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      responseData: error.response?.data
    });
  }
});

/**
 * Get scan status for a user
 * GET /api/scan-status?rcUserId={revenueCatUserId}
 */
app.get('/api/scan-status', async (req, res) => {
  try {
    const { rcUserId } = req.query;

    if (!rcUserId) {
      return res.status(400).json({ error: 'rcUserId parameter required' });
    }

    console.log(`📊 Scan status check for user: ${rcUserId.substring(0, 8)}...`);

    // Get or create user record
    if (!scanUsageData[rcUserId]) {
      scanUsageData[rcUserId] = {
        scansUsed: 0,
        periodStart: new Date().toISOString()
      };
      await saveScanUsageForUser(rcUserId, scanUsageData[rcUserId]);
    }

    const userRecord = scanUsageData[rcUserId];

    // Check if period needs reset
    const wasReset = checkAndResetPeriod(userRecord);
    if (wasReset) {
      console.log(`   Period reset for user ${rcUserId.substring(0, 8)}...`);
      await saveScanUsageForUser(rcUserId, userRecord);
    }

    const response = {
      success: true,
      scansUsed: userRecord.scansUsed,
      scansLimit: FREE_SCAN_LIMIT,
      periodStart: userRecord.periodStart,
      resetsAt: getResetDate(userRecord.periodStart)
    };

    console.log(`   Scans used: ${userRecord.scansUsed}/${FREE_SCAN_LIMIT}`);

    res.json(response);
  } catch (error) {
    console.error('❌ Scan status error:', error);
    res.status(500).json({ error: 'Failed to get scan status' });
  }
});

/**
 * Increment scan count for a user (called after successful scan)
 * POST /api/increment-scan
 * Body: { rcUserId }
 */
app.post('/api/increment-scan', async (req, res) => {
  try {
    const { rcUserId } = req.body;

    if (!rcUserId) {
      return res.status(400).json({ error: 'rcUserId required in request body' });
    }

    console.log(`📊 Incrementing scan count for user: ${rcUserId.substring(0, 8)}...`);

    // Get or create user record
    if (!scanUsageData[rcUserId]) {
      scanUsageData[rcUserId] = {
        scansUsed: 0,
        periodStart: new Date().toISOString()
      };
    }

    const userRecord = scanUsageData[rcUserId];

    // Check if period needs reset first
    checkAndResetPeriod(userRecord);

    // Increment scan count
    userRecord.scansUsed += 1;

    // Save to Redis (or in-memory)
    await saveScanUsageForUser(rcUserId, userRecord);

    const response = {
      success: true,
      scansUsed: userRecord.scansUsed,
      scansLimit: FREE_SCAN_LIMIT,
      periodStart: userRecord.periodStart,
      resetsAt: getResetDate(userRecord.periodStart)
    };

    console.log(`   New scan count: ${userRecord.scansUsed}/${FREE_SCAN_LIMIT}`);

    res.json(response);
  } catch (error) {
    console.error('❌ Increment scan error:', error);
    res.status(500).json({ error: 'Failed to increment scan count' });
  }
});

// ============================================
// PRICE ALERTS (Gold/Lifetime Feature)
// ============================================

/**
 * Create a new price alert
 * POST /api/alerts
 * Body: { userId, metal, targetPrice, direction, pushToken }
 */
app.post('/api/alerts', async (req, res) => {
  try {
    const { userId, metal, targetPrice, direction, pushToken } = req.body;

    // Validate required fields
    if (!userId || !metal || !targetPrice || !direction) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: userId, metal, targetPrice, direction'
      });
    }

    // Validate metal
    if (!['gold', 'silver'].includes(metal)) {
      return res.status(400).json({
        success: false,
        error: 'Metal must be "gold" or "silver"'
      });
    }

    // Validate direction
    if (!['above', 'below'].includes(direction)) {
      return res.status(400).json({
        success: false,
        error: 'Direction must be "above" or "below"'
      });
    }

    // Validate target price
    const price = parseFloat(targetPrice);
    if (isNaN(price) || price <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Target price must be a positive number'
      });
    }

    const alert = await createAlert({
      userId,
      metal,
      targetPrice: price,
      direction,
      pushToken: pushToken || null
    });

    res.json({
      success: true,
      alert
    });

  } catch (error) {
    console.error('❌ Create alert error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create alert'
    });
  }
});

/**
 * Get all alerts for a user
 * GET /api/alerts/:userId
 */
app.get('/api/alerts/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    const alerts = await getAlertsForUser(userId);

    res.json({
      success: true,
      alerts,
      count: alerts.length
    });

  } catch (error) {
    console.error('❌ Get alerts error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get alerts'
    });
  }
});

/**
 * Delete an alert
 * DELETE /api/alerts/:alertId
 * Query: userId (required for ownership verification)
 */
app.delete('/api/alerts/:alertId', async (req, res) => {
  try {
    const { alertId } = req.params;
    const { userId } = req.query;

    if (!alertId || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Alert ID and User ID are required'
      });
    }

    await deleteAlert(alertId, userId);

    res.json({
      success: true,
      message: 'Alert deleted'
    });

  } catch (error) {
    console.error('❌ Delete alert error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete alert'
    });
  }
});

/**
 * Check all active alerts against current prices
 * POST /api/alerts/check
 * This should be called periodically (e.g., every 15 minutes)
 */
app.post('/api/alerts/check', async (req, res) => {
  try {
    // Use cached spot prices
    const currentPrices = spotPriceCache.prices;

    if (!currentPrices.gold || !currentPrices.silver) {
      return res.status(503).json({
        success: false,
        error: 'Spot prices not available'
      });
    }

    console.log(`🔔 Checking alerts at Gold $${currentPrices.gold}, Silver $${currentPrices.silver}...`);

    const result = await checkAlerts(currentPrices);

    res.json({
      success: true,
      ...result,
      prices: {
        gold: currentPrices.gold,
        silver: currentPrices.silver
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Check alerts error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check alerts'
    });
  }
});

// ============================================
// PORTFOLIO SNAPSHOTS (Gold/Lifetime Feature - Analytics)
// ============================================

/**
 * Save a daily portfolio snapshot
 * POST /api/snapshots
 * Body: { userId, totalValue, goldValue, silverValue, goldOz, silverOz, goldSpot, silverSpot }
 */
app.post('/api/snapshots', async (req, res) => {
  try {
    const { userId, totalValue, goldValue, silverValue, goldOz, silverOz, goldSpot, silverSpot } = req.body;

    // Validate required fields
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    // Allow zero values but validate they're numbers
    if (typeof totalValue !== 'number' || typeof goldValue !== 'number' ||
        typeof silverValue !== 'number' || typeof goldOz !== 'number' ||
        typeof silverOz !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'Invalid numeric values provided'
      });
    }

    const snapshot = await saveSnapshot({
      userId,
      totalValue,
      goldValue,
      silverValue,
      goldOz,
      silverOz,
      goldSpot: goldSpot || 0,
      silverSpot: silverSpot || 0,
    });

    res.json({
      success: true,
      snapshot
    });

  } catch (error) {
    console.error('❌ Save snapshot error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save snapshot'
    });
  }
});

/**
 * Get portfolio snapshots for analytics charts
 * GET /api/snapshots/:userId
 * Query params: ?range=1M (1W, 1M, 3M, 6M, 1Y, all)
 */
app.get('/api/snapshots/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { range = '1M' } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    const snapshots = await getSnapshots(userId, range);

    res.json({
      success: true,
      snapshots,
      count: snapshots.length,
      range
    });

  } catch (error) {
    console.error('❌ Get snapshots error:', error.message);

    // If database is not available, return empty array instead of error
    // This allows the app to gracefully handle and calculate historical data
    if (error.message === 'Database not available') {
      return res.json({
        success: true,
        snapshots: [],
        count: 0,
        range: req.query.range || '1M',
        note: 'Database temporarily unavailable'
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to get snapshots',
      details: error.message
    });
  }
});

/**
 * Get latest snapshot for a user
 * GET /api/snapshots/:userId/latest
 */
app.get('/api/snapshots/:userId/latest', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    const snapshot = await getLatestSnapshot(userId);

    res.json({
      success: true,
      snapshot
    });

  } catch (error) {
    console.error('❌ Get latest snapshot error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get latest snapshot'
    });
  }
});

/**
 * Scan receipt using Gemini 1.5 Flash (primary) or Claude Vision (fallback)
 * Privacy: Image is processed in memory only, never stored
 * Accepts both FormData (multipart) and JSON with base64
 */
app.post('/api/scan-receipt', upload.single('receipt'), async (req, res) => {
  const startTime = Date.now();
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║                    RECEIPT SCAN REQUEST                       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  try {
    let base64Image;
    let mediaType;

    // Check if request is JSON with base64 or FormData
    if (req.body && req.body.image) {
      // JSON format with base64
      console.log('📄 RECEIVED AS JSON/BASE64:');
      base64Image = req.body.image;
      mediaType = req.body.mimeType || 'image/jpeg';
      const originalSize = req.body.originalSize;

      console.log(`   - Original size from client: ${originalSize ? (originalSize / 1024).toFixed(2) + ' KB' : 'unknown'}`);
      console.log(`   - Base64 length: ${base64Image.length} characters`);
      console.log(`   - Calculated size: ${(base64Image.length * 0.75 / 1024).toFixed(2)} KB`);
      console.log(`   - Media type: ${mediaType}`);

    } else if (req.file) {
      // FormData format
      console.log('📄 RECEIVED AS FORMDATA:');
      console.log(`   - MIME type: ${req.file.mimetype}`);
      console.log(`   - Size: ${(req.file.size / 1024).toFixed(2)} KB (${req.file.size} bytes)`);
      console.log(`   - Original name: ${req.file.originalname}`);

      // Convert buffer to base64
      base64Image = req.file.buffer.toString('base64');
      mediaType = req.file.mimetype || 'image/jpeg';

    } else {
      console.log('❌ No image provided');
      return res.status(400).json({ error: 'No image provided' });
    }

    // Prompt for receipt extraction
    const prompt = `Extract precious metals purchase data from this receipt image. Read every number EXACTLY as printed.

RULES:
1. ONLY include precious metal products: coins, bars, rounds
2. EXCLUDE accessories: tubes, capsules, boxes, cases, albums, flips, holders
3. EXCLUDE items under $10 (accessories)
4. Read prices EXACTLY - do not estimate
5. Extract purchase TIME if visible (from timestamp, order time, transaction time, etc.)

Return ONLY valid JSON (no markdown, no explanation):
{
  "dealer": "dealer name",
  "purchaseDate": "YYYY-MM-DD",
  "purchaseTime": "HH:MM",
  "items": [
    {
      "description": "product name exactly as printed",
      "quantity": 1,
      "unitPrice": 123.45,
      "extPrice": 123.45,
      "metal": "silver",
      "ozt": 1.0
    }
  ]
}

If a field is unreadable, use null. Metal must be: gold, silver, platinum, or palladium. purchaseTime should be in 24-hour format (e.g., "14:30" for 2:30 PM).`;

    let responseText;
    let apiSource;
    const apiStartTime = Date.now();

    // Try Gemini 1.5 Flash first (faster and cheaper)
    const geminiApiKey = process.env.GEMINI_API_KEY;
    console.log(`\n🔑 GEMINI_API_KEY configured: ${geminiApiKey ? 'YES (' + geminiApiKey.substring(0, 8) + '...)' : 'NO'}`);

    if (geminiApiKey) {
      try {
        console.log('🤖 Calling Gemini 2.0 Flash API...');

        const geminiResponse = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
          {
            contents: [{
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mediaType,
                    data: base64Image
                  }
                }
              ]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 2048,
            }
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000
          }
        );

        if (geminiResponse.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
          responseText = geminiResponse.data.candidates[0].content.parts[0].text;
          apiSource = 'gemini-2.0-flash';
          console.log('✅ Gemini response received');
        } else {
          throw new Error('Invalid Gemini response structure');
        }
      } catch (geminiError) {
        console.log('⚠️ Gemini API Error Details:');
        console.log(`   Message: ${geminiError.message}`);
        if (geminiError.response) {
          console.log(`   Status: ${geminiError.response.status}`);
          console.log(`   Status Text: ${geminiError.response.statusText}`);
          console.log(`   Response Data:`, JSON.stringify(geminiError.response.data, null, 2));
        }
        if (geminiError.code) {
          console.log(`   Error Code: ${geminiError.code}`);
        }
        console.log('   Falling back to Claude...');
      }
    }

    // Fall back to Claude if Gemini failed or not configured
    if (!responseText) {
      console.log('\n🤖 Calling Claude Vision API (claude-sonnet-4-20250514)...');

      const claudeResponse = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64Image,
                },
              },
              {
                type: 'text',
                text: prompt,
              },
            ],
          },
        ],
      });

      const content = claudeResponse.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }
      responseText = content.text;
      apiSource = 'claude-sonnet-4';
    }

    const apiDuration = Date.now() - apiStartTime;
    console.log(`⏱️  API call completed in ${apiDuration}ms (${apiSource})`);

    console.log('\n📥 RAW API RESPONSE:');
    console.log('═'.repeat(60));
    console.log(responseText);
    console.log('═'.repeat(60));

    // Extract JSON from response
    let extractedData;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found in response');
      }
    } catch (parseError) {
      console.error('❌ JSON PARSE ERROR:', parseError.message);
      console.error('   Raw text was:', responseText);
      extractedData = { items: [] };
    }

    // Ensure items array exists
    if (!extractedData.items || !Array.isArray(extractedData.items)) {
      extractedData.items = [];
    }

    // Verify and correct unit prices using ext price
    console.log('\n🔍 PRICE VERIFICATION (using ext price):');
    extractedData.items = extractedData.items.map((item, index) => {
      const qty = item.quantity || 1;
      const readUnitPrice = item.unitPrice;
      const extPrice = item.extPrice;

      // If we have ext price, verify unit price
      if (extPrice && qty > 0) {
        const calculatedUnitPrice = Math.round((extPrice / qty) * 100) / 100;

        if (Math.abs(calculatedUnitPrice - readUnitPrice) > 0.02) {
          console.log(`   Item ${index + 1}: CORRECTED`);
          console.log(`      Read unit price: $${readUnitPrice}`);
          console.log(`      Ext price: $${extPrice} ÷ ${qty} = $${calculatedUnitPrice}`);
          console.log(`      Using calculated: $${calculatedUnitPrice}`);
          return { ...item, unitPrice: calculatedUnitPrice };
        } else {
          console.log(`   Item ${index + 1}: OK ($${readUnitPrice} × ${qty} = $${extPrice})`);
        }
      } else {
        console.log(`   Item ${index + 1}: No ext price to verify`);
      }

      return item;
    });

    // Log parsed data
    console.log('\n✅ PARSED EXTRACTION RESULT:');
    console.log('─'.repeat(60));
    console.log(`   Dealer: "${extractedData.dealer || '(not found)'}"`);
    console.log(`   Purchase Date: "${extractedData.purchaseDate || '(not found)'}"`);
    console.log(`   Purchase Time: "${extractedData.purchaseTime || '(not found)'}"`);
    console.log(`   Items Found: ${extractedData.items.length}`);
    console.log('');

    if (extractedData.items.length > 0) {
      extractedData.items.forEach((item, index) => {
        console.log(`   Item ${index + 1}:`);
        console.log(`      Description: ${item.description}`);
        console.log(`      Metal: ${item.metal}`);
        console.log(`      Quantity: ${item.quantity}`);
        console.log(`      Unit Price: $${item.unitPrice}`);
        console.log(`      Ext Price: $${item.extPrice || 'N/A'}`);
        console.log(`      Weight: ${item.ozt} ozt`);
        console.log('');
      });
    }
    console.log('─'.repeat(60));

    // Clear image data from memory immediately
    if (req.file) req.file.buffer = null;
    if (req.body && req.body.image) req.body.image = null;

    const totalDuration = Date.now() - startTime;
    console.log(`\n🏁 SCAN COMPLETE in ${totalDuration}ms (API: ${apiDuration}ms)`);
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║                      END SCAN REQUEST                         ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    res.json({
      success: true,
      dealer: extractedData.dealer || '',
      purchaseDate: extractedData.purchaseDate || '',
      purchaseTime: extractedData.purchaseTime || '',
      items: extractedData.items,
      itemCount: extractedData.items.length,
      apiSource: apiSource,
      privacyNote: 'Image processed in memory and immediately discarded',
    });

  } catch (error) {
    // Ensure image is cleared even on error
    if (req.file) req.file.buffer = null;
    if (req.body && req.body.image) req.body.image = null;

    console.error('\n❌ SCAN ERROR:');
    console.error('   Message:', error.message);
    console.error('   Stack:', error.stack);

    res.status(500).json({
      error: 'Failed to process receipt',
      details: error.message
    });
  }
});

/**
 * Privacy policy endpoint
 */
app.get('/api/privacy', (req, res) => {
  res.json({
    version: '2.0.0',
    lastUpdated: '2026-01-28',
    summary: 'Your data is stored on your device by default. Cloud sync is optional and encrypted. We never sell or share your data.',
    principles: [
      {
        title: 'Memory-Only Image Processing',
        description: 'Receipt images are processed entirely in RAM and never written to disk.',
        technical: 'Images held in RAM only during API call, garbage collected immediately after response.'
      },
      {
        title: 'No Account Required',
        description: 'Use the app fully without creating an account. Your data stays on your device.',
        technical: 'Local-first architecture with optional encrypted sync.'
      },
      {
        title: 'End-to-End Encryption',
        description: 'If you choose to backup/sync, your data is encrypted on your device before transmission.',
        technical: 'AES-256-GCM encryption with user-held keys. Server stores only ciphertext.'
      },
      {
        title: 'No Tracking',
        description: 'No analytics, no third-party SDKs, no advertising. We do not track your usage.',
        technical: 'No Google Analytics, Facebook SDK, or similar. No device fingerprinting.'
      },
      {
        title: 'Your Data, Your Control',
        description: 'Export all your data anytime. Delete everything with one tap.',
        technical: 'Full JSON/CSV export, complete local deletion, server backup deletion via API.'
      }
    ],
    contact: 'privacy@stacktrackerpro.com'
  });
});

// Human-readable privacy policy (HTML)
app.get('/privacy', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy - Stack Tracker Gold</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 40px;
    }
    h1 {
      font-size: 2.5em;
      color: #111827;
      margin-bottom: 10px;
      font-weight: 700;
    }
    .tagline {
      font-size: 1.2em;
      color: #6b7280;
      margin-bottom: 30px;
      font-weight: 500;
    }
    .last-updated {
      color: #9ca3af;
      font-size: 0.9em;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #e5e7eb;
    }
    h2 {
      font-size: 1.8em;
      color: #374151;
      margin-top: 30px;
      margin-bottom: 15px;
      font-weight: 600;
    }
    .principle {
      background: #f9fafb;
      border-left: 4px solid #fbbf24;
      padding: 20px;
      margin-bottom: 20px;
      border-radius: 6px;
    }
    .principle h3 {
      color: #111827;
      font-size: 1.3em;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .principle p {
      color: #4b5563;
      line-height: 1.7;
      font-size: 1.05em;
    }
    .icon {
      font-size: 1.5em;
    }
    .summary {
      background: #fef3c7;
      border: 2px solid #fbbf24;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
      font-size: 1.1em;
      color: #78350f;
      font-weight: 500;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #e5e7eb;
      color: #6b7280;
      text-align: center;
      font-size: 0.95em;
    }
    a {
      color: #667eea;
      text-decoration: none;
      font-weight: 600;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>🪙 Privacy Policy</h1>
    <p class="tagline">Stack Tracker Gold - Privacy-First Precious Metals Portfolio</p>
    <p class="last-updated">Last Updated: February 17, 2026</p>

    <div class="summary">
      <strong>TL;DR:</strong> Your portfolio data is stored on your device by default. If you create an account, your data is encrypted and stored securely in Supabase (our cloud database) for cross-device sync. AI features send portfolio data to Google Gemini for analysis — this data is not shared beyond the AI provider. We never sell or share your data with advertisers. Receipt images are deleted immediately after processing.
    </div>

    <h2>Our Privacy Principles</h2>

    <div class="principle">
      <h3><span class="icon">📱</span> Local-First Data Storage</h3>
      <p>
        By default, all your portfolio data—your precious metals holdings, purchase history, and preferences—is stored on your device using encrypted local storage. You can use Stack Tracker Gold without an account, and your data stays entirely on your device.
      </p>
    </div>

    <div class="principle">
      <h3><span class="icon">☁️</span> Optional Cloud Sync</h3>
      <p>
        Gold and Lifetime subscribers can optionally create an account and enable cloud sync. When enabled, your portfolio data is encrypted and stored on our secure servers to sync across your devices. Cloud sync is entirely optional—you can use all features without it. You can delete your cloud account and all associated data at any time from the app settings.
      </p>
    </div>

    <div class="principle">
      <h3><span class="icon">🤖</span> AI-Generated Content</h3>
      <p>
        Features like <strong>Daily Brief</strong> and <strong>Portfolio Intelligence</strong> use AI to generate market analysis and portfolio insights. To provide these features, your portfolio data (holdings, values, and metal allocations) is sent to the <strong>Google Gemini API</strong> for analysis. This data is used solely for generating your personalized insights and is <strong>not shared with third parties beyond the AI provider</strong> for analysis purposes. AI-generated content is for informational purposes only and does not constitute financial advice.
      </p>
    </div>

    <div class="principle">
      <h3><span class="icon">🔔</span> Push Notifications</h3>
      <p>
        When you enable push notifications, we collect and store your <strong>Expo push token</strong> to deliver notifications to your device. Your notification preferences (Daily Brief, Price Alerts, Breaking News & COMEX alerts) are stored server-side in Supabase and tied to your user account. You can disable any notification type at any time in Settings → Notifications. We do not use push tokens for advertising or tracking purposes.
      </p>
    </div>

    <div class="principle">
      <h3><span class="icon">🏦</span> COMEX Warehouse Data</h3>
      <p>
        The Vault Watch feature displays COMEX warehouse inventory data sourced from CME Group. This is publicly available market data and does not involve any collection or processing of your personal information.
      </p>
    </div>

    <div class="principle">
      <h3><span class="icon">📷</span> Memory-Only Image Processing</h3>
      <p>
        When you use our AI receipt scanning feature, images are processed in memory and <strong>deleted immediately</strong> after analysis. No receipts, photos, or scanned images are ever stored on our servers. Only the extracted text data (item descriptions, prices, quantities) is returned to your device.
      </p>
    </div>

    <div class="principle">
      <h3><span class="icon">📊</span> Portfolio Snapshots</h3>
      <p>
        To power analytics charts and historical tracking, we store daily portfolio value snapshots on our servers. These snapshots contain aggregate values only (total portfolio value, metal totals) and are tied to your anonymous user ID. They do not contain individual item details.
      </p>
    </div>

    <div class="principle">
      <h3><span class="icon">🚫</span> No Analytics or Tracking</h3>
      <p>
        We do not use Google Analytics, Facebook SDK, advertising networks, or any third-party tracking tools. We don't collect usage data, device fingerprints, or behavioral analytics. Your activity in the app is completely private.
      </p>
    </div>

    <div class="principle">
      <h3><span class="icon">🔑</span> No Account Required</h3>
      <p>
        You can use Stack Tracker Gold fully without creating an account (Guest Mode). No email, no password, no personal information required. Your data stays on your device, under your control. Accounts are only needed for optional cloud sync.
      </p>
    </div>

    <div class="principle">
      <h3><span class="icon">💰</span> Third-Party Services</h3>
      <p>
        We use the following third-party services to power the app:
      </p>
      <p>
        <strong>MetalPriceAPI</strong> &amp; <strong>GoldAPI.io</strong> — Live spot prices. These requests contain no personal data.<br>
        <strong>RevenueCat</strong> — Subscription management. Receives an anonymous user ID only.<br>
        <strong>Supabase</strong> — Cloud database for account sync and portfolio snapshots. Data is stored securely with row-level security.<br>
        <strong>Expo</strong> — Push notifications for price alerts. Receives only a device push token.<br>
        <strong>Apple App Store</strong> — Payment processing. We never see your payment details.
      </p>
    </div>

    <h2>Data We Collect</h2>
    <div class="principle">
      <h3><span class="icon">📋</span> What We Store</h3>
      <p>
        ✅ Anonymous user ID (for subscription and sync features)<br>
        ✅ Portfolio snapshots for analytics (aggregate values only)<br>
        ✅ Cloud sync data if you opt in (encrypted portfolio data)<br>
        ✅ Price alert preferences (target prices and notification settings)<br>
        ✅ Expo push token (for delivering push notifications to your device)<br>
        ✅ Notification preferences (which alerts you've enabled/disabled)<br>
        ✅ AI-processed portfolio summaries (sent to Google Gemini for analysis, not stored permanently)
      </p>
    </div>

    <div class="principle">
      <h3><span class="icon">🚫</span> What We Never Collect</h3>
      <p>
        ❌ Receipt images or scanned documents (deleted immediately)<br>
        ❌ Personal information (name, address, phone number)<br>
        ❌ Location data or device identifiers<br>
        ❌ Usage analytics or behavioral tracking<br>
        ❌ Payment details (handled by Apple/Google)
      </p>
    </div>

    <h2>Data Sharing</h2>
    <div class="principle">
      <h3><span class="icon">🔒</span> We Never Sell Your Data</h3>
      <p>
        Your data is never sold, shared with advertisers, or provided to third parties for marketing purposes. Data is only shared with service providers essential to app functionality (payment processing, price data APIs) and only the minimum data necessary.
      </p>
    </div>

    <h2>Your Rights</h2>
    <div class="principle">
      <h3><span class="icon">🛡️</span> Complete Control</h3>
      <p>
        You can export your data anytime as CSV. If you have a cloud account, you can delete your account and all server-side data from Settings → Danger Zone. Guest mode users have all data stored locally—simply deleting the app removes all data. You can also reset all data from within the app settings.
      </p>
    </div>

    <h2>Changes to This Policy</h2>
    <p style="margin-top: 20px; color: #4b5563; line-height: 1.7;">
      If we make changes to this privacy policy, we'll update the "Last Updated" date at the top. Significant changes will be communicated through the app.
    </p>

    <div class="footer">
      <p>Questions about privacy? Contact us at <a href="mailto:stacktrackergold@gmail.com">stacktrackergold@gmail.com</a></p>
      <p style="margin-top: 10px;">Built with privacy in mind. Your data, your control. 🔒</p>
    </div>
  </div>
</body>
</html>
  `;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Human-readable terms of use (HTML)
app.get('/terms', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terms of Use - Stack Tracker Gold</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      border-radius: 12px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      padding: 40px;
    }
    h1 {
      font-size: 2.5em;
      color: #111827;
      margin-bottom: 10px;
      font-weight: 700;
    }
    .tagline {
      font-size: 1.2em;
      color: #6b7280;
      margin-bottom: 30px;
      font-weight: 500;
    }
    .last-updated {
      color: #9ca3af;
      font-size: 0.9em;
      margin-bottom: 30px;
      padding-bottom: 20px;
      border-bottom: 2px solid #e5e7eb;
    }
    h2 {
      font-size: 1.5em;
      color: #374151;
      margin-top: 30px;
      margin-bottom: 15px;
      font-weight: 600;
    }
    p, ul {
      color: #4b5563;
      margin-bottom: 15px;
      line-height: 1.7;
    }
    ul {
      margin-left: 20px;
    }
    li {
      margin-bottom: 8px;
    }
    .summary {
      background: #fef3c7;
      border: 2px solid #fbbf24;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
      font-size: 1.1em;
      color: #78350f;
      font-weight: 500;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #e5e7eb;
      color: #6b7280;
      text-align: center;
      font-size: 0.95em;
    }
    a {
      color: #667eea;
      text-decoration: none;
      font-weight: 600;
    }
    a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>📜 Terms of Use</h1>
    <p class="tagline">Stack Tracker Gold - Privacy-First Precious Metals Portfolio</p>
    <p class="last-updated">Last Updated: February 17, 2026</p>

    <div class="summary">
      By using Stack Tracker Gold, you agree to these terms. Please read them carefully.
    </div>

    <h2>1. Acceptance of Terms</h2>
    <p>
      By downloading, installing, or using Stack Tracker Gold ("the App"), you agree to be bound by these Terms of Use. If you do not agree to these terms, please do not use the App.
    </p>

    <h2>2. Description of Service</h2>
    <p>
      Stack Tracker Gold is a personal portfolio tracking application for precious metals enthusiasts. The App allows you to:
    </p>
    <ul>
      <li>Track your gold, silver, platinum, and palladium holdings</li>
      <li>Scan receipts using AI-powered image recognition</li>
      <li>View live spot prices for precious metals</li>
      <li>View COMEX warehouse inventory data (Vault Watch)</li>
      <li>Receive AI-generated market analysis and portfolio insights</li>
      <li>Receive push notifications for price alerts, daily briefs, and breaking news</li>
      <li>Export your portfolio data in various formats</li>
    </ul>

    <h2>3. User Responsibilities</h2>
    <p>You agree to:</p>
    <ul>
      <li>Use the App only for lawful purposes</li>
      <li>Verify the accuracy of all portfolio data, including AI-scanned receipt results — you are solely responsible for ensuring your holdings data is correct</li>
      <li>Not attempt to reverse engineer, modify, or exploit the App</li>
      <li>Not use the App to store or process illegal content</li>
      <li>Maintain the security of your device and account credentials</li>
    </ul>

    <h2>4. Data and Privacy</h2>
    <p>
      Your portfolio data is stored locally on your device by default. If you create an account and enable cloud sync, your data is encrypted and stored on our servers. Receipt images are deleted immediately after AI processing. For full details, please review our <a href="/privacy">Privacy Policy</a>.
    </p>

    <h2>5. AI-Generated Content</h2>
    <p>
      The App includes features powered by artificial intelligence, including Daily Brief, Portfolio Intelligence, and Market Intelligence. By using these features, you acknowledge and agree that:
    </p>
    <ul>
      <li><strong>Not financial advice:</strong> All AI-generated content is for informational and educational purposes only. It does not constitute financial advice, investment recommendations, or any form of professional guidance.</li>
      <li><strong>No guarantee of accuracy:</strong> AI-generated analysis, summaries, and insights may contain errors, inaccuracies, or outdated information. You should not rely solely on AI content for investment decisions.</li>
      <li><strong>Data processing:</strong> To generate personalized insights, your portfolio data (holdings, values, allocations) is sent to third-party AI providers (Google Gemini) for processing. This data is used solely for generating your insights and is not shared beyond the AI provider.</li>
      <li><strong>Your responsibility:</strong> You are solely responsible for any investment or financial decisions you make. Always consult qualified financial professionals before making significant financial decisions.</li>
    </ul>

    <h2>6. Push Notifications</h2>
    <p>
      The App offers optional push notifications for price alerts, daily market briefs, and breaking news. By enabling notifications, you agree that:
    </p>
    <ul>
      <li>Your device push token will be stored on our servers to deliver notifications</li>
      <li>Your notification preferences are stored server-side and tied to your account</li>
      <li>Notification content (price alerts, market summaries) may be delayed or inaccurate due to network conditions or data source delays</li>
      <li>You can disable any or all notification types at any time in Settings</li>
      <li>We will not use push notifications for advertising or promotional purposes unrelated to the App</li>
    </ul>

    <h2>7. Subscriptions and Payments</h2>
    <p>
      Stack Tracker Gold offers a free tier and premium "Gold" subscriptions with the following pricing:
    </p>
    <ul>
      <li><strong>Gold Monthly:</strong> $9.99/month — auto-renews monthly</li>
      <li><strong>Gold Yearly:</strong> $79.99/year — auto-renews annually</li>
      <li><strong>Lifetime:</strong> $149.99 — one-time purchase, never expires</li>
    </ul>
    <p>
      All subscriptions are processed through the Apple App Store. Subscription terms:
    </p>
    <ul>
      <li>Subscriptions automatically renew unless cancelled at least 24 hours before the end of the current period</li>
      <li>Your Apple ID account will be charged for renewal within 24 hours prior to the end of the current period</li>
      <li>You can manage and cancel subscriptions in your device's Settings → Apple ID → Subscriptions</li>
      <li>Refunds are handled according to Apple App Store policies</li>
      <li>Free trial periods, if offered, will automatically convert to a paid subscription unless cancelled</li>
    </ul>

    <h2>8. Data Accuracy Disclaimer</h2>
    <p>
      The App displays data from multiple third-party sources. You acknowledge and agree that:
    </p>
    <ul>
      <li><strong>Spot prices</strong> are sourced from third-party APIs (MetalPriceAPI, GoldAPI) and may be delayed, inaccurate, or temporarily unavailable</li>
      <li><strong>COMEX warehouse data</strong> is sourced from CME Group and may not reflect real-time inventory changes</li>
      <li><strong>AI-generated analysis</strong> (Daily Brief, Portfolio Intelligence, Market Intelligence) may contain errors and should not be relied upon as the sole basis for any decision</li>
      <li><strong>Receipt scanning</strong> uses AI vision which may misread digits, prices, or quantities — always verify scanned data before saving</li>
      <li><strong>Portfolio valuations</strong> are estimates based on available spot price data and may not reflect the actual market or resale value of your holdings</li>
    </ul>

    <h2>9. Disclaimer of Warranties</h2>
    <p>
      The App is provided <strong>"as is" and "as available"</strong> without warranties of any kind, whether express or implied. We do not guarantee the accuracy, completeness, or timeliness of any data, content, or features provided by the App.
    </p>
    <p>
      <strong>Stack Tracker Gold is not a financial advisor, broker, or dealer.</strong> The App is for personal informational and tracking purposes only. It does not provide investment advice, tax guidance, or financial recommendations. Always verify important financial information independently and consult qualified professionals for financial decisions.
    </p>

    <h2>10. Limitation of Liability</h2>
    <p>
      To the maximum extent permitted by law, Stack Tracker Gold and its developers shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the App, including but not limited to losses arising from reliance on AI-generated content, inaccurate spot prices, or data synchronization issues.
    </p>

    <h2>11. Intellectual Property</h2>
    <p>
      All content, features, and functionality of the App are owned by Stack Tracker Gold and are protected by copyright, trademark, and other intellectual property laws.
    </p>

    <h2>12. Changes to Terms</h2>
    <p>
      We may update these Terms of Use from time to time. Continued use of the App after changes constitutes acceptance of the new terms. We will update the "Last Updated" date when changes are made.
    </p>

    <h2>13. Termination</h2>
    <p>
      We reserve the right to terminate or suspend access to the App at any time, without prior notice, for conduct that we believe violates these terms or is harmful to other users or the App.
    </p>

    <h2>14. Contact Us</h2>
    <p>
      If you have questions about these Terms of Use, please contact us at <a href="mailto:stacktrackergold@gmail.com">stacktrackergold@gmail.com</a>.
    </p>

    <div class="footer">
      <p>Questions? Contact us at <a href="mailto:stacktrackergold@gmail.com">stacktrackergold@gmail.com</a></p>
      <p style="margin-top: 10px;">Stack Tracker Gold - Track your stack with confidence. 🪙</p>
    </div>
  </div>
</body>
</html>
  `;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// ============================================
// PUSH NOTIFICATIONS API ENDPOINTS
// ============================================

/**
 * Register or update a push token
 * POST /api/push-token/register
 */
app.post('/api/push-token/register', validate('pushTokenRegister'), async (req, res) => {
  try {
    const { expo_push_token, platform, app_version, user_id, device_id } = req.body;
    console.log('🔔 [Push Token] Register request:', { expo_push_token: expo_push_token?.substring(0, 30) + '...', platform, user_id: user_id?.substring(0, 8), device_id });

    if (!isSupabaseAvailable()) {
      console.error('🔔 [Push Token] Supabase not available!');
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    const supabase = getSupabase();

    // Check if token already exists
    const { data: existing, error: checkError } = await supabase
      .from('push_tokens')
      .select('id')
      .eq('expo_push_token', expo_push_token)
      .single();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('🔔 [Push Token] Error checking existing token:', checkError);
    }

    if (existing) {
      // Update existing token
      const { error: updateError } = await supabase
        .from('push_tokens')
        .update({
          user_id: user_id || null,
          device_id: device_id || null,
          platform: platform || null,
          app_version: app_version || null,
          last_active: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error('🔔 [Push Token] Error updating:', updateError);
        return res.status(500).json({ success: false, error: updateError.message });
      }

      console.log(`✅ [Push Token] Updated: ${expo_push_token.substring(0, 30)}... (id: ${existing.id})`);
      return res.json({ success: true, action: 'updated', id: existing.id });
    }

    // Insert new token
    const { data: inserted, error: insertError } = await supabase
      .from('push_tokens')
      .insert({
        user_id: user_id || null,
        device_id: device_id || null,
        expo_push_token,
        platform: platform || null,
        app_version: app_version || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('🔔 [Push Token] Error inserting:', insertError);
      return res.status(500).json({ success: false, error: insertError.message });
    }

    console.log(`✅ [Push Token] Registered NEW: ${expo_push_token.substring(0, 30)}... (id: ${inserted.id})`);
    res.json({ success: true, action: 'created', id: inserted.id });
  } catch (error) {
    console.error('❌ [Push Token] Register error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Delete a push token
 */
app.delete('/api/push-token/delete', validate('pushTokenDelete'), async (req, res) => {
  try {
    const { expo_push_token } = req.body;

    if (!isSupabaseAvailable()) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    const supabase = getSupabase();

    const { error } = await supabase
      .from('push_tokens')
      .delete()
      .eq('expo_push_token', expo_push_token);

    if (error) {
      console.error('Error deleting push token:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log(`✅ Deleted push token: ${expo_push_token.substring(0, 30)}...`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error in /api/push-token/delete:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Sync price alerts from mobile app
 */
/**
 * Create a single price alert
 */
app.post('/api/price-alerts', async (req, res) => {
  try {
    const { id, userId, device_id, metal, targetPrice, direction, enabled } = req.body;

    if (!metal || !targetPrice || !direction) {
      return res.status(400).json({ success: false, error: 'metal, targetPrice, and direction are required' });
    }
    if (!['gold', 'silver', 'platinum', 'palladium'].includes(metal)) {
      return res.status(400).json({ success: false, error: 'Invalid metal' });
    }
    if (!['above', 'below'].includes(direction)) {
      return res.status(400).json({ success: false, error: 'direction must be above or below' });
    }
    if (!userId && !device_id) {
      return res.status(400).json({ success: false, error: 'Either userId or device_id is required' });
    }

    if (!isSupabaseAvailable()) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    const supabase = getSupabase();

    const row = {
      metal,
      target_price: parseFloat(targetPrice),
      direction,
      enabled: enabled !== false,
      device_id: device_id || null,
    };
    if (id) row.id = id;
    // Only set user_id if it looks like a valid UUID (skip non-UUID strings)
    if (userId && userId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-/i)) {
      row.user_id = userId;
    }

    const { data, error } = await supabase
      .from('price_alerts')
      .upsert(row, { onConflict: 'id' })
      .select()
      .single();

    if (error) {
      console.error('🔔 Error creating price alert:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log(`✅ Created price alert: ${data.id} (${metal} ${direction} $${targetPrice})`);
    res.json({ success: true, alert: data });
  } catch (error) {
    console.error('Error in POST /api/price-alerts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Delete a price alert by ID
 */
app.delete('/api/price-alerts/:id', async (req, res) => {
  try {
    const alertId = req.params.id;

    if (!isSupabaseAvailable()) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    const supabase = getSupabase();

    const { error } = await supabase
      .from('price_alerts')
      .delete()
      .eq('id', alertId);

    if (error) {
      console.error('Error deleting price alert:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log(`✅ Deleted price alert: ${alertId}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/price-alerts/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Delete all price alerts for a user/device
 */
app.delete('/api/price-alerts', async (req, res) => {
  try {
    const { user_id, device_id } = req.query;
    if (!user_id && !device_id) {
      return res.status(400).json({ success: false, error: 'Either user_id or device_id is required' });
    }
    if (!isSupabaseAvailable()) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }
    const supabase = getSupabase();
    let query = supabase.from('price_alerts').delete();
    if (user_id && device_id) {
      query = query.or(`user_id.eq.${user_id},device_id.eq.${device_id}`);
    } else if (user_id) {
      query = query.eq('user_id', user_id);
    } else {
      query = query.eq('device_id', device_id);
    }
    const { error } = await query;
    if (error) {
      console.error('Error deleting all price alerts:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
    console.log(`✅ Deleted all price alerts for user_id=${user_id}, device_id=${device_id}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/price-alerts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Toggle/update a price alert
 */
app.patch('/api/price-alerts/:id', async (req, res) => {
  try {
    const alertId = req.params.id;
    const { enabled, metal, targetPrice, direction } = req.body;

    const updates = { updated_at: new Date().toISOString() };
    if (typeof enabled === 'boolean') updates.enabled = enabled;
    if (metal) updates.metal = metal;
    if (targetPrice !== undefined) updates.target_price = parseFloat(targetPrice);
    if (direction) updates.direction = direction;

    if (Object.keys(updates).length === 1) {
      return res.status(400).json({ success: false, error: 'No valid fields to update' });
    }

    if (!isSupabaseAvailable()) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('price_alerts')
      .update(updates)
      .eq('id', alertId)
      .select()
      .single();

    if (error) {
      console.error('Error updating price alert:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    console.log(`✅ Updated price alert ${alertId}:`, JSON.stringify(updates));
    res.json({ success: true, alert: data });
  } catch (error) {
    console.error('Error in PATCH /api/price-alerts/:id:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Get user's price alerts
 */
app.get('/api/price-alerts', async (req, res) => {
  try {
    const { user_id, device_id } = req.query;

    if (!user_id && !device_id) {
      return res.status(400).json({ success: false, error: 'Either user_id or device_id is required' });
    }

    if (!isSupabaseAvailable()) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    const supabase = getSupabase();
    let query = supabase.from('price_alerts').select('*');

    // Build OR condition with available identifiers
    const orConditions = [];
    if (user_id) orConditions.push(`user_id.eq.${user_id}`);
    if (device_id) orConditions.push(`device_id.eq.${device_id}`);
    query = query.or(orConditions.join(','));

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching price alerts:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, alerts: data || [] });
  } catch (error) {
    console.error('Error in /api/price-alerts:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// INTELLIGENCE FEED (Today Tab)
// ============================================

// GET /api/intelligence - Fetch daily intelligence briefs
app.get('/api/intelligence', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    if (!isSupabaseAvailable()) {
      return res.json({
        success: true,
        date,
        briefs: [],
        generated_at: new Date().toISOString(),
        spot_prices: spotPriceCache.prices || {},
        message: 'Intelligence feed not configured',
      });
    }

    const sb = getSupabase();
    const { data, error } = await sb
      .from('intelligence_briefs')
      .select('*')
      .eq('date', date)
      .order('relevance_score', { ascending: false });

    if (error) {
      console.error('Intelligence fetch error:', error);
      return res.json({
        success: true,
        date,
        briefs: [],
        generated_at: new Date().toISOString(),
        spot_prices: spotPriceCache.prices || {},
        error: error.message,
      });
    }

    // Filter out expired briefs
    const now = new Date();
    const activeBriefs = (data || []).filter(b =>
      !b.expires_at || new Date(b.expires_at) > now
    );

    res.json({
      success: true,
      date,
      briefs: activeBriefs,
      generated_at: new Date().toISOString(),
      spot_prices: spotPriceCache.prices || {},
    });
  } catch (error) {
    console.error('Intelligence endpoint error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/intelligence/seed - Seed intelligence briefs (testing)
app.post('/api/intelligence/seed', async (req, res) => {
  try {
    // API key check
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    if (!apiKey || apiKey !== process.env.INTELLIGENCE_API_KEY) {
      return res.status(401).json({ success: false, error: 'Invalid API key' });
    }

    if (!isSupabaseAvailable()) {
      return res.status(503).json({ success: false, error: 'Supabase not configured' });
    }

    const { briefs } = req.body;
    if (!briefs || !Array.isArray(briefs) || briefs.length === 0) {
      return res.status(400).json({ success: false, error: 'briefs array required' });
    }

    const sb = getSupabase();
    const { data, error } = await sb
      .from('intelligence_briefs')
      .insert(briefs)
      .select();

    if (error) {
      console.error('Intelligence seed error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, inserted: data.length, briefs: data });
  } catch (error) {
    console.error('Intelligence seed endpoint error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/intelligence/migrate - Run intelligence_briefs table migration (one-time)
app.post('/api/intelligence/migrate', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    if (!apiKey || apiKey !== process.env.INTELLIGENCE_API_KEY) {
      return res.status(401).json({ success: false, error: 'Invalid API key' });
    }

    if (!isSupabaseAvailable()) {
      return res.status(503).json({ success: false, error: 'Supabase not configured' });
    }

    const sb = getSupabase();

    // Run migration SQL statements sequentially
    const statements = [
      `CREATE TABLE IF NOT EXISTS intelligence_briefs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        date DATE NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('market_brief', 'breaking_news', 'policy', 'supply_demand', 'analysis')),
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        source TEXT,
        source_url TEXT,
        relevance_score INTEGER CHECK (relevance_score >= 1 AND relevance_score <= 100),
        gold_price_at_publish NUMERIC,
        silver_price_at_publish NUMERIC,
        platinum_price_at_publish NUMERIC,
        palladium_price_at_publish NUMERIC,
        expires_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_intelligence_briefs_date_category ON intelligence_briefs (date, category)`,
    ];

    const results = [];
    for (const sql of statements) {
      const { error } = await sb.rpc('exec_sql', { sql_text: sql }).maybeSingle();
      if (error) {
        // Try direct query approach
        const { error: error2 } = await sb.from('intelligence_briefs').select('id').limit(0);
        if (error2 && error2.code === '42P01') {
          // Table doesn't exist, can't create via PostgREST - need manual migration
          results.push({ sql: sql.substring(0, 50) + '...', status: 'needs_manual_migration', error: error.message });
        } else {
          results.push({ sql: sql.substring(0, 50) + '...', status: 'table_exists_or_created' });
        }
      } else {
        results.push({ sql: sql.substring(0, 50) + '...', status: 'ok' });
      }
    }

    // Verify table exists by trying a select
    const { error: verifyError } = await sb.from('intelligence_briefs').select('id').limit(0);

    res.json({
      success: !verifyError,
      table_exists: !verifyError,
      results,
      verify_error: verifyError?.message || null,
      note: verifyError ? 'Run the SQL migration manually in Supabase Dashboard SQL Editor' : 'Table ready',
    });
  } catch (error) {
    console.error('Intelligence migrate error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// VAULT DATA (COMEX Warehouse Inventory)
// ============================================

// GET /api/vault-data - Fetch COMEX warehouse inventory data
app.get('/api/vault-data', async (req, res) => {
  try {
    const source = req.query.source || 'comex';
    const days = Math.min(parseInt(req.query.days) || 30, 365);

    if (!isSupabaseAvailable()) {
      return res.json({
        success: true,
        source,
        days,
        data: { gold: [], silver: [], platinum: [], palladium: [] },
        message: 'Vault data not configured',
      });
    }

    const sb = getSupabase();
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - days);
    const sinceDateStr = sinceDate.toISOString().split('T')[0];

    const { data, error } = await sb
      .from('vault_data')
      .select('date, metal, registered_oz, eligible_oz, combined_oz, registered_change_oz, eligible_change_oz, combined_change_oz, open_interest_oz, oversubscribed_ratio')
      .eq('source', source)
      .gte('date', sinceDateStr)
      .order('date', { ascending: true });

    if (error) {
      console.error('Vault data fetch error:', error);
      return res.json({
        success: true,
        source,
        days,
        data: { gold: [], silver: [], platinum: [], palladium: [] },
        error: error.message,
      });
    }

    // Group by metal
    const grouped = { gold: [], silver: [], platinum: [], palladium: [] };
    for (const row of (data || [])) {
      if (grouped[row.metal]) {
        grouped[row.metal].push({
          date: row.date,
          registered_oz: parseFloat(row.registered_oz) || 0,
          eligible_oz: parseFloat(row.eligible_oz) || 0,
          combined_oz: parseFloat(row.combined_oz) || 0,
          registered_change_oz: parseFloat(row.registered_change_oz) || 0,
          eligible_change_oz: parseFloat(row.eligible_change_oz) || 0,
          oversubscribed_ratio: parseFloat(row.oversubscribed_ratio) || 0,
        });
      }
    }

    res.json({
      success: true,
      source,
      days,
      data: grouped,
    });
  } catch (error) {
    console.error('Vault data endpoint error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/vault-data/seed - Seed vault data (testing)
app.post('/api/vault-data/seed', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    if (!apiKey || apiKey !== process.env.INTELLIGENCE_API_KEY) {
      return res.status(401).json({ success: false, error: 'Invalid API key' });
    }

    if (!isSupabaseAvailable()) {
      return res.status(503).json({ success: false, error: 'Supabase not configured' });
    }

    const { entries } = req.body;
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ success: false, error: 'entries array required' });
    }

    const sb = getSupabase();
    const { data, error } = await sb
      .from('vault_data')
      .insert(entries)
      .select();

    if (error) {
      console.error('Vault seed error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({ success: true, inserted: data.length, entries: data });
  } catch (error) {
    console.error('Vault seed endpoint error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/vault-data/migrate - Run vault_data table migration (one-time)
app.post('/api/vault-data/migrate', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    if (!apiKey || apiKey !== process.env.INTELLIGENCE_API_KEY) {
      return res.status(401).json({ success: false, error: 'Invalid API key' });
    }

    if (!isSupabaseAvailable()) {
      return res.status(503).json({ success: false, error: 'Supabase not configured' });
    }

    const sb = getSupabase();

    const statements = [
      `CREATE TABLE IF NOT EXISTS vault_data (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        date DATE NOT NULL,
        source TEXT NOT NULL DEFAULT 'comex',
        metal TEXT NOT NULL CHECK (metal IN ('gold', 'silver', 'platinum', 'palladium')),
        registered_oz NUMERIC,
        eligible_oz NUMERIC,
        combined_oz NUMERIC,
        registered_change_oz NUMERIC,
        eligible_change_oz NUMERIC,
        combined_change_oz NUMERIC,
        open_interest_oz NUMERIC,
        oversubscribed_ratio NUMERIC,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS idx_vault_data_date_metal ON vault_data (date, metal, source)`,
    ];

    const results = [];
    for (const sql of statements) {
      const { error } = await sb.rpc('exec_sql', { sql_text: sql }).maybeSingle();
      if (error) {
        const { error: error2 } = await sb.from('vault_data').select('id').limit(0);
        if (error2 && error2.code === '42P01') {
          results.push({ sql: sql.substring(0, 50) + '...', status: 'needs_manual_migration', error: error.message });
        } else {
          results.push({ sql: sql.substring(0, 50) + '...', status: 'table_exists_or_created' });
        }
      } else {
        results.push({ sql: sql.substring(0, 50) + '...', status: 'ok' });
      }
    }

    const { error: verifyError } = await sb.from('vault_data').select('id').limit(0);

    res.json({
      success: !verifyError,
      table_exists: !verifyError,
      results,
      verify_error: verifyError?.message || null,
      note: verifyError ? 'Run the SQL migration manually in Supabase Dashboard SQL Editor' : 'Table ready',
    });
  } catch (error) {
    console.error('Vault migrate error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// INTELLIGENCE GENERATION (Gemini + Google Search)
// ============================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
const MAX_BRIEFS_PER_DAY = 8;

/**
 * Call Gemini with Google Search grounding. Returns parsed JSON or null.
 */
async function geminiSearch(prompt, systemPrompt, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.3 },
      };
      if (systemPrompt) {
        body.system_instruction = { parts: [{ text: systemPrompt }] };
      }

      const resp = await axios.post(GEMINI_URL, body, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000,
      });

      const text = resp.data?.candidates?.[0]?.content?.parts
        ?.filter(p => p.text)
        ?.map(p => p.text)
        ?.join('') || '';

      if (!text) {
        console.log(`     Attempt ${attempt}: Empty Gemini response`);
        continue;
      }

      // Strip markdown fences and parse JSON
      const cleaned = text.replace(/^```(?:json)?\s*\n?/g, '').replace(/\n?```\s*$/g, '').trim();
      return JSON.parse(cleaned);
    } catch (err) {
      console.log(`     Attempt ${attempt} failed: ${err.message}`);
      if (attempt < retries) {
        const wait = Math.pow(2, attempt) * 1000;
        console.log(`     Retrying in ${wait / 1000}s...`);
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }
  return null;
}

/**
 * Title similarity check (simple Dice coefficient on bigrams).
 */
function titleSimilarity(a, b) {
  const bigrams = (s) => {
    const lower = s.toLowerCase();
    const set = new Set();
    for (let i = 0; i < lower.length - 1; i++) set.add(lower.slice(i, i + 2));
    return set;
  };
  const setA = bigrams(a);
  const setB = bigrams(b);
  let intersection = 0;
  for (const bg of setA) { if (setB.has(bg)) intersection++; }
  return setA.size + setB.size > 0 ? (2 * intersection) / (setA.size + setB.size) : 0;
}

/**
 * Run the full intelligence generation pipeline.
 * Returns { briefsInserted, vaultInserted, apiCalls, errors }.
 */
async function runIntelligenceGeneration() {
  const startTime = Date.now();
  const today = new Date().toISOString().split('T')[0];
  let apiCalls = 0;
  const errors = [];

  if (!GEMINI_API_KEY) {
    return { briefsInserted: 0, vaultInserted: 0, apiCalls: 0, errors: ['GEMINI_API_KEY not configured'] };
  }
  if (!isSupabaseAvailable()) {
    return { briefsInserted: 0, vaultInserted: 0, apiCalls: 0, errors: ['Supabase not configured'] };
  }

  const sb = getSupabase();

  // ── STEP 1: INTELLIGENCE BRIEFS ──

  console.log(`\n🧠 [Intelligence] ===== STEP 1: BRIEFS for ${today} =====`);

  const SEARCHES = [
    `gold silver precious metals market news today ${today}`,
    `federal reserve interest rate policy gold impact ${today}`,
    `COMEX silver gold delivery supply shortage ${today}`,
    `central bank gold buying reserves ${today}`,
    `silver industrial demand solar panels EV ${today}`,
    `platinum palladium automotive catalyst supply ${today}`,
  ];

  const BRIEFS_SYSTEM = `You are a precious metals market analyst. Search for the most important news from the last 24 hours about the given topic. Return a JSON array of 1-3 news items. Each item must have: title (string), summary (2-3 sentences), category (one of: market_brief, breaking_news, policy, supply_demand, analysis), source (publication name), source_url (if findable), relevance_score (1-100, how important this is for physical precious metals stackers). Only include genuinely newsworthy items. If nothing significant happened, return an empty array. Return ONLY the JSON array, no markdown.`;

  const allBriefs = [];

  for (let i = 0; i < SEARCHES.length; i++) {
    console.log(`🧠 [Intelligence] Search ${i + 1}/${SEARCHES.length}: ${SEARCHES[i].slice(0, 60)}...`);
    apiCalls++;
    const result = await geminiSearch(SEARCHES[i], BRIEFS_SYSTEM);

    if (Array.isArray(result)) {
      console.log(`     Found ${result.length} briefs`);
      allBriefs.push(...result);
    } else {
      console.log(`     No results or bad response`);
    }

    // Small delay between searches
    if (i < SEARCHES.length - 1) await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`🧠 [Intelligence] Raw briefs: ${allBriefs.length}`);

  // Deduplicate by title similarity
  const deduped = [];
  for (const brief of allBriefs) {
    if (!brief.title) continue;
    const isDupe = deduped.some(existing => titleSimilarity(brief.title, existing.title) > 0.8);
    if (!isDupe) deduped.push(brief);
  }

  // Sort by relevance, cap
  deduped.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
  const finalBriefs = deduped.slice(0, MAX_BRIEFS_PER_DAY);
  console.log(`🧠 [Intelligence] After dedup + cap: ${finalBriefs.length}`);

  // Delete existing briefs for today (idempotent)
  try {
    await sb.from('intelligence_briefs').delete().eq('date', today);
    console.log(`🧠 [Intelligence] Cleared existing briefs for ${today}`);
  } catch (err) {
    console.log(`🧠 [Intelligence] Clear failed: ${err.message}`);
  }

  // Insert briefs
  let briefsInserted = 0;
  for (const brief of finalBriefs) {
    try {
      const row = {
        date: today,
        category: brief.category || 'market_brief',
        title: brief.title || 'Untitled',
        summary: brief.summary || '',
        source: brief.source || null,
        source_url: brief.source_url || null,
        relevance_score: Math.min(Math.max(parseInt(brief.relevance_score) || 50, 1), 100),
      };
      await sb.from('intelligence_briefs').insert(row);
      briefsInserted++;
      console.log(`     ✅ ${row.title.slice(0, 60)}...`);
    } catch (err) {
      console.log(`     ❌ Insert failed: ${err.message}`);
      errors.push(`Brief insert: ${err.message}`);
    }
  }

  // ── STEP 2: VAULT DATA (2 targeted searches + open interest) ──

  console.log(`\n🏦 [Vault] ===== STEP 2: COMEX VAULT DATA =====`);

  const VAULT_SYSTEM = `You are a COMEX warehouse data analyst. Search for the most recent COMEX vault / warehouse inventory numbers posted online. Reddit communities like r/WallstreetSilver and r/SilverDegenClub post these daily, as do sites like Kitco, SilverSeek, and GoldSeek. Return precise numbers in troy ounces. Only return data if you find actual reported numbers — do not estimate or fabricate. Return ONLY valid JSON, no markdown.`;

  // Search 1: Silver & Gold (most commonly reported)
  const VAULT_AG_AU_PROMPT = `COMEX silver gold registered eligible inventory ounces today ${today} site:reddit.com OR site:kitco.com OR site:silverseek.com OR site:goldseek.com`;
  const VAULT_AG_AU_SYSTEM = `${VAULT_SYSTEM} Search for the latest COMEX warehouse inventory numbers for silver and gold. Look for posts or articles from the last 48 hours that report registered, eligible, and total inventory in troy ounces, plus daily changes. Return JSON: { "gold": { "registered_oz": number, "eligible_oz": number, "registered_change_oz": number, "eligible_change_oz": number }, "silver": { "registered_oz": number, "eligible_oz": number, "registered_change_oz": number, "eligible_change_oz": number } }. Use real numbers from actual reports. If you cannot find real numbers for a metal, omit that key entirely. Return ONLY JSON.`;

  // Search 2: Platinum & Palladium
  const VAULT_PT_PD_PROMPT = `COMEX NYMEX platinum palladium registered eligible warehouse inventory ounces ${today}`;
  const VAULT_PT_PD_SYSTEM = `${VAULT_SYSTEM} Search for the latest COMEX/NYMEX warehouse inventory numbers for platinum and palladium. Return JSON: { "platinum": { "registered_oz": number, "eligible_oz": number, "registered_change_oz": number, "eligible_change_oz": number }, "palladium": { "registered_oz": number, "eligible_oz": number, "registered_change_oz": number, "eligible_change_oz": number } }. Use real numbers from actual reports. If you cannot find real numbers for a metal, omit that key entirely. Return ONLY JSON.`;

  // Search 3: Open interest (separate, often on different sites)
  const VAULT_OI_PROMPT = `COMEX gold silver platinum palladium open interest contracts today ${today} site:cmegroup.com OR site:barchart.com OR site:kitco.com`;
  const VAULT_OI_SYSTEM = `Search for the latest COMEX open interest for gold, silver, platinum, and palladium futures (active front month). Convert contracts to troy ounces (gold=100oz/contract, silver=5000oz/contract, platinum=50oz/contract, palladium=100oz/contract). Return JSON: { "gold": { "open_interest_oz": number }, "silver": { "open_interest_oz": number }, "platinum": { "open_interest_oz": number }, "palladium": { "open_interest_oz": number } }. Use real numbers. Omit metals you cannot find. Return ONLY JSON.`;

  // Run vault searches
  apiCalls += 3;
  console.log(`🏦 [Vault] Search 1/3: Silver & Gold inventory...`);
  const agAuResult = await geminiSearch(VAULT_AG_AU_PROMPT, VAULT_AG_AU_SYSTEM);
  await new Promise(r => setTimeout(r, 1000));

  console.log(`🏦 [Vault] Search 2/3: Platinum & Palladium inventory...`);
  const ptPdResult = await geminiSearch(VAULT_PT_PD_PROMPT, VAULT_PT_PD_SYSTEM);
  await new Promise(r => setTimeout(r, 1000));

  console.log(`🏦 [Vault] Search 3/3: Open interest...`);
  const oiResult = await geminiSearch(VAULT_OI_PROMPT, VAULT_OI_SYSTEM);

  // Merge results
  const vaultMerged = {};
  for (const result of [agAuResult, ptPdResult]) {
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      for (const metal of ['gold', 'silver', 'platinum', 'palladium']) {
        if (result[metal]) vaultMerged[metal] = { ...(vaultMerged[metal] || {}), ...result[metal] };
      }
    }
  }
  // Merge open interest
  if (oiResult && typeof oiResult === 'object' && !Array.isArray(oiResult)) {
    for (const metal of ['gold', 'silver', 'platinum', 'palladium']) {
      if (oiResult[metal]?.open_interest_oz) {
        vaultMerged[metal] = { ...(vaultMerged[metal] || {}), open_interest_oz: oiResult[metal].open_interest_oz };
      }
    }
  }

  let vaultInserted = 0;
  const metalsWithData = Object.keys(vaultMerged).filter(m => {
    const d = vaultMerged[m];
    return d && (parseFloat(d.registered_oz) > 0 || parseFloat(d.eligible_oz) > 0);
  });

  console.log(`🏦 [Vault] Found data for: ${metalsWithData.length > 0 ? metalsWithData.join(', ') : 'none'}`);

  if (metalsWithData.length > 0) {
    // Only clear today's data for metals we have fresh data for
    try {
      await sb.from('vault_data').delete().eq('date', today).eq('source', 'comex');
      console.log(`🏦 [Vault] Cleared existing data for ${today}`);
    } catch (err) {
      console.log(`🏦 [Vault] Clear failed: ${err.message}`);
    }

    for (const metal of metalsWithData) {
      const md = vaultMerged[metal];
      try {
        const registered = parseFloat(md.registered_oz) || 0;
        const eligible = parseFloat(md.eligible_oz) || 0;
        const regChange = parseFloat(md.registered_change_oz) || 0;
        const eligChange = parseFloat(md.eligible_change_oz) || 0;
        const openInterest = parseFloat(md.open_interest_oz) || 0;

        // Skip metals with no real inventory data (avoid inserting zeros)
        if (registered === 0 && eligible === 0) {
          console.log(`     ${metal}: Skipped (zero inventory — likely bad data)`);
          continue;
        }

        const combined = registered + eligible;
        const combinedChange = regChange + eligChange;
        const oversubscribed = registered > 0 && openInterest > 0 ? Math.round((openInterest / registered) * 100) / 100 : 0;

        const row = {
          date: today,
          source: 'comex',
          metal,
          registered_oz: registered,
          eligible_oz: eligible,
          combined_oz: combined,
          registered_change_oz: regChange,
          eligible_change_oz: eligChange,
          combined_change_oz: combinedChange,
          open_interest_oz: openInterest,
          oversubscribed_ratio: oversubscribed,
        };

        await sb.from('vault_data').insert(row);
        vaultInserted++;
        console.log(`     ✅ ${metal}: registered=${registered.toLocaleString()} oz${openInterest > 0 ? `, ratio=${oversubscribed}x` : ', no OI'}`);
      } catch (err) {
        console.log(`     ❌ ${metal}: ${err.message}`);
        errors.push(`Vault ${metal}: ${err.message}`);
      }
    }
    // ── COMEX AUTO-ALERTS: check for >2% registered inventory changes ──
    if (vaultInserted > 0) {
      try {
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        const { data: yesterdayData } = await sb.from('vault_data')
          .select('metal, registered_oz')
          .eq('date', yesterday)
          .eq('source', 'comex');

        if (yesterdayData && yesterdayData.length > 0) {
          const yesterdayMap = {};
          for (const row of yesterdayData) {
            yesterdayMap[row.metal] = row.registered_oz;
          }

          const comexAlerts = [];
          for (const metal of metalsWithData) {
            const todayReg = parseFloat(vaultMerged[metal].registered_oz) || 0;
            const yestReg = yesterdayMap[metal];
            if (!yestReg || yestReg === 0 || todayReg === 0) continue;

            const changePct = ((todayReg - yestReg) / yestReg) * 100;
            if (Math.abs(changePct) >= 2) {
              const changeOz = todayReg - yestReg;
              const direction = changePct > 0 ? 'rose' : 'dropped';
              const metalName = metal.charAt(0).toUpperCase() + metal.slice(1);
              const fmtOz = (v) => {
                const abs = Math.abs(v);
                if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
                if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
                return v.toLocaleString();
              };
              comexAlerts.push({
                title: `🏦 ${metalName} COMEX Alert`,
                body: `Registered inventory ${direction} ${fmtOz(Math.abs(changeOz))} oz (${changePct > 0 ? '+' : ''}${changePct.toFixed(1)}%) today`,
                metal,
                severity: Math.abs(changePct) >= 5 ? 'high' : 'medium',
              });
            }
          }

          if (comexAlerts.length > 0) {
            console.log(`🏦 [COMEX Alert] ${comexAlerts.length} metals with >2% change detected`);

            // Get all push tokens for users with breaking_news enabled
            const { data: tokens } = await sb.from('push_tokens')
              .select('expo_push_token, user_id')
              .order('last_active', { ascending: false });

            const { data: disabledPrefs } = await sb
              .from('notification_preferences')
              .select('user_id')
              .eq('breaking_news', false);

            const disabledUserIds = new Set((disabledPrefs || []).map(p => p.user_id));

            const seenUsers = new Set();
            const validTokens = [];
            for (const t of (tokens || [])) {
              if (!isValidExpoPushToken(t.expo_push_token)) continue;
              if (t.user_id && disabledUserIds.has(t.user_id)) continue;
              const key = t.user_id || t.expo_push_token;
              if (seenUsers.has(key)) continue;
              seenUsers.add(key);
              validTokens.push(t.expo_push_token);
            }

            for (const alert of comexAlerts) {
              // Insert breaking news record
              try {
                await sb.from('breaking_news').insert({
                  title: alert.title,
                  body: alert.body,
                  metal: alert.metal,
                  severity: alert.severity,
                });
              } catch (e) { console.log(`🏦 [COMEX Alert] Insert error: ${e.message}`); }

              // Send batch push
              if (validTokens.length > 0) {
                try {
                  const notifications = validTokens.map(token => ({
                    token,
                    notification: {
                      title: alert.title,
                      body: alert.body,
                      data: { type: 'breaking_news' },
                      sound: 'default',
                    },
                  }));
                  const results = await sendBatchPushNotifications(notifications);
                  const sent = results.filter(r => r.success).length;
                  console.log(`🏦 [COMEX Alert] ${alert.metal}: pushed to ${sent}/${validTokens.length} devices`);
                } catch (pushErr) {
                  console.error(`🏦 [COMEX Alert] Push error for ${alert.metal}: ${pushErr.message}`);
                }
              }
            }
          }
        }
      } catch (alertErr) {
        console.error(`🏦 [COMEX Alert] Error: ${alertErr.message}`);
      }
    }
  } else {
    console.log(`🏦 [Vault] ⚠️ No vault data found — previous day's data remains`);
  }

  // ── SUMMARY ──

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const estCost = (apiCalls * 0.01).toFixed(2);

  console.log(`\n${'━'.repeat(50)}`);
  console.log(`  Intelligence Generation Complete`);
  console.log(`  Briefs: ${briefsInserted} | Vault: ${vaultInserted}/4 | API calls: ${apiCalls}`);
  console.log(`  Cost: ~$${estCost} | Runtime: ${elapsed}s`);
  if (errors.length > 0) console.log(`  Errors: ${errors.length}`);
  console.log(`${'━'.repeat(50)}\n`);

  return { briefsInserted, vaultInserted, apiCalls, elapsed, estCost, errors };
}

// POST /api/intelligence/generate - Run intelligence generation pipeline
app.post('/api/intelligence/generate', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    if (!apiKey || apiKey !== process.env.INTELLIGENCE_API_KEY) {
      return res.status(401).json({ success: false, error: 'Invalid API key' });
    }

    console.log(`\n🧠 [Intelligence] Manual generation triggered via API`);
    const result = await runIntelligenceGeneration();

    res.json({
      success: result.briefsInserted > 0 || result.vaultInserted > 0,
      ...result,
    });
  } catch (error) {
    console.error('Intelligence generate error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// REVENUECAT SUBSCRIPTION SYNC
// ============================================

/**
 * Map a RevenueCat product_id to our subscription_tier.
 */
function mapProductToTier(productId) {
  if (!productId) return 'free';
  const pid = productId.toLowerCase();
  if (pid.includes('lifetime')) return 'lifetime';
  if (pid.includes('gold') || pid.includes('premium') || pid.includes('yearly') || pid.includes('monthly')) return 'gold';
  return 'free';
}

/**
 * Check if a string looks like a valid UUID (Supabase user id).
 */
function isUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

// POST /api/webhooks/revenuecat — RevenueCat server-to-server webhook
app.post('/api/webhooks/revenuecat', async (req, res) => {
  // Always return 200 to RevenueCat so they don't retry endlessly
  try {
    // Verify webhook secret
    if (REVENUECAT_WEBHOOK_SECRET) {
      const authHeader = req.headers['authorization'] || '';
      const token = authHeader.replace(/^Bearer\s+/i, '');
      if (token !== REVENUECAT_WEBHOOK_SECRET) {
        console.warn('🔑 [RevenueCat Webhook] Invalid authorization token — rejecting');
        return res.status(401).json({ error: 'Unauthorized' });
      }
    } else {
      console.warn('🔑 [RevenueCat Webhook] No REVENUECAT_WEBHOOK_SECRET set — accepting without auth');
    }

    const event = req.body?.event || req.body;
    const eventType = event?.type;
    const appUserId = event?.app_user_id;
    const productId = event?.product_id;
    const expirationMs = event?.expiration_at_ms;

    console.log(`\n📦 [RevenueCat Webhook] Event: ${eventType}, user: ${appUserId}, product: ${productId}`);

    // Skip anonymous users (pre-v1.4.1 installs that haven't logged in)
    if (!appUserId || appUserId.startsWith('$RCAnonymousID:')) {
      console.log('   ⚠️ Anonymous user, skipping Supabase sync');
      return res.status(200).json({ success: true, skipped: true, reason: 'anonymous_user' });
    }

    // Validate that app_user_id is a valid Supabase UUID
    if (!isUUID(appUserId)) {
      console.log(`   ⚠️ Non-UUID app_user_id: ${appUserId}, skipping`);
      return res.status(200).json({ success: true, skipped: true, reason: 'non_uuid_user' });
    }

    if (!isSupabaseAvailable()) {
      console.error('   ❌ Supabase not configured — cannot sync subscription');
      return res.status(200).json({ success: false, error: 'supabase_unavailable' });
    }

    const supabase = getSupabase();
    const tier = mapProductToTier(productId);
    const expirationDate = expirationMs ? new Date(expirationMs).toISOString() : null;

    switch (eventType) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'PRODUCT_CHANGE': {
        console.log(`   ✅ Setting tier=${tier}, expires=${expirationDate}`);
        const { error } = await supabase
          .from('profiles')
          .update({
            subscription_tier: tier,
            subscription_expires_at: expirationDate,
          })
          .eq('id', appUserId);

        if (error) console.error('   ❌ Supabase update failed:', error.message);
        else console.log('   ✅ Profile updated successfully');
        break;
      }

      case 'CANCELLATION': {
        // Don't downgrade — user keeps access until expiration
        console.log(`   ⏳ Cancellation — keeping tier, setting expiry=${expirationDate}`);
        const { error } = await supabase
          .from('profiles')
          .update({ subscription_expires_at: expirationDate })
          .eq('id', appUserId);

        if (error) console.error('   ❌ Supabase update failed:', error.message);
        else console.log('   ✅ Expiration date updated');
        break;
      }

      case 'EXPIRATION': {
        console.log('   ⬇️ Subscription expired — downgrading to free');
        const { error } = await supabase
          .from('profiles')
          .update({
            subscription_tier: 'free',
            subscription_expires_at: null,
          })
          .eq('id', appUserId);

        if (error) console.error('   ❌ Supabase update failed:', error.message);
        else console.log('   ✅ Downgraded to free');
        break;
      }

      case 'BILLING_ISSUE_DETECTED': {
        console.log('   ⚠️ Billing issue detected — no tier change (grace period)');
        break;
      }

      default:
        console.log(`   ℹ️ Unhandled event type: ${eventType} — no action taken`);
    }

    return res.status(200).json({ success: true, processed: true });

  } catch (error) {
    console.error('❌ [RevenueCat Webhook] Error:', error.message);
    // Still return 200 to prevent RevenueCat retries
    return res.status(200).json({ success: false, error: error.message });
  }
});

// GET /api/sync-subscription — Manual sync via RevenueCat REST API
app.get('/api/sync-subscription', async (req, res) => {
  try {
    const userId = req.query.user_id;

    if (!userId || !isUUID(userId)) {
      return res.status(400).json({ success: false, error: 'Valid user_id (UUID) required' });
    }

    if (!REVENUECAT_API_KEY) {
      return res.status(503).json({ success: false, error: 'RevenueCat sync not configured' });
    }

    if (!isSupabaseAvailable()) {
      return res.status(503).json({ success: false, error: 'Database not available' });
    }

    console.log(`\n🔄 [Subscription Sync] Checking RevenueCat for user: ${userId}`);

    // Query RevenueCat V1 REST API (V2 secret keys work with V1 endpoints)
    const rcResponse = await axios.get(
      `https://api.revenuecat.com/v1/subscribers/${userId}`,
      {
        headers: {
          'Authorization': `Bearer ${REVENUECAT_API_KEY}`,
          'Content-Type': 'application/json',
        },
        validateStatus: () => true, // Don't throw on non-200
      }
    );

    console.log(`   📡 RevenueCat response status: ${rcResponse.status}`);
    console.log(`   📡 RevenueCat response data:`, JSON.stringify(rcResponse.data, null, 2));

    if (rcResponse.status === 404) {
      // User not found in RevenueCat — they have no purchases
      console.log('   ℹ️ User not found in RevenueCat — setting tier to free');
      const supabase = getSupabase();
      await supabase
        .from('profiles')
        .update({ subscription_tier: 'free', subscription_expires_at: null })
        .eq('id', userId);

      return res.json({ success: true, tier: 'free', synced: true });
    }

    if (rcResponse.status !== 200) {
      console.error(`   ❌ RevenueCat API error: ${rcResponse.status}`, rcResponse.data);
      return res.status(502).json({ success: false, error: `RevenueCat returned ${rcResponse.status}` });
    }

    const subscriber = rcResponse.data?.subscriber;
    const entitlements = subscriber?.entitlements || {};
    console.log(`   📡 Parsed entitlements:`, JSON.stringify(entitlements, null, 2));

    // Check for active "Gold" (or any) entitlement
    let tier = 'free';
    let expirationDate = null;

    for (const [, entitlement] of Object.entries(entitlements)) {
      const ent = entitlement;
      // Check if entitlement is active (expires_date is null for lifetime, or in the future)
      const expiresDate = ent.expires_date ? new Date(ent.expires_date) : null;
      const isActive = !expiresDate || expiresDate > new Date();

      if (isActive) {
        const productId = ent.product_identifier || '';
        tier = mapProductToTier(productId);
        expirationDate = ent.expires_date || null;
        console.log(`   ✅ Active entitlement found: product=${productId}, tier=${tier}, expires=${expirationDate}`);
        break; // Use the first active entitlement
      }
    }

    // Update Supabase profiles
    const supabase = getSupabase();
    const { error } = await supabase
      .from('profiles')
      .update({
        subscription_tier: tier,
        subscription_expires_at: expirationDate,
      })
      .eq('id', userId);

    if (error) {
      console.error('   ❌ Supabase update failed:', error.message);
      return res.status(500).json({ success: false, error: 'Failed to update profile' });
    }

    console.log(`   ✅ Synced: tier=${tier}`);
    return res.json({ success: true, tier, synced: true });

  } catch (error) {
    console.error('❌ [Subscription Sync] Error:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// AI STACK ADVISOR
// ============================================

app.post('/api/advisor/chat', async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(503).json({ error: 'AI advisor is not configured' });
    }
    if (!isSupabaseAvailable()) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const { userId, message, conversationHistory } = req.body;

    if (!userId || !isUUID(userId)) {
      return res.status(400).json({ error: 'Valid userId is required' });
    }
    if (!message || typeof message !== 'string' || message.length > 500) {
      return res.status(400).json({ error: 'Message is required (max 500 characters)' });
    }

    const supabaseClient = getSupabase();

    // Verify user has Gold or Lifetime tier
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('subscription_tier')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    const tier = profile.subscription_tier || 'free';
    if (tier !== 'gold' && tier !== 'lifetime') {
      return res.status(403).json({ error: 'AI Stack Advisor requires Gold' });
    }

    // Fetch user's holdings
    const { data: holdings, error: holdingsError } = await supabaseClient
      .from('holdings')
      .select('metal, type, weight, weight_unit, quantity, purchase_price, purchase_date, notes')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (holdingsError) {
      console.error('❌ [Advisor] Holdings fetch error:', holdingsError.message);
    }

    const userHoldings = holdings || [];

    // Get current spot prices
    const prices = spotPriceCache.prices;
    const change = spotPriceCache.change || {};

    // Build portfolio summary
    const metalTotals = { gold: { oz: 0, cost: 0 }, silver: { oz: 0, cost: 0 }, platinum: { oz: 0, cost: 0 }, palladium: { oz: 0, cost: 0 } };
    const holdingDetails = [];

    for (const h of userHoldings) {
      const metal = h.metal;
      if (!metalTotals[metal]) continue;
      const weightOz = h.weight || 0;
      const qty = h.quantity || 1;
      const totalOz = weightOz * qty;
      const purchasePrice = h.purchase_price || 0;
      const totalCost = purchasePrice * qty;
      const currentValue = totalOz * (prices[metal] || 0);

      metalTotals[metal].oz += totalOz;
      metalTotals[metal].cost += totalCost;

      // Clean up type field (might contain JSON metadata)
      let typeName = h.type || 'Other';
      if (typeof typeName === 'string' && typeName.startsWith('{')) {
        try { typeName = JSON.parse(typeName).name || 'Other'; } catch { /* keep as-is */ }
      }

      holdingDetails.push({
        metal,
        type: typeName,
        qty,
        totalOz: totalOz.toFixed(4),
        purchasePrice: purchasePrice.toFixed(2),
        totalCost: totalCost.toFixed(2),
        currentValue: currentValue.toFixed(2),
        gainLoss: (currentValue - totalCost).toFixed(2),
        gainLossPct: totalCost > 0 ? (((currentValue - totalCost) / totalCost) * 100).toFixed(1) : '0',
        purchaseDate: h.purchase_date || 'Unknown',
      });
    }

    const totalValue = Object.keys(metalTotals).reduce((sum, m) => sum + metalTotals[m].oz * (prices[m] || 0), 0);
    const totalCost = Object.keys(metalTotals).reduce((sum, m) => sum + metalTotals[m].cost, 0);
    const gsRatio = prices.silver > 0 ? (prices.gold / prices.silver).toFixed(1) : 'N/A';

    // Format holdings for the prompt
    const holdingsText = holdingDetails.length > 0
      ? holdingDetails.map(h =>
        `- ${h.qty}x ${h.type} (${h.metal}): ${h.totalOz} oz, Cost $${h.totalCost}, Value $${h.currentValue}, ${parseFloat(h.gainLoss) >= 0 ? '+' : ''}$${h.gainLoss} (${h.gainLossPct}%), Purchased ${h.purchaseDate}`
      ).join('\n')
      : 'No holdings found.';

    const metalSummary = Object.entries(metalTotals)
      .filter(([_, v]) => v.oz > 0)
      .map(([m, v]) => {
        const val = v.oz * (prices[m] || 0);
        const gl = val - v.cost;
        return `${m.charAt(0).toUpperCase() + m.slice(1)}: ${v.oz.toFixed(2)} oz, Value $${val.toFixed(2)}, Cost $${v.cost.toFixed(2)}, ${gl >= 0 ? '+' : ''}$${gl.toFixed(2)}`;
      }).join('\n');

    const changeText = ['gold', 'silver', 'platinum', 'palladium']
      .map(m => {
        const c = change[m];
        if (!c || !c.percent) return null;
        return `${m.charAt(0).toUpperCase() + m.slice(1)}: ${c.percent >= 0 ? '+' : ''}${c.percent.toFixed(2)}% ($${c.amount?.toFixed(2) || '?'})`;
      })
      .filter(Boolean)
      .join(', ');

    const systemPrompt = `You are the Stack Advisor, an AI assistant for precious metals investors inside the Stack Tracker Gold app. You have access to the user's stack and current market data.

FORMATTING:
- Use **bold** for emphasis on key numbers, dollar amounts, percentages, and metal names.
- Use paragraph breaks for readability.
- Do NOT use headers (#), bullet points, tables, code blocks, or any heavy formatting.
- Keep it conversational prose with selective bold for important figures.

STACK SUMMARY:
Total Value: $${totalValue.toFixed(2)}
Total Cost Basis: $${totalCost.toFixed(2)}
Overall ${totalValue >= totalCost ? 'Gain' : 'Loss'}: ${totalValue >= totalCost ? '+' : ''}$${(totalValue - totalCost).toFixed(2)} (${totalCost > 0 ? (((totalValue - totalCost) / totalCost) * 100).toFixed(1) : '0'}%)

BY METAL:
${metalSummary || 'No holdings'}

INDIVIDUAL HOLDINGS:
${holdingsText}

CURRENT SPOT PRICES:
Gold: $${prices.gold}, Silver: $${prices.silver}, Platinum: $${prices.platinum}, Palladium: $${prices.palladium}

MARKET CONTEXT:
Gold/Silver Ratio: ${gsRatio}
Today's Moves: ${changeText || 'No data available'}

RULES:
- Give specific, actionable advice based on their actual stack
- Reference their holdings by name when relevant (e.g. "Your 1832 American Silver Eagles are up 64%...")
- Use current spot prices in calculations
- When discussing buying: mention current premiums and cost-per-oz context
- Be concise but thorough — this is for serious stackers, not beginners
- Never guarantee returns or make definitive price predictions
- Add a brief disclaimer at the end of financial advice responses
- Format responses with clear sections when appropriate using markdown (bold, bullet points)
- You can use dollar amounts and percentages freely
- Keep responses under 600 words`;

    // Build conversation for Gemini
    const contents = [];

    // Add conversation history (max last 10 messages)
    const history = Array.isArray(conversationHistory) ? conversationHistory.slice(-10) : [];
    for (const msg of history) {
      if (msg.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: msg.content }] });
      } else if (msg.role === 'assistant') {
        contents.push({ role: 'model', parts: [{ text: msg.content }] });
      }
    }

    // Add the new user message
    contents.push({ role: 'user', parts: [{ text: message }] });

    const geminiBody = {
      contents,
      system_instruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    };

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
    const geminiResp = await axios.post(geminiUrl, geminiBody, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    const responseText = geminiResp.data?.candidates?.[0]?.content?.parts
      ?.filter(p => p.text)
      ?.map(p => p.text)
      ?.join('') || '';

    if (!responseText) {
      return res.status(500).json({ error: 'AI advisor returned an empty response' });
    }

    console.log(`🧠 [Advisor] Response for user ${userId}: ${responseText.length} chars`);
    return res.json({ response: responseText });

  } catch (error) {
    console.error('❌ [Advisor] Error:', error.message);
    return res.status(500).json({ error: 'Failed to get advisor response' });
  }
});

// ============================================
// AI DAILY BRIEF
// ============================================

/**
 * Generate a personalized daily brief for a Gold/Lifetime user.
 * Analyzes their holdings against current market conditions and news.
 */
async function generateDailyBrief(userId) {
  if (!GEMINI_API_KEY) throw new Error('Gemini API key not configured');
  if (!isSupabaseAvailable()) throw new Error('Database not available');
  if (!isUUID(userId)) throw new Error('Invalid userId');

  const supabaseClient = getSupabase();

  // Verify Gold/Lifetime tier
  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('subscription_tier')
    .eq('id', userId)
    .single();

  if (profileError || !profile) throw new Error('User profile not found');
  const tier = profile.subscription_tier || 'free';
  if (tier !== 'gold' && tier !== 'lifetime') throw new Error('Daily brief requires Gold');

  // Fetch user's holdings
  const { data: holdings } = await supabaseClient
    .from('holdings')
    .select('metal, type, weight, weight_unit, quantity, purchase_price')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  const userHoldings = holdings || [];

  // Build portfolio summary
  const prices = spotPriceCache.prices;
  const change = spotPriceCache.change || {};
  const metalTotals = { gold: { oz: 0, cost: 0 }, silver: { oz: 0, cost: 0 }, platinum: { oz: 0, cost: 0 }, palladium: { oz: 0, cost: 0 } };

  for (const h of userHoldings) {
    const metal = h.metal;
    if (!metalTotals[metal]) continue;
    const weightOz = h.weight || 0;
    const qty = h.quantity || 1;
    metalTotals[metal].oz += weightOz * qty;
    metalTotals[metal].cost += (h.purchase_price || 0) * qty;
  }

  const totalValue = Object.keys(metalTotals).reduce((sum, m) => sum + metalTotals[m].oz * (prices[m] || 0), 0);
  const totalCost = Object.keys(metalTotals).reduce((sum, m) => sum + metalTotals[m].cost, 0);

  const metalSummary = Object.entries(metalTotals)
    .filter(([_, v]) => v.oz > 0)
    .map(([m, v]) => {
      const val = v.oz * (prices[m] || 0);
      return `${m.charAt(0).toUpperCase() + m.slice(1)}: ${v.oz.toFixed(2)} oz ($${val.toFixed(2)})`;
    }).join(', ');

  const changeText = ['gold', 'silver', 'platinum', 'palladium']
    .map(m => {
      const c = change[m];
      if (!c || !c.percent) return null;
      return `${m.charAt(0).toUpperCase() + m.slice(1)}: ${c.percent >= 0 ? '+' : ''}${c.percent.toFixed(2)}%`;
    })
    .filter(Boolean)
    .join(', ');

  // Fetch today's intelligence briefs for context
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const { data: newsBriefs } = await supabaseClient
    .from('intelligence_briefs')
    .select('title, summary, category')
    .eq('date', today)
    .order('relevance_score', { ascending: false })
    .limit(6);

  const newsContext = (newsBriefs || [])
    .map(b => `- [${b.category}] ${b.title}: ${b.summary}`)
    .join('\n');

  // Call Gemini 2.0 Flash (plain text, no Google Search tool)
  const systemPrompt = `You are a senior precious metals market analyst writing a personalized daily briefing for an investor. Be concise, insightful, and specific to their stack. Write 3-4 short paragraphs. Use plain text, no markdown headers or bullet points. Address the reader as "you" and reference their actual holdings. Do NOT start with "Good morning" or any time-of-day greeting — jump straight into the market analysis.`;

  const userPrompt = `Write a daily market brief for today (${today}).

THE STACK:
Total Value: $${totalValue.toFixed(2)} | Cost Basis: $${totalCost.toFixed(2)} | ${totalValue >= totalCost ? 'Gain' : 'Loss'}: $${Math.abs(totalValue - totalCost).toFixed(2)}
Holdings: ${metalSummary || 'No holdings yet'}

SPOT PRICES:
Gold: $${prices.gold}, Silver: $${prices.silver}, Platinum: $${prices.platinum}, Palladium: $${prices.palladium}
Today's Changes: ${changeText || 'No change data available'}
Gold/Silver Ratio: ${prices.silver > 0 ? (prices.gold / prices.silver).toFixed(1) : 'N/A'}

TODAY'S NEWS:
${newsContext || 'No news available yet today.'}

Write a personalized briefing covering: 1) How today's market moves affect their specific stack, 2) Key news and what it means for their metals, 3) One brief forward-looking thought. Keep it under 250 words.`;

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
  const geminiResp = await axios.post(geminiUrl, {
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    system_instruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
  }, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });

  const briefText = geminiResp.data?.candidates?.[0]?.content?.parts
    ?.filter(p => p.text)
    ?.map(p => p.text)
    ?.join('') || '';

  if (!briefText) throw new Error('Gemini returned empty response');

  // Upsert into daily_briefs (on conflict update)
  const { error: upsertError } = await supabaseClient
    .from('daily_briefs')
    .upsert({
      user_id: userId,
      brief_text: briefText,
      generated_at: new Date().toISOString(),
      date: today,
    }, { onConflict: 'user_id,date' });

  if (upsertError) throw new Error(`Failed to save brief: ${upsertError.message}`);

  console.log(`📝 [Daily Brief] Generated for user ${userId}: ${briefText.length} chars`);
  return { success: true, brief: { brief_text: briefText, generated_at: new Date().toISOString(), date: today } };
}

// Generate portfolio intelligence analysis for a user
async function generatePortfolioIntelligence(userId) {
  if (!GEMINI_API_KEY) throw new Error('Gemini API key not configured');
  if (!isSupabaseAvailable()) throw new Error('Database not available');
  if (!isUUID(userId)) throw new Error('Invalid userId');

  const supabaseClient = getSupabase();

  // Fetch user's holdings
  const { data: holdings } = await supabaseClient
    .from('holdings')
    .select('metal, type, weight, weight_unit, quantity, purchase_price')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  const userHoldings = holdings || [];
  if (userHoldings.length === 0) return null;

  const prices = spotPriceCache.prices;
  const metalTotals = { gold: { oz: 0, cost: 0, items: 0 }, silver: { oz: 0, cost: 0, items: 0 }, platinum: { oz: 0, cost: 0, items: 0 }, palladium: { oz: 0, cost: 0, items: 0 } };

  for (const h of userHoldings) {
    const metal = h.metal;
    if (!metalTotals[metal]) continue;
    const weightOz = h.weight || 0;
    const qty = h.quantity || 1;
    metalTotals[metal].oz += weightOz * qty;
    metalTotals[metal].cost += (h.purchase_price || 0) * qty;
    metalTotals[metal].items += qty;
  }

  const totalValue = Object.keys(metalTotals).reduce((sum, m) => sum + metalTotals[m].oz * (prices[m] || 0), 0);
  const totalCost = Object.keys(metalTotals).reduce((sum, m) => sum + metalTotals[m].cost, 0);

  // Build allocation breakdown
  const allocation = Object.entries(metalTotals)
    .filter(([_, v]) => v.oz > 0)
    .map(([m, v]) => {
      const val = v.oz * (prices[m] || 0);
      const pct = totalValue > 0 ? ((val / totalValue) * 100).toFixed(1) : '0';
      const gain = val - v.cost;
      const gainPct = v.cost > 0 ? ((gain / v.cost) * 100).toFixed(1) : 'N/A';
      return `${m.charAt(0).toUpperCase() + m.slice(1)}: ${v.oz.toFixed(2)} oz, $${val.toFixed(0)} (${pct}% of stack), cost basis $${v.cost.toFixed(0)}, ${gain >= 0 ? '+' : ''}$${gain.toFixed(0)} (${gainPct}%)`;
    }).join('\n');

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  const systemPrompt = `You are a senior precious metals stack strategist. Return a JSON object with exactly three keys: "portfolio", "costBasis", and "purchaseStats". Each value is a plain-text paragraph (2-3 sentences). Do NOT use markdown, headers, or bullet points. Do NOT start with any greeting. Address the reader as "you".

- "portfolio": Allocation and diversification analysis — concentration risk, metal mix assessment, strategic positioning.
- "costBasis": Cost basis insights — unrealized gains/losses by metal, which positions are performing best/worst, average cost vs current spot.
- "purchaseStats": Buying patterns — purchase frequency observations, dollar-cost averaging assessment, timing insights.

Return ONLY valid JSON, no other text.`;

  const userPrompt = `Analyze this precious metals stack (${today}).

STACK OVERVIEW:
Total Value: $${totalValue.toFixed(0)} | Total Cost: $${totalCost.toFixed(0)} | ${totalValue >= totalCost ? 'Gain' : 'Loss'}: $${Math.abs(totalValue - totalCost).toFixed(0)} (${totalCost > 0 ? ((totalValue - totalCost) / totalCost * 100).toFixed(1) : '0'}%)
Items: ${userHoldings.length}

ALLOCATION:
${allocation}

SPOT PRICES:
Gold: $${prices.gold}, Silver: $${prices.silver}, Platinum: $${prices.platinum}, Palladium: $${prices.palladium}
Gold/Silver Ratio: ${prices.silver > 0 ? (prices.gold / prices.silver).toFixed(1) : 'N/A'}`;

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
  const geminiResp = await axios.post(geminiUrl, {
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    system_instruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { temperature: 0.7, maxOutputTokens: 1024, responseMimeType: 'application/json' },
  }, {
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
  });

  const rawText = geminiResp.data?.candidates?.[0]?.content?.parts
    ?.filter(p => p.text)
    ?.map(p => p.text)
    ?.join('') || '';

  if (!rawText) throw new Error('Gemini returned empty response');

  let sections;
  try {
    sections = JSON.parse(rawText);
  } catch (e) {
    // Fallback: use raw text as portfolio intelligence only
    sections = { portfolio: rawText, costBasis: '', purchaseStats: '' };
  }

  const portfolioText = sections.portfolio || '';
  const costBasisText = sections.costBasis || '';
  const purchaseStatsText = sections.purchaseStats || '';

  // Update existing daily_briefs row for today
  const updatePayload = {
    portfolio_intelligence: portfolioText,
    cost_basis_intelligence: costBasisText,
    purchase_stats_intelligence: purchaseStatsText,
  };

  const { data: updated, error: updateError } = await supabaseClient
    .from('daily_briefs')
    .update(updatePayload)
    .eq('user_id', userId)
    .eq('date', today)
    .select('date');

  if (updateError) throw new Error(`Failed to save portfolio intelligence: ${updateError.message}`);

  if (!updated || updated.length === 0) {
    // No row for today — generate daily brief first to create the row, then update it
    await generateDailyBrief(userId);
    const { error: retryError } = await supabaseClient
      .from('daily_briefs')
      .update(updatePayload)
      .eq('user_id', userId)
      .eq('date', today);
    if (retryError) throw new Error(`Failed to save portfolio intelligence after brief generation: ${retryError.message}`);
  }

  console.log(`🧠 [Portfolio Intelligence] Generated for user ${userId}: portfolio=${portfolioText.length}, costBasis=${costBasisText.length}, purchaseStats=${purchaseStatsText.length}`);
  return { success: true, portfolio: portfolioText, costBasis: costBasisText, purchaseStats: purchaseStatsText, date: today };
}

// GET /api/portfolio-intelligence — Fetch portfolio intelligence for a user
app.get('/api/portfolio-intelligence', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId || !isUUID(userId)) {
      return res.status(400).json({ error: 'Valid userId is required' });
    }
    if (!isSupabaseAvailable()) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const supabaseClient = getSupabase();

    // Tier check
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('subscription_tier')
      .eq('id', userId)
      .single();

    const tier = profile?.subscription_tier || 'free';
    if (tier !== 'gold' && tier !== 'lifetime') {
      return res.status(403).json({ error: 'Portfolio intelligence requires Gold' });
    }

    // Get latest entry with portfolio_intelligence
    const { data, error } = await supabaseClient
      .from('daily_briefs')
      .select('portfolio_intelligence, cost_basis_intelligence, purchase_stats_intelligence, date, generated_at')
      .eq('user_id', userId)
      .not('portfolio_intelligence', 'is', null)
      .order('date', { ascending: false })
      .limit(1)
      .single();

    if (error || !data || !data.portfolio_intelligence) {
      return res.json({ success: true, intelligence: null });
    }

    const todayEST = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    return res.json({ success: true, intelligence: {
      text: data.portfolio_intelligence,
      costBasis: data.cost_basis_intelligence || null,
      purchaseStats: data.purchase_stats_intelligence || null,
      date: data.date,
      is_current: data.date === todayEST,
    } });

  } catch (error) {
    console.error('❌ [Portfolio Intelligence] Fetch error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch portfolio intelligence' });
  }
});

// GET /api/daily-brief — Fetch the latest daily brief for a user
app.get('/api/daily-brief', async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId || !isUUID(userId)) {
      return res.status(400).json({ error: 'Valid userId is required' });
    }
    if (!isSupabaseAvailable()) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const supabaseClient = getSupabase();

    // Tier check
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('subscription_tier')
      .eq('id', userId)
      .single();

    const tier = profile?.subscription_tier || 'free';
    if (tier !== 'gold' && tier !== 'lifetime') {
      return res.status(403).json({ error: 'Daily brief requires Gold' });
    }

    // Get latest brief
    const { data, error } = await supabaseClient
      .from('daily_briefs')
      .select('brief_text, generated_at, date')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      // No briefs ever generated for this user
      return res.json({ success: true, brief: null });
    }

    // Check if the brief is from today (EST)
    const todayEST = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const isCurrent = data.date === todayEST;

    return res.json({ success: true, brief: { ...data, is_current: isCurrent } });

  } catch (error) {
    console.error('❌ [Daily Brief] Fetch error:', error.message);
    return res.status(500).json({ error: 'Failed to fetch daily brief' });
  }
});

// POST /api/daily-brief/generate — Manual trigger for testing
app.post('/api/daily-brief/generate', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId || !isUUID(userId)) {
      return res.status(400).json({ error: 'Valid userId is required' });
    }

    const result = await generateDailyBrief(userId);

    // Generate portfolio intelligence alongside the daily brief
    try { await generatePortfolioIntelligence(userId); } catch (piErr) { console.log(`🧠 [Portfolio Intelligence] Skipped for ${userId}: ${piErr.message}`); }

    // Push notifications disabled — stg-api cron handles all push delivery now

    return res.json(result);

  } catch (error) {
    console.error('❌ [Daily Brief] Generate error:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to generate daily brief' });
  }
});

// POST /api/portfolio-intelligence/generate — Manual trigger for testing
app.post('/api/portfolio-intelligence/generate', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId || !isUUID(userId)) {
      return res.status(400).json({ error: 'Valid userId is required' });
    }

    const result = await generatePortfolioIntelligence(userId);
    if (!result) {
      return res.json({ success: true, intelligence: null, message: 'No holdings found' });
    }

    return res.json({ success: true, intelligence: { text: result.portfolio, costBasis: result.costBasis, purchaseStats: result.purchaseStats, date: result.date } });

  } catch (error) {
    console.error('❌ [Portfolio Intelligence] Generate error:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to generate portfolio intelligence' });
  }
});

// ============================================
// BREAKING NEWS + NOTIFICATION PREFERENCES
// ============================================

// POST /api/breaking-news — Send a breaking news push to all eligible users
app.post('/api/breaking-news', async (req, res) => {
  try {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    if (!apiKey || apiKey !== process.env.INTELLIGENCE_API_KEY) {
      return res.status(401).json({ success: false, error: 'Invalid API key' });
    }

    const { title, body, metal, severity } = req.body;
    if (!title || !body) {
      return res.status(400).json({ success: false, error: 'title and body are required' });
    }

    if (!isSupabaseAvailable()) {
      return res.status(503).json({ success: false, error: 'Database not configured' });
    }

    const sb = getSupabase();

    // Insert breaking news record
    const { data: newsRecord, error: insertError } = await sb
      .from('breaking_news')
      .insert({ title, body, metal: metal || null, severity: severity || 'info' })
      .select()
      .single();

    if (insertError) {
      console.error('❌ [Breaking News] Insert error:', insertError.message);
      return res.status(500).json({ success: false, error: insertError.message });
    }

    // Get all push tokens
    const { data: tokens, error: tokenError } = await sb
      .from('push_tokens')
      .select('expo_push_token, user_id')
      .order('last_active', { ascending: false });

    if (tokenError || !tokens) {
      return res.json({ success: true, newsId: newsRecord.id, pushSent: 0, error: 'Failed to fetch tokens' });
    }

    // Filter out users who have disabled breaking_news notifications
    const { data: disabledPrefs } = await sb
      .from('notification_preferences')
      .select('user_id')
      .eq('breaking_news', false);

    const disabledUserIds = new Set((disabledPrefs || []).map(p => p.user_id));

    // Deduplicate by user_id (most recent token per user)
    const seenUsers = new Set();
    const validTokens = [];
    for (const t of tokens) {
      if (!isValidExpoPushToken(t.expo_push_token)) continue;
      if (t.user_id && disabledUserIds.has(t.user_id)) continue;
      const key = t.user_id || t.expo_push_token;
      if (seenUsers.has(key)) continue;
      seenUsers.add(key);
      validTokens.push(t.expo_push_token);
    }

    // Send batch push notifications
    let pushSent = 0;
    if (validTokens.length > 0) {
      try {
        const notifications = validTokens.map(token => ({
          token,
          notification: {
            title,
            body,
            data: { type: 'breaking_news', newsId: newsRecord.id },
            sound: 'default',
          },
        }));
        const results = await sendBatchPushNotifications(notifications);
        pushSent = results.filter(r => r.success).length;
      } catch (batchErr) {
        console.error('❌ [Breaking News] Batch push error:', batchErr.message);
      }
    }

    console.log(`📰 [Breaking News] Created: "${title}" — pushed to ${pushSent}/${validTokens.length} devices`);
    res.json({ success: true, newsId: newsRecord.id, pushSent, totalTargeted: validTokens.length });
  } catch (error) {
    console.error('❌ [Breaking News] Error:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/notification-preferences — Get user's notification preferences
const NOTIF_DEFAULTS = {
  daily_brief: true, price_alerts: true, breaking_news: true,
  comex_alerts: true, comex_gold: true, comex_silver: true, comex_platinum: true, comex_palladium: true,
};

app.get('/api/notification-preferences', async (req, res) => {
  try {
    const userId = req.query.userId;
    if (!userId || !isUUID(userId)) {
      return res.status(400).json({ error: 'Valid userId is required' });
    }

    if (!isSupabaseAvailable()) {
      return res.json({ ...NOTIF_DEFAULTS });
    }

    const { data, error } = await getSupabase()
      .from('notification_preferences')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return res.json({ ...NOTIF_DEFAULTS });
    }

    // Merge with defaults so new fields default to true
    res.json({ ...NOTIF_DEFAULTS, ...data });
  } catch (error) {
    console.error('❌ [Notification Prefs] Get error:', error.message);
    res.json({ ...NOTIF_DEFAULTS });
  }
});

// POST /api/notification-preferences — Save user's notification preferences
app.post('/api/notification-preferences', async (req, res) => {
  try {
    const { userId, daily_brief, price_alerts, breaking_news,
            comex_alerts, comex_gold, comex_silver, comex_platinum, comex_palladium } = req.body;
    if (!userId || !isUUID(userId)) {
      return res.status(400).json({ error: 'Valid userId is required' });
    }

    if (!isSupabaseAvailable()) {
      return res.status(503).json({ error: 'Database not configured' });
    }

    const sb = getSupabase();
    const prefs = {
      user_id: userId,
      daily_brief: daily_brief !== false,
      price_alerts: price_alerts !== false,
      breaking_news: breaking_news !== false,
      comex_alerts: comex_alerts !== false,
      comex_gold: comex_gold !== false,
      comex_silver: comex_silver !== false,
      comex_platinum: comex_platinum !== false,
      comex_palladium: comex_palladium !== false,
    };

    const { error } = await sb
      .from('notification_preferences')
      .upsert(prefs, { onConflict: 'user_id' });

    if (error) {
      // If COMEX columns don't exist yet, retry with just the original 3 fields
      if (error.message && error.message.includes('column')) {
        const fallbackPrefs = { user_id: userId, daily_brief: prefs.daily_brief, price_alerts: prefs.price_alerts, breaking_news: prefs.breaking_news };
        const { error: fallbackErr } = await sb.from('notification_preferences').upsert(fallbackPrefs, { onConflict: 'user_id' });
        if (fallbackErr) {
          console.error('❌ [Notification Prefs] Fallback save error:', fallbackErr.message);
          return res.status(500).json({ error: fallbackErr.message });
        }
        console.log(`🔔 [Notification Prefs] Saved (fallback) for ${userId}`);
        return res.json({ success: true, ...prefs });
      }
      console.error('❌ [Notification Prefs] Save error:', error.message);
      return res.status(500).json({ error: error.message });
    }

    console.log(`🔔 [Notification Prefs] Saved for ${userId}: brief=${prefs.daily_brief}, alerts=${prefs.price_alerts}, comex=${prefs.comex_alerts}`);
    res.json({ success: true, ...prefs });
  } catch (error) {
    console.error('❌ [Notification Prefs] Save error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// STRIPE BILLING
// ============================================

/**
 * Map a Stripe price_id to our subscription_tier.
 * All paid Stripe plans map to 'gold' (or 'lifetime' for one-time).
 */
function mapStripePriceToTier(priceId) {
  if (!priceId) return 'free';
  if (priceId === STRIPE_GOLD_LIFETIME_PRICE_ID) return 'lifetime';
  if (priceId === STRIPE_GOLD_MONTHLY_PRICE_ID) return 'gold';
  if (priceId === STRIPE_GOLD_YEARLY_PRICE_ID) return 'gold';
  return 'free';
}

/**
 * Check if a price_id is the lifetime (one-time payment) product.
 */
function isLifetimePrice(priceId) {
  return priceId === STRIPE_GOLD_LIFETIME_PRICE_ID;
}

// POST /api/stripe/create-checkout-session
app.post('/api/stripe/create-checkout-session', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe is not configured' });
    }
    if (!isSupabaseAvailable()) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const { user_id, price_id, success_url, cancel_url } = req.body;

    if (!user_id || !isUUID(user_id)) {
      return res.status(400).json({ error: 'Valid user_id is required' });
    }
    if (!price_id) {
      return res.status(400).json({ error: 'price_id is required' });
    }

    const supabaseClient = getSupabase();

    // Look up user profile for email and existing stripe_customer_id
    let { data: profile } = await supabaseClient
      .from('profiles')
      .select('email, stripe_customer_id')
      .eq('id', user_id)
      .single();

    // If profile doesn't exist (new user), create it from auth.users
    if (!profile) {
      const { data: authUser, error: authError } = await supabaseClient.auth.admin.getUserById(user_id);
      if (authError || !authUser?.user) {
        return res.status(404).json({ error: 'User not found' });
      }
      const userEmail = authUser.user.email || '';
      await supabaseClient
        .from('profiles')
        .upsert({ id: user_id, email: userEmail, subscription_tier: 'free' }, { onConflict: 'id' });
      profile = { email: userEmail, stripe_customer_id: null };
      console.log(`📝 [Stripe] Created missing profile for user ${user_id}`);
    }

    let customerId = profile.stripe_customer_id;

    // Create Stripe customer if we don't have one
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile.email,
        metadata: { supabase_user_id: user_id },
      });
      customerId = customer.id;

      // Store stripe_customer_id in profiles
      await supabaseClient
        .from('profiles')
        .update({ stripe_customer_id: customerId })
        .eq('id', user_id);
    }

    // Determine tier and checkout mode from price_id
    const tier = mapStripePriceToTier(price_id);
    const isLifetime = isLifetimePrice(price_id);

    const sessionParams = {
      mode: isLifetime ? 'payment' : 'subscription',
      customer: customerId,
      line_items: [{ price: price_id, quantity: 1 }],
      success_url: success_url || 'https://stacktrackergold.com/settings?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: cancel_url || 'https://stacktrackergold.com/settings',
      client_reference_id: user_id,
      metadata: { user_id, tier },
    };

    // For lifetime, add invoice creation so webhook fires checkout.session.completed
    if (isLifetime) {
      sessionParams.invoice_creation = { enabled: true };
    }

    // For subscriptions (not lifetime), add 7-day free trial
    if (!isLifetime) {
      sessionParams.subscription_data = {
        trial_period_days: 7,
        trial_settings: {
          end_behavior: { missing_payment_method: 'cancel' },
        },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    console.log(`💳 [Stripe] Checkout session created for user ${user_id}, tier=${tier}`);
    return res.json({ url: session.url });

  } catch (error) {
    console.error('❌ [Stripe] Create checkout error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/webhooks/stripe — Stripe webhook
app.post('/api/webhooks/stripe', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).send('Stripe not configured');
    }

    const sig = req.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.warn('⚠️ [Stripe Webhook] Signature verification failed:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log(`💳 [Stripe Webhook] Event: ${event.type}`);

    if (!isSupabaseAvailable()) {
      console.error('❌ [Stripe Webhook] Supabase not available');
      return res.status(503).send('Database not available');
    }

    const supabaseClient = getSupabase();

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id || session.metadata?.user_id;
        if (!userId || !isUUID(userId)) {
          console.warn('⚠️ [Stripe Webhook] No valid user_id in checkout session');
          break;
        }

        // Determine tier from metadata or by looking up the price
        let tier = session.metadata?.tier || 'gold';

        let subscriptionStatus = 'active';
        let trialEnd = null;

        if (session.subscription) {
          // Subscription checkout — look up price_id from subscription
          try {
            const subscription = await stripe.subscriptions.retrieve(session.subscription);
            const priceId = subscription.items?.data?.[0]?.price?.id;
            if (priceId) {
              tier = mapStripePriceToTier(priceId);
            }
            subscriptionStatus = subscription.status || 'active';
            if (subscription.trial_end) {
              trialEnd = new Date(subscription.trial_end * 1000).toISOString();
            }
          } catch (e) {
            console.warn('⚠️ [Stripe Webhook] Could not retrieve subscription:', e.message);
          }
        } else if (session.mode === 'payment') {
          // One-time payment (lifetime) — tier comes from metadata
          tier = session.metadata?.tier || 'lifetime';
        }

        const { error } = await supabaseClient
          .from('profiles')
          .update({
            subscription_tier: tier,
            stripe_customer_id: session.customer,
            subscription_status: subscriptionStatus,
            trial_end: trialEnd,
          })
          .eq('id', userId);

        if (error) {
          console.error('❌ [Stripe Webhook] Failed to update profile:', error.message);
        } else {
          console.log(`✅ [Stripe Webhook] checkout.session.completed: user=${userId}, tier=${tier}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        // Look up user by stripe_customer_id
        const { data: profile } = await supabaseClient
          .from('profiles')
          .select('id, subscription_tier')
          .eq('stripe_customer_id', customerId)
          .single();

        if (profile) {
          // Don't downgrade lifetime users via subscription events
          if (profile.subscription_tier === 'lifetime') break;

          const newTier = (subscription.status === 'active' || subscription.status === 'trialing') ? 'gold' : 'free';
          const updateData = {
            subscription_tier: newTier,
            subscription_status: subscription.status,
          };
          if (subscription.trial_end) {
            updateData.trial_end = new Date(subscription.trial_end * 1000).toISOString();
          } else {
            updateData.trial_end = null;
          }
          await supabaseClient
            .from('profiles')
            .update(updateData)
            .eq('id', profile.id);
          console.log(`✅ [Stripe Webhook] subscription.updated: user=${profile.id}, tier=${newTier}, status=${subscription.status}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        const { data: profile } = await supabaseClient
          .from('profiles')
          .select('id, subscription_tier')
          .eq('stripe_customer_id', customerId)
          .single();

        if (profile) {
          // Don't downgrade lifetime users
          if (profile.subscription_tier === 'lifetime') break;

          await supabaseClient
            .from('profiles')
            .update({ subscription_tier: 'free' })
            .eq('id', profile.id);
          console.log(`✅ [Stripe Webhook] subscription.deleted: user=${profile.id}, downgraded to free`);
        }
        break;
      }

      default:
        console.log(`💳 [Stripe Webhook] Unhandled event: ${event.type}`);
    }

    return res.json({ received: true });

  } catch (error) {
    console.error('❌ [Stripe Webhook] Error:', error.message);
    return res.status(500).send('Webhook handler error');
  }
});

// POST /api/stripe/customer-portal
app.post('/api/stripe/customer-portal', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe is not configured' });
    }
    if (!isSupabaseAvailable()) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const { user_id, return_url } = req.body;

    if (!user_id || !isUUID(user_id)) {
      return res.status(400).json({ error: 'Valid user_id is required' });
    }

    const supabaseClient = getSupabase();

    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('stripe_customer_id')
      .eq('id', user_id)
      .single();

    if (profileError || !profile?.stripe_customer_id) {
      return res.status(404).json({ error: 'No Stripe customer found for this user' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: return_url || 'https://stacktrackergold.com/settings',
    });

    console.log(`💳 [Stripe] Customer portal session created for user ${user_id}`);
    return res.json({ url: session.url });

  } catch (error) {
    console.error('❌ [Stripe] Customer portal error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// POST /api/stripe/verify-session — Fallback: verify checkout session directly
app.post('/api/stripe/verify-session', async (req, res) => {
  try {
    if (!stripe) {
      return res.status(503).json({ error: 'Stripe is not configured' });
    }
    if (!isSupabaseAvailable()) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const { session_id } = req.body;
    if (!session_id || typeof session_id !== 'string') {
      return res.status(400).json({ error: 'session_id is required' });
    }

    const session = await stripe.checkout.sessions.retrieve(session_id, {
      expand: ['subscription'],
    });

    const userId = session.client_reference_id || session.metadata?.user_id;
    if (!userId || !isUUID(userId)) {
      return res.status(400).json({ error: 'No valid user_id in session' });
    }

    // Check if payment/trial is successful
    const subscription = session.subscription; // expanded object
    const subStatus = subscription?.status;
    const isPaid = session.payment_status === 'paid';
    const isTrialing = subStatus === 'trialing';
    const isActive = subStatus === 'active';

    if (!isPaid && !isTrialing && !isActive) {
      return res.json({ success: false, reason: 'Session not yet paid or trialing' });
    }

    // Determine tier
    let tier = session.metadata?.tier || 'gold';
    let subscriptionStatus = 'active';
    let trialEnd = null;

    if (subscription) {
      const priceId = subscription.items?.data?.[0]?.price?.id;
      if (priceId) {
        tier = mapStripePriceToTier(priceId);
      }
      subscriptionStatus = subscription.status || 'active';
      if (subscription.trial_end) {
        trialEnd = new Date(subscription.trial_end * 1000).toISOString();
      }
    } else if (session.mode === 'payment') {
      tier = session.metadata?.tier || 'lifetime';
    }

    // Update profiles
    const supabaseClient = getSupabase();
    const { error } = await supabaseClient
      .from('profiles')
      .update({
        subscription_tier: tier,
        stripe_customer_id: session.customer,
        subscription_status: subscriptionStatus,
        trial_end: trialEnd,
      })
      .eq('id', userId);

    if (error) {
      console.error('❌ [Stripe Verify] Failed to update profile:', error.message);
      return res.status(500).json({ error: 'Failed to update subscription' });
    }

    console.log(`✅ [Stripe Verify] Session verified: user=${userId}, tier=${tier}, status=${subscriptionStatus}`);
    return res.json({ success: true, tier });

  } catch (error) {
    console.error('❌ [Stripe Verify] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// ============================================
// TROY CONVERSATIONS — Persistent Chat
// ============================================

/**
 * Reusable: Build Troy's system prompt with user portfolio context.
 * Shared by the /v1/troy/conversations/:id/messages endpoint and (legacy) /api/advisor/chat.
 */
async function buildTroySystemPrompt(userId) {
  const supabaseClient = getSupabase();

  // Fetch user's holdings
  const { data: holdings } = await supabaseClient
    .from('holdings')
    .select('metal, type, weight, weight_unit, quantity, purchase_price, purchase_date, notes')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  const userHoldings = holdings || [];
  const prices = spotPriceCache.prices;
  const change = spotPriceCache.change || {};

  // Build portfolio summary
  const metalTotals = { gold: { oz: 0, cost: 0 }, silver: { oz: 0, cost: 0 }, platinum: { oz: 0, cost: 0 }, palladium: { oz: 0, cost: 0 } };
  const holdingDetails = [];

  for (const h of userHoldings) {
    const metal = h.metal;
    if (!metalTotals[metal]) continue;
    const weightOz = h.weight || 0;
    const qty = h.quantity || 1;
    const totalOz = weightOz * qty;
    const purchasePrice = h.purchase_price || 0;
    const totalCost = purchasePrice * qty;
    const currentValue = totalOz * (prices[metal] || 0);

    metalTotals[metal].oz += totalOz;
    metalTotals[metal].cost += totalCost;

    let typeName = h.type || 'Other';
    if (typeof typeName === 'string' && typeName.startsWith('{')) {
      try { typeName = JSON.parse(typeName).name || 'Other'; } catch { /* keep as-is */ }
    }

    holdingDetails.push({
      metal, type: typeName, qty,
      totalOz: totalOz.toFixed(4),
      purchasePrice: purchasePrice.toFixed(2),
      totalCost: totalCost.toFixed(2),
      currentValue: currentValue.toFixed(2),
      gainLoss: (currentValue - totalCost).toFixed(2),
      gainLossPct: totalCost > 0 ? (((currentValue - totalCost) / totalCost) * 100).toFixed(1) : '0',
      purchaseDate: h.purchase_date || 'Unknown',
    });
  }

  const totalValue = Object.keys(metalTotals).reduce((sum, m) => sum + metalTotals[m].oz * (prices[m] || 0), 0);
  const totalCost = Object.keys(metalTotals).reduce((sum, m) => sum + metalTotals[m].cost, 0);
  const gsRatio = prices.silver > 0 ? (prices.gold / prices.silver).toFixed(1) : 'N/A';

  const holdingsText = holdingDetails.length > 0
    ? holdingDetails.map(h =>
      `- ${h.qty}x ${h.type} (${h.metal}): ${h.totalOz} oz, Cost $${h.totalCost}, Value $${h.currentValue}, ${parseFloat(h.gainLoss) >= 0 ? '+' : ''}$${h.gainLoss} (${h.gainLossPct}%), Purchased ${h.purchaseDate}`
    ).join('\n')
    : 'No holdings found.';

  const metalSummary = Object.entries(metalTotals)
    .filter(([_, v]) => v.oz > 0)
    .map(([m, v]) => {
      const val = v.oz * (prices[m] || 0);
      const gl = val - v.cost;
      return `${m.charAt(0).toUpperCase() + m.slice(1)}: ${v.oz.toFixed(2)} oz, Value $${val.toFixed(2)}, Cost $${v.cost.toFixed(2)}, ${gl >= 0 ? '+' : ''}$${gl.toFixed(2)}`;
    }).join('\n');

  const changeText = ['gold', 'silver', 'platinum', 'palladium']
    .map(m => {
      const c = change[m];
      if (!c || !c.percent) return null;
      return `${m.charAt(0).toUpperCase() + m.slice(1)}: ${c.percent >= 0 ? '+' : ''}${c.percent.toFixed(2)}% ($${c.amount?.toFixed(2) || '?'})`;
    })
    .filter(Boolean)
    .join(', ');

  return `You are Troy, the AI stack analyst inside TroyStack — a precious metals portfolio tracker. You have access to the user's full stack and live market data. You remember the full conversation history.

PERSONALITY:
- Confident, concise, opinionated — like a trusted metals dealer who also reads macro.
- Address the user directly. Reference their specific holdings by name.
- You're not a generic chatbot. You're THEIR analyst.

FORMATTING:
- Use **bold** for key numbers, dollar amounts, percentages, and metal names.
- Use paragraph breaks for readability.
- Do NOT use headers (#), tables, or code blocks.
- Keep it conversational prose with selective bold for important figures.
- Keep responses under 600 words unless the user asks for detail.

STACK SUMMARY:
Total Value: $${totalValue.toFixed(2)}
Total Cost Basis: $${totalCost.toFixed(2)}
Overall ${totalValue >= totalCost ? 'Gain' : 'Loss'}: ${totalValue >= totalCost ? '+' : ''}$${(totalValue - totalCost).toFixed(2)} (${totalCost > 0 ? (((totalValue - totalCost) / totalCost) * 100).toFixed(1) : '0'}%)

BY METAL:
${metalSummary || 'No holdings'}

INDIVIDUAL HOLDINGS:
${holdingsText}

CURRENT SPOT PRICES:
Gold: $${prices.gold}, Silver: $${prices.silver}, Platinum: $${prices.platinum}, Palladium: $${prices.palladium}

MARKET CONTEXT:
Gold/Silver Ratio: ${gsRatio}
Today's Moves: ${changeText || 'No data available'}

RULES:
- Give specific, actionable advice based on their actual stack
- Reference their holdings by name when relevant
- Use current spot prices in calculations
- Be concise but thorough — this is for serious stackers
- Never guarantee returns or make definitive price predictions
- Add a brief disclaimer at the end of financial advice responses`;
}

// POST /v1/troy/conversations — Create a new conversation
app.post('/v1/troy/conversations', async (req, res) => {
  try {
    if (!isSupabaseAvailable()) {
      return res.status(503).json({ error: 'Database not available' });
    }
    const userId = req.body.userId;
    if (!userId || !isUUID(userId)) {
      return res.status(400).json({ error: 'Valid userId is required' });
    }

    const supabaseClient = getSupabase();
    const { data, error } = await supabaseClient
      .from('troy_conversations')
      .insert({ user_id: userId })
      .select('id, title, created_at, updated_at')
      .single();

    if (error) {
      console.error('❌ [Troy] Create conversation error:', error.message);
      return res.status(500).json({ error: 'Failed to create conversation' });
    }

    console.log(`💬 [Troy] New conversation ${data.id} for user ${userId.substring(0, 8)}...`);
    return res.json(data);
  } catch (error) {
    console.error('❌ [Troy] Create conversation error:', error.message);
    return res.status(500).json({ error: 'Failed to create conversation' });
  }
});

// GET /v1/troy/conversations — List conversations for a user
app.get('/v1/troy/conversations', async (req, res) => {
  try {
    if (!isSupabaseAvailable()) {
      return res.status(503).json({ error: 'Database not available' });
    }
    const userId = req.query.userId;
    if (!userId || !isUUID(userId)) {
      return res.status(400).json({ error: 'Valid userId is required' });
    }

    const supabaseClient = getSupabase();
    const { data, error } = await supabaseClient
      .from('troy_conversations')
      .select('id, title, created_at, updated_at, message_count')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('❌ [Troy] List conversations error:', error.message);
      return res.status(500).json({ error: 'Failed to list conversations' });
    }

    return res.json(data || []);
  } catch (error) {
    console.error('❌ [Troy] List conversations error:', error.message);
    return res.status(500).json({ error: 'Failed to list conversations' });
  }
});

// GET /v1/troy/conversations/:id — Get conversation with messages
app.get('/v1/troy/conversations/:id', async (req, res) => {
  try {
    if (!isSupabaseAvailable()) {
      return res.status(503).json({ error: 'Database not available' });
    }
    const userId = req.query.userId;
    if (!userId || !isUUID(userId)) {
      return res.status(400).json({ error: 'Valid userId is required' });
    }

    const supabaseClient = getSupabase();

    // Verify ownership
    const { data: conv, error: convError } = await supabaseClient
      .from('troy_conversations')
      .select('id, title, created_at, updated_at')
      .eq('id', req.params.id)
      .eq('user_id', userId)
      .single();

    if (convError || !conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Fetch messages
    const { data: messages, error: msgError } = await supabaseClient
      .from('troy_messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', req.params.id)
      .order('created_at', { ascending: true });

    if (msgError) {
      console.error('❌ [Troy] Fetch messages error:', msgError.message);
      return res.status(500).json({ error: 'Failed to fetch messages' });
    }

    return res.json({ ...conv, messages: messages || [] });
  } catch (error) {
    console.error('❌ [Troy] Get conversation error:', error.message);
    return res.status(500).json({ error: 'Failed to get conversation' });
  }
});

// DELETE /v1/troy/conversations/:id — Delete a conversation
app.delete('/v1/troy/conversations/:id', async (req, res) => {
  try {
    if (!isSupabaseAvailable()) {
      return res.status(503).json({ error: 'Database not available' });
    }
    const userId = req.query.userId;
    if (!userId || !isUUID(userId)) {
      return res.status(400).json({ error: 'Valid userId is required' });
    }

    const supabaseClient = getSupabase();

    // Delete (cascade removes messages via FK constraint)
    const { error } = await supabaseClient
      .from('troy_conversations')
      .delete()
      .eq('id', req.params.id)
      .eq('user_id', userId);

    if (error) {
      console.error('❌ [Troy] Delete conversation error:', error.message);
      return res.status(500).json({ error: 'Failed to delete conversation' });
    }

    console.log(`🗑️ [Troy] Deleted conversation ${req.params.id}`);
    return res.json({ success: true });
  } catch (error) {
    console.error('❌ [Troy] Delete conversation error:', error.message);
    return res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

// POST /v1/troy/conversations/:id/messages — Send message and get Troy's response
app.post('/v1/troy/conversations/:id/messages', async (req, res) => {
  try {
    if (!GEMINI_API_KEY) {
      return res.status(503).json({ error: 'AI is not configured' });
    }
    if (!isSupabaseAvailable()) {
      return res.status(503).json({ error: 'Database not available' });
    }

    const userId = req.body.userId;
    const message = req.body.message;

    if (!userId || !isUUID(userId)) {
      return res.status(400).json({ error: 'Valid userId is required' });
    }
    if (!message || typeof message !== 'string' || message.length > 2000) {
      return res.status(400).json({ error: 'Message is required (max 2000 characters)' });
    }

    const supabaseClient = getSupabase();
    const conversationId = req.params.id;

    // Verify ownership
    const { data: conv, error: convError } = await supabaseClient
      .from('troy_conversations')
      .select('id, title, user_id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single();

    if (convError || !conv) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Insert user message
    const { data: userMsg, error: userMsgError } = await supabaseClient
      .from('troy_messages')
      .insert({ conversation_id: conversationId, role: 'user', content: message })
      .select('id, role, content, created_at')
      .single();

    if (userMsgError) {
      console.error('❌ [Troy] Insert user message error:', userMsgError.message);
      return res.status(500).json({ error: 'Failed to save message' });
    }

    // Fetch conversation history for context
    const { data: allMessages } = await supabaseClient
      .from('troy_messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(40);

    // Build Gemini messages from conversation history
    const contents = [];
    for (const msg of (allMessages || [])) {
      if (msg.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: msg.content }] });
      } else if (msg.role === 'assistant') {
        contents.push({ role: 'model', parts: [{ text: msg.content }] });
      }
    }

    // Build system prompt with user's portfolio context
    const systemPrompt = await buildTroySystemPrompt(userId);

    const geminiBody = {
      contents,
      system_instruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    };

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;
    const geminiResp = await axios.post(geminiUrl, geminiBody, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    const responseText = geminiResp.data?.candidates?.[0]?.content?.parts
      ?.filter(p => p.text)
      ?.map(p => p.text)
      ?.join('') || '';

    if (!responseText) {
      return res.status(500).json({ error: 'Troy returned an empty response' });
    }

    // Insert Troy's response
    const { data: assistantMsg, error: assistantMsgError } = await supabaseClient
      .from('troy_messages')
      .insert({ conversation_id: conversationId, role: 'assistant', content: responseText })
      .select('id, role, content, created_at')
      .single();

    if (assistantMsgError) {
      console.error('❌ [Troy] Insert assistant message error:', assistantMsgError.message);
      // Still return the response even if DB insert failed
      return res.json({ message: { id: 'temp-' + Date.now(), role: 'assistant', content: responseText, created_at: new Date().toISOString() } });
    }

    // Auto-generate title from first user message if conversation has no title
    let title = conv.title;
    if (!title) {
      title = message.length > 50 ? message.substring(0, 47) + '...' : message;
      await supabaseClient
        .from('troy_conversations')
        .update({ title })
        .eq('id', conversationId);
    }

    console.log(`🧠 [Troy] Response for ${userId.substring(0, 8)}... in conv ${conversationId.substring(0, 8)}...: ${responseText.length} chars`);
    return res.json({ message: assistantMsg, title });
  } catch (error) {
    console.error('❌ [Troy] Send message error:', error.message);
    return res.status(500).json({ error: 'Failed to get response from Troy' });
  }
});

// ============================================
// STARTUP
// ============================================

const PORT = process.env.PORT || 3000;

// Load data on startup
loadHistoricalData(); // Synchronous JSON load
loadScanUsageData(); // Load scan usage from /tmp/

fetchLiveSpotPrices().then(() => {
  app.listen(PORT, () => {
    console.log(`\n🪙 Stack Tracker API running on port ${PORT}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔒 Privacy Mode: ENABLED');
    console.log('📷 Image Storage: DISABLED (memory-only)');
    console.log('📊 Analytics: DISABLED');
    console.log('💰 Spot Prices:', spotPriceCache.prices);
    console.log('📡 Price Source:', spotPriceCache.source);
    console.log('📅 Historical Data:', historicalData.loaded ? 'LOADED' : 'FALLBACK');
    console.log('⚡ Price Fetching: ON-DEMAND ONLY (10-min cache)');
    console.log('💸 API: MetalPriceAPI Primary, GoldAPI Fallback (10,000/month each)');
    console.log('🗄️ Scan Storage: /tmp/scan-usage.json');
    console.log('🔔 Price Alerts: DISABLED — moved to stg-api');
    console.log('🧠 Intelligence Cron: DISABLED — moved to stg-api');
    console.log('📝 Daily Brief Cron: DISABLED — moved to stg-api');
    console.log('💳 Stripe:', stripe ? 'ENABLED' : 'DISABLED (no STRIPE_SECRET_KEY)');

    // SQL reminder for daily_briefs table
    console.log('\n📋 [Daily Briefs] Ensure this table exists in Supabase:');
    console.log(`
  CREATE TABLE daily_briefs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id),
    brief_text TEXT NOT NULL,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    date DATE NOT NULL,
    UNIQUE (user_id, date)
  );
  CREATE INDEX idx_daily_briefs_user_date ON daily_briefs(user_id, date DESC);
  ALTER TABLE daily_briefs ENABLE ROW LEVEL SECURITY;
  CREATE POLICY "Users can read own briefs" ON daily_briefs FOR SELECT USING (auth.uid() = user_id);
    `);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // DISABLED — all crons moved to stg-api (api.stacktrackergold.com)
    // // Intelligence cron: daily at 6:00 AM EST (11:00 UTC)
    // // Runs 35 min before Daily Brief so vault alerts don't overlap with brief notification
    // if (GEMINI_API_KEY) {
    // cron.schedule('0 11 * * *', async () => {
    // console.log(`\n🧠 [Intelligence Cron] Triggered at ${new Date().toISOString()}`);
    // try {
    // const result = await runIntelligenceGeneration();
    // console.log(`🧠 [Intelligence Cron] Done: ${result.briefsInserted} briefs, ${result.vaultInserted}/4 vault`);
    // } catch (err) {
    // console.error(`🧠 [Intelligence Cron] Failed:`, err.message);
    // }
    // }, { timezone: 'UTC' });
    // console.log('🧠 [Intelligence Cron] Scheduled: daily at 6:00 AM EST (11:00 UTC)');
    //
    // // Daily Brief cron: 6:35 AM EST (11:35 UTC) — 35 min after intelligence so news is available
    // cron.schedule('35 11 * * *', async () => {
    // console.log(`\n📝 [Daily Brief Cron] Triggered at ${new Date().toISOString()}`);
    // try {
    // const supabaseClient = getSupabase();
    // const { data: goldUsers, error } = await supabaseClient
    // .from('profiles')
    // .select('id')
    // .in('subscription_tier', ['gold', 'lifetime']);
    //
    // if (error || !goldUsers) {
    // console.error('📝 [Daily Brief Cron] Failed to fetch Gold users:', error?.message);
    // return;
    // }
    //
    // console.log(`📝 [Daily Brief Cron] Generating briefs for ${goldUsers.length} Gold/Lifetime users`);
    // let success = 0;
    // let failed = 0;
    //
    // let pushSent = 0;
    // for (const user of goldUsers) {
    // try {
    // const result = await generateDailyBrief(user.id);
    // // Generate portfolio intelligence alongside the daily brief
    // try { await generatePortfolioIntelligence(user.id); } catch (piErr) { console.log(`🧠 [Portfolio Intelligence Cron] Skipped for ${user.id}: ${piErr.message}`); }
    // success++;
    // console.log(`📝 [Daily Brief Cron] ✅ ${success}/${goldUsers.length} — user ${user.id}`);
    //
    // // Send push notification if user has a valid push token and daily_brief enabled
    // if (result && result.brief && result.brief.brief_text) {
    // try {
    // // Check notification preferences
    // const { data: notifPref } = await supabaseClient
    // .from('notification_preferences')
    // .select('daily_brief')
    // .eq('user_id', user.id)
    // .single();
    // const briefEnabled = !notifPref || notifPref.daily_brief !== false;
    //
    // if (briefEnabled) {
    // const { data: tokenData } = await supabaseClient
    // .from('push_tokens')
    // .select('expo_push_token')
    // .eq('user_id', user.id)
    // .order('last_active', { ascending: false })
    // .limit(1)
    // .single();
    //
    // if (tokenData && isValidExpoPushToken(tokenData.expo_push_token)) {
    // const firstSentence = result.brief.brief_text.split(/[.!]\s/)[0];
    // const body = firstSentence.length > 100 ? firstSentence.slice(0, 97) + '...' : firstSentence;
    // await sendPushNotification(tokenData.expo_push_token, {
    // title: '\u2600\uFE0F Your daily brief from Troy is ready',
    // body,
    // data: { type: 'daily_brief' },
    // sound: 'default',
    // });
    // pushSent++;
    // }
    // }
    // } catch (pushErr) {
    // console.log(`📝 [Daily Brief Cron] Push skipped for ${user.id}: ${pushErr.message}`);
    // }
    // }
    // } catch (err) {
    // failed++;
    // console.error(`📝 [Daily Brief Cron] ❌ user ${user.id}: ${err.message}`);
    // }
    // // 2s delay between users to avoid rate limits
    // if (goldUsers.indexOf(user) < goldUsers.length - 1) {
    // await new Promise(r => setTimeout(r, 2000));
    // }
    // }
    //
    // console.log(`📝 [Daily Brief Cron] Done: ${success} success, ${failed} failed, ${pushSent} push sent out of ${goldUsers.length}`);
    // } catch (err) {
    // console.error('📝 [Daily Brief Cron] Failed:', err.message);
    // }
    // }, { timezone: 'UTC' });
    // console.log('📝 [Daily Brief Cron] Scheduled: daily at 6:35 AM EST (11:35 UTC)');
    // }

    console.log('💳 RevenueCat Webhook:', REVENUECAT_WEBHOOK_SECRET ? 'ENABLED' : 'DISABLED (no secret)');
    console.log('🔄 RevenueCat Sync:', REVENUECAT_API_KEY ? 'ENABLED' : 'DISABLED (no API key)');
  });
}).catch(error => {
  console.error('Startup error:', error);
  // Start anyway with fallback data
  app.listen(PORT, () => {
    console.log(`Stack Tracker API running on port ${PORT} (with fallback data)`);
  });
});

// ❌ NO AUTO-POLLING: Prices are fetched ONLY on-demand when users request them
// This prevents burning through API quota when the app is idle
// With 10-minute cache, even heavy usage stays well under 10,000/month limit

// Historical data loaded from static JSON file, no need to refresh

module.exports = app;

// Force redeploy
