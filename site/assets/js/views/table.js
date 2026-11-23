/**
 * Data Table view — port of `src/components/DataTable.tsx`.
 *
 * Same search filter, null-last sort with numeric fast path, 15-row pages and
 * five-slot pagination window as the React original.
 */

import { pageWindow, summaryText } from '../paging.js';

const config = window.DATALENS_CONFIG;
const ROWS_PER_PAGE = config.table.rowsPerPage;
const PAGE_WINDOW = config.table.pageWindow;


const dom = {
  empty: document.getElementById('data-empty'),
  card: document.getElementById('data-table-card'),
  search: document.getElementById('table-search'),
  summary: document.getElementById('table-summary'),
  headRow: document.getElementById('table-head-row'),
  body: document.getElementById('table-body'),
  pager: document.getElementById('table-pager'),
  prev: document.getElementById('table-prev'),
  next: document.getElementById('table-next'),
};

let currentState = null;

const view = {
  page: 1,
  search: '',
  sortColumn: null,
  sortDirection: 'asc',
  datasetKey: null,
};

function filterRows(data) {
  if (!view.search) return data;
  const needle = view.search.toLowerCase();
  return data.filter((row) =>
    Object.values(row).some((value) => String(value).toLowerCase().includes(needle))
  );
}

function sortRows(rows) {
  if (!view.sortColumn) return rows;
  const column = view.sortColumn;
  const direction = view.sortDirection;

  return [...rows].sort((a, b) => {
    const aVal = a[column];
    const bVal = b[column];

    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;

    const aNum = Number(aVal);
    const bNum = Number(bVal);

    if (!isNaN(aNum) && !isNaN(bNum)) {
      return direction === 'asc' ? aNum - bNum : bNum - aNum;
    }

    const comparison = String(aVal).localeCompare(String(bVal));
    return direction === 'asc' ? comparison : -comparison;
  });
}

function sortIndicator() {
  return '<svg class="icon icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg>';
}

function renderHead(columns) {
  dom.headRow.innerHTML = '';

  const indexHead = document.createElement('th');
  indexHead.className = 'th th-index';
  indexHead.scope = 'col';
  indexHead.textContent = '#';
  dom.headRow.appendChild(indexHead);

  columns.forEach((column) => {
    const th = document.createElement('th');
    th.className = 'th th-sortable';
    th.scope = 'col';
    th.tabIndex = 0;
    th.setAttribute('role', 'button');
    th.setAttribute('aria-label', `Sort by ${column}`);
    if (view.sortColumn === column) {
      th.setAttribute('aria-sort', view.sortDirection === 'asc' ? 'ascending' : 'descending');
      th.classList.add('is-sorted');
    }
    th.innerHTML = `<span class="th-inner">${escapeHtml(column)}${sortIndicator()}</span>`;
    th.addEventListener('click', () => handleSort(column));
    th.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        handleSort(column);
      }
    });
    dom.headRow.appendChild(th);
  });
}

function renderBody(rows, columns, startOffset) {
  dom.body.innerHTML = '';

  rows.forEach((row, index) => {
    const tr = document.createElement('tr');
    tr.className = 'tr';

    const numberCell = document.createElement('td');
    numberCell.className = 'td td-row-number';
    numberCell.textContent = String(startOffset + index + 1);
    tr.appendChild(numberCell);

    columns.forEach((column) => {
      const td = document.createElement('td');
      td.className = 'td';
      const value = row[column];
      td.textContent = value !== null && value !== undefined ? String(value) : '-';
      td.title = td.textContent;
      tr.appendChild(td);
    });

    dom.body.appendChild(tr);
  });
}

function renderPager(totalPages) {
  dom.pager.innerHTML = '';
  pageWindow(view.page, totalPages, PAGE_WINDOW).forEach((pageNum) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pager-button';
    button.textContent = String(pageNum);
    button.setAttribute('aria-label', `Page ${pageNum}`);
    if (pageNum === view.page) {
      button.classList.add('is-active');
      button.setAttribute('aria-current', 'page');
    }
    button.addEventListener('click', () => {
      view.page = pageNum;
      draw();
    });
    dom.pager.appendChild(button);
  });
}

function draw() {
  const state = currentState;
  if (!state || !state.datasetInfo || state.data.length === 0) return;

  const columns = state.datasetInfo.columns;
  const filtered = filterRows(state.data);
  const sorted = sortRows(filtered);
  const totalPages = Math.max(1, Math.ceil(sorted.length / ROWS_PER_PAGE));

  if (view.page > totalPages) view.page = totalPages;
  if (view.page < 1) view.page = 1;

  const start = (view.page - 1) * ROWS_PER_PAGE;
  const pageRows = sorted.slice(start, start + ROWS_PER_PAGE);

  renderHead(columns);
  renderBody(pageRows, columns, start);
  renderPager(totalPages);

  dom.summary.textContent = summaryText(view.page, ROWS_PER_PAGE, sorted.length);

  dom.prev.disabled = view.page === 1;
  dom.next.disabled = view.page === totalPages;
}

function handleSort(column) {
  if (view.sortColumn === column) {
    view.sortDirection = view.sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    view.sortColumn = column;
    view.sortDirection = 'asc';
  }
  draw();
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function renderTable(state) {
  currentState = state;
  const loaded = Boolean(state.datasetInfo) && state.data.length > 0;
  dom.empty.hidden = loaded;
  dom.card.hidden = !loaded;
  if (!loaded) return;

  // Reset transient view state whenever a different dataset arrives.
  const key = `${state.datasetInfo.fileName}:${state.datasetInfo.rowCount}:${state.datasetInfo.columnCount}`;
  if (key !== view.datasetKey) {
    view.datasetKey = key;
    view.page = 1;
    view.search = '';
    view.sortColumn = null;
    view.sortDirection = 'asc';
    dom.search.value = '';
  }

  draw();
}

export function initTable() {
  dom.search.addEventListener('input', (event) => {
    view.search = event.target.value;
    view.page = 1;
    draw();
  });

  dom.prev.addEventListener('click', () => {
    view.page = Math.max(1, view.page - 1);
    draw();
  });

  dom.next.addEventListener('click', () => {
    view.page += 1;
    draw();
  });
}
