// 1 USDT = 1460 KRW (API 실패 시 폴백, 정상 시 업비트 KRW-USDT 실시간 시세 사용)
const USDT_KRW_RATE_FALLBACK = 1460;

// 거래소 정보
const exchanges = {
  base: {
    upbit: { name: '업비트', code: 'upbit', headerName: '업비트' }
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

function formatTradeVolumeEok(value) {
  const eok = value / 100000000;
  return new Intl.NumberFormat('ko-KR', {
    style: 'decimal',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(Math.round(eok)) + '억';
}

function formatGatePrice(usdtValue, usdtKrwRate) {
  const rate = usdtKrwRate ?? USDT_KRW_RATE_FALLBACK;
  const krwAmount = Math.round(usdtValue * rate);
  const usdtFormatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(usdtValue);
  return `${formatKRWOnly(krwAmount)} ($${usdtFormatted})`;
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

function renderCoinList(coins, baseName, overseasName, isLoading, usdtKrwRate) {
  const tbody = document.getElementById('coinTableBody');
  tbody.innerHTML = '';

  if (isLoading) {
    tbody.innerHTML = '<tr class="empty-state"><td colspan="7">데이터 로딩 중...</td></tr>';
    return;
  }

  if (!coins || coins.length === 0) {
    tbody.innerHTML = '<tr class="empty-state"><td colspan="7">표시할 데이터가 없습니다.</td></tr>';
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
    const basePriceStr = hasData ? formatKRWOnly(coin.basePrice) : '-';
    const gatePriceStr = hasData ? formatGatePrice(coin.overseasPrice, usdtKrwRate) : '-';
    const krwDiffStr = krwDiff != null ? `${diffSign}${formatKRWOnly(Math.abs(krwDiff))}` : '-';
    const tradeVolumeStr = coin.tradeVolume24h != null ? formatTradeVolumeEok(coin.tradeVolume24h) : '-';
    const premiumStr = coin.premium != null ? `${premiumSign}${coin.premium.toFixed(2)}%` : '-';

    tr.innerHTML = `
      <td>
        <div class="coin-name">
          <span class="coin-symbol">${coin.symbol}</span>
          <span class="coin-full-name">${coin.name}</span>
        </div>
      </td>
      <td class="cell-change-rate ${changeRateClass}">${changeRateStr}</td>
      <td class="cell-upbit">${basePriceStr}</td>
      <td class="cell-gate">${gatePriceStr}</td>
      <td class="cell-krw-diff ${diffClass}">${krwDiffStr}</td>
      <td class="cell-trade-volume">${tradeVolumeStr}</td>
      <td class="cell-premium ${premiumClass}">${premiumStr}</td>
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
    const basePriceStr = hasData ? formatKRWOnly(coin.basePrice) : '-';
    const gatePriceStr = hasData ? formatGatePrice(coin.overseasPrice, usdtKrwRate) : '-';
    const krwDiffStr = krwDiff != null ? `${diffSign}${formatKRWOnly(Math.abs(krwDiff))}` : '-';
    const tradeVolumeStr = coin.tradeVolume24h != null ? formatTradeVolumeEok(coin.tradeVolume24h) : '-';
    const premiumStr = coin.premium != null ? `${premiumSign}${coin.premium.toFixed(2)}%` : '-';

    const changeRateCell = row.querySelector('.cell-change-rate');
    const upbitCell = row.querySelector('.cell-upbit');
    const gateCell = row.querySelector('.cell-gate');
    const diffCell = row.querySelector('.cell-krw-diff');
    const tradeVolumeCell = row.querySelector('.cell-trade-volume');
    const premiumCell = row.querySelector('.cell-premium');

    if (changeRateCell.textContent !== changeRateStr) {
      changeRateCell.textContent = changeRateStr;
      changeRateCell.className = `cell-change-rate ${changeRateClass}`;
      flashCell(changeRateCell);
    }
    if (upbitCell.textContent !== basePriceStr) {
      upbitCell.textContent = basePriceStr;
      flashCell(upbitCell);
    }
    if (gateCell.textContent !== gatePriceStr) {
      gateCell.textContent = gatePriceStr;
      flashCell(gateCell);
    }
    if (diffCell.textContent !== krwDiffStr) {
      diffCell.textContent = krwDiffStr;
      diffCell.className = `cell-krw-diff ${diffClass}`;
      flashCell(diffCell);
    }
    if (tradeVolumeCell.textContent !== tradeVolumeStr) {
      tradeVolumeCell.textContent = tradeVolumeStr;
      flashCell(tradeVolumeCell);
    }
    if (premiumCell.textContent !== premiumStr) {
      premiumCell.textContent = premiumStr;
      premiumCell.className = `cell-premium ${premiumClass}`;
      flashCell(premiumCell);
    }
  });
}

function updateTableHeaders(baseExchange, overseasExchange) {
  const ths = document.querySelectorAll('.coin-table th');
  if (ths.length >= 5) {
    ths[2].textContent = baseExchange.headerName || baseExchange.name;
    ths[3].textContent = overseasExchange.headerName || overseasExchange.name;
  }
}

async function onExchangeChange() {
  const baseSelect = document.getElementById('baseExchange');
  const overseasSelect = document.getElementById('overseasExchange');
  const baseValue = baseSelect.value;
  const overseasValue = overseasSelect.value;

  const tbody = document.getElementById('coinTableBody');

  if (!baseValue || !overseasValue) {
    tbody.innerHTML = '<tr class="empty-state"><td colspan="7">기준 거래소와 해외 거래소를 선택해주세요.</td></tr>';
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
}

const REFRESH_INTERVAL = 3000;

document.addEventListener('DOMContentLoaded', () => {
  const baseSelect = document.getElementById('baseExchange');
  const overseasSelect = document.getElementById('overseasExchange');

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
  }, REFRESH_INTERVAL);
});
