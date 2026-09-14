import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { permissions } from "../shared/permissions";
const db = new PrismaClient();
async function main() {
  const password = process.env.SEED_PASSWORD;
  if (
    !password ||
    password.length < 12 ||
    Buffer.byteLength(password, "utf8") > 72
  )
    throw new Error(
      "SEED_PASSWORD deve ter pelo menos 12 caracteres e até 72 bytes",
    );
  const tenant = await db.tenant.upsert({
    where: { slug: "era-demo" },
    update: {},
    create: { name: "ERA Technology", slug: "era-demo" },
  });
  await db.user.upsert({
    where: {
      tenantId_email: { tenantId: tenant.id, email: "admin@era.local" },
    },
    update: {},
    create: {
      tenantId: tenant.id,
      email: "admin@era.local",
      name: "Administrador",
      passwordHash: await hash(password, 12),
      role: "TENANT_ADMIN",
      permissions: [...permissions],
    },
  });
  await db.branch.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: "MATRIZ" } },
    update: {},
    create: { tenantId: tenant.id, code: "MATRIZ", name: "Matriz" },
  });
}
main().finally(() => db.$disconnect());
