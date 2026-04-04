declare global {
  interface CloudflareEnv {
    DB: D1Database;
    SMSAPI_TOKEN?: string;
    OPERATOR_PASSWORD?: string;
  }
}

export {};
