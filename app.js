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

// Front face has one job - "how does this coin's premium look right now" -
// so it's just the header, the two prices, and one muted trend line. The 24h
// range bar and the volume-share bar used to live here too, but three
// different mini-widgets stacked on a simple comparison card just made it
// noisy; both moved to the back, which already exists for "tell me more."
function cardFrontHTML(coin, d) {
  return `
    <div class="card-head">
      <div class="coin-id">
        <span class="coin-symbol">${coin.symbol}</span>
        <span class="coin-name">${coinNames[coin.symbol] || ''}</span>
      </div>
      <div class="premium-col">
        <div class="premium-badge ${d.premiumClass}">${d.premiumStr}</div>
        ${d.premiumTrendStr ? `<div class="premium-trend ${d.premiumTrendClass}">${d.premiumTrendStr}</div>` : ''}
      </div>
    </div>
    <div class="price-rows">
      <div class="price-row">
        <span class="price-row-label">${d.baseHeaderName}</span>
        <span class="price-row-value">
          <span class="price-main">${d.baseMainStr}</span>
          <span class="price-sub ${d.changeClass}">${d.changeStr}</span>
        </span>
      </div>
      <div class="price-row">
        <span class="price-row-label">${d.comparisonHeaderName}</span>
        <span class="price-row-value${d.hasData ? '' : ' unavailable'}">
          <span class="price-main">${d.comparisonMainStr}</span>
          ${d.comparisonSubStr ? `<span class="price-sub ${d.comparisonSubClass}">${d.comparisonSubStr}</span>` : ''}
        </span>
      </div>
    </div>
    ${d.sparklinePoints ? `
    <div class="sparkline-row">
      <span class="stat-label">7일 추이</span>
      <svg class="sparkline" viewBox="0 0 100 28" preserveAspectRatio="none">
        <polyline points="${d.sparklinePoints}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
      </svg>
      <span class="sparkline-change ${d.sparklineChangeClass}">${d.sparkline7dChange}</span>
    </div>` : ''}
  `;
}

// Every stat row renders main value + sub-line, even when there is no date
// to show (a non-breaking space holds the line open) - so all five rows are
// exactly two lines tall instead of some being one line and some two, which
// is what made the flipped card look uneven.
function statValueHTML(main, sub) {
  return `${main}<span class="stat-value-sub">${sub || ' '}</span>`;
}

function cardBackHTML(coin, d) {
  return `
    <div class="card-head">
      <div class="coin-id">
        <span class="coin-symbol">${coin.symbol}</span>
        <span class="coin-name">${coinNames[coin.symbol] || ''}</span>
      </div>
    </div>
    <div class="stat-list">
      <div class="stat-row">
        <span class="stat-label">시가총액 순위</span>
        <span class="stat-value">${statValueHTML(d.marketCapRankStr)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">시가총액</span>
        <span class="stat-value">${statValueHTML(d.marketCapStr)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">유통량</span>
        <span class="stat-value">${statValueHTML(d.circulatingSupplyStr)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">최대발행량</span>
        <span class="stat-value">${statValueHTML(d.maxSupplyStr)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">전고점 대비</span>
        <span class="stat-value">${statValueHTML(d.athChangeStr, d.athDateStr)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">52주 최고</span>
        <span class="stat-value">${statValueHTML(d.high52wStr, d.high52wDateStr)}</span>
      </div>
      <div class="stat-row">
        <span class="stat-label">52주 최저</span>
        <span class="stat-value">${statValueHTML(d.low52wStr, d.low52wDateStr)}</span>
      </div>
    </div>
    ${d.hasRange ? `
    <div class="range-row">
      <div class="range-bar">
        <div class="range-marker" style="left:${d.rangePct}%"></div>
      </div>
      <div class="range-labels">
        <span>24h 저 ${d.low24hStr}</span>
        <span>24h 고 ${d.high24hStr}</span>
      </div>
    </div>` : ''}
    <div class="volume-row">
      <div class="volume-bar">
        <div class="volume-bar-fill domestic" style="width:${d.domesticPct}%"></div>
        <div class="volume-bar-fill comparison" style="width:${100 - d.domesticPct}%"></div>
      </div>
      <div class="volume-labels">
        <span><strong>${d.baseHeaderName}</strong> ${d.baseVolumeStr}억</span>
        <span><strong>${d.comparisonHeaderName}</strong> ${d.comparisonVolumeStr}억</span>
      </div>
    </div>
  `;
}

function cardInnerHTML(coin, d) {
  return `
    <div class="card-clip">
      <div class="card-flip">
        <div class="card-face card-front">${cardFrontHTML(coin, d)}</div>
        <div class="card-face card-back">${cardBackHTML(coin, d)}</div>
      </div>
    </div>
  `;
}

function flashCard(card) {
  card.classList.remove('card-flash');
  void card.offsetWidth;
  card.classList.add('card-flash');
  card.addEventListener('animationend', () => card.classList.remove('card-flash'), { once: true });
}

// .card-clip has no intrinsic height (its faces are absolutely positioned -
// see style.css), so it has to be told in px how tall to be: the currently
// shown face's own content height, not whichever face is taller. `animate`
// controls whether that change transitions (the height CSS transition is
// always on, so a plain data refresh - snapping to a possibly-unchanged
// height - must not animate) or snaps instantly (new cards, and price/stat
// updates, where a height "settle" every 3s would just be noise).
function syncCardHeight(card, animate) {
  const clip = card.querySelector('.card-clip');
  if (!clip) return;
  const isFlipped = card.classList.contains('is-flipped');
  const face = card.querySelector(isFlipped ? '.card-back' : '.card-front');
  if (!face) return;
  // offsetHeight (content + padding + border), not scrollHeight (which
  // excludes the face's 1px border and would let it get clipped by
  // .card-clip's overflow: hidden).
  const targetHeight = face.offsetHeight;
  if (animate) {
    clip.style.height = `${targetHeight}px`;
    return;
  }
  const prevTransition = clip.style.transition;
  clip.style.transition = 'none';
  clip.style.height = `${targetHeight}px`;
  void clip.offsetHeight;
  clip.style.transition = prevTransition;
}

function renderCoinGrid(coins, isLoading) {
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

  coins.forEach(coin => {
    const d = buildCardData(coin);
    let card = grid.querySelector(`.coin-card[data-symbol="${coin.symbol}"]`);
    if (!card) {
      card = document.createElement('article');
      card.className = 'coin-card';
      card.dataset.symbol = coin.symbol;
      grid.appendChild(card);
    }
    const nextHTML = cardInnerHTML(coin, d);
    const changed = card.innerHTML.replace(/\s+/g, ' ').trim() !== nextHTML.replace(/\s+/g, ' ').trim();
    card.innerHTML = nextHTML;
    // A poll refresh replaces the card's content but must not un-flip a card
    // the user has turned over to read its back.
    const isFlipped = card.classList.contains('is-flipped');
    card.className = `coin-card${d.bsvWarnClass ? ' ' + d.bsvWarnClass : ''}${isFlipped ? ' is-flipped' : ''}`;
    syncCardHeight(card, false);
    if (changed) flashCard(card);
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

document.addEventListener('DOMContentLoaded', () => {
  updateHeaderTodayDate();
  setupCardFlip();
  setupSegmented('comparisonSegmented', 'comparison');

  refresh(true);
  setInterval(() => refresh(false), REFRESH_INTERVAL);
});
