/**
 * Dataset store — replaces the React context in `src/context/DataContext.tsx`.
 *
 * Same three pieces of state (`data`, `datasetInfo`, `isLoading`) with the same
 * in-memory lifetime: a reload starts empty, exactly like the original app.
 * Views subscribe and re-render when the state changes.
 */

const state = {
  data: [],
  datasetInfo: null,
  isLoading: false,
  /** Build-time statistics for the bundled sample dataset, when it is loaded. */
  precomputed: null,
};

const listeners = new Set();

export function getState() {
  return state;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach((listener) => listener(state));
}

export function setIsLoading(isLoading) {
  state.isLoading = isLoading;
  notify();
}

/**
 * @param {Array<object>} data
 * @param {{fileName: string, rowCount: number, columnCount: number, columns: string[], uploadedAt: Date}} info
 * @param {object|null} precomputed optional build-time stats payload
 */
export function setDataset(data, info, precomputed = null) {
  state.data = data;
  state.datasetInfo = info;
  state.precomputed = precomputed;
  notify();
}

export function clearDataset() {
  state.data = [];
  state.datasetInfo = null;
  state.precomputed = null;
  notify();
}

export function hasData() {
  return state.datasetInfo !== null && state.data.length > 0;
}
