import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import type { Request, Response } from "express";
import { PlatformService } from "../services/api/src/platform";
import { Database } from "../services/api/src/database";
import { OdooClient } from "../services/api/src/odoo";
import { OdooProvisioning } from "../services/api/src/odoo-provision";
import { PlatformGovernance, temporaryPassword } from "../services/api/src/platform-governance";

const origin = "https://erp.eratechnology.com.br";
function request(cookie?: string, requestOrigin = origin) {
  return { headers: { origin: requestOrigin, cookie }, ip: "127.0.0.1" } as unknown as Request;
}
function fixture(provision?: (input: { slug: string; name: string }) => Promise<number>) {
  const events: string[] = [];
  const tenant = { id: "d2c1277c-80fb-4bee-a2c4-6852aef93eaa", name: "Empresa A", slug: "empresa-a", active: true, createdAt: new Date() };
  const db = {
    tenant: {
      findMany: async () => [tenant],
      findUnique: async () => tenant,
      create: async ({ data }: { data: { name: string; slug: string } }) => ({ ...tenant, ...data }),
      update: async ({ data }: { data: { name?: string; active?: boolean; odooCompanyId?: number } }) => { events.push(data.odooCompanyId ? "odoo:" + data.odooCompanyId : "tenant"); return { ...tenant, ...data }; },
    },
    user: { create: async () => { events.push("user"); } },
    session: { updateMany: async () => { events.push("revoked"); } },
    auditLog: { create: async () => { events.push("audit"); } },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  const odoo = { mappedCompany: () => null };
  const provisioning = provision ? { available: true, provision } : undefined;
  return {
    service: new PlatformService(db as unknown as Database, odoo as unknown as OdooClient, provisioning as unknown as OdooProvisioning),
    events, tenant,
  };
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
async function ownerCookie(service: PlatformService) {
  process.env.PLATFORM_ADMIN_EMAIL = "owner@example.com";
  process.env.PLATFORM_ADMIN_PASSWORD = "owner-secret-not-for-production";
  process.env.PLATFORM_SESSION_SECRET = "test-platform-session-secret-longer-than-32";
  let cookie = "";
  const response = { cookie: (_name: string, value: string) => { cookie = "era_platform_session=" + value; } } as unknown as Response;
  await service.login(request(), response, { email: "owner@example.com", password: "owner-secret-not-for-production" });
  return cookie;
}
const newCompany = { name: "Cliente Novo", slug: "cliente-novo", adminName: "Ana", adminEmail: "ana@cliente.com", adminPassword: "senha-inicial-segura" };
test("new company is created in Odoo and linked to the tenant", async () => {
  const calls: string[] = [];
  const { service, events } = fixture(async (input) => { calls.push(input.slug); return 7; });
  const cookie = await ownerCookie(service);
  const created = await service.create(request(cookie), newCompany);
  assert.deepEqual(calls, ["cliente-novo"]);
  assert.equal(created.odooCompanyId, 7);
  assert.ok(events.includes("odoo:7"));
});
test("an Odoo failure keeps the ERA company and can be retried", async () => {
  let fail = true;
  const { service, tenant } = fixture(async () => { if (fail) throw new Error("Odoo fora do ar"); return 9; });
  const cookie = await ownerCookie(service);
  const created = await service.create(request(cookie), newCompany);
  assert.equal(created.odooCompanyId, null);
  assert.equal(created.odooError, "Odoo fora do ar");
  fail = false;
  assert.equal((await service.linkCompany(request(cookie), tenant.id)).odooCompanyId, 9);
});

function governance(users: Array<{ id: string; role: string; active: boolean }>) {
  const events: string[] = [];
  const audits: Array<{ action: string; after: unknown }> = [];
  const tenant = { id: "d2c1277c-80fb-4bee-a2c4-6852aef93eaa", name: "Empresa A", slug: "empresa-a", active: true, createdAt: new Date(), odooCompanyId: null };
  const find = (id: string) => users.find(u => u.id === id);
  const db = {
    tenant: {
      findUnique: async () => tenant,
      update: async ({ data }: { data: object }) => { events.push("tenant"); return { ...tenant, ...data }; },
    },
    user: {
      findFirst: async ({ where }: { where: { id: string } }) => { const u = find(where.id); return u && { ...u, name: "U", email: "u@a.com", mustChangePassword: false }; },
      count: async ({ where }: { where: { id: { not: string } } }) => users.filter(u => u.role === "TENANT_ADMIN" && u.active && u.id !== where.id.not).length,
      update: async ({ data }: { data: { passwordHash?: string; mustChangePassword?: boolean } }) => { events.push(data.passwordHash ? "password:" + data.mustChangePassword : "user"); return {}; },
    },
    session: { updateMany: async () => { events.push("revoked"); return { count: 2 }; } },
    auditLog: { create: async ({ data }: { data: { action: string; after: unknown } }) => { events.push("audit"); audits.push(data); } },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  const odoo = { mappedCompany: () => null };
  const platform = new PlatformService(db as unknown as Database, odoo as unknown as OdooClient);
  return { platform, service: new PlatformGovernance(db as unknown as Database, platform, odoo as unknown as OdooClient), events, audits, tenant };
}
const admin = "0b7f7a7e-2a43-4f5b-9e7c-6d9d1f2a3b4c";
const other = "1c8e8b8f-3b54-4a6c-8f8d-7eae2a3b4c5d";
test("suspension needs a reason, revokes sessions and is audited", async () => {
  const { platform, service, events, audits, tenant } = governance([]);
  const cookie = await ownerCookie(platform);
  await assert.rejects(service.updateCompany(request(cookie), tenant.id, { active: false }), BadRequestException);
  const changed = await service.updateCompany(request(cookie), tenant.id, { active: false, reason: "Inadimplência" });
  assert.equal(changed.active, false);
  assert.deepEqual(events, ["tenant", "revoked", "audit"]);
  assert.equal(audits[0].action, "suspend_company");
  assert.deepEqual((audits[0].after as { reason: string }).reason, "Inadimplência");
});
test("password reset returns a one-time password, forces a change and ends sessions", async () => {
  const { platform, service, events, audits, tenant } = governance([{ id: admin, role: "TENANT_ADMIN", active: true }]);
  const cookie = await ownerCookie(platform);
  const { temporaryPassword: password } = await service.resetPassword(request(cookie), tenant.id, admin, { reason: "Pedido do cliente" });
  assert.equal(password.length, 16);
  assert.deepEqual(events, ["password:true", "revoked", "audit"]);
  assert.equal(JSON.stringify(audits).includes(password), false);
  assert.match(temporaryPassword(), /^[A-HJ-NP-Za-km-z2-9]{16}$/);
});
test("the last active company admin cannot be blocked or demoted", async () => {
  const { platform, service, tenant } = governance([{ id: admin, role: "TENANT_ADMIN", active: true }, { id: other, role: "OPERATOR", active: true }]);
  const cookie = await ownerCookie(platform);
  await assert.rejects(service.updateUser(request(cookie), tenant.id, admin, { active: false, reason: "Saiu da empresa" }), ForbiddenException);
  await assert.rejects(service.updateUser(request(cookie), tenant.id, admin, { role: "OPERATOR" }), ForbiddenException);
  await assert.rejects(service.updateUser(request(cookie), tenant.id, other, { active: false }), BadRequestException);
  await service.updateUser(request(cookie), tenant.id, other, { active: false, reason: "Saiu da empresa" });
});
