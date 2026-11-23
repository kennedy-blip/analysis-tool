/**
 * Overview view — port of `src/components/DataOverview.tsx` and
 * `src/components/FileUpload.tsx`.
 */

import { clearDataset } from '../store.js';
import { loadSampleDataset, processFile, UploadError } from '../parser.js';

const config = window.DATALENS_CONFIG;

const dom = {
  loading: document.getElementById('overview-loading'),
  empty: document.getElementById('overview-empty'),
  loaded: document.getElementById('overview-loaded'),
  datasetName: document.getElementById('dataset-name'),
  metricRows: document.getElementById('metric-rows'),
  metricColumns: document.getElementById('metric-columns'),
  metricUploaded: document.getElementById('metric-uploaded'),
  metricSize: document.getElementById('metric-size'),
  columnChips: document.getElementById('column-chips'),
  sampleButton: document.getElementById('generate-sample'),
  clearButton: document.getElementById('clear-data'),
};

function show(node) {
  if (node) node.hidden = false;
}

function hide(node) {
  if (node) node.hidden = true;
}

/** `(JSON.stringify(data).length / 1024).toFixed(2)` from DataOverview.tsx */
export function estimatedSizeKb(data) {
  return data.length > 0 ? (JSON.stringify(data).length / 1024).toFixed(2) : '0';
}

export function renderOverview(state) {
  if (state.isLoading) {
    show(dom.loading);
    hide(dom.empty);
    hide(dom.loaded);
    return;
  }

  hide(dom.loading);

  const loaded = state.datasetInfo && state.data.length > 0;
  if (!loaded) {
    show(dom.empty);
    hide(dom.loaded);
    return;
  }

  hide(dom.empty);
  show(dom.loaded);

  const info = state.datasetInfo;
  dom.datasetName.textContent = info.fileName;
  dom.metricRows.textContent = info.rowCount.toLocaleString();
  dom.metricColumns.textContent = String(info.columnCount);
  dom.metricUploaded.textContent = info.uploadedAt.toLocaleTimeString();
  dom.metricSize.textContent = `~${estimatedSizeKb(state.data)} KB`;

  dom.columnChips.innerHTML = '';
  info.columns.forEach((column, index) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = `${index + 1}. ${column}`;
    dom.columnChips.appendChild(chip);
  });
}

function showError(zone, message) {
  const alert = document.querySelector(`[data-upload-error="${zone}"]`);
  if (!alert) return;
  alert.querySelector('.alert-text').textContent = message;
  alert.hidden = false;
}

function clearError(zone) {
  const alert = document.querySelector(`[data-upload-error="${zone}"]`);
  if (alert) alert.hidden = true;
}

function bindUploadZone(zone) {
  const dropzone = document.getElementById(`dropzone-${zone}`);
  const input = document.querySelector(`[data-upload-input="${zone}"]`);
  const badge = document.querySelector(`[data-upload-badge="${zone}"]`);
  const title = document.querySelector(`[data-upload-title="${zone}"]`);
  if (!dropzone || !input) return;

  const setDragActive = (active) => {
    dropzone.classList.toggle('is-dragging', active);
    if (badge) badge.classList.toggle('is-dragging', active);
    if (title) title.textContent = active ? config.upload.dropTitle : config.upload.title;
  };

  ['dragenter', 'dragover'].forEach((type) =>
    dropzone.addEventListener(type, (event) => {
      event.preventDefault();
      event.stopPropagation();
      setDragActive(true);
    })
  );

  dropzone.addEventListener('dragleave', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
  });

  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) handleFile(zone, file);
  });

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) handleFile(zone, file);
    input.value = '';
  });

  const alert = document.querySelector(`[data-upload-error="${zone}"]`);
  alert?.querySelector('.alert-close')?.addEventListener('click', () => clearError(zone));
}

async function handleFile(zone, file) {
  clearError(zone);
  try {
    await processFile(file);
  } catch (error) {
    showError(zone, error instanceof Error ? error.message : config.upload.errors.generic);
  }
}

async function handleSample() {
  clearError('welcome');
  dom.sampleButton.disabled = true;
  try {
    await loadSampleDataset();
  } catch (error) {
    const message =
      error instanceof UploadError ? error.message : config.upload.errors.generic;
    showError('welcome', message);
  } finally {
    dom.sampleButton.disabled = false;
  }
}

export function initOverview() {
  bindUploadZone('welcome');
  bindUploadZone('replace');

  dom.sampleButton?.addEventListener('click', handleSample);
  dom.clearButton?.addEventListener('click', () => {
    clearDataset();
    document.dispatchEvent(new CustomEvent('datalens:dataset-cleared'));
  });
}