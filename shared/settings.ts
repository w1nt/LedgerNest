/** Public settings contain masked credential summaries only. */
export const aiProviders = {
  deepseek: { name: "DeepSeek", baseUrl: "https://api.deepseek.com" },
  openai: { name: "OpenAI", baseUrl: "https://api.openai.com/v1" },
  anthropic: { name: "Anthropic", baseUrl: "https://api.anthropic.com" },
  custom: { name: "OpenAI-compatible", baseUrl: "" },
} as const;
export type AIProvider = keyof typeof aiProviders;
export type IntegrationKind = "plaid" | "ai";
export type IdleMinutes = 5 | 10 | 15 | 30;
export interface SettingsSnapshot {
  idleMinutes: IdleMinutes;
  plaid: {
    environment: "sandbox" | "production";
    clientId: string | null;
    secret: string | null;
    configured: boolean;
  };
  ai: {
    provider: AIProvider;
    baseUrl: string;
    model: string;
    apiKey: string | null;
    configured: boolean;
  };
}
export type IntegrationUpdate =
  | {
      kind: "plaid";
      environment: "sandbox" | "production";
      clientId: string;
      secret: string;
    }
  | {
      kind: "ai";
      provider: AIProvider;
      baseUrl: string;
      model: string;
      apiKey: string;
    };
export const emptySettings = (): SettingsSnapshot => ({
  idleMinutes: 10,
  plaid: {
    environment: "sandbox",
    clientId: null,
    secret: null,
    configured: false,
  },
  ai: {
    provider: "deepseek",
    baseUrl: aiProviders.deepseek.baseUrl,
    model: "",
    apiKey: null,
    configured: false,
  },
});
