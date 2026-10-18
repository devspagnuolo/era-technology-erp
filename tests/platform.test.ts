import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { Request, Response } from "express";
import { PlatformService } from "../services/api/src/platform";
import { Database } from "../services/api/src/database";

const origin = "https://erp.eratechnology.com.br";
function request(cookie?: string, requestOrigin = origin) {
  return { headers: { origin: requestOrigin, cookie }, ip: "127.0.0.1" } as unknown as Request;
}
function fixture() {
  const events: string[] = [];
  const tenant = { id: "d2c1277c-80fb-4bee-a2c4-6852aef93eaa", name: "Empresa A", slug: "empresa-a", active: true, createdAt: new Date() };
  const db = {
    tenant: {
      findMany: async () => [tenant],
      findUnique: async () => tenant,
      create: async ({ data }: { data: { name: string; slug: string } }) => ({ ...tenant, ...data }),
      update: async ({ data }: { data: { name?: string; active?: boolean } }) => { events.push("tenant"); return { ...tenant, ...data }; },
    },
    user: { create: async () => { events.push("user"); } },
    session: { updateMany: async () => { events.push("revoked"); } },
    auditLog: { create: async () => { events.push("audit"); } },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return { service: new PlatformService(db as unknown as Database), events, tenant };
}
test("tenant cookie cannot authorize platform", () => {
  process.env.PLATFORM_ADMIN_EMAIL = "owner@example.com";
  process.env.PLATFORM_SESSION_SECRET = "test-platform-session-secret-longer-than-32";
  const { service } = fixture();
  assert.throws(() => service.authorize(request("era_platform_session=tenant-jwt")), UnauthorizedException);
});
test("owner session is isolated and cross-origin writes are rejected", async () => {
  process.env.PLATFORM_ADMIN_EMAIL = "owner@example.com";
  process.env.PLATFORM_ADMIN_PASSWORD = "owner-secret-not-for-production";
  process.env.PLATFORM_SESSION_SECRET = "test-platform-session-secret-longer-than-32";
  const { service } = fixture();
  let cookie = "";
  const response = { cookie: (_name: string, value: string) => { cookie = "era_platform_session=" + value; } } as unknown as Response;
  await service.login(request(), response, { email: "owner@example.com", password: "owner-secret-not-for-production" });
  assert.equal(service.authorize(request(cookie)), "owner@example.com");
  assert.throws(() => service.authorize(request(cookie, "https://attacker.example"), true), ForbiddenException);
  assert.equal((await service.companies(request(cookie))).length, 1);
  assert.equal(cookie.includes("owner-secret"), false);
});
test("suspension revokes tenant sessions and records an audit event", async () => {
  process.env.PLATFORM_ADMIN_EMAIL = "owner@example.com";
  process.env.PLATFORM_ADMIN_PASSWORD = "owner-secret-not-for-production";
  process.env.PLATFORM_SESSION_SECRET = "test-platform-session-secret-longer-than-32";
  const { service, events, tenant } = fixture();
  let cookie = "";
  const response = { cookie: (_name: string, value: string) => { cookie = "era_platform_session=" + value; } } as unknown as Response;
  await service.login(request(), response, { email: "owner@example.com", password: "owner-secret-not-for-production" });
  const changed = await service.update(request(cookie), tenant.id, { active: false });
  assert.equal(changed.active, false);
  assert.deepEqual(events, ["tenant", "revoked", "audit"]);
});
