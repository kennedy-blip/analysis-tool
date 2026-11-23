/**
 * Pagination window — pure logic extracted from `src/components/DataTable.tsx`
 * so the five-slot pager can be unit-tested without a DOM.
 */

export const DEFAULT_PAGE_WINDOW = 5;

/**
 * Reproduces the original expression:
 *
 *   if (totalPages <= 5)            pageNum = i + 1
 *   else if (currentPage <= 3)      pageNum = i + 1
 *   else if (currentPage >= total-2) pageNum = total - 4 + i
 *   else                            pageNum = current - 2 + i
 *
 * @param {number} currentPage 1-based
 * @param {number} totalPages
 * @param {number} [size]
 * @returns {number[]}
 */
export function pageWindow(currentPage, totalPages, size = DEFAULT_PAGE_WINDOW) {
  const slots = Math.min(size, totalPages);
  const pages = [];

  for (let i = 0; i < slots; i++) {
    let pageNum;
    if (totalPages <= size) {
      pageNum = i + 1;
    } else if (currentPage <= 3) {
      pageNum = i + 1;
    } else if (currentPage >= totalPages - 2) {
      pageNum = totalPages - (size - 1) + i;
    } else {
      pageNum = currentPage - 2 + i;
    }
    pages.push(pageNum);
  }

  return pages;
}

/** `Showing X - Y of Z rows` (DataTable.tsx). */
export function summaryText(currentPage, rowsPerPage, totalRows) {
  if (totalRows === 0) return 'Showing 0 - 0 of 0 rows';
  const start = (currentPage - 1) * rowsPerPage + 1;
  const end = Math.min(currentPage * rowsPerPage, totalRows);
  return `Showing ${start} - ${end} of ${totalRows} rows`;
}
