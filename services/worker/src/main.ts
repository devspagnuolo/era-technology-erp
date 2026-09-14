import { PrismaClient } from "@prisma/client";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
const db = new PrismaClient();
const connection = new IORedis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  { maxRetriesPerRequest: null },
);
const queue = new Queue("era-domain-events", { connection });
const worker = new Worker(
  "era-domain-events",
  async (job) => {
    const { tenantId, type } = job.data as { tenantId: string; type: string };
    if (!tenantId) throw new Error("Evento sem tenant");
    if (type !== "product.created.v1")
      throw new Error("Evento sem consumidor: " + type);
    // DEL é idempotente: uma nova entrega não duplica efeitos de negócio.
    await connection.del("tenant:" + tenantId + ":catalog-summary");
  },
  { connection, concurrency: 5 },
);
worker.on("failed", (job, error) =>
  console.error("event.failed", { jobId: job?.id, message: error.message }),
);
let stopping = false;
async function relay() {
  while (!stopping) {
    try {
      // Leitura global restrita ao processo interno de entrega, nunca exposta em HTTP.
      const events = await db.outboxEvent.findMany({
        where: { publishedAt: null },
        orderBy: { createdAt: "asc" },
        take: 100,
      });
      for (const event of events) {
        await queue.add(
          event.type,
          {
            id: event.id,
            tenantId: event.tenantId,
            type: event.type,
            version: 1,
            occurredAt: event.createdAt.toISOString(),
            payload: event.payload,
          },
          {
            jobId: event.id,
            attempts: 8,
            backoff: { type: "exponential", delay: 1000 },
            removeOnComplete: false,
            removeOnFail: false,
          },
        );
        await db.outboxEvent.updateMany({
          where: { id: event.id, tenantId: event.tenantId, publishedAt: null },
          data: { publishedAt: new Date() },
        });
      }
    } catch (error) {
      console.error(
        "outbox.relay.failed",
        error instanceof Error ? error.message : "Erro desconhecido",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
async function stop() {
  if (stopping) return;
  stopping = true;
  await delivery;
  await worker.close();
  await queue.close();
  await connection.quit();
  await db.$disconnect();
}
const delivery = relay();
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
