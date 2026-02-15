// 1 USDT = 1460 KRW (API 실패 시 폴백, 정상 시 업비트 KRW-USDT 실시간 시세 사용)
const USDT_KRW_RATE_FALLBACK = 1460;
// 우측상단 환율 고정 기준값 (config에서 로드, 기본 1445)
let headerRateFixed = 1445;
// 환율 기준 날짜 (config에서 로드)
let headerRateDate = null;

// 거래소 정보
const exchanges = {
  base: {
    upbit: { name: '업비트', code: 'upbit', headerName: 'Upbit' }
  },
  overseas: {
    gate_usdt: { name: 'Gate USDT 마켓', code: 'gate_usdt', headerName: 'Gate' }
  }
};

function formatKRWOnly(value) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

function formatKRW2Decimals(value) {
  return new Intl.NumberFormat('ko-KR', {
    style: 'decimal',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

function formatTradeVolumeEok(value) {
  const eok = value / 100000000;
  return new Intl.NumberFormat('ko-KR', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(Math.round(eok)) + '억';
}

function formatTradeVolumeEokNumber(value) {
  const eok = value / 100000000;
  return new Intl.NumberFormat('ko-KR', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(Math.round(eok));
}

function formatGateTradeVolumeEok(quoteVolumeUsdt, usdtKrwRate) {
  const rate = usdtKrwRate ?? USDT_KRW_RATE_FALLBACK;
  const krwVolume = (quoteVolumeUsdt || 0) * rate;
  return formatTradeVolumeEokNumber(krwVolume);
}

function formatEok2(value) {
  return (value / 100000000).toFixed(2) + '억';
}

function formatGatePriceKrw(usdtValue, usdtKrwRate) {
  const rate = usdtKrwRate ?? USDT_KRW_RATE_FALLBACK;
  return formatKRWOnly(Math.round(usdtValue * rate));
}

function formatGatePriceUsd(usdtValue) {
  const usdtFormatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(usdtValue);
  return `$${usdtFormatted}`;
}

async function fetchPrices() {
  try {
    const res = await fetch('/api/prices');
    if (!res.ok) throw new Error('API 요청 실패');
    return await res.json();
  } catch (err) {
    console.error(err);
    return null;
  }
}

async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) return;
    const data = await res.json();
    if (data.headerRateFixed != null) {
      headerRateFixed = Math.round(parseFloat(data.headerRateFixed) * 100) / 100;
    }
    headerRateDate = data.rateDate || null;
  } catch (err) {
    console.error(err);
  }
}

async function saveConfig(rate, rateDate) {
  try {
    const body = { headerRateFixed: rate };
    if (rateDate) body.rateDate = rateDate;
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error('저장 실패');
    const data = await res.json();
    headerRateFixed = Math.round(parseFloat(data.headerRateFixed) * 100) / 100;
    headerRateDate = data.rateDate || null;
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${y}.${m}.${d}`;
}

function getTodayDateStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}.${m}.${d}`;
}

function updateHeaderTodayDate() {
  const el = document.getElementById('headerTodayDate');
  if (el) el.textContent = getTodayDateStr();
}

function renderCoinList(coins, baseName, overseasName, isLoading, usdtKrwRate) {
  const tbody = document.getElementById('coinTableBody');
  tbody.innerHTML = '';

  if (isLoading) {
    tbody.innerHTML = '<tr class="empty-state"><td colspan="4">데이터 로딩 중...</td></tr>';
    return;
  }

  if (!coins || coins.length === 0) {
    tbody.innerHTML = '<tr class="empty-state"><td colspan="4">표시할 데이터가 없습니다.</td></tr>';
    return;
  }

  const rate = usdtKrwRate ?? USDT_KRW_RATE_FALLBACK;

  coins.forEach(coin => {
    const tr = document.createElement('tr');
    tr.dataset.symbol = coin.symbol;
    const hasData = coin.basePrice != null && coin.overseasPrice != null;
    const gatePriceKRW = hasData ? coin.overseasPrice * rate : 0;
    const krwDiff = hasData ? coin.basePrice - gatePriceKRW : null;
    const diffClass = krwDiff != null && krwDiff >= 0 ? 'premium-positive' : 'premium-negative';
    const diffSign = krwDiff != null && krwDiff >= 0 ? '+' : '';
    const premiumClass = coin.premium != null && coin.premium >= 0 ? 'premium-positive' : 'premium-negative';
    const premiumSign = coin.premium != null && coin.premium >= 0 ? '+' : '';
    const changeRateClass = coin.changeRate != null && coin.changeRate >= 0 ? 'premium-positive' : 'premium-negative';
    const changeRateSign = coin.changeRate != null && coin.changeRate >= 0 ? '+' : '';
    const changeRateStr = coin.changeRate != null ? `${changeRateSign}${(coin.changeRate * 100).toFixed(2)}%` : '-';
    const basePriceStr = coin.symbol === 'BTC' && hasData
      ? formatEok2(coin.basePrice) : (hasData ? formatKRWOnly(coin.basePrice) : '-');
    const gatePriceKrwStr = coin.symbol === 'BTC' && hasData
      ? formatEok2(coin.overseasPrice * rate) : (hasData ? formatGatePriceKrw(coin.overseasPrice, usdtKrwRate) : '-');
    const gatePriceUsdStr = hasData ? formatGatePriceUsd(coin.overseasPrice) : '-';
    const krwDiffStr = krwDiff != null ? `${diffSign}${formatKRWOnly(Math.abs(krwDiff))}` : '-';
    const upbitTradeVolumeStr = coin.tradeVolume24h != null ? formatTradeVolumeEokNumber(coin.tradeVolume24h) : '-';
    const gateTradeVolumeStr = coin.gateQuoteVolume24h != null
      ? formatGateTradeVolumeEok(coin.gateQuoteVolume24h, usdtKrwRate) : '-';
    const premiumStr = coin.premium != null ? `${premiumSign}${coin.premium.toFixed(2)}%` : '-';
    const premium = coin.premium != null ? coin.premium : 0;
    const bsvSymbolClass = coin.symbol === 'BSV' && premium >= 5
      ? (premium >= 20 ? 'bsv-urgent' : premium >= 10 ? 'bsv-high' : 'bsv-warn')
      : '';

    const gateCellContent = coin.symbol === 'USDT'
      ? '<div class="gate-price-krw">$1.00</div>'
      : `<div class="gate-price-krw">${gatePriceKrwStr}${krwDiffStr !== '-' ? ` (<span class="${diffClass}">${krwDiffStr}</span>)` : ''}</div><div class="gate-price-usd">${gatePriceUsdStr}</div>`;

    tr.innerHTML = `
      <td class="cell-coin">
        <div class="coin-symbol ${bsvSymbolClass}">${coin.symbol}</div>
        <div class="coin-premium ${premiumClass}">${premiumStr}</div>
      </td>
      <td class="cell-upbit">
        <div class="upbit-price">${basePriceStr}</div>
        <div class="upbit-change-rate ${changeRateClass}">${changeRateStr}</div>
      </td>
      <td class="cell-gate">
        ${gateCellContent}
      </td>
      <td class="cell-trade-volume">
        <div class="trade-volume-upbit">${upbitTradeVolumeStr}</div>
        <div class="trade-volume-gate">${gateTradeVolumeStr}</div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function flashCell(cell) {
  cell.classList.remove('cell-flash');
  void cell.offsetWidth;
  cell.classList.add('cell-flash');
  cell.addEventListener('animationend', () => cell.classList.remove('cell-flash'), { once: true });
}

function updateCoinPrices(coins, usdtKrwRate) {
  if (!coins || coins.length === 0) return;

  const rate = usdtKrwRate ?? USDT_KRW_RATE_FALLBACK;

  coins.forEach(coin => {
    const row = document.querySelector(`#coinTableBody tr[data-symbol="${coin.symbol}"]`);
    if (!row) return;

    const hasData = coin.basePrice != null && coin.overseasPrice != null;
    const gatePriceKRW = hasData ? coin.overseasPrice * rate : 0;
    const krwDiff = hasData ? coin.basePrice - gatePriceKRW : null;
    const diffClass = krwDiff != null && krwDiff >= 0 ? 'premium-positive' : 'premium-negative';
    const diffSign = krwDiff != null && krwDiff >= 0 ? '+' : '';
    const premiumClass = coin.premium != null && coin.premium >= 0 ? 'premium-positive' : 'premium-negative';
    const premiumSign = coin.premium != null && coin.premium >= 0 ? '+' : '';
    const changeRateClass = coin.changeRate != null && coin.changeRate >= 0 ? 'premium-positive' : 'premium-negative';
    const changeRateSign = coin.changeRate != null && coin.changeRate >= 0 ? '+' : '';
    const changeRateStr = coin.changeRate != null ? `${changeRateSign}${(coin.changeRate * 100).toFixed(2)}%` : '-';
    const basePriceStr = coin.symbol === 'BTC' && hasData
      ? formatEok2(coin.basePrice) : (hasData ? formatKRWOnly(coin.basePrice) : '-');
    const gatePriceKrwStr = coin.symbol === 'BTC' && hasData
      ? formatEok2(coin.overseasPrice * rate) : (hasData ? formatGatePriceKrw(coin.overseasPrice, usdtKrwRate) : '-');
    const gatePriceUsdStr = hasData ? formatGatePriceUsd(coin.overseasPrice) : '-';
    const krwDiffStr = krwDiff != null ? `${diffSign}${formatKRWOnly(Math.abs(krwDiff))}` : '-';
    const upbitTradeVolumeStr = coin.tradeVolume24h != null ? formatTradeVolumeEokNumber(coin.tradeVolume24h) : '-';
    const gateTradeVolumeStr = coin.gateQuoteVolume24h != null
      ? formatGateTradeVolumeEok(coin.gateQuoteVolume24h, usdtKrwRate) : '-';
    const premiumStr = coin.premium != null ? `${premiumSign}${coin.premium.toFixed(2)}%` : '-';

    const gatePriceKrwWithDiff = `${gatePriceKrwStr}${krwDiffStr !== '-' ? ` (<span class="${diffClass}">${krwDiffStr}</span>)` : ''}`;
    const gateCellContent = coin.symbol === 'USDT'
      ? '<div class="gate-price-krw">$1.00</div>'
      : `<div class="gate-price-krw">${gatePriceKrwWithDiff}</div><div class="gate-price-usd">${gatePriceUsdStr}</div>`;

    const coinCell = row.querySelector('.cell-coin');
    const upbitCell = row.querySelector('.cell-upbit');
    const gateCell = row.querySelector('.cell-gate');
    const tradeVolumeCell = row.querySelector('.cell-trade-volume');

    const premium = coin.premium != null ? coin.premium : 0;
    const bsvSymbolClass = coin.symbol === 'BSV' && premium >= 5
      ? (premium >= 20 ? 'bsv-urgent' : premium >= 10 ? 'bsv-high' : 'bsv-warn')
      : '';
    const coinSymbolEl = coinCell.querySelector('.coin-symbol');
    const coinPremiumEl = coinCell.querySelector('.coin-premium');
    const coinChanged = coinSymbolEl?.textContent !== coin.symbol || coinPremiumEl?.textContent !== premiumStr;
    if (coinChanged) {
      coinCell.innerHTML = `<div class="coin-symbol ${bsvSymbolClass}">${coin.symbol}</div><div class="coin-premium ${premiumClass}">${premiumStr}</div>`;
      flashCell(coinCell);
    }
    const priceEl = upbitCell.querySelector('.upbit-price');
    const changeEl = upbitCell.querySelector('.upbit-change-rate');
    const priceChanged = priceEl?.textContent !== basePriceStr;
    const changeChanged = changeEl?.textContent !== changeRateStr;
    if (priceChanged || changeChanged) {
      upbitCell.innerHTML = `<div class="upbit-price">${basePriceStr}</div><div class="upbit-change-rate ${changeRateClass}">${changeRateStr}</div>`;
      flashCell(upbitCell);
    }
    const gateKrwEl = gateCell.querySelector('.gate-price-krw');
    const gateUsdEl = gateCell.querySelector('.gate-price-usd');
    const gateChanged = coin.symbol === 'USDT'
      ? gateKrwEl?.textContent !== '$1.00'
      : (gateKrwEl?.innerHTML !== gatePriceKrwWithDiff || gateUsdEl?.textContent !== gatePriceUsdStr);
    if (gateChanged) {
      gateCell.innerHTML = gateCellContent;
      flashCell(gateCell);
    }
    const upbitTradeEl = tradeVolumeCell.querySelector('.trade-volume-upbit');
    const gateTradeEl = tradeVolumeCell.querySelector('.trade-volume-gate');
    const tradeVolumeChanged = upbitTradeEl?.textContent !== upbitTradeVolumeStr || gateTradeEl?.textContent !== gateTradeVolumeStr;
    if (tradeVolumeChanged) {
      tradeVolumeCell.innerHTML = `<div class="trade-volume-upbit">${upbitTradeVolumeStr}</div><div class="trade-volume-gate">${gateTradeVolumeStr}</div>`;
      flashCell(tradeVolumeCell);
    }
  });
}

function updateHeaderRate(usdtKrwRate) {
  const el = document.getElementById('headerRate');
  const dateEl = document.getElementById('headerDate');
  if (!el) return;
  const fixedStr = formatKRW2Decimals(headerRateFixed);
  if (usdtKrwRate == null) {
    el.innerHTML = `환율 : ${fixedStr}원(<span class="header-rate-percent">-</span>)`;
  } else {
    const diff = usdtKrwRate - headerRateFixed;
    const percentDiff = (diff / headerRateFixed) * 100;
    const sign = percentDiff >= 0 ? '+' : '';
    el.innerHTML = `환율 : ${fixedStr}원(<span class="header-rate-percent">${sign}${percentDiff.toFixed(2)}%</span>)`;
  }
  if (dateEl) dateEl.textContent = formatDisplayDate(headerRateDate);
}

function updateTableHeaders(baseExchange, overseasExchange) {
  const ths = document.querySelectorAll('.coin-table th');
  if (ths.length >= 3) {
    ths[1].textContent = baseExchange.headerName || baseExchange.name;
    ths[2].textContent = overseasExchange.headerName || overseasExchange.name;
  }
}

async function onExchangeChange() {
  const baseSelect = document.getElementById('baseExchange');
  const overseasSelect = document.getElementById('overseasExchange');
  const baseValue = baseSelect.value;
  const overseasValue = overseasSelect.value;

  const tbody = document.getElementById('coinTableBody');

  if (!baseValue || !overseasValue) {
    tbody.innerHTML = '<tr class="empty-state"><td colspan="4">기준 거래소와 해외 거래소를 선택해주세요.</td></tr>';
    return;
  }

  const baseExchange = exchanges.base[baseValue];
  const overseasExchange = exchanges.overseas[overseasValue];

  if (!baseExchange || !overseasExchange) return;

  updateTableHeaders(baseExchange, overseasExchange);
  renderCoinList(null, baseExchange.name, overseasExchange.name, true);

  const data = await fetchPrices();
  const coins = data?.coins || [];
  const usdtKrwRate = data?.krwRate; // 1 USDT = N KRW (업비트 KRW-USDT)
  renderCoinList(coins, baseExchange.name, overseasExchange.name, false, usdtKrwRate);
  updateHeaderRate(usdtKrwRate);
}

const REFRESH_INTERVAL = 3000;

document.addEventListener('DOMContentLoaded', async () => {
  const baseSelect = document.getElementById('baseExchange');
  const overseasSelect = document.getElementById('overseasExchange');
  const rateEditBtn = document.getElementById('headerRateEdit');
  const rateModal = document.getElementById('rateModal');
  const rateInput = document.getElementById('rateInput');
  const dateInput = document.getElementById('dateInput');
  const rateModalCancel = document.getElementById('rateModalCancel');
  const rateModalSave = document.getElementById('rateModalSave');

  await fetchConfig();
  updateHeaderTodayDate();

  rateEditBtn.addEventListener('click', () => {
    rateInput.value = Number(headerRateFixed).toFixed(2);
    dateInput.value = headerRateDate || new Date().toISOString().slice(0, 10);
    rateModal.classList.add('is-open');
    rateInput.focus();
  });

  rateModalCancel.addEventListener('click', () => {
    rateModal.classList.remove('is-open');
  });

  rateModal.addEventListener('click', (e) => {
    if (e.target === rateModal) rateModal.classList.remove('is-open');
  });

  rateModalSave.addEventListener('click', async () => {
    const val = parseFloat(rateInput.value);
    if (isNaN(val) || val < 1 || val > 999999) {
      alert('1 ~ 999,999 사이의 숫자를 입력하세요.');
      return;
    }
    const valRounded = Math.round(val * 100) / 100;
    const dateVal = dateInput.value || null;
    const ok = await saveConfig(valRounded, dateVal);
    if (ok) {
      rateModal.classList.remove('is-open');
      updateHeaderRate(null);
      const data = await fetchPrices();
      if (data?.krwRate != null) updateHeaderRate(data.krwRate);
    } else {
      alert('저장에 실패했습니다.');
    }
  });

  baseSelect.addEventListener('change', onExchangeChange);
  overseasSelect.addEventListener('change', onExchangeChange);

  baseSelect.value = 'upbit';
  overseasSelect.value = 'gate_usdt';
  onExchangeChange();

  setInterval(async () => {
    if (!baseSelect.value || !overseasSelect.value) return;
    const hasRows = document.querySelector('#coinTableBody tr[data-symbol]');
    if (!hasRows) return;

    const data = await fetchPrices();
    const coins = data?.coins || [];
    const usdtKrwRate = data?.krwRate; // 1 USDT = N KRW (업비트 KRW-USDT)
    updateCoinPrices(coins, usdtKrwRate);
    updateHeaderRate(usdtKrwRate);
  }, REFRESH_INTERVAL);
});
