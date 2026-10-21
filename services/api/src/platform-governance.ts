import { Body, Controller, Get, Param, Patch, Post, Req, BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomInt } from "node:crypto";
import { z } from "zod";
import type { Request } from "express";
import { Database } from "./database";
import { OdooClient } from "./odoo";
import { FormOptions, OdooForms } from "./odoo-form";
import { forAudit } from "./odoo-records";
import { Public, parse } from "./auth";
import { PlatformService } from "./platform";
import { rolePresets } from "../../../packages/shared/permissions";

// Governança do proprietário sobre cada empresa cliente: cadastro completo
// (ERA e empresa do Odoo), usuários, senhas, sessões e trilha de auditoria.
// Toda alteração fica registrada com quem fez, de onde e o motivo informado.

const ADMIN = "TENANT_ADMIN";
const reason = z.string().trim().min(3, "Informe o motivo").max(300);
const role = z.string().refine(v => Object.hasOwn(rolePresets, v), "Perfil inválido");
const email = z.string().email().max(200).transform(v => v.toLowerCase());
const userCreate = z.object({ name: z.string().trim().min(2).max(120), email, role }).strict();
const userUpdate = z.object({
  name: z.string().trim().min(2).max(120).optional(), email: email.optional(), role: role.optional(),
  active: z.boolean().optional(), reason: reason.optional(),
}).strict().refine(v => Object.keys(v).some(k => k !== "reason"), "Nada para alterar");
const reasonOnly = z.object({ reason }).strict();
// Hierarquia e moeda da empresa no Odoo são definidas no cadastro da ERA.
const COMPANY_FORM: FormOptions = { locked: ["parent_id", "child_ids", "currency_id"] };
const userSelect = { id: true, name: true, email: true, role: true, active: true, mustChangePassword: true } as const;
// Sem caracteres ambíguos (0/O, 1/l/I) para ditar a senha sem erro.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
export function temporaryPassword(length = 16) {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

@Injectable()
export class PlatformGovernance {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(PlatformService) private platform: PlatformService,
    @Inject(OdooClient) private odoo: OdooClient,
    @Inject(OdooForms) private forms?: OdooForms,
  ) {}

  private async tenant(id: string) {
    if (!z.string().uuid().safeParse(id).success) throw new BadRequestException("Empresa inválida");
    const tenant = await this.db.tenant.findUnique({ where: { id },
      select: { id: true, name: true, slug: true, active: true, createdAt: true, odooCompanyId: true, settings: true } });
    if (!tenant) throw new NotFoundException("Empresa não encontrada");
    return { ...tenant, odooCompanyId: tenant.odooCompanyId ?? this.odoo?.mappedCompany(tenant.slug) ?? null };
  }
  private audit(req: Request, actor: string, tenantId: string, action: string, recordId: string, before: unknown, after: unknown) {
    return this.db.auditLog.create({ data: {
      tenantId, actorId: actor, ip: req.ip ?? "unknown", module: "platform", action, recordId,
      before: before === null ? Prisma.JsonNull : (before as Prisma.InputJsonValue),
      after: after === null ? Prisma.JsonNull : (after as Prisma.InputJsonValue),
    } });
  }

  async detail(req: Request, id: string) {
    this.platform.authorize(req);
    const tenant = await this.tenant(id);
    const now = new Date();
    const [users, sessions, audit] = await Promise.all([
      this.db.user.findMany({ where: { tenantId: id }, select: userSelect, orderBy: { name: "asc" } }),
      this.db.session.groupBy({ by: ["userId"], where: { tenantId: id, revokedAt: null, expiresAt: { gt: now } }, _count: { _all: true } }),
      this.db.auditLog.findMany({ where: { tenantId: id }, orderBy: { createdAt: "desc" }, take: 100,
        select: { id: true, actorId: true, module: true, action: true, recordId: true, ip: true, before: true, after: true, createdAt: true } }),
    ]);
    const open = new Map(sessions.map(s => [s.userId, s._count._all]));
    const names = new Map(users.map(u => [u.id, u.name]));
    return {
      company: tenant,
      users: users.map(u => ({ ...u, sessions: open.get(u.id) ?? 0 })),
      roles: Object.entries(rolePresets).map(([key, value]) => ({ key, label: value.label })),
      activity: audit.map(a => ({ ...a, actor: names.get(a.actorId) ?? a.actorId })),
    };
  }

  // Dados da ERA: nome e endereço de acesso. O nome acompanha a empresa do Odoo.
  async updateCompany(req: Request, id: string, raw: unknown) {
    const actor = this.platform.authorize(req, true);
    const input = parse(z.object({
      name: z.string().trim().min(2).max(120).optional(),
      slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(60).optional(),
      active: z.boolean().optional(),
      reason: reason.optional(),
    }).strict(), raw);
    const before = await this.tenant(id);
    if (input.active === false && !input.reason) throw new BadRequestException("Informe o motivo da suspensão");
    if (input.slug && input.slug !== before.slug && !this.platform.slugAllowed(input.slug))
      throw new BadRequestException("Endereço reservado");
    const data = {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.slug !== undefined && { slug: input.slug }),
      ...(input.active !== undefined && { active: input.active }),
      // O vínculo por ODOO_TENANT_COMPANIES depende do endereço; ao trocar, fica gravado.
      ...(input.slug && input.slug !== before.slug && before.odooCompanyId && { odooCompanyId: before.odooCompanyId }),
    };
    if (!Object.keys(data).length) throw new BadRequestException("Nada para alterar");
    let after;
    try {
      after = await this.db.$transaction(async tx => {
        const tenant = await tx.tenant.update({ where: { id }, data,
          select: { id: true, name: true, slug: true, active: true, createdAt: true, odooCompanyId: true } });
        if (input.active === false)
          await tx.session.updateMany({ where: { tenantId: id, revokedAt: null }, data: { revokedAt: new Date() } });
        return tenant;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new ConflictException("Endereço já usado por outra empresa");
      throw error;
    }
    const action = input.active === undefined ? "update_company" : input.active ? "activate_company" : "suspend_company";
    await this.audit(req, actor, id, action, id,
      { name: before.name, slug: before.slug, active: before.active },
      { name: after.name, slug: after.slug, active: after.active, reason: input.reason ?? null });
    let odooError: string | null = null;
    if (input.name && input.name !== before.name && before.odooCompanyId)
      await this.odoo.execute(before.odooCompanyId, "res.company", "write", [[before.odooCompanyId], { name: input.name }])
        .catch(error => { odooError = error instanceof Error ? error.message : "Falha ao atualizar o Odoo"; });
    return { ...after, odooError };
  }

  // Cadastro completo da empresa no Odoo (CNPJ, endereço, inscrições etc.).
  private async odooCompany(id: string) {
    const tenant = await this.tenant(id);
    if (!tenant.odooCompanyId) throw new BadRequestException("Empresa ainda não criada no Odoo");
    if (!this.forms) throw new BadRequestException("Integração Odoo não configurada");
    const companyId = tenant.odooCompanyId;
    const schema = await this.forms.schema(companyId, "res.company", COMPANY_FORM);
    return { tenant, companyId, schema, forms: this.forms };
  }
  async companyForm(req: Request, id: string) {
    this.platform.authorize(req);
    const { companyId, schema, forms } = await this.odooCompany(id);
    const values = await forms.read(companyId, schema, [["id", "=", companyId]]);
    if (!values) throw new NotFoundException("Empresa não encontrada no Odoo");
    return { schema, values };
  }
  async companyOnchange(req: Request, id: string, body: unknown) {
    this.platform.authorize(req, true);
    const { companyId, schema, forms } = await this.odooCompany(id);
    return forms.onchange(companyId, schema, body, companyId);
  }
  async companyLookup(req: Request, id: string, body: unknown) {
    this.platform.authorize(req, true);
    const { companyId, schema, forms } = await this.odooCompany(id);
    return forms.lookup(companyId, schema, body);
  }
  async saveCompanyForm(req: Request, id: string, raw: unknown) {
    const actor = this.platform.authorize(req, true);
    const { tenant, companyId, schema, forms } = await this.odooCompany(id);
    const before = await forms.read(companyId, schema, [["id", "=", companyId]]);
    if (!before) throw new NotFoundException("Empresa não encontrada no Odoo");
    const values = await forms.values(companyId, schema, ((raw ?? {}) as { values?: unknown }).values ?? {}, before);
    if (Object.keys(values).length)
      await forms.call(companyId, "res.company", "write", [[companyId], values], {});
    const after = (await forms.read(companyId, schema, [["id", "=", companyId]]))!;
    if (typeof after.name === "string" && after.name.trim().length >= 2 && after.name !== tenant.name)
      await this.db.tenant.update({ where: { id }, data: { name: after.name.trim().slice(0, 120) } });
    await this.audit(req, actor, id, "update_odoo_company", String(companyId), forAudit(before), forAudit(after));
    return after;
  }

  async createUser(req: Request, id: string, raw: unknown) {
    const actor = this.platform.authorize(req, true);
    const input = parse(userCreate, raw);
    await this.tenant(id);
    const password = temporaryPassword();
    try {
      const user = await this.db.user.create({ data: {
        tenantId: id, name: input.name, email: input.email, role: input.role,
        permissions: rolePresets[input.role].permissions, passwordHash: await hash(password, 12), mustChangePassword: true,
      }, select: userSelect });
      await this.audit(req, actor, id, "create_user", user.id, null, user);
      return { user, temporaryPassword: password };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new ConflictException("E-mail já cadastrado nesta empresa");
      throw error;
    }
  }

  private async user(tenantId: string, userId: string) {
    if (!z.string().uuid().safeParse(userId).success) throw new BadRequestException("Usuário inválido");
    const user = await this.db.user.findFirst({ where: { id: userId, tenantId }, select: userSelect });
    if (!user) throw new NotFoundException("Usuário não encontrado");
    return user;
  }
  // A empresa nunca fica sem um administrador ativo.
  private async keepAdmin(tenantId: string, userId: string) {
    const others = await this.db.user.count({ where: { tenantId, role: ADMIN, active: true, id: { not: userId } } });
    if (!others) throw new ForbiddenException("A empresa precisa de ao menos um administrador ativo");
  }

  async updateUser(req: Request, id: string, userId: string, raw: unknown) {
    const actor = this.platform.authorize(req, true);
    const input = parse(userUpdate, raw);
    await this.tenant(id);
    const before = await this.user(id, userId);
    if (input.active === false && before.active && !input.reason) throw new BadRequestException("Informe o motivo do bloqueio");
    const losesAdmin = before.role === ADMIN && before.active &&
      ((input.role !== undefined && input.role !== ADMIN) || input.active === false);
    if (losesAdmin) await this.keepAdmin(id, userId);
    const { reason: why, ...change } = input;
    let after;
    try {
      after = await this.db.$transaction(async tx => {
        const user = await tx.user.update({ where: { tenantId_id: { tenantId: id, id: userId } }, select: userSelect, data: {
          ...change, ...(input.role !== undefined && { permissions: rolePresets[input.role].permissions }),
        } });
        // Bloqueio, troca de perfil ou de e-mail encerram as sessões abertas.
        if (input.active === false || (input.role && input.role !== before.role) || (input.email && input.email !== before.email))
          await tx.session.updateMany({ where: { tenantId: id, userId, revokedAt: null }, data: { revokedAt: new Date() } });
        return user;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new ConflictException("E-mail já cadastrado nesta empresa");
      throw error;
    }
    const action = input.active === false && before.active ? "deactivate_user" : input.active && !before.active ? "activate_user" : "update_user";
    await this.audit(req, actor, id, action, userId, before, { ...after, reason: why ?? null });
    return after;
  }

  // Nova senha temporária: mostrada uma única vez ao proprietário, guardada só
  // como hash, encerra as sessões e obriga a troca no próximo acesso.
  async resetPassword(req: Request, id: string, userId: string, raw: unknown) {
    const actor = this.platform.authorize(req, true);
    const { reason: why } = parse(reasonOnly, raw);
    await this.tenant(id);
    const user = await this.user(id, userId);
    const password = temporaryPassword();
    const passwordHash = await hash(password, 12);
    await this.db.$transaction(async tx => {
      await tx.user.update({ where: { tenantId_id: { tenantId: id, id: userId } }, data: { passwordHash, mustChangePassword: true } });
      await tx.session.updateMany({ where: { tenantId: id, userId, revokedAt: null }, data: { revokedAt: new Date() } });
    });
    await this.audit(req, actor, id, "reset_password", userId, null, { email: user.email, reason: why });
    return { temporaryPassword: password };
  }

  async revokeSessions(req: Request, id: string, raw: unknown) {
    const actor = this.platform.authorize(req, true);
    const { reason: why } = parse(reasonOnly, raw);
    await this.tenant(id);
    const { count } = await this.db.session.updateMany({ where: { tenantId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await this.audit(req, actor, id, "revoke_sessions", id, null, { sessions: count, reason: why });
    return { revoked: count };
  }
}

@Public()
@Controller("platform")
export class PlatformGovernanceController {
  constructor(@Inject(PlatformGovernance) private governance: PlatformGovernance) {}
  @Get("companies/:id") detail(@Req() req: Request, @Param("id") id: string) {
    return this.governance.detail(req, id);
  }
  @Patch("companies/:id") update(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.governance.updateCompany(req, id, body);
  }
  @Get("companies/:id/odoo/form") odooForm(@Req() req: Request, @Param("id") id: string) {
    return this.governance.companyForm(req, id);
  }
  @Post("companies/:id/odoo/onchange") odooOnchange(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.governance.companyOnchange(req, id, body);
  }
  @Post("companies/:id/odoo/lookup") odooLookup(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.governance.companyLookup(req, id, body);
  }
  @Patch("companies/:id/odoo") saveOdoo(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.governance.saveCompanyForm(req, id, body);
  }
  @Post("companies/:id/users") createUser(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.governance.createUser(req, id, body);
  }
  @Patch("companies/:id/users/:userId") updateUser(@Req() req: Request, @Param("id") id: string, @Param("userId") userId: string, @Body() body: unknown) {
    return this.governance.updateUser(req, id, userId, body);
  }
  @Post("companies/:id/users/:userId/password") resetPassword(@Req() req: Request, @Param("id") id: string, @Param("userId") userId: string, @Body() body: unknown) {
    return this.governance.resetPassword(req, id, userId, body);
  }
  @Post("companies/:id/sessions/revoke") revokeSessions(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.governance.revokeSessions(req, id, body);
  }
}
