const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const iconv = require('iconv-lite');

const UPBIT_TICKER_URL = 'https://api.upbit.com/v1/ticker?markets=KRW-BTC,KRW-BCH,KRW-BSV,KRW-USDT';
const GATE_TICKER_BASE = 'https://api.gateio.ws/api/v4/spot/tickers';
const NAVER_FINANCE_URL = 'https://finance.naver.com/marketindex/';
const USD_KRW_FALLBACK = 1477.7;
const CONFIG_PATH = path.join(__dirname, 'config.json');

function readConfig() {
  try {
    const data = fs.readFileSync(CONFIG_PATH, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return { headerRateFixed: 1445, rateDate: null };
  }
}

function writeConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
}

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
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

async function fetchUpbitPrices() {
  const tickers = await fetchJSON(UPBIT_TICKER_URL);
  const prices = {};
  const changeRates = {};
  const tradeVolumes24h = {};
  let usdtKrwRate = 0;

  tickers.forEach(t => {
    if (t.market === 'KRW-BTC') {
      prices.BTC = t.trade_price;
      changeRates.BTC = t.signed_change_rate;
      tradeVolumes24h.BTC = t.acc_trade_price_24h;
    }
    if (t.market === 'KRW-BCH') {
      prices.BCH = t.trade_price;
      changeRates.BCH = t.signed_change_rate;
      tradeVolumes24h.BCH = t.acc_trade_price_24h;
    }
    if (t.market === 'KRW-BSV') {
      prices.BSV = t.trade_price;
      changeRates.BSV = t.signed_change_rate;
      tradeVolumes24h.BSV = t.acc_trade_price_24h;
    }
    if (t.market === 'KRW-USDT') {
      prices.USDT = t.trade_price;
      changeRates.USDT = t.signed_change_rate;
      tradeVolumes24h.USDT = t.acc_trade_price_24h;
      usdtKrwRate = t.trade_price;
    }
  });

  return { prices, changeRates, tradeVolumes24h, usdtKrwRate };
}

async function fetchGatePrices() {
  const pairs = [
    { pair: 'BTC_USDT', symbol: 'BTC' },
    { pair: 'BSV_USDT', symbol: 'BSV' },
    { pair: 'BCH_USDT', symbol: 'BCH' },
    { pair: 'USDT_USD', symbol: 'USDT' }
  ];
  const results = await Promise.all(
    pairs.map(p => fetchJSON(`${GATE_TICKER_BASE}?currency_pair=${p.pair}`))
  );
  const prices = {};
  const quoteVolumes = {};
  results.forEach((data, i) => {
    if (Array.isArray(data) && data[0]) {
      prices[pairs[i].symbol] = parseFloat(data[0].last);
      quoteVolumes[pairs[i].symbol] = parseFloat(data[0].quote_volume) || 0;
    }
  });
  return { prices, quoteVolumes };
}

function fetchNaverMarketIndexHtml() {
  return new Promise((resolve, reject) => {
    const url = new URL(NAVER_FINANCE_URL);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    };
    https.get(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        let buf = Buffer.concat(chunks);
        const encoding = (res.headers['content-encoding'] || '').toLowerCase();
        if (encoding === 'gzip') {
          buf = zlib.gunzipSync(buf);
        } else if (encoding === 'br') {
          buf = zlib.brotliDecompressSync(buf);
        } else if (encoding === 'deflate') {
          buf = zlib.inflateSync(buf);
        }
        const html = iconv.decode(buf, 'euc-kr');
        resolve(html);
      });
    }).on('error', reject);
  });
}

async function fetchUsdKrwRateFromNaver() {
  try {
    const html = await fetchNaverMarketIndexHtml();
    let match = html.match(/marketindexCd=FX_USDKRW[\s\S]{0,600}?([1-2],[0-9]{3}(?:\.[0-9]+)?)/);
    if (!match) {
      match = html.match(/FX_USDKRW[\s\S]{0,600}?([1-2],[0-9]{3}(?:\.[0-9]+)?)/);
    }
    if (!match || !match[1]) return null;
    const rate = parseFloat(match[1].replace(/,/g, ''));
    if (Number.isFinite(rate) && rate > 100 && rate < 3000) return Math.round(rate * 10) / 10;
    return null;
  } catch (e) {
    return null;
  }
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/api/config' && req.method === 'GET') {
    const config = readConfig();
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(config));
    return;
  }

  if (req.url === '/api/config' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const rateRaw = parseFloat(body.headerRateFixed);
      if (isNaN(rateRaw) || rateRaw < 1 || rateRaw > 999999) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid rate' }));
        return;
      }
      const rate = Math.round(rateRaw * 100) / 100;
      const rateDate = body.rateDate && /^\d{4}-\d{2}-\d{2}$/.test(String(body.rateDate))
        ? String(body.rateDate) : null;
      const config = { headerRateFixed: rate };
      if (rateDate) config.rateDate = rateDate;
      writeConfig(config);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(config));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.url === '/api/prices' && req.method === 'GET') {
    try {
      const [upbitData, gateData, usdKrwRate] = await Promise.all([
        fetchUpbitPrices(),
        fetchGatePrices(),
        fetchUsdKrwRateFromNaver()
      ]);

      const { prices: upbitPrices, changeRates, tradeVolumes24h, usdtKrwRate } = upbitData;
      const { prices: gatePrices, quoteVolumes: gateQuoteVolumes } = gateData;

      const coins = [
        { symbol: 'BSV', name: 'Bitcoin SV' },
        { symbol: 'BTC', name: 'Bitcoin' },
        { symbol: 'BCH', name: 'Bitcoin Cash' },
        { symbol: 'USDT', name: 'Tether' }
      ].map(coin => {
        const basePrice = upbitPrices[coin.symbol];
        const overseasPrice = gatePrices[coin.symbol];
        const gateQuoteVolume = gateQuoteVolumes[coin.symbol];
        const gateKrwRate = usdKrwRate ?? USD_KRW_FALLBACK;
        const gatePriceKRW = (overseasPrice && gateKrwRate) ? overseasPrice * gateKrwRate : 0;
        const premium = (basePrice && gatePriceKRW)
          ? ((basePrice - gatePriceKRW) / gatePriceKRW) * 100
          : null;
        const changeRate = changeRates[coin.symbol];
        const tradeVolume24h = tradeVolumes24h[coin.symbol];

        return {
          ...coin,
          basePrice: basePrice || null,
          overseasPrice: overseasPrice || null,
          premium: premium,
          changeRate: changeRate != null ? changeRate : null,
          tradeVolume24h: tradeVolume24h != null ? tradeVolume24h : null,
          gateQuoteVolume24h: gateQuoteVolume != null ? gateQuoteVolume : null
        };
      });

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({
        coins,
        krwRate: usdtKrwRate,
        krwRateChange: changeRates?.USDT ?? null,
        usdKrwRate: usdKrwRate ?? null,
        usdKrwRateChange: null
      }));
    } catch (err) {
      console.error(err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.url === '/' || req.url === '/index.html') {
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

  if (req.url === '/style.css') {
    const filePath = path.join(__dirname, 'style.css');
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/css' });
      res.end(data);
    });
    return;
  }

  if (req.url === '/app.js') {
    const filePath = path.join(__dirname, 'app.js');
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/javascript' });
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
