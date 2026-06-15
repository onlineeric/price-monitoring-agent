/**
 * Shared error-formatting helper.
 *
 * Lives in a dependency-free leaf module so both the DB service and the job
 * utilities can use the same implementation without forking it or creating an
 * import cycle (jobUtils already depends on the DB service).
 */

/** Format an unknown thrown value into a log-friendly message. */
export function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
