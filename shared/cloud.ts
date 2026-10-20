export type CloudError = "auth" | "network" | "quota" | "remote" | "config" | "canceled";
export interface CloudSettingsInput {
  enabled: boolean;
  automatic: boolean;
  intervalHours: number;
  folderName: string;
  filePrefix: string;
  password: string;
  confirmation: string;
  rememberConfirmed: boolean;
}
export interface CloudState {
  configured: boolean;
  clientId: string | null;
  clientSecret: string | null;
  connected: boolean;
  enabled: boolean;
  automatic: boolean;
  intervalHours: number;
  folderName: string;
  filePrefix: string;
  passwordSet: boolean;
  lastSuccessAt: string | null;
  nextSyncAt: string | null;
  lastError: CloudError | null;
  phase: "idle" | "authorizing" | "encrypting" | "uploading" | "listing" | "downloading";
  progress: number;
}
export interface CloudFile { id: string; name: string; createdTime: string; size: number }
