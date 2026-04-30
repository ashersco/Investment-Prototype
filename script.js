const STORAGE_KEY = "portfolio-prototype-state-v1";

async function loadJsonPortfolio() {
  try {
    const response = await fetch("data/portfolio.json");

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const raw = await response.json();
    return normalizeJsonPortfolio(raw);
  } catch (error) {
    console.warn("Could not load portfolio.json, falling back to local/demo data.", error);
    return null;
  }
}

function normalizeJsonPortfolio(raw) {
  if (!raw || !Array.isArray(raw.investments)) {
    throw new Error("Invalid portfolio JSON: missing investments array.");
  }

  const assets = raw.investments.map((inv) => ({
    symbol: inv.symbol,
    name: inv.name,
    shares: Number(inv.quantity) || 0
  }));

  const allDates = [
    ...new Set(
      raw.investments.flatMap((inv) =>
        Array.isArray(inv.history) ? inv.history.map((point) => point.date) : []
      )
    )
  ].sort();

  if (allDates.length === 0) {
    throw new Error("Invalid portfolio JSON: no history dates found.");
  }

  const series = allDates.map((date) => {
    const prices = {};

    raw.investments.forEach((inv) => {
      const historyPoint = (inv.history || []).find((point) => point.date === date);
      prices[inv.symbol] = historyPoint ? Number(historyPoint.price) : null;
    });

    return { date, prices };
  });

  for (let i = 0; i < series.length; i++) {
    assets.forEach((asset) => {
      if (series[i].prices[asset.symbol] == null) {
        const previous = i > 0 ? series[i - 1].prices[asset.symbol] : null;
        const nextKnownRow = series.find((row) => row.prices[asset.symbol] != null);
        const nextKnown = nextKnownRow ? nextKnownRow.prices[asset.symbol] : null;
        series[i].prices[asset.symbol] = previous ?? nextKnown ?? 0;
      }
    });
  }

  return { assets, series };
}

const baseAssets = [
  { symbol: "AAPL", name: "Apple", shares: 18.5, startPrice: 176, drift: 0.0006, volatility: 0.018 },
  { symbol: "VTI", name: "Vanguard Total Stock Market ETF", shares: 42, startPrice: 227, drift: 0.00028, volatility: 0.008 },
  { symbol: "BTC", name: "Bitcoin", shares: 0.42, startPrice: 29500, drift: 0.0012, volatility: 0.033 },
  { symbol: "NVDA", name: "NVIDIA", shares: 8.2, startPrice: 515, drift: 0.0009, volatility: 0.022 }
];

let state = null;
let selectedView = "PORTFOLIO";
let selectedRange = "ALL";
let chartMode = "percent";

function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function createDemoState() {
  const days = 730;
  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  const series = [];
  const assets = structuredClone(baseAssets);

  for (let i = 0; i < days; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const row = { date: date.toISOString().slice(0, 10), prices: {} };

    assets.forEach((asset, idx) => {
      const previous = i === 0 ? asset.startPrice : series[i - 1].prices[asset.symbol];
      const rand = seededRandom(i * 97 + idx * 13 + 41) - 0.5;
      const cycle = Math.sin(i / (28 + idx * 8)) * asset.volatility * 0.35;
      const dayReturn = asset.drift + rand * asset.volatility + cycle;
      const next = Math.max(previous * (1 + dayReturn), asset.startPrice * 0.35);
      row.prices[asset.symbol] = Number(next.toFixed(2));
    });

    series.push(row);
  }

  return { assets, series };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function currency(n) {
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function pct(n) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function classFor(n) {
  return n >= 0 ? "positive-text" : "negative-text";
}

function rangeDays(range) {
  if (!state || !state.series || state.series.length === 0) return 0;
  if (range === "1D") return Math.min(2, state.series.length);
  if (range === "1M") return Math.min(31, state.series.length);
  if (range === "3M") return Math.min(92, state.series.length);
  if (range === "1Y") return Math.min(366, state.series.length);
  return state.series.length;
}

function buildPortfolioSeries() {
  return state.series.map((row) => {
    const total = state.assets.reduce((sum, asset) => {
      return sum + (row.prices[asset.symbol] || 0) * asset.shares;
    }, 0);

    return { date: row.date, value: total };
  });
}

function buildAssetSeries(symbol) {
  const asset = state.assets.find((a) => a.symbol === symbol);
  if (!asset) return [];

  return state.series.map((row) => ({
    date: row.date,
    value: (row.prices[symbol] || 0) * asset.shares
  }));
}

function visibleSeries() {
  const full = selectedView === "PORTFOLIO" ? buildPortfolioSeries() : buildAssetSeries(selectedView);
  const count = rangeDays(selectedRange);
  return full.slice(-count);
}

function currentAssetMeta(symbol) {
  const asset = state.assets.find((a) => a.symbol === symbol);
  if (!asset || state.series.length === 0) {
    return { value: 0, dayPct: 0, allPct: 0 };
  }

  const first = state.series[0].prices[symbol] || 0;
  const last = state.series[state.series.length - 1].prices[symbol] || 0;
  const previous = state.series.length > 1
    ? (state.series[state.series.length - 2].prices[symbol] || last)
    : last;

  return {
    value: last * asset.shares,
    dayPct: previous === 0 ? 0 : ((last - previous) / previous) * 100,
    allPct: first === 0 ? 0 : ((last - first) / first) * 100
  };
}

function renderWatchlist() {
  const container = document.getElementById("watchlist");
  container.innerHTML = "";

  state.assets.forEach((asset) => {
    const meta = currentAssetMeta(asset.symbol);
    const row = document.createElement("div");
    row.className = "watch-row";
    row.innerHTML = `
      <div>
        <strong>${asset.symbol}</strong>
        <div class="subtle">${asset.name}</div>
      </div>
      <div style="text-align:right">
        <div>$${currency(meta.value)}</div>
        <div class="${classFor(meta.dayPct)}">${pct(meta.dayPct)}</div>
      </div>
    `;

    row.addEventListener("click", () => {
      selectedView = asset.symbol;
      render();
    });

    container.appendChild(row);
  });
}

function renderTable() {
  const body = document.getElementById("holdings-body");
  body.innerHTML = "";

  state.assets.forEach((asset) => {
    const meta = currentAssetMeta(asset.symbol);
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>
        <span class="asset-chip">
          <span class="badge">${asset.symbol[0]}</span>
          <span>
            <strong>${asset.symbol}</strong><br />
            <span class="subtle">${asset.name}</span>
          </span>
        </span>
      </td>
      <td>${asset.shares.toFixed(2)}</td>
      <td>$${currency(meta.value)}</td>
      <td class="${classFor(meta.dayPct)}">${pct(meta.dayPct)}</td>
      <td class="${classFor(meta.allPct)}">${pct(meta.allPct)}</td>
    `;

    tr.addEventListener("click", () => {
      selectedView = asset.symbol;
      render();
    });

    body.appendChild(tr);
  });
}

function renderInsights() {
  const ranked = state.assets
    .map((asset) => ({
      symbol: asset.symbol,
      ...currentAssetMeta(asset.symbol)
    }))
    .sort((a, b) => b.allPct - a.allPct);

  if (ranked.length === 0) return;

  const best = ranked[0];
  const worst = ranked[ranked.length - 1];

  document.getElementById("best-performer").textContent = best.symbol;
  document.getElementById("best-performer-meta").textContent = `${pct(best.allPct)} all-time`;
  document.getElementById("worst-performer").textContent = worst.symbol;
  document.getElementById("worst-performer-meta").textContent = `${pct(worst.allPct)} all-time`;
}

function dateLabel(series) {
  if (!series.length) return "";

  const start = new Date(series[0].date + "T00:00:00");
  const end = new Date(series[series.length - 1].date + "T00:00:00");
  const opts = { month: "short", day: "numeric", year: "numeric" };

  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
}

function renderSummary() {
  const series = visibleSeries();
  const totalSeries = selectedView === "PORTFOLIO" ? buildPortfolioSeries() : buildAssetSeries(selectedView);

  if (!series.length || !totalSeries.length) return;

  const current = totalSeries[totalSeries.length - 1].value;
  const start = series[0].value;
  const end = series[series.length - 1].value;
  const diff = end - start;
  const diffPct = start === 0 ? 0 : (diff / start) * 100;

  const title = selectedView === "PORTFOLIO" ? "Total Portfolio" : `${selectedView} Position`;
  const label = selectedView === "PORTFOLIO" ? "Portfolio" : "Investment";

  document.getElementById("selection-title").textContent = title;
  document.getElementById("selection-label").textContent = label;
  document.getElementById("current-value").textContent = currency(current);

  const changeEl = document.getElementById("period-change");
  changeEl.className = `change-line ${classFor(diffPct)}`;
  changeEl.textContent = `${diff >= 0 ? "+" : "-"}$${currency(Math.abs(diff))} (${pct(Math.abs(diffPct)).replace("+", diff >= 0 ? "+" : "-")})`;

  const portfolioSeries = buildPortfolioSeries();
  document.getElementById("sidebar-total").textContent = portfolioSeries.length
    ? currency(portfolioSeries[portfolioSeries.length - 1].value)
    : currency(0);

  document.getElementById("date-range-label").textContent = dateLabel(series);
  document.getElementById("chart-caption").textContent =
    chartMode === "percent"
      ? "Showing percent change from the start of the selected period."
      : "Showing dollar value across the selected period.";

  document.getElementById("toggle-mode").textContent = chartMode === "percent" ? "Show $" : "Show %";
}

function drawChart() {
  const canvas = document.getElementById("chart");
  const ctx = canvas.getContext("2d");
  const series = visibleSeries();

  if (!series.length) return;

  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = Math.round(width * 0.38);

  canvas.width = width * dpr;
  canvas.height = height * dpr;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const padding = { top: 18, right: 20, bottom: 28, left: 56 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const baseValue = series[0].value || 1;
  const values = series.map((p) =>
    chartMode === "percent" ? ((p.value / baseValue) - 1) * 100 : p.value
  );

  let min = Math.min(...values);
  let max = Math.max(...values);

  if (min === max) {
    min -= 1;
    max += 1;
  }

  const toX = (i) => padding.left + (i / (values.length - 1 || 1)) * plotW;
  const toY = (v) => padding.top + (1 - (v - min) / (max - min)) * plotH;

  ctx.strokeStyle = "rgba(255,255,255,0.10)";
  ctx.lineWidth = 1;

  for (let i = 0; i < 4; i++) {
    const y = padding.top + (plotH / 3) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(163, 174, 208, 0.95)";
  ctx.font = "12px sans-serif";

  const ticks = 4;
  for (let i = 0; i < ticks; i++) {
    const ratio = i / (ticks - 1);
    const value = max - (max - min) * ratio;
    const y = padding.top + plotH * ratio;
    const label = chartMode === "percent"
      ? `${value.toFixed(1)}%`
      : `$${Math.round(value).toLocaleString()}`;

    ctx.fillText(label, 8, y + 4);
  }

  const gradient = ctx.createLinearGradient(0, padding.top, 0, height);
  gradient.addColorStop(0, "rgba(34,197,94,0.35)");
  gradient.addColorStop(1, "rgba(34,197,94,0.03)");

  ctx.beginPath();
  ctx.moveTo(toX(0), toY(values[0]));
  values.forEach((v, i) => ctx.lineTo(toX(i), toY(v)));
  ctx.lineTo(toX(values.length - 1), height - padding.bottom);
  ctx.lineTo(toX(0), height - padding.bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  values.forEach((v, i) => {
    const x = toX(i);
    const y = toY(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  const latest = values[values.length - 1];
  ctx.strokeStyle = latest >= values[0]
    ? "rgba(34,197,94,0.95)"
    : "rgba(239,68,68,0.95)";
  ctx.lineWidth = 3;
  ctx.stroke();

  const lx = toX(values.length - 1);
  const ly = toY(values[values.length - 1]);
  ctx.beginPath();
  ctx.arc(lx, ly, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = "#fff";
  ctx.fill();

  const labelIndexes = [
    0,
    Math.floor(values.length * 0.33),
    Math.floor(values.length * 0.66),
    values.length - 1
  ];

  labelIndexes.forEach((idx, pos) => {
    const x = toX(idx);
    const date = new Date(series[idx].date + "T00:00:00");
    const opts = selectedRange === "1D"
      ? { hour: "numeric" }
      : { month: "short", day: "numeric" };

    ctx.fillStyle = "rgba(163, 174, 208, 0.95)";
    const text = date.toLocaleDateString(undefined, opts);

    let offset = -15;
    if (pos === 0) offset = 0;
    if (pos === labelIndexes.length - 1) offset = -40;

    ctx.fillText(text, x + offset, height - 8);
  });
}

function populateControls() {
  const select = document.getElementById("asset-select");
  select.innerHTML = "";

  state.assets.forEach((asset) => {
    const option = document.createElement("option");
    option.value = asset.symbol;
    option.textContent = `${asset.symbol} — ${asset.name}`;
    select.appendChild(option);
  });

  document.querySelectorAll("#range-buttons button").forEach((button) => {
    button.classList.toggle("active", button.dataset.range === selectedRange);
    button.onclick = () => {
      selectedRange = button.dataset.range;
      render();
    };
  });
}

function applyTransaction() {
  const symbol = document.getElementById("asset-select").value;
  const qty = Number(document.getElementById("quantity-input").value);
  const action = document.getElementById("action-select").value;

  if (!qty || qty <= 0) {
    document.getElementById("transaction-status").textContent = "Enter a quantity greater than 0.";
    return;
  }

  const asset = state.assets.find((a) => a.symbol === symbol);
  if (!asset) return;

  const delta = action === "buy" ? qty : -qty;
  asset.shares = Math.max(0, Number((asset.shares + delta).toFixed(4)));

  saveState();
  document.getElementById("transaction-status").textContent =
    `${action === "buy" ? "Bought" : "Sold"} ${qty} ${symbol} in the local state.`;

  render();
}

function render() {
  if (!state) return;
  populateControls();
  renderWatchlist();
  renderTable();
  renderInsights();
  renderSummary();
  drawChart();
}

document.getElementById("toggle-mode").addEventListener("click", () => {
  chartMode = chartMode === "percent" ? "value" : "percent";
  render();
});

document.getElementById("apply-transaction").addEventListener("click", applyTransaction);

document.getElementById("demo-reset").addEventListener("click", async () => {
  localStorage.removeItem(STORAGE_KEY);

  const jsonState = await loadJsonPortfolio();
  state = jsonState || createDemoState();
  selectedView = "PORTFOLIO";
  selectedRange = "ALL";

  document.getElementById("transaction-status").textContent = jsonState
    ? "Reloaded portfolio.json data."
    : "Demo data reset.";

  render();
});

async function init() {
  const jsonState = await loadJsonPortfolio();
  state = jsonState || loadState() || createDemoState();
  render();
}

window.addEventListener("resize", drawChart);
window.addEventListener("load", init);
