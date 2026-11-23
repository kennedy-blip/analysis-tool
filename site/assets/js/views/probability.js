/**
 * Probability view — port of `src/components/Probability.tsx`.
 *
 * The default results are pre-rendered by `site/build.py` (see
 * `probability_defaults`); this module recalculates them in the browser as the
 * inputs change, using exactly the same expressions as the React original.
 */

import {
  binomialProbability,
  combinations,
  correlation,
  covariance,
  mean,
  normalPDF,
  numericColumnsFor,
  permutations,
  poissonProbability,
  probability,
  stdDev,
  zScore,
} from '../statistics.js';

const dom = {
  favorable: document.getElementById('prob-favorable'),
  total: document.getElementById('prob-total'),
  basicPercent: document.getElementById('prob-basic-percent'),
  basicDecimal: document.getElementById('prob-basic-decimal'),
  n: document.getElementById('prob-n'),
  r: document.getElementById('prob-r'),
  combinations: document.getElementById('prob-combinations'),
  permutations: document.getElementById('prob-permutations'),
  binN: document.getElementById('prob-bin-n'),
  binK: document.getElementById('prob-bin-k'),
  binP: document.getElementById('prob-bin-p'),
  binomialLabel: document.getElementById('prob-bin-p-label'),
  binomialPercent: document.getElementById('prob-binomial-percent'),
  binomialMean: document.getElementById('prob-binomial-mean'),
  binomialStd: document.getElementById('prob-binomial-stddev'),
  lambda: document.getElementById('prob-lambda'),
  poissonK: document.getElementById('prob-poisson-k'),
  poissonLabel: document.getElementById('prob-poisson-label'),
  poissonPercent: document.getElementById('prob-poisson-percent'),
  poissonMean: document.getElementById('prob-poisson-mean'),
  poissonStd: document.getElementById('prob-poisson-stddev'),
  normalX: document.getElementById('prob-normal-x'),
  normalMean: document.getElementById('prob-normal-mean'),
  normalStd: document.getElementById('prob-normal-std'),
  zScore: document.getElementById('prob-zscore'),
  pdf: document.getElementById('prob-pdf'),
  correlationEmpty: document.getElementById('correlation-empty'),
  correlationBody: document.getElementById('correlation-body'),
  corrX: document.getElementById('prob-corr-x'),
  corrY: document.getElementById('prob-corr-y'),
  correlationResults: document.getElementById('correlation-results'),
  correlationValue: document.getElementById('prob-correlation'),
  correlationStrength: document.getElementById('prob-correlation-strength'),
  covarianceValue: document.getElementById('prob-covariance'),
  r2Value: document.getElementById('prob-r2'),
};

let currentState = { data: [], datasetInfo: null };

const value = (input) => Number(input.value);

export function correlationStrength(r) {
  const magnitude = Math.abs(r) > 0.7 ? 'Strong' : Math.abs(r) > 0.3 ? 'Moderate' : 'Weak';
  return `${magnitude}${r >= 0 ? ' Positive' : ' Negative'}`;
}

function recalcBasic() {
  const favorable = value(dom.favorable);
  const total = value(dom.total);
  dom.basicPercent.textContent = `${total > 0 ? (probability(favorable, total) * 100).toFixed(4) : 0}%`;
  dom.basicDecimal.textContent = total > 0 ? probability(favorable, total).toFixed(6) : '0';
}

function recalcCounting() {
  const n = value(dom.n);
  const r = value(dom.r);
  const usable = n >= r && n <= 170;
  dom.combinations.textContent = usable ? combinations(n, r).toLocaleString() : 'N/A';
  dom.permutations.textContent = usable ? permutations(n, r).toLocaleString() : 'N/A';
}

function recalcBinomial() {
  const n = value(dom.binN);
  const k = value(dom.binK);
  const p = value(dom.binP);
  dom.binomialLabel.textContent = `P(X = ${k})`;
  dom.binomialPercent.textContent = `${(binomialProbability(n, k, p) * 100).toFixed(4)}%`;
  dom.binomialMean.textContent = (n * p).toFixed(4);
  dom.binomialStd.textContent = Math.sqrt(n * p * (1 - p)).toFixed(4);
}

function recalcPoisson() {
  const lambda = value(dom.lambda);
  const k = value(dom.poissonK);
  dom.poissonLabel.textContent = `P(X = ${k})`;
  dom.poissonPercent.textContent = `${(poissonProbability(lambda, k) * 100).toFixed(4)}%`;
  dom.poissonMean.textContent = String(lambda);
  dom.poissonStd.textContent = Math.sqrt(lambda).toFixed(4);
}

function recalcNormal() {
  const x = value(dom.normalX);
  const mu = value(dom.normalMean);
  const sigma = value(dom.normalStd);
  dom.zScore.textContent = zScore(x, mu, sigma).toFixed(4);
  dom.pdf.textContent = normalPDF(x, mu, sigma).toFixed(6);
}

function recalcCorrelation(state) {
  const numericColumns = state.data.length
    ? numericColumnsFor(state.data, state.datasetInfo?.columns ?? [])
    : [];

  if (numericColumns.length < 2) {
    dom.correlationEmpty.hidden = false;
    dom.correlationBody.hidden = true;
    return;
  }

  dom.correlationEmpty.hidden = true;
  dom.correlationBody.hidden = false;

  fillColumnSelect(dom.corrX, numericColumns);
  fillColumnSelect(dom.corrY, numericColumns);

  const xColumn = dom.corrX.value;
  const yColumn = dom.corrY.value;

  if (!xColumn || !yColumn) {
    dom.correlationResults.hidden = true;
    return;
  }

  const xValues = [];
  const yValues = [];
  state.data.forEach((row) => {
    const x = Number(row[xColumn]);
    const y = Number(row[yColumn]);
    if (!isNaN(x) && !isNaN(y)) {
      xValues.push(x);
      yValues.push(y);
    }
  });

  if (xValues.length < 2) {
    dom.correlationResults.hidden = true;
    return;
  }

  const r = correlation(xValues, yValues);
  dom.correlationResults.hidden = false;
  dom.correlationValue.textContent = r.toFixed(4);
  dom.correlationStrength.textContent = correlationStrength(r);
  dom.covarianceValue.textContent = covariance(xValues, yValues).toFixed(4);
  dom.r2Value.textContent = `${(Math.pow(r, 2) * 100).toFixed(2)}%`;
  dom.correlationResults.dataset.pairs = String(xValues.length);
  dom.correlationResults.dataset.xMean = mean(xValues).toFixed(4);
  dom.correlationResults.dataset.yMean = mean(yValues).toFixed(4);
  dom.correlationResults.dataset.xStdDev = stdDev(xValues).toFixed(4);
  dom.correlationResults.dataset.yStdDev = stdDev(yValues).toFixed(4);
}

function fillColumnSelect(select, columns) {
  const current = select.value;
  select.innerHTML = '<option value="">Select column...</option>';
  columns.forEach((column) => {
    const option = document.createElement('option');
    option.value = column;
    option.textContent = column;
    select.appendChild(option);
  });
  if (columns.includes(current)) select.value = current;
}

export function renderProbability(state) {
  currentState = state;
  recalcCorrelation(state);
}

export function initProbability() {
  const tabs = Array.from(document.querySelectorAll('[data-prob-mode]'));
  const panels = Array.from(document.querySelectorAll('[data-prob-panel]'));

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.probMode;
      tabs.forEach((other) => {
        const active = other === tab;
        other.classList.toggle('is-active', active);
        other.setAttribute('aria-selected', String(active));
      });
      panels.forEach((panel) => {
        panel.hidden = panel.dataset.probPanel !== mode;
      });
    });
  });

  [dom.favorable, dom.total].forEach((input) => input.addEventListener('input', recalcBasic));
  [dom.n, dom.r].forEach((input) => input.addEventListener('input', recalcCounting));
  [dom.binN, dom.binK, dom.binP].forEach((input) => input.addEventListener('input', recalcBinomial));
  [dom.lambda, dom.poissonK].forEach((input) => input.addEventListener('input', recalcPoisson));
  [dom.normalX, dom.normalMean, dom.normalStd].forEach((input) =>
    input.addEventListener('input', recalcNormal)
  );
  [dom.corrX, dom.corrY].forEach((select) =>
    select.addEventListener('change', () => recalcCorrelation(currentState))
  );
}
