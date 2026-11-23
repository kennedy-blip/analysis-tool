/**
 * Application entry point — replaces `src/main.tsx` + `src/App.tsx`.
 *
 * Wires the sidebar navigation, the mobile drawer, the dataset status card and
 * the five views.  State lives in `store.js` (the former React context).
 */

import { getState, subscribe } from './store.js';
import { initOverview, renderOverview } from './views/overview.js';
import { initTable, renderTable } from './views/table.js';
import { renderStatistics } from './views/stats.js';
import { initProbability, renderProbability } from './views/probability.js';
import { initVisualization, renderVisualization } from './views/visualization.js';

const config = window.DATALENS_CONFIG;

const dom = {
  sidebar: document.getElementById('sidebar'),
  sidebarToggle: document.getElementById('sidebar-toggle'),
  overlay: document.getElementById('sidebar-overlay'),
  navButtons: Array.from(document.querySelectorAll('[data-tab]')),
  views: Array.from(document.querySelectorAll('[data-view]')),
  titles: Array.from(document.querySelectorAll('[data-title]')),
  subtitles: Array.from(document.querySelectorAll('[data-subtitle]')),
  statusEmpty: document.getElementById('dataset-status-empty'),
  statusLoaded: document.getElementById('dataset-status-loaded'),
  statusName: document.getElementById('dataset-status-name'),
  statusMeta: document.getElementById('dataset-status-meta'),
};

let activeTab = config.defaultView;

function setActiveTab(tabId) {
  activeTab = tabId;

  dom.navButtons.forEach((button) => {
    const active = button.dataset.tab === tabId;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });

  dom.views.forEach((view) => {
    view.hidden = view.dataset.view !== tabId;
  });

  dom.titles.forEach((title) => {
    title.hidden = title.dataset.title !== tabId;
  });

  dom.subtitles.forEach((subtitle) => {
    subtitle.hidden = subtitle.dataset.subtitle !== tabId;
  });

  setSidebarOpen(false);
  document.dispatchEvent(new CustomEvent('datalens:view-changed', { detail: { view: tabId } }));
}

function setSidebarOpen(open) {
  dom.sidebar.classList.toggle('is-open', open);
  dom.overlay.hidden = !open;
  dom.sidebarToggle.setAttribute('aria-expanded', String(open));
  dom.sidebarToggle.classList.toggle('is-open', open);
  document.body.classList.toggle('nav-open', open);
}

function renderStatus(state) {
  const loaded = Boolean(state.datasetInfo) && state.data.length > 0;
  dom.statusEmpty.hidden = loaded;
  dom.statusLoaded.hidden = !loaded;
  if (!loaded) return;

  dom.statusName.textContent = state.datasetInfo.fileName;
  dom.statusName.title = state.datasetInfo.fileName;
  dom.statusMeta.textContent = `${state.datasetInfo.rowCount.toLocaleString()} rows × ${state.datasetInfo.columnCount} cols`;
}

function render(state) {
  renderStatus(state);
  renderOverview(state);
  renderTable(state);
  renderStatistics(state);
  renderProbability(state);
  renderVisualization(state);
}

function initNavigation() {
  dom.navButtons.forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tab));
  });

  dom.sidebarToggle.addEventListener('click', () => {
    setSidebarOpen(!dom.sidebar.classList.contains('is-open'));
  });

  dom.overlay.addEventListener('click', () => setSidebarOpen(false));

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setSidebarOpen(false);
  });

  // Deep links: index.html#statistics opens that view on load.
  const hash = window.location.hash.replace('#', '');
  if (config.views.some((view) => view.id === hash)) {
    setActiveTab(hash);
  }
}

function init() {
  initNavigation();
  initOverview();
  initTable();
  initProbability();
  initVisualization();

  subscribe(render);
  render(getState());

  window.addEventListener('datalens:dataset-cleared', () => render(getState()));
  document.documentElement.classList.add('js-ready');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

export { setActiveTab, getState };
