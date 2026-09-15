const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const UPBIT_TICKER_URL = 'https://api.upbit.com/v1/ticker?markets=KRW-BTC,KRW-BCH,KRW-BSV,KRW-USDT';
const BITHUMB_TICKER_URL = 'https://api.bithumb.com/public/ticker/ALL_KRW';
const GATE_TICKER_BASE = 'https://api.gateio.ws/api/v4/spot/tickers';
const BINANCE_TICKER_BASE = 'https://api.binance.com/api/v3/ticker/24hr';
const BINANCE_FUTURES_TICKER_BASE = 'https://fapi.binance.com/fapi/v1/ticker/24hr';
const COINGECKO_IDS = { BTC: 'bitcoin', BCH: 'bitcoin-cash', BSV: 'bitcoin-cash-sv', USDT: 'tether' };
const COINGECKO_MARKETS_URL = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&sparkline=true&ids=${Object.values(COINGECKO_IDS).join(',')}`;

function fetchJSON(url, headers) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Every fetcher below returns the same shape - { prices, changeRates, volumes }
// - with volumes and prices left in the exchange's own native quote currency
// (KRW for Upbit/Bithumb, USDT for Gate/Binance). The KRW/USDT distinction is
// tracked per-exchange in EXCHANGES below and resolved in one place in the
// /api/prices handler, instead of each fetcher guessing whether it needs FX
// conversion.

async function fetchUpbitPrices() {
  const tickers = await fetchJSON(UPBIT_TICKER_URL);
  const prices = {};
  const changeRates = {};
  const volumes = {};
  const high24h = {};
  const low24h = {};
  const high52w = {};
  const high52wDate = {};
  const low52w = {};
  const low52wDate = {};

  const fieldsByMarket = { 'KRW-BTC': 'BTC', 'KRW-BCH': 'BCH', 'KRW-BSV': 'BSV', 'KRW-USDT': 'USDT' };
  tickers.forEach(t => {
    const symbol = fieldsByMarket[t.market];
    if (!symbol) return;
    prices[symbol] = t.trade_price;
    changeRates[symbol] = t.signed_change_rate;
    volumes[symbol] = t.acc_trade_price_24h;
    high24h[symbol] = t.high_price;
    low24h[symbol] = t.low_price;
    high52w[symbol] = t.highest_52_week_price;
    high52wDate[symbol] = t.highest_52_week_date;
    low52w[symbol] = t.lowest_52_week_price;
    low52wDate[symbol] = t.lowest_52_week_date;
  });

  return { prices, changeRates, volumes, high24h, low24h, high52w, high52wDate, low52w, low52wDate };
}

async function fetchBithumbPrices() {
  const data = await fetchJSON(BITHUMB_TICKER_URL);
  const prices = {};
  const changeRates = {};
  const volumes = {};

  ['BTC', 'BCH', 'BSV', 'USDT'].forEach(symbol => {
    const t = data?.data?.[symbol];
    if (!t) return;
    prices[symbol] = parseFloat(t.closing_price);
    changeRates[symbol] = parseFloat(t.fluctate_rate_24H) / 100;
    volumes[symbol] = parseFloat(t.acc_trade_value_24H);
  });

  return { prices, changeRates, volumes };
}

async function fetchGatePrices() {
  const pairs = [
    { pair: 'BTC_USDT', symbol: 'BTC' },
    { pair: 'BSV_USDT', symbol: 'BSV' },
    { pair: 'BCH_USDT', symbol: 'BCH' },
    { pair: 'USDT_USD', symbol: 'USDT' }
  ];
  const results = await Promise.all(
    pairs.map(p => fetchJSON(`${GATE_TICKER_BASE}?currency_pair=${p.pair}`).catch(() => null))
  );
  const prices = {};
  const changeRates = {};
  const volumes = {};
  results.forEach((data, i) => {
    if (Array.isArray(data) && data[0]) {
      prices[pairs[i].symbol] = parseFloat(data[0].last);
      changeRates[pairs[i].symbol] = parseFloat(data[0].change_percentage) / 100;
      volumes[pairs[i].symbol] = parseFloat(data[0].quote_volume) || 0;
    }
  });
  return { prices, changeRates, volumes };
}

async function fetchBinancePrices() {
  const spotPairs = [
    { pair: 'BTCUSDT', symbol: 'BTC' },
    { pair: 'BCHUSDT', symbol: 'BCH' }
  ];
  const results = await Promise.all(
    spotPairs.map(p => fetchJSON(`${BINANCE_TICKER_BASE}?symbol=${p.pair}`).catch(() => null))
  );
  const prices = {};
  const changeRates = {};
  const volumes = {};
  const markets = {};
  results.forEach((data, i) => {
    if (data && data.lastPrice) {
      prices[spotPairs[i].symbol] = parseFloat(data.lastPrice);
      changeRates[spotPairs[i].symbol] = parseFloat(data.priceChangePercent) / 100;
      volumes[spotPairs[i].symbol] = parseFloat(data.quoteVolume) || 0;
      markets[spotPairs[i].symbol] = 'spot';
    }
  });

  // Binance delisted the BSV spot market in 2019, but its USDT-M perpetual
  // future is still live and is the closest available substitute - shown as
  // "선물" on the card so it isn't mistaken for a spot price.
  const bsvFutures = await fetchJSON(`${BINANCE_FUTURES_TICKER_BASE}?symbol=BSVUSDT`).catch(() => null);
  if (bsvFutures && bsvFutures.lastPrice) {
    prices.BSV = parseFloat(bsvFutures.lastPrice);
    changeRates.BSV = parseFloat(bsvFutures.priceChangePercent) / 100;
    volumes.BSV = parseFloat(bsvFutures.quoteVolume) || 0;
    markets.BSV = 'futures';
  }

  // Binance quotes everything in USDT and has no USDT/USD spot pair; treat the peg as $1.
  prices.USDT = 1;
  changeRates.USDT = 0;
  volumes.USDT = 0;
  markets.USDT = 'spot';
  return { prices, changeRates, volumes, markets };
}

// quote: the currency each exchange's `prices`/`volumes` are already denominated
// in. 'KRW' exchanges (Upbit, Bithumb) need no FX conversion at all; 'USDT'
// exchanges (Gate, Binance) need `prices * usdKrwRate` to become comparable KRW.
// Mixing this up - e.g. multiplying an already-KRW Bithumb price by the FX rate
// again - is the exact class of bug this table exists to prevent.
const EXCHANGES = {
  upbit: { quote: 'KRW', fetch: fetchUpbitPrices },
  bithumb: { quote: 'KRW', fetch: fetchBithumbPrices },
  gate: { quote: 'USDT', fetch: fetchGatePrices },
  binance: { quote: 'USDT', fetch: fetchBinancePrices }
};
const BASE_KEYS = ['upbit'];
const COMPARISON_KEYS = ['gate', 'binance', 'bithumb'];

// finance.naver.com/marketindex/ was moved to stock.naver.com (client-rendered,
// no static rate in the HTML) and now permanently 302-redirects, so the old
// scraper always returned an empty body. These two independent, keyless REST
// APIs replace it; either alone is enough to keep the rate fresh.
// Both sources are official/interbank reference rates that only move a
// handful of times a day (open.er-api ~daily, frankfurter is the ECB's daily
// reference rate) - unlike kimpga.com, which streams USDKRW over its own
// websocket and updates continuously. That gap in update frequency, not a
// calculation bug, is why our premium can sit ~0.1%p off from kimpga's at any
// given moment: real USD/KRW drifts by more than that within a single day.
// `asOf` (the source's own quote timestamp, when it provides one) is surfaced
// to the UI so that staleness is visible instead of silently assumed away.
const FX_RATE_SOURCES = [
  {
    url: 'https://open.er-api.com/v6/latest/USD',
    extract: (d) => d?.rates?.KRW,
    asOf: (d) => (Number.isFinite(d?.time_last_update_unix) ? new Date(d.time_last_update_unix * 1000).toISOString() : null)
  },
  {
    url: 'https://api.frankfurter.dev/v1/latest?from=USD&to=KRW',
    extract: (d) => d?.rates?.KRW,
    asOf: (d) => (d?.date ? `${d.date}T00:00:00.000Z` : null)
  }
];

async function fetchUsdKrwRateLive() {
  for (const source of FX_RATE_SOURCES) {
    try {
      const data = await fetchJSON(source.url);
      const rate = source.extract(data);
      if (Number.isFinite(rate) && rate > 100 && rate < 3000) {
        return { rate: Math.round(rate * 100) / 100, asOf: source.asOf(data) || new Date().toISOString() };
      }
    } catch (e) {
      // try the next source
    }
  }
  return null;
}

const FX_CACHE_TTL_MS = 60 * 1000;
let fxCache = { rate: null, asOf: null, fetchedAt: 0 };

// Live FX APIs update at most a few times a day, so there is no need to hit
// them on every 3-second price poll; an in-memory cache absorbs that. There
// is no disk persistence here (deliberately - a rate saved to a file survives
// restarts and can silently go stale for real, which is exactly what caused
// the 1477.7 fallback to be ~10% wrong for a long time). If every live
// source fails and this process has never seen a rate, fx.rate is null and
// any USDT-quoted premium reports as unavailable rather than guessing.
async function fetchUsdKrwRate() {
  const now = Date.now();
  if (fxCache.rate != null && (now - fxCache.fetchedAt) < FX_CACHE_TTL_MS) {
    return fxCache;
  }

  const live = await fetchUsdKrwRateLive();
  if (live != null) {
    fxCache = { rate: live.rate, asOf: live.asOf, fetchedAt: now };
    return fxCache;
  }

  return fxCache.rate != null ? fxCache : { rate: null, asOf: null };
}

// Card-back indicators (market cap, supply). These barely change minute to
// minute, unlike price, so a 5-minute cache keeps this well within
// CoinGecko's free-tier rate limit instead of hitting it on every 3s poll.
const SUPPLY_CACHE_TTL_MS = 5 * 60 * 1000;
let supplyCache = { data: {}, fetchedAt: 0 };

async function fetchSupplyData() {
  const now = Date.now();
  if (now - supplyCache.fetchedAt < SUPPLY_CACHE_TTL_MS) {
    return supplyCache.data;
  }
  try {
    // CoinGecko rejects requests with no User-Agent (or Node's generic default)
    // with a 403, unlike every other API this project calls.
    const list = await fetchJSON(COINGECKO_MARKETS_URL, { 'User-Agent': 'coin-premium-app/1.0 (personal project)' });
    const idToSymbol = Object.fromEntries(Object.entries(COINGECKO_IDS).map(([symbol, id]) => [id, symbol]));
    const bySymbol = {};
    list.forEach(c => {
      const symbol = idToSymbol[c.id];
      if (!symbol) return;
      bySymbol[symbol] = {
        circulatingSupply: c.circulating_supply ?? null,
        totalSupply: c.total_supply ?? null,
        maxSupply: c.max_supply ?? null,
        marketCapRank: c.market_cap_rank ?? null,
        ath: c.ath ?? null,
        athChangePercentage: c.ath_change_percentage ?? null,
        athDate: c.ath_date ?? null,
        sparkline7d: c.sparkline_in_7d?.price ?? null
      };
    });
    supplyCache = { data: bySymbol, fetchedAt: now };
  } catch (e) {
    // keep serving the last known values (or {} on a cold start) rather than
    // failing the whole /api/prices request over a slow-changing sidebar stat
  }
  return supplyCache.data;
}

// In-memory-only premium history so the card can show "1시간 전 대비" without a
// database. It resets on server restart and only fills in once the server has
// been polled continuously for ~1 hour - there is no persistence, by design,
// to keep this a zero-infrastructure addition.
const PREMIUM_HISTORY_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const PREMIUM_TREND_WINDOW_MS = 60 * 60 * 1000;
const premiumHistory = new Map();

function recordPremiumSample(key, value) {
  if (value == null) return;
  const now = Date.now();
  let samples = premiumHistory.get(key);
  if (!samples) {
    samples = [];
    premiumHistory.set(key, samples);
  }
  samples.push({ t: now, value });
  const cutoff = now - PREMIUM_HISTORY_MAX_AGE_MS;
  while (samples.length && samples[0].t < cutoff) samples.shift();
}

function getPremiumChange1h(key) {
  const samples = premiumHistory.get(key);
  if (!samples || samples.length < 2) return null;
  const now = Date.now();
  // Only worth showing once the buffer actually spans close to an hour -
  // otherwise "1h ago" would really mean "whenever this key was first seen".
  if (now - samples[0].t < PREMIUM_TREND_WINDOW_MS - 5 * 60 * 1000) return null;
  const targetT = now - PREMIUM_TREND_WINDOW_MS;
  let closest = samples[0];
  for (const sample of samples) {
    if (Math.abs(sample.t - targetT) < Math.abs(closest.t - targetT)) closest = sample;
  }
  return samples[samples.length - 1].value - closest.value;
}

const server = http.createServer(async (req, res) => {
  const reqPath = (() => {
    try {
      return new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname;
    } catch {
      return String(req.url || '/').split('?')[0];
    }
  })();

  if (req.url.startsWith('/api/prices') && req.method === 'GET') {
    try {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const baseKey = BASE_KEYS.includes(parsedUrl.searchParams.get('base')) ? parsedUrl.searchParams.get('base') : 'upbit';
      const comparisonKey = COMPARISON_KEYS.includes(parsedUrl.searchParams.get('comparison')) ? parsedUrl.searchParams.get('comparison') : 'gate';

      const [baseData, comparisonData, fx, supplyData] = await Promise.all([
        EXCHANGES[baseKey].fetch(),
        EXCHANGES[comparisonKey].fetch(),
        fetchUsdKrwRate(),
        fetchSupplyData()
      ]);

      const comparisonQuote = EXCHANGES[comparisonKey].quote;
      // A KRW-quoted comparison exchange (Bithumb) needs no conversion; a
      // USDT-quoted one (Gate, Binance) is converted through the live FX
      // rate, or comes back null if that rate itself is unavailable right now.
      const toKRW = (value) => {
        if (value == null) return null;
        if (comparisonQuote === 'KRW') return value;
        return fx.rate != null ? value * fx.rate : null;
      };

      const coins = [
        { symbol: 'BSV', name: 'Bitcoin SV' },
        { symbol: 'BTC', name: 'Bitcoin' },
        { symbol: 'BCH', name: 'Bitcoin Cash' },
        { symbol: 'USDT', name: 'Tether' }
      ].map(coin => {
        const basePrice = baseData.prices[coin.symbol] ?? null;
        const comparisonPrice = comparisonData.prices[coin.symbol] ?? null;
        const comparisonPriceKRW = toKRW(comparisonPrice);
        const premium = (basePrice != null && comparisonPriceKRW)
          ? ((basePrice - comparisonPriceKRW) / comparisonPriceKRW) * 100
          : null;

        const supply = supplyData[coin.symbol] || {};
        const marketCapKRW = (basePrice != null && supply.circulatingSupply != null)
          ? basePrice * supply.circulatingSupply
          : null;

        const historyKey = `${comparisonKey}:${coin.symbol}`;
        recordPremiumSample(historyKey, premium);

        return {
          ...coin,
          basePrice,
          baseChangeRate: baseData.changeRates[coin.symbol] ?? null,
          baseVolume24h: baseData.volumes[coin.symbol] ?? null,
          high24h: baseData.high24h?.[coin.symbol] ?? null,
          low24h: baseData.low24h?.[coin.symbol] ?? null,
          comparisonPrice,
          comparisonPriceKRW,
          comparisonQuote,
          comparisonChangeRate: comparisonData.changeRates[coin.symbol] ?? null,
          comparisonVolume24h: toKRW(comparisonData.volumes[coin.symbol] ?? null),
          comparisonMarket: comparisonData.markets?.[coin.symbol] ?? 'spot',
          premium,
          premiumChange1h: getPremiumChange1h(historyKey),
          high52w: baseData.high52w?.[coin.symbol] ?? null,
          high52wDate: baseData.high52wDate?.[coin.symbol] ?? null,
          low52w: baseData.low52w?.[coin.symbol] ?? null,
          low52wDate: baseData.low52wDate?.[coin.symbol] ?? null,
          circulatingSupply: supply.circulatingSupply ?? null,
          totalSupply: supply.totalSupply ?? null,
          maxSupply: supply.maxSupply ?? null,
          marketCapRank: supply.marketCapRank ?? null,
          ath: supply.ath ?? null,
          athChangePercentage: supply.athChangePercentage ?? null,
          athDate: supply.athDate ?? null,
          sparkline7d: supply.sparkline7d ?? null,
          marketCapKRW
        };
      });

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({
        coins,
        base: baseKey,
        comparison: comparisonKey,
        usdKrwRate: fx.rate ?? null,
        usdKrwRateAsOf: fx.asOf ?? null
      }));
    } catch (err) {
      console.error(err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (reqPath === '/' || reqPath === '/index.html') {
    const filePath = path.join(__dirname, 'index.html');
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading index.html');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
    return;
  }

  if (reqPath === '/style.css') {
    const filePath = path.join(__dirname, 'style.css');
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/css',
        'Cache-Control': 'no-cache'
      });
      res.end(data);
    });
    return;
  }

  if (reqPath === '/app.js') {
    const filePath = path.join(__dirname, 'app.js');
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'no-cache'
      });
      res.end(data);
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
