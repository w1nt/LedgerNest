export type ExportFormat = "csv" | "json";
export interface BackupLocation { directory: string | null }
export interface DataResult { fileName: string; records: number }
