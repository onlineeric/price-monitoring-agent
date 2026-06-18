/**
 * Well-known keys for the `settings` key/value table.
 *
 * Defined here in the shared package so the writer (worker) and the readers
 * (web API routes) reference the exact same string and can never drift.
 */

/**
 * ISO-8601 timestamp stamped each time a bulk "Check All" digest batch finishes
 * refreshing every product. The dashboard reads this to reveal a "refresh
 * available" signal once a batch it triggered has completed (feature: B1).
 */
export const SETTING_LAST_BULK_REFRESH_COMPLETED_AT = "last_bulk_refresh_completed_at";
