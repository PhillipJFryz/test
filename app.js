const REFRESH_INTERVAL = 3000;

const exchanges = {
  base: {
    upbit: { headerName: 'Upbit' }
  },
  comparison: {
    gate: { headerName: 'Gate' },
    binance: { headerName: 'Binance' },
    bithumb: { headerName: 'Bithumb' }
  }
};

const coinNames = {
  BSV: '비트코인 SV',
  BTC: '비트코인',
  BCH: '비트코인 캐시',
  USDT: '테더'
};

const state = {
  base: 'upbit',
  comparison: 'gate'
};

let lastCoins = [];

function formatKRWOnly(value) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

function formatEok2(value) {
  return (value / 100000000).toFixed(2) + '억';
}

function formatTradeVolumeEokNumber(value) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(Math.round(value / 100000000));
}

function formatUsdPrice(usdtValue) {
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(usdtValue);
  return `$${formatted}`;
}

// Raw digit counts (supply is in the tens of billions for USDT) are unreadable,
// so abbreviate the same way Korean sites quote large won amounts.
function formatCount(value) {
  if (value == null) return null;
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}조`;
  if (abs >= 1e8) return `${(value / 1e8).toFixed(2)}억`;
  if (abs >= 1e4) return `${formatKRWOnly(Math.round(value / 1e4))}만`;
  return formatKRWOnly(value);
}

function formatKRWAbbrev(value) {
  if (value == null) return '-';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}조원`;
  if (abs >= 1e8) return `${(value / 1e8).toFixed(2)}억원`;
  return `${formatKRWOnly(value)}원`;
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return '';
  return `${y.slice(2)}.${m}.${d}`;
}

// ath_date/updateAt etc. arrive as full ISO timestamps rather than the plain
// YYYY-MM-DD strings formatShortDate expects.
function formatShortDateFromISO(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  return formatShortDate(d.toISOString().slice(0, 10));
}

function formatSignedPercent(value, digits) {
  if (value == null) return null;
  return `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`;
}

// Builds an SVG polyline `points` attribute from a raw price series,
// normalized into a 0-100 x / 0-28 y box so the shape reads regardless of
// the coin's absolute price. Gaps CoinGecko sometimes leaves as null are
// dropped rather than plotted as zero.
function buildSparklinePoints(prices) {
  const clean = (prices || []).filter(v => typeof v === 'number' && Number.isFinite(v));
  if (clean.length < 2) return null;
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  const range = max - min || 1;
  const stepX = 100 / (clean.length - 1);
  return clean.map((v, i) => `${(i * stepX).toFixed(2)},${(28 - ((v - min) / range) * 28).toFixed(2)}`).join(' ');
}

function getTodayDateStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

async function fetchPrices() {
  try {
    const params = new URLSearchParams({ base: state.base, comparison: state.comparison });
    const res = await fetch(`/api/prices?${params.toString()}`);
    if (!res.ok) throw new Error('API 요청 실패');
    return await res.json();
  } catch (err) {
    console.error(err);
    return null;
  }
}

function updateHeaderTodayDate() {
  const el = document.getElementById('headerTodayDate');
  if (el) el.textContent = getTodayDateStr();
}

function updateDocumentTitle(coins) {
  const bsv = coins?.find(c => c.symbol === 'BSV');
  if (!bsv) {
    document.title = '코인프리미엄 · 거래소 시세 비교';
    return;
  }
  const premiumStr = bsv.premium != null
    ? (bsv.premium >= 0 ? '+' : '') + bsv.premium.toFixed(2) + '%'
    : '-';
  const priceStr = bsv.basePrice != null ? formatKRWOnly(bsv.basePrice) + '원' : '-';
  document.title = `BSV 김프 ${premiumStr} | ${priceStr}`;
}

function formatKRWMain(value, symbol) {
  return symbol === 'BTC' ? formatEok2(value) : `${formatKRWOnly(value)}원`;
}

function changeRateDisplay(changeRate) {
  const cls = changeRate == null ? '' : (changeRate >= 0 ? 'positive' : 'negative');
  const str = changeRate != null ? `${changeRate >= 0 ? '+' : ''}${(changeRate * 100).toFixed(2)}%` : '-';
  return { cls, str };
}

function buildCardData(coin) {
  const baseExchange = exchanges.base[state.base];
  const comparisonExchange = exchanges.comparison[state.comparison];
  const hasData = coin.basePrice != null && coin.comparisonPriceKRW != null;
  const isUsdtQuote = coin.comparisonQuote === 'USDT';

  const premiumClass = coin.premium == null ? 'premium-neutral' : (coin.premium >= 0 ? 'premium-positive' : 'premium-negative');
  const premiumStr = coin.premium != null ? `${coin.premium >= 0 ? '+' : ''}${coin.premium.toFixed(2)}%` : '-';

  const baseChange = changeRateDisplay(coin.baseChangeRate);
  const baseMainStr = coin.basePrice != null ? formatKRWMain(coin.basePrice, coin.symbol) : '-';

  let comparisonMainStr = '거래 미지원';
  let comparisonSubStr = '';
  let comparisonSubClass = '';
  if (hasData) {
    // Gate/Binance quote in USDT: show the KRW-converted price plus the raw
    // USDT price underneath - USDT itself is no exception here anymore. It
    // used to hardcode "$1.00" with no sub-line, which left that one row a
    // line shorter than every other coin's and threw off row alignment
    // across the whole card row. Showing Gate's real ~$0.999-1.001 print (or
    // Binance's fixed $1.00 - see fetchBinancePrices) keeps every card the
    // same shape and is more honest about the USDT/USD peg besides.
    // Bithumb quotes directly in KRW, so there is no USD line; its own 24h
    // change rate is shown instead, same as the base row.
    if (isUsdtQuote) {
      comparisonMainStr = formatKRWMain(coin.comparisonPriceKRW, coin.symbol);
      comparisonSubStr = formatUsdPrice(coin.comparisonPrice);
    } else {
      comparisonMainStr = formatKRWMain(coin.comparisonPriceKRW, coin.symbol);
      const comparisonChange = changeRateDisplay(coin.comparisonChangeRate);
      comparisonSubStr = comparisonChange.str !== '-' ? comparisonChange.str : '';
      comparisonSubClass = comparisonChange.cls;
    }
  }

  const baseVolume = coin.baseVolume24h;
  const comparisonVolume = coin.comparisonVolume24h;
  const baseVolumeStr = baseVolume != null ? formatTradeVolumeEokNumber(baseVolume) : '-';
  const comparisonVolumeStr = comparisonVolume != null ? formatTradeVolumeEokNumber(comparisonVolume) : '-';
  let domesticPct = 50;
  if (baseVolume != null && comparisonVolume != null && (baseVolume + comparisonVolume) > 0) {
    domesticPct = (baseVolume / (baseVolume + comparisonVolume)) * 100;
  }

  const bsvWarnClass = coin.symbol === 'BSV' && coin.premium != null && coin.premium >= 5
    ? (coin.premium >= 20 ? 'bsv-urgent' : coin.premium >= 10 ? 'bsv-high' : 'bsv-warn')
    : '';

  // Binance has no BSV spot market; its price there comes from the USDT-M
  // perpetual future instead, so that row is labelled distinctly.
  const comparisonLabel = coin.comparisonMarket === 'futures'
    ? `${comparisonExchange.headerName} 선물`
    : comparisonExchange.headerName;

  // Card-back indicators (52-week range comes straight from Upbit's own
  // ticker; supply/market cap/ATH/sparkline come from CoinGecko - see server.js).
  const marketCapStr = formatKRWAbbrev(coin.marketCapKRW);
  const marketCapRankStr = coin.marketCapRank != null ? `#${coin.marketCapRank}` : '-';
  const circulatingSupplyStr = coin.circulatingSupply != null ? `${formatCount(coin.circulatingSupply)}개` : '-';
  const maxSupplyStr = coin.maxSupply != null ? `${formatCount(coin.maxSupply)}개` : '제한 없음';
  const high52wStr = coin.high52w != null ? formatKRWMain(coin.high52w, coin.symbol) : '-';
  const high52wDateStr = formatShortDate(coin.high52wDate);
  const low52wStr = coin.low52w != null ? formatKRWMain(coin.low52w, coin.symbol) : '-';
  const low52wDateStr = formatShortDate(coin.low52wDate);
  const athChangeStr = formatSignedPercent(coin.athChangePercentage, 1) ?? '-';
  const athDateStr = formatShortDateFromISO(coin.athDate);

  // Front-face 24h range: a slim position bar (like the volume bar) rather
  // than more numbers, so "where is today's price within its 24h band" reads
  // at a glance instead of needing three figures compared mentally.
  let rangePct = 50;
  const hasRange = coin.high24h != null && coin.low24h != null && coin.basePrice != null && coin.high24h > coin.low24h;
  if (hasRange) {
    rangePct = ((coin.basePrice - coin.low24h) / (coin.high24h - coin.low24h)) * 100;
    rangePct = Math.min(100, Math.max(0, rangePct));
  }
  const low24hStr = coin.low24h != null ? formatKRWOnly(coin.low24h) : '-';
  const high24hStr = coin.high24h != null ? formatKRWOnly(coin.high24h) : '-';

  // Premium trend: only rendered once the server has ~1h of samples for this
  // exchange pair (see getPremiumChange1h in server.js) - null until then.
  const premiumTrendStr = coin.premiumChange1h != null
    ? `1시간 전 대비 ${formatSignedPercent(coin.premiumChange1h, 2)}p`
    : '';
  const premiumTrendClass = coin.premiumChange1h == null ? '' : (coin.premiumChange1h >= 0 ? 'positive' : 'negative');

  // The line itself is deliberately neutral (--text-faint), not colored by
  // direction - a full-saturation red/green squiggle next to the premium
  // badge competed with it for attention. Only the small percentage label
  // keeps the positive/negative color, same as everywhere else on the card.
  const sparklinePoints = buildSparklinePoints(coin.sparkline7d);
  const sparkline = coin.sparkline7d?.filter(v => typeof v === 'number' && Number.isFinite(v)) || [];
  const sparkline7dChangeValue = sparkline.length >= 2
    ? ((sparkline[sparkline.length - 1] - sparkline[0]) / sparkline[0]) * 100
    : null;
  const sparkline7dChange = sparkline7dChangeValue != null ? formatSignedPercent(sparkline7dChangeValue, 1) : null;
  const sparklineChangeClass = sparkline7dChangeValue == null ? '' : (sparkline7dChangeValue >= 0 ? 'positive' : 'negative');

  return {
    premiumClass, premiumStr,
    changeClass: baseChange.cls, changeStr: baseChange.str,
    baseMainStr, comparisonMainStr, comparisonSubStr, comparisonSubClass,
    hasData,
    baseVolumeStr, comparisonVolumeStr, domesticPct, bsvWarnClass,
    baseHeaderName: baseExchange.headerName, comparisonHeaderName: comparisonLabel,
    marketCapStr, marketCapRankStr, circulatingSupplyStr, maxSupplyStr,
    high52wStr, high52wDateStr, low52wStr, low52wDateStr,
    athChangeStr, athDateStr,
    hasRange, rangePct, low24hStr, high24hStr,
    premiumTrendStr, premiumTrendClass,
    sparklinePoints, sparkline7dChange, sparklineChangeClass
  };
}

// Card shell is built once; polls only patch text/classes so the whole face
// does not remount (that remount + card-flash was the 3s flicker).
function cardShellHTML(coin) {
  const name = coinNames[coin.symbol] || '';
  return `
    <div class="card-clip">
      <div class="card-flip">
        <div class="card-face card-front">
          <div class="card-head">
            <div class="coin-id">
              <span class="coin-symbol">${coin.symbol}</span>
              <span class="coin-name">${name}</span>
            </div>
            <div class="premium-col">
              <div class="premium-badge premium-neutral" data-f="premium"></div>
              <div class="premium-trend" data-f="premiumTrend" hidden></div>
            </div>
          </div>
          <div class="price-rows">
            <div class="price-row">
              <span class="price-row-label" data-f="baseLabel"></span>
              <span class="price-row-value">
                <span class="price-main" data-f="baseMain"></span>
                <span class="price-sub" data-f="baseSub"></span>
              </span>
            </div>
            <div class="price-row">
              <span class="price-row-label" data-f="cmpLabel"></span>
              <span class="price-row-value" data-f="cmpValue">
                <span class="price-main" data-f="cmpMain"></span>
                <span class="price-sub" data-f="cmpSub" hidden></span>
              </span>
            </div>
          </div>
          <div class="sparkline-row" data-f="sparkRow" hidden>
            <span class="stat-label">7일 추이</span>
            <svg class="sparkline" viewBox="0 0 100 28" preserveAspectRatio="none">
              <polyline data-f="sparkPoly" points="" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
            </svg>
            <span class="sparkline-change" data-f="sparkChange"></span>
          </div>
        </div>
        <div class="card-face card-back">
          <div class="card-head">
            <div class="coin-id">
              <span class="coin-symbol">${coin.symbol}</span>
              <span class="coin-name">${name}</span>
            </div>
          </div>
          <div class="stat-list">
            <div class="stat-row">
              <span class="stat-label">시가총액 순위</span>
              <span class="stat-value"><span data-f="mcapRank"></span><span class="stat-value-sub" data-f="mcapRankSub"> </span></span>
            </div>
            <div class="stat-row">
              <span class="stat-label">시가총액</span>
              <span class="stat-value"><span data-f="mcap"></span><span class="stat-value-sub" data-f="mcapSub"> </span></span>
            </div>
            <div class="stat-row">
              <span class="stat-label">유통량</span>
              <span class="stat-value"><span data-f="circ"></span><span class="stat-value-sub" data-f="circSub"> </span></span>
            </div>
            <div class="stat-row">
              <span class="stat-label">최대발행량</span>
              <span class="stat-value"><span data-f="maxSup"></span><span class="stat-value-sub" data-f="maxSupSub"> </span></span>
            </div>
            <div class="stat-row">
              <span class="stat-label">전고점 대비</span>
              <span class="stat-value"><span data-f="athChg"></span><span class="stat-value-sub" data-f="athDate"> </span></span>
            </div>
            <div class="stat-row">
              <span class="stat-label">52주 최고</span>
              <span class="stat-value"><span data-f="hi52"></span><span class="stat-value-sub" data-f="hi52Date"> </span></span>
            </div>
            <div class="stat-row">
              <span class="stat-label">52주 최저</span>
              <span class="stat-value"><span data-f="lo52"></span><span class="stat-value-sub" data-f="lo52Date"> </span></span>
            </div>
          </div>
          <div class="range-row" data-f="rangeRow" hidden>
            <div class="range-bar">
              <div class="range-marker" data-f="rangeMarker"></div>
            </div>
            <div class="range-labels">
              <span data-f="rangeLow"></span>
              <span data-f="rangeHigh"></span>
            </div>
          </div>
          <div class="volume-row">
            <div class="volume-bar">
              <div class="volume-bar-fill domestic" data-f="volDom"></div>
              <div class="volume-bar-fill comparison" data-f="volCmp"></div>
            </div>
            <div class="volume-labels">
              <span data-f="volDomLabel"></span>
              <span data-f="volCmpLabel"></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function setText(el, text) {
  if (!el) return;
  const next = text == null ? '' : String(text);
  if (el.textContent !== next) el.textContent = next;
}

// Only flash when the visible string actually changes (poll tick with
// identical values stays quiet — no whole-line blink).
function setTextFlash(el, text) {
  if (!el) return;
  const next = text == null ? '' : String(text);
  if (el.textContent === next) return;
  el.textContent = next;
  el.classList.remove('is-flash');
  void el.offsetWidth;
  el.classList.add('is-flash');
  el.addEventListener('animationend', () => el.classList.remove('is-flash'), { once: true });
}

function setClass(el, className) {
  if (!el || el.className === className) return;
  el.className = className;
}

function setHidden(el, hidden) {
  if (!el) return;
  if (el.hidden !== hidden) el.hidden = hidden;
}

function setStyleProp(el, prop, value) {
  if (!el) return;
  if (el.style[prop] !== value) el.style[prop] = value;
}

function isTerminalTheme(theme) {
  const t = theme || document.documentElement.getAttribute('data-theme');
  return t === 'terminal' || t === 'terminal-color';
}

function formatLogTime(date = new Date()) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function syncLayoutMode() {
  const term = isTerminalTheme();
  const grid = document.getElementById('coinGrid');
  const shell = document.getElementById('terminalShell');
  if (grid) grid.hidden = term;
  if (shell) shell.hidden = !term;
}

function formatLsStamp(date = new Date()) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mon = months[date.getMonth()];
  const day = String(date.getDate()).padStart(2, ' ');
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${mon} ${day} ${h}:${m}`;
}

function padLeft(str, width) {
  const s = String(str);
  return s.length >= width ? s : ' '.repeat(width - s.length) + s;
}

function renderTerminalLs(coins) {
  const el = document.getElementById('terminalLs');
  if (!el) return;

  const stamp = formatLsStamp();
  const rows = [
    { mode: 'drwxr-xr-x', n: 2, size: 4096, name: '.' },
    { mode: 'drwxr-xr-x', n: 3, size: 4096, name: '..' },
    { mode: '-rw-r--r--', n: 1, size: 128, name: 'upbit.cfg' },
    { mode: '-rw-r--r--', n: 1, size: 96, name: `${state.comparison}.cfg` }
  ];

  (coins || []).forEach((coin, i) => {
    const size = coin.basePrice != null
      ? Math.max(64, Math.round(Number(coin.basePrice) % 9000) + 100)
      : 128 + i * 16;
    rows.push({
      mode: '-rw-r--r--',
      n: 1,
      size,
      name: `${coin.symbol.toLowerCase()}.kimp`
    });
  });

  if (!coins || !coins.length) {
    ['bsv', 'btc', 'bch', 'usdt'].forEach((sym, i) => {
      rows.push({ mode: '-rw-r--r--', n: 1, size: 128 + i * 16, name: `${sym}.kimp` });
    });
  }

  const lines = [
    `<span class="ls-cmd">$ ls -al</span>`,
    `<span class="ls-meta">total ${rows.length * 4}</span>`
  ];

  rows.forEach(r => {
    lines.push(
      `<span class="ls-meta">${r.mode}  ${r.n} user  coin  ${padLeft(r.size, 5)} ${stamp} </span>` +
      `<span class="ls-name">${r.name}</span>`
    );
  });

  el.innerHTML = lines.join('\n');
}

function setupTerminalPrompt() {
  const bar = document.getElementById('terminalPromptBar');
  if (!bar) return;

  // Visual-only prompt: never open the soft keyboard on mobile.
  const blockKeyboard = (e) => {
    e.preventDefault();
  };

  bar.addEventListener('pointerdown', blockKeyboard);
  bar.addEventListener('touchstart', blockKeyboard, { passive: false });
  bar.addEventListener('mousedown', blockKeyboard);
  bar.addEventListener('click', blockKeyboard);
}

function terminalShellHTML(coin) {
  // One primary log line per coin (Render-style), then a range sub-line.
  return `
    <div class="term-line term-line-main">
      <span class="term-time" data-f="time"></span>
      <span class="term-body">
        <span class="term-sym">${coin.symbol}</span>
        <span class="term-label"> kimp </span>
        <span class="term-val" data-f="premium"></span>
        <span class="term-gap"></span>
        <span class="term-label" data-f="baseLabel"></span>
        <span class="term-val" data-f="baseMain"></span>
        <span class="term-val" data-f="baseSub"></span>
        <span class="term-gap"></span>
        <span class="term-label" data-f="cmpLabel"></span>
        <span class="term-val" data-f="cmpMain"></span>
        <span class="term-val" data-f="cmpSub"></span>
      </span>
    </div>
    <div class="term-line term-line-range">
      <span class="term-time" aria-hidden="true"></span>
      <span class="term-body">
        <span class="term-label">금일저 </span>
        <span class="term-val" data-f="lo24"></span>
        <span class="term-gap"></span>
        <span class="term-label">금일고 </span>
        <span class="term-val" data-f="hi24"></span>
      </span>
    </div>
  `;
}

function patchTerminalBlock(block, d, stamp) {
  const q = (key) => block.querySelector(`[data-f="${key}"]`);
  setText(q('time'), stamp);

  const premium = q('premium');
  const premCls = d.premiumClass === 'premium-positive'
    ? 'term-val positive'
    : d.premiumClass === 'premium-negative'
      ? 'term-val negative'
      : 'term-val';
  setClass(premium, premCls);
  setTextFlash(premium, d.premiumStr);

  setText(q('baseLabel'), `${d.baseHeaderName} `);
  setTextFlash(q('baseMain'), `${d.baseMainStr} `);
  const baseSub = q('baseSub');
  setClass(baseSub, `term-val ${d.changeClass}`.trim());
  setTextFlash(baseSub, d.changeStr);

  setText(q('cmpLabel'), `${d.comparisonHeaderName} `);
  setTextFlash(q('cmpMain'), d.hasData ? `${d.comparisonMainStr}` : d.comparisonMainStr);
  const cmpSub = q('cmpSub');
  if (d.comparisonSubStr) {
    setHidden(cmpSub, false);
    setClass(cmpSub, `term-val ${d.comparisonSubClass}`.trim());
    setTextFlash(cmpSub, ` ${d.comparisonSubStr}`);
  } else {
    setHidden(cmpSub, true);
    setText(cmpSub, '');
  }

  setTextFlash(q('lo24'), d.low24hStr);
  setTextFlash(q('hi24'), d.high24hStr);
}

function renderTerminalLog(coins, isLoading) {
  renderTerminalLs(coins);

  const inner = document.getElementById('terminalLogInner');
  if (!inner) return;

  if (isLoading || !coins || coins.length === 0) {
    inner.querySelectorAll('.term-block').forEach(b => b.remove());
    let empty = inner.querySelector('.term-empty');
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'term-empty';
      inner.appendChild(empty);
    }
    empty.textContent = isLoading ? 'fetching market data...' : 'no data';
    empty.hidden = false;
    return;
  }

  const empty = inner.querySelector('.term-empty');
  if (empty) empty.hidden = true;

  const stamp = formatLogTime();
  const keep = new Set();
  coins.forEach(coin => {
    keep.add(coin.symbol);
    const d = buildCardData(coin);
    let block = inner.querySelector(`.term-block[data-symbol="${coin.symbol}"]`);
    if (!block || block.dataset.shell !== 'v2') {
      if (block) block.remove();
      block = document.createElement('article');
      block.className = 'term-block';
      block.dataset.symbol = coin.symbol;
      block.dataset.shell = 'v2';
      block.innerHTML = terminalShellHTML(coin);
      inner.appendChild(block);
    }
    patchTerminalBlock(block, d, stamp);
  });

  inner.querySelectorAll('.term-block').forEach(block => {
    if (!keep.has(block.dataset.symbol)) block.remove();
  });
}

function patchCard(card, d) {
  const q = (key) => card.querySelector(`[data-f="${key}"]`);

  const premium = q('premium');
  setClass(premium, `premium-badge ${d.premiumClass}`);
  setText(premium, d.premiumStr);

  const trend = q('premiumTrend');
  setHidden(trend, !d.premiumTrendStr);
  setClass(trend, `premium-trend ${d.premiumTrendClass}`.trim());
  setText(trend, d.premiumTrendStr);

  setText(q('baseLabel'), d.baseHeaderName);
  setText(q('baseMain'), d.baseMainStr);
  const baseSub = q('baseSub');
  setClass(baseSub, `price-sub ${d.changeClass}`.trim());
  setText(baseSub, d.changeStr);

  setText(q('cmpLabel'), d.comparisonHeaderName);
  const cmpValue = q('cmpValue');
  setClass(cmpValue, d.hasData ? 'price-row-value' : 'price-row-value unavailable');
  setText(q('cmpMain'), d.comparisonMainStr);
  const cmpSub = q('cmpSub');
  setHidden(cmpSub, !d.comparisonSubStr);
  setClass(cmpSub, `price-sub ${d.comparisonSubClass}`.trim());
  setText(cmpSub, d.comparisonSubStr);

  const sparkRow = q('sparkRow');
  setHidden(sparkRow, !d.sparklinePoints);
  if (d.sparklinePoints) {
    const poly = q('sparkPoly');
    if (poly && poly.getAttribute('points') !== d.sparklinePoints) {
      poly.setAttribute('points', d.sparklinePoints);
    }
    const sparkChange = q('sparkChange');
    setClass(sparkChange, `sparkline-change ${d.sparklineChangeClass}`.trim());
    setText(sparkChange, d.sparkline7dChange);
  }

  setText(q('mcapRank'), d.marketCapRankStr);
  setText(q('mcap'), d.marketCapStr);
  setText(q('circ'), d.circulatingSupplyStr);
  setText(q('maxSup'), d.maxSupplyStr);
  setText(q('athChg'), d.athChangeStr);
  setText(q('athDate'), d.athDateStr || '\u00a0');
  setText(q('hi52'), d.high52wStr);
  setText(q('hi52Date'), d.high52wDateStr || '\u00a0');
  setText(q('lo52'), d.low52wStr);
  setText(q('lo52Date'), d.low52wDateStr || '\u00a0');

  const rangeRow = q('rangeRow');
  setHidden(rangeRow, !d.hasRange);
  if (d.hasRange) {
    setStyleProp(q('rangeMarker'), 'left', `${d.rangePct}%`);
    setText(q('rangeLow'), `24h 저 ${d.low24hStr}`);
    setText(q('rangeHigh'), `24h 고 ${d.high24hStr}`);
  }

  setStyleProp(q('volDom'), 'width', `${d.domesticPct}%`);
  setStyleProp(q('volCmp'), 'width', `${100 - d.domesticPct}%`);
  setVolumeLabel(q('volDomLabel'), d.baseHeaderName, d.baseVolumeStr);
  setVolumeLabel(q('volCmpLabel'), d.comparisonHeaderName, d.comparisonVolumeStr);

  const isFlipped = card.classList.contains('is-flipped');
  const nextClass = `coin-card${d.bsvWarnClass ? ' ' + d.bsvWarnClass : ''}${isFlipped ? ' is-flipped' : ''}`;
  if (card.className !== nextClass) card.className = nextClass;
}

function setVolumeLabel(el, exchangeName, volumeStr) {
  if (!el) return;
  const next = `${exchangeName}|${volumeStr}`;
  if (el.dataset.volKey === next) return;
  el.dataset.volKey = next;
  el.replaceChildren();
  const strong = document.createElement('strong');
  strong.textContent = exchangeName;
  el.append(strong, ` ${volumeStr}억`);
}

// .card-clip has no intrinsic height (faces are absolutely positioned).
// Only rewrite height when it actually changed — avoids layout thrash on
// every 3s poll when numbers alone moved.
function syncCardHeight(card, animate) {
  const clip = card.querySelector('.card-clip');
  if (!clip) return;
  const isFlipped = card.classList.contains('is-flipped');
  const face = card.querySelector(isFlipped ? '.card-back' : '.card-front');
  if (!face) return;
  const targetHeight = face.offsetHeight;
  const next = `${targetHeight}px`;
  if (clip.style.height === next) return;
  if (animate) {
    clip.style.height = next;
    return;
  }
  const prevTransition = clip.style.transition;
  clip.style.transition = 'none';
  clip.style.height = next;
  void clip.offsetHeight;
  clip.style.transition = prevTransition;
}

function renderCoinGrid(coins, isLoading) {
  syncLayoutMode();

  if (!isLoading && coins && coins.length) lastCoins = coins;

  if (isTerminalTheme()) {
    renderTerminalLog(coins, isLoading);
    return;
  }

  const grid = document.getElementById('coinGrid');
  const emptyState = document.getElementById('emptyState');

  if (isLoading || !coins || coins.length === 0) {
    grid.querySelectorAll('.coin-card').forEach(c => c.remove());
    if (emptyState) {
      emptyState.textContent = isLoading ? '데이터 로딩 중...' : '표시할 데이터가 없습니다.';
      emptyState.hidden = false;
    }
    return;
  }

  if (emptyState) emptyState.hidden = true;

  const keep = new Set();
  coins.forEach(coin => {
    keep.add(coin.symbol);
    const d = buildCardData(coin);
    let card = grid.querySelector(`.coin-card[data-symbol="${coin.symbol}"]`);
    if (!card) {
      card = document.createElement('article');
      card.className = 'coin-card';
      card.dataset.symbol = coin.symbol;
      card.innerHTML = cardShellHTML(coin);
      grid.appendChild(card);
    }
    patchCard(card, d);
    syncCardHeight(card, false);
  });

  grid.querySelectorAll('.coin-card').forEach(card => {
    if (!keep.has(card.dataset.symbol)) card.remove();
  });
}

async function refresh(isInitial) {
  if (isInitial) renderCoinGrid(null, true);
  const data = await fetchPrices();
  const coins = data?.coins || [];
  renderCoinGrid(coins, false);
  updateDocumentTitle(coins);
}

function setupCardFlip() {
  const grid = document.getElementById('coinGrid');
  grid.addEventListener('click', (e) => {
    if (isTerminalTheme()) return;
    const card = e.target.closest('.coin-card');
    if (!card) return;
    // Measure the face we're about to reveal and set that as the height
    // target *before* toggling the flip class, so the height transition and
    // the 3D rotation run together - that combination is what reads as the
    // card unfolding open rather than just spinning in place.
    const clip = card.querySelector('.card-clip');
    const willFlip = !card.classList.contains('is-flipped');
    const nextFace = card.querySelector(willFlip ? '.card-back' : '.card-front');
    if (clip && nextFace) {
      clip.style.height = `${nextFace.offsetHeight}px`;
    }
    card.classList.toggle('is-flipped');
  });
}

function setupSegmented(containerId, group) {
  const container = document.getElementById(containerId);
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('.segmented-btn');
    if (!btn || btn.classList.contains('is-active')) return;
    container.querySelectorAll('.segmented-btn').forEach(b => {
      b.classList.toggle('is-active', b === btn);
      b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
    });
    state[group] = btn.dataset.value;
    refresh(true);
  });
}

const THEME_STORAGE_KEY = 'kimp-coin-theme';
const THEME_ORDER = ['light', 'dark', 'black', 'terminal', 'terminal-color'];
const THEME_LABELS = {
  light: '라이트',
  dark: '다크',
  black: '블랙',
  terminal: '터미널',
  'terminal-color': '터미널 컬러'
};

function normalizeTheme(theme) {
  return THEME_ORDER.includes(theme) ? theme : 'terminal';
}

function getPreferredTheme() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (THEME_ORDER.includes(saved)) return saved;
  } catch (err) {
    /* ignore */
  }
  return 'terminal';
}

function nextTheme(current) {
  const idx = THEME_ORDER.indexOf(normalizeTheme(current));
  return THEME_ORDER[(idx + 1) % THEME_ORDER.length];
}

function applyTheme(theme) {
  const next = normalizeTheme(theme);
  document.documentElement.setAttribute('data-theme', next);
  const btn = document.getElementById('themeToggle');
  if (btn) {
    const upcoming = nextTheme(next);
    btn.setAttribute('aria-label', `${THEME_LABELS[upcoming]} 테마로 전환`);
    btn.title = `${THEME_LABELS[next]} · 클릭 시 ${THEME_LABELS[upcoming]}`;
  }
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch (err) {
    /* ignore */
  }
  syncLayoutMode();
}

function setupThemeToggle() {
  applyTheme(getPreferredTheme());
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const current = normalizeTheme(document.documentElement.getAttribute('data-theme'));
    applyTheme(nextTheme(current));
    if (lastCoins.length) renderCoinGrid(lastCoins, false);
    else refresh(false);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  updateHeaderTodayDate();
  setupThemeToggle();
  setupCardFlip();
  setupSegmented('comparisonSegmented', 'comparison');
  setupTerminalPrompt();

  refresh(true);
  setInterval(() => refresh(false), REFRESH_INTERVAL);
});
