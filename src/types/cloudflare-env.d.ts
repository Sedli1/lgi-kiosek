declare global {
  interface CloudflareEnv {
    DB: D1Database;
    TWILIO_ACCOUNT_SID?: string;
    TWILIO_AUTH_TOKEN?: string;
    TWILIO_FROM?: string;
    OPERATOR_PASSWORD?: string;
  }
}

export {};
