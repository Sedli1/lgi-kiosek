import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { drivers, ramps, auditLogs } from "@/db/schema";
import { requireOperator } from "@/lib/auth";
import { desc } from "drizzle-orm";

// SSE endpoint: sends updates every 2s for up to 25s, then closes.
// EventSource on the client auto-reconnects, giving near-realtime updates.
export async function GET(req: NextRequest) {
  const denied = await requireOperator(req);
  if (denied) return denied;

  const encoder = new TextEncoder();
  let closed = false;

  const fetchSnapshot = async () => {
    const db = await getDb();
    const [driversData, rampsData, auditData] = await Promise.all([
      db.select().from(drivers).orderBy(desc(drivers.createdAt)),
      db.select().from(ramps).orderBy(ramps.name),
      db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(50),
    ]);
    return { drivers: driversData, ramps: rampsData, auditLogs: auditData };
  };

  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => {
        if (closed) return;
        try {
          const snapshot = await fetchSnapshot();
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(snapshot)}\n\n`)
          );
        } catch (e) {
          console.error("SSE fetch error:", e);
        }
      };

      await send();

      // Send updates every 2s, max 12 iterations (24s), then let client reconnect
      for (let i = 0; i < 12 && !closed; i++) {
        await new Promise<void>((resolve) => setTimeout(resolve, 2000));
        await send();
      }

      if (!closed) {
        try { controller.close(); } catch {}
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
