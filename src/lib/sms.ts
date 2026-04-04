export { buildConfirmSms, buildRampSms, type Lang } from "./sms-client";

export async function sendSms(phone: string, message: string): Promise<void> {
  // Import lazily so the module is usable in edge runtime
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const { env } = await getCloudflareContext({ async: true });
  const token = env.SMSAPI_TOKEN;

  if (!token || token === "your_token_here") {
    console.log(`[SMS MOCK] To: ${phone}\n${message}`);
    return;
  }

  const params = new URLSearchParams({
    access_token: token,
    to: phone,
    message,
    from: "LGI",
    format: "json",
    encoding: "utf-8",
  });

  const res = await fetch("https://api.smsapi.pl/sms.do", {
    method: "POST",
    body: params,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`SMSAPI error: ${res.status} ${text}`);
  }
}
