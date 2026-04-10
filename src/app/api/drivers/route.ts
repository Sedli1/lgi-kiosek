import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { drivers, smsLogs, auditLogs } from "@/db/schema";
import { buildConfirmSms, Lang } from "@/lib/sms";
import { requireOperator } from "@/lib/auth";
import { desc, eq } from "drizzle-orm";

const VALID_TYPES = new Set(["vyklada", "naklada", "obe"]);
const VALID_LANGS = new Set(["cs", "sk", "pl", "de"]);

function sanitize(s: string): string {
  return s.replace(/<[^>]*>/g, "").trim();
}

// Per-isolate rate limiter: max 5 registrations per IP per minute
const rlMap = new Map<string, number[]>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (rlMap.get(ip) ?? []).filter((t) => t > now - 60_000);
  if (hits.length >= 5) return true;
  hits.push(now);
  rlMap.set(ip, hits);
  return false;
}

export async function GET(req: NextRequest) {
  const denied = await requireOperator(req);
  if (denied) return denied;

  const db = await getDb();
  const rows = await db.select().from(drivers).orderBy(desc(drivers.createdAt));

  const logs = await db.select().from(smsLogs);
  const logsByDriver: Record<number, typeof logs> = {};
  for (const log of logs) {
    (logsByDriver[log.driverId] ??= []).push(log);
  }

  const result = rows.map((d) => ({
    ...d,
    smsLogs: (logsByDriver[d.id] ?? []).sort(
      (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
    ),
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  // Use only Cloudflare's verified IP — not spoofable x-forwarded-for
  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";

  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = (await req.json()) as Record<string, string>;
  const { name, phone, spz, firm, order, type, lang } = body;

  // Presence check
  if (!name || !phone || !spz || !firm || !type || !lang) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Whitelist enums
  if (!VALID_TYPES.has(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
  if (!VALID_LANGS.has(lang)) {
    return NextResponse.json({ error: "Invalid lang" }, { status: 400 });
  }

  // Length limits to prevent abuse
  if (name.length > 100 || phone.length > 30 || spz.length > 20 || firm.length > 100 || (order && order.length > 100)) {
    return NextResponse.json({ error: "Field too long" }, { status: 400 });
  }

  // SPZ: 2–15 alphanumeric chars, spaces or hyphens allowed
  if (!/^[A-Za-z0-9][A-Za-z0-9 \-]{0,13}[A-Za-z0-9]$|^[A-Za-z0-9]{2}$/.test(spz.trim())) {
    return NextResponse.json({ error: "Invalid SPZ format" }, { status: 400 });
  }

  const db = await getDb();
  const count = await db.$count(drivers);
  const num = count + 1;

  const [driver] = await db
    .insert(drivers)
    .values({ num, name: sanitize(name), phone: sanitize(phone), spz: sanitize(spz).toUpperCase(), firm: sanitize(firm), order: order ? sanitize(order) || null : null, type, lang })
    .returning();

  // Write audit log
  db.insert(auditLogs)
    .values({ driverId: driver.id, action: "created", ramp: null, note: null, operatorName: null })
    .catch((err) => console.error("Audit log failed:", err));

  const message = buildConfirmSms(lang as Lang, num);

  return NextResponse.json({ ...driver, confirmSms: message }, { status: 201 });
}
