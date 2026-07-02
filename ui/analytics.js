function formatCoins(n) {
  if (n == null || Number.isNaN(n)) return '—';
  return Math.round(n).toLocaleString('pt-BR');
}

function formatPl(n) {
  const sign = n > 0 ? '+' : '';
  return `${sign}${formatCoins(n)}`;
}

function renderMetrics(summary) {
  const row = document.getElementById('metrics-row');
  const cards = [
    { label: 'Portfolio', value: summary.portfolio },
    { label: 'Investments', value: summary.investments },
    {
      label: 'Unrealized P/L',
      value: summary.unrealizedProfitLoss,
      cls: summary.unrealizedProfitLoss >= 0 ? 'positive' : 'negative',
    },
    { label: 'Fodder', value: summary.fodder },
    { label: 'Transfer List', value: summary.transferList },
    { label: 'Coins', value: summary.coins ?? 0 },
  ];

  row.innerHTML = cards
    .map(
      (c) => `
    <div class="metric-card">
      <div class="label">${c.label}</div>
      <div class="value ${c.cls || ''}">${formatCoins(c.value)}</div>
    </div>`
    )
    .join('');
}

function renderTierBadges(tierCounts, elId) {
  const el = document.getElementById(elId);
  el.innerHTML = `
    <span>Bronze ${tierCounts.bronze || 0}</span>
    <span>Silver ${tierCounts.silver || 0}</span>
    <span>Gold ${tierCounts.gold || 0}</span>
  `;
}

function renderRatingChart(distribution) {
  const chart = document.getElementById('rating-chart');
  if (!distribution?.length) {
    chart.innerHTML = '<p style="color:#71717a;font-size:13px">Sem dados</p>';
    return;
  }

  const slice = distribution.filter((d) => d.rating >= 45 && d.rating <= 99);
  const max = Math.max(...slice.map((d) => d.count), 1);

  chart.innerHTML = slice
    .map((d) => {
      const h = Math.round((d.count / max) * 100);
      const showLabel = d.rating % 5 === 0 || d.count === max;
      return `
      <div class="bar-wrap">
        <div class="bar" style="height:${h}%" title="${d.rating}: ${d.count}"></div>
        ${showLabel ? `<span class="bar-label">${d.rating}</span>` : '<span class="bar-label"></span>'}
      </div>`;
    })
    .join('');
}

function renderInvestChart(rows) {
  const chart = document.getElementById('invest-chart');
  if (!rows?.length) {
    chart.innerHTML = '<p style="color:#71717a;font-size:13px">Sem investimentos 83+</p>';
    return;
  }

  const max = Math.max(
    ...rows.flatMap((r) => [r.invested, r.currentValue]),
    1
  );

  chart.innerHTML = rows
    .map((r) => {
      const hi = Math.round((Math.max(r.invested, r.currentValue) / max) * 100);
      const hInv = Math.round((r.invested / max) * hi);
      const hCur = Math.round((r.currentValue / max) * hi);
      return `
      <div class="bar-wrap">
        <div class="bar-pair" style="height:${hi}%">
          <div class="bar invested" style="height:${hInv || 2}%"></div>
          <div class="bar current" style="height:${hCur || 2}%"></div>
        </div>
        <span class="bar-label">${r.rating}</span>
      </div>`;
    })
    .join('');
}

function renderTable(tbodyId, rows) {
  const tbody = document.getElementById(tbodyId);
  if (!rows?.length) {
    tbody.innerHTML = '<tr><td colspan="5">Nenhum dado</td></tr>';
    return;
  }

  tbody.innerHTML = rows
    .map((r) => {
      const plCls = r.profitLoss >= 0 ? 'pl-positive' : 'pl-negative';
      return `
      <tr>
        <td>${escapeHtml(r.name)}</td>
        <td>${r.rating}</td>
        <td>${formatCoins(r.invested)}</td>
        <td>${formatCoins(r.currentValue)}</td>
        <td class="${plCls}">${formatPl(r.profitLoss)}</td>
      </tr>`;
    })
    .join('');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function loadAnalytics(forceRefresh = false) {
  const loading = document.getElementById('loading');
  const useFutbin = document.getElementById('use-futbin').checked;
  loading.classList.remove('hidden');

  try {
    const result = await chrome.runtime.sendMessage({
      action: 'getClubAnalytics',
      force_refresh: forceRefresh,
      use_futbin: useFutbin,
    });

    if (!result?.success) {
      document.getElementById('footer-meta').textContent =
        result?.error || 'Falha ao carregar. Abra o Web App e faça login.';
      return;
    }

    const d = result.data;
    renderMetrics({ ...d.summary, coins: d.coins });
    renderTierBadges(d.tierCounts, 'tier-badges');
    renderTierBadges(
      {
        bronze: d.investmentByRating.filter((x) => x.rating <= 64).length,
        silver: d.investmentByRating.filter((x) => x.rating >= 65 && x.rating <= 74)
          .length,
        gold: d.investmentByRating.filter((x) => x.rating >= 75).length,
      },
      'inv-tier-badges'
    );
    renderRatingChart(d.ratingDistribution);
    renderInvestChart(d.investmentByRating);
    renderTable('top-gainers', d.topGainers);
    renderTable('top-losers', d.topLosers);

    const updated = new Date(d.updatedAt).toLocaleString('pt-BR');
    document.getElementById('footer-meta').textContent =
      `Atualizado: ${updated} · ${d.summary.playerCount} jogadores · FutBin ${d.pricing.futbinCoveragePct}% (${d.pricing.futbinPricesLoaded} preços)`;
  } finally {
    loading.classList.add('hidden');
  }
}

document.getElementById('btn-refresh').addEventListener('click', () => loadAnalytics(true));
document.getElementById('use-futbin').addEventListener('change', () => loadAnalytics(false));

loadAnalytics(false);
