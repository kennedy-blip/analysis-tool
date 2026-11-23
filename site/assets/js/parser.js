/**
 * File parsing — port of the `processFile` routine in `src/components/FileUpload.tsx`.
 *
 * SheetJS is vendored at `assets/vendor/xlsx.full.min.js` (the same 0.18.5 build
 * the legacy `xlsx` dependency resolved to) and exposed as the global `XLSX`.
 * Parsing still happens entirely in the browser, so uploaded data never leaves
 * the machine — the behaviour the README advertises.
 */

import { setDataset, setIsLoading } from './store.js';

const config = window.DATALENS_CONFIG;

export class UploadError extends Error {}

/**
 * @param {File} file
 * @returns {Promise<{rowCount: number, columnCount: number}>}
 */
export async function processFile(file) {
  setIsLoading(true);

  try {
    const extension = file.name.split('.').pop()?.toLowerCase();

    if (!config.upload.extensions.includes(extension || '')) {
      throw new UploadError(config.upload.errors.unsupported);
    }

    if (typeof window.XLSX === 'undefined') {
      throw new UploadError('The spreadsheet parser failed to load. Please refresh the page.');
    }

    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = window.XLSX.utils.sheet_to_json(worksheet);

    if (jsonData.length === 0) {
      throw new UploadError(config.upload.errors.empty);
    }

    const columns = Object.keys(jsonData[0]);

    setDataset(jsonData, {
      fileName: file.name,
      rowCount: jsonData.length,
      columnCount: columns.length,
      columns,
      uploadedAt: new Date(),
    });

    return { rowCount: jsonData.length, columnCount: columns.length };
  } finally {
    setIsLoading(false);
  }
}

/**
 * Load the bundled sample dataset from the static JSON produced by
 * `site/build.py` (deterministic, seeded — see `site/sample.py`).
 */
export async function loadSampleDataset() {
  setIsLoading(true);

  try {
    const response = await fetch(config.sampleDataset.url, { cache: 'no-cache' });
    if (!response.ok) {
      throw new UploadError(`Could not load the sample dataset (HTTP ${response.status})`);
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      throw new UploadError(config.upload.errors.empty);
    }

    const columns = Object.keys(data[0]);

    setDataset(
      data,
      {
        fileName: config.sampleDataset.displayName,
        rowCount: data.length,
        columnCount: columns.length,
        columns,
        uploadedAt: new Date(),
      },
      readPrecomputedStats()
    );

    return { rowCount: data.length, columnCount: columns.length };
  } catch (error) {
    if (error instanceof UploadError) throw error;
    throw new UploadError(error instanceof Error ? error.message : config.upload.errors.generic);
  } finally {
    setIsLoading(false);
  }
}

/** Statistics embedded in the page at build time (`views/statistics.html.j2`). */
export function readPrecomputedStats() {
  const node = document.querySelector(config.sampleDataset.statsSelector);
  if (!node) return null;
  try {
    return JSON.parse(node.textContent);
  } catch {
    return null;
  }
}
