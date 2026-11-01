import type { DocumentFormat } from '../protocol/probe';

/** The rich snapshot preserves features a source format cannot represent. */
export function snapshotFormat(format: DocumentFormat): DocumentFormat {
  return format === 'csv' ? 'xlsx' : format;
}

/** The editor can defer a save without reporting an error while input is incomplete or lossy. */
export function isDeferredSave(error: unknown): boolean {
  return error instanceof Error && ['DRAFT_PENDING', 'CSV_FEATURES'].includes(error.message);
}
