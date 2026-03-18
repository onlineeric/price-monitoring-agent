const MISSING_RELATION_CODE = "42P01";
const MANUAL_REPORT_LEDGER_TABLE = "manual_report_sends";

export const MANUAL_REPORT_STORAGE_UNAVAILABLE_CODE = "manual_report_storage_unavailable";
export const MANUAL_REPORT_STORAGE_UNAVAILABLE_MESSAGE =
  "Manual report storage is not ready. Run `pnpm --filter @price-monitor/db push` and try again.";

function containsLedgerTableName(value: unknown): boolean {
  return typeof value === "string" && value.toLowerCase().includes(MANUAL_REPORT_LEDGER_TABLE);
}

function isMissingRelationError(value: unknown): value is { code: string; message?: string } {
  if (!value || typeof value !== "object") {
    return false;
  }

  return "code" in value && value.code === MISSING_RELATION_CODE;
}

export function isManualReportLedgerMissingError(error: unknown): boolean {
  let current: unknown = error;

  for (let depth = 0; depth < 6 && current; depth += 1) {
    if (typeof current !== "object") {
      return false;
    }

    const message = "message" in current ? current.message : undefined;
    const query = "query" in current ? current.query : undefined;

    if (isMissingRelationError(current) && (containsLedgerTableName(message) || containsLedgerTableName(query))) {
      return true;
    }

    if (containsLedgerTableName(message) && containsLedgerTableName(query)) {
      return true;
    }

    current = "cause" in current ? current.cause : undefined;
  }

  return false;
}
