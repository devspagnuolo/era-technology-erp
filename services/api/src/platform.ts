import { Body, Controller, Get, Post, Patch, Param, Req, Res, Injectable, Inject, UnauthorizedException, ForbiddenException, BadRequestException, ConflictException, NotFoundException, HttpException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Request, Response } from "express";
import { Database } from "./database";
import { Public, parse } from "./auth";
import { rolePresets } from "../../../packages/shared/permissions";

const COOKIE = "era_platform_session";
const maxAge = 8 * 60 * 60;
const reserved = new Set(["platform", "admin", "api", "v1", "docs", "login", "health"]);
const companyInput = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(60).refine(v => !reserved.has(v), "Endereço reservado"),
  adminName: z.string().trim().min(2).max(120),
  adminEmail: z.string().email().max(200).transform(v => v.toLowerCase()),
  adminPassword: z.string().min(12).refine(v => Buffer.byteLength(v, "utf8") <= 72, "Senha longa demais"),
});
const companyUpdate = z.object({ name: z.string().trim().min(2).max(120).optional(), active: z.boolean().optional() }).strict().refine(v => Object.keys(v).length > 0);
const attempts = new Map<string, { count: number; until: number }>();

@Injectable()
export class PlatformService {
  constructor(@Inject(Database) private db: Database) {}
  private secret() {
    const secret = process.env.PLATFORM_SESSION_SECRET;
    if (!secret || secret.length < 32) throw new UnauthorizedException("Acesso administrativo indisponível");
    return secret;
  }
  private mac(payload: string) {
    return createHmac("sha256", this.secret()).update(payload).digest("base64url");
  }
  private sameOrigin(req: Request) {
    const origin = req.headers.origin;
    const allowed = new Set(["https://erp.eratechnology.com.br", "https://era-admin-fxf1.onrender.com"]);
    if (process.env.NODE_ENV !== "production") allowed.add("http://localhost:3000");
    if (!origin || !allowed.has(origin)) throw new ForbiddenException("Origem não autorizada");
  }
  private cookie(req: Request) {
    return req.headers.cookie?.split(";").map(v => v.trim()).find(v => v.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1);
  }
  private sign() {
    const payload = Buffer.from(JSON.stringify({
      email: process.env.PLATFORM_ADMIN_EMAIL?.toLowerCase(),
      exp: Math.floor(Date.now() / 1000) + maxAge,
      nonce: randomBytes(16).toString("hex"),
    })).toString("base64url");
    return payload + "." + this.mac(payload);
  }
  authorize(req: Request, mutation = false) {
    if (mutation) this.sameOrigin(req);
    const token = this.cookie(req);
    if (!token) throw new UnauthorizedException();
    const [payload, mac, extra] = token.split(".");
    if (!payload || !mac || extra) throw new UnauthorizedException();
    const actual = Buffer.from(mac);
    const expected = Buffer.from(this.mac(payload));
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new UnauthorizedException();
    try {
      const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
      if (data.email !== process.env.PLATFORM_ADMIN_EMAIL?.toLowerCase() ||
          !Number.isInteger(data.exp) || data.exp <= Math.floor(Date.now() / 1000))
        throw new UnauthorizedException();
      return data.email as string;
    } catch {
      throw new UnauthorizedException();
    }
  }
  async login(req: Request, res: Response, raw: unknown) {
    this.sameOrigin(req);
    const { email, password } = parse(z.object({
      email: z.string().email(),
      password: z.string().min(1).max(256),
    }), raw);
    const key = req.ip ?? "unknown";
    const now = Date.now();
    const state = attempts.get(key);
    if (state && state.until > now && state.count >= 5)
      throw new HttpException("Muitas tentativas. Aguarde 15 minutos.", 429);
    const configuredEmail = process.env.PLATFORM_ADMIN_EMAIL?.trim().toLowerCase();
    const configuredPassword = process.env.PLATFORM_ADMIN_PASSWORD;
    const configuredSecret = process.env.PLATFORM_SESSION_SECRET;
    const provided = createHmac("sha256", "era-platform-login").update(password).digest();
    const expected = createHmac("sha256", "era-platform-login").update(configuredPassword ?? "").digest();
    if (!configuredEmail || !configuredPassword || !configuredSecret || configuredSecret.length < 32 ||
        email.toLowerCase() !== configuredEmail || !timingSafeEqual(provided, expected)) {
      attempts.set(key, { count: (state && state.until > now ? state.count : 0) + 1, until: now + 15 * 60_000 });
      throw new UnauthorizedException("Credenciais inválidas");
    }
    attempts.delete(key);
    res.cookie(COOKIE, this.sign(), {
      httpOnly: true, secure: process.env.NODE_ENV === "production",
      sameSite: "strict", path: "/v1/platform", maxAge: maxAge * 1000,
    });
    return { email: configuredEmail };
  }
  logout(req: Request, res: Response) {
    this.authorize(req, true);
    res.clearCookie(COOKIE, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/v1/platform" });
    return { ok: true };
  }
  async overview(req: Request) {
    this.authorize(req);
    const companies = await this.db.tenant.findMany({
      select: { id: true, name: true, slug: true, active: true, createdAt: true },
      orderBy: { createdAt: "desc" }, take: 200,
    });
    const ids = companies.map(c => c.id);
    const now = new Date();
    const [users, sessions, activity] = await Promise.all([
      ids.length ? this.db.user.count({ where: { tenantId: { in: ids }, active: true } }) : 0,
      ids.length ? this.db.session.count({ where: { tenantId: { in: ids }, revokedAt: null, expiresAt: { gt: now } } }) : 0,
      this.db.auditLog.findMany({ where: { module: "platform" }, orderBy: { createdAt: "desc" }, take: 12,
        select: { id: true, tenantId: true, actorId: true, action: true, createdAt: true } }),
    ]);
    const names = new Map(companies.map(c => [c.id, c.name]));
    return {
      companies,
      metrics: { companies: companies.length, activeCompanies: companies.filter(c => c.active).length,
        suspendedCompanies: companies.filter(c => !c.active).length, activeUsers: users, activeSessions: sessions },
      recentActivity: activity.map(a => ({ id: a.id, company: names.get(a.tenantId) ?? "Empresa removida",
        actor: a.actorId, action: a.action, createdAt: a.createdAt })),
      generatedAt: now.toISOString(),
    };
  }

  async companies(req: Request) {
    this.authorize(req);
    return this.db.tenant.findMany({
      select: { id: true, name: true, slug: true, active: true, createdAt: true,
        users: { where: { role: "TENANT_ADMIN" }, select: { name: true, email: true, active: true }, take: 1 } },
      orderBy: { createdAt: "desc" }, take: 200,
    });
  }
  async create(req: Request, raw: unknown) {
    const actor = this.authorize(req, true);
    const input = parse(companyInput, raw);
    const passwordHash = await hash(input.adminPassword, 12);
    try {
      return await this.db.$transaction(async tx => {
        const tenant = await tx.tenant.create({ data: { name: input.name, slug: input.slug } });
        await tx.user.create({ data: {
          tenantId: tenant.id, name: input.adminName, email: input.adminEmail,
          passwordHash, role: "TENANT_ADMIN", permissions: rolePresets.TENANT_ADMIN.permissions,
        } });
        await tx.auditLog.create({ data: {
          tenantId: tenant.id, actorId: actor, ip: req.ip ?? "unknown", module: "platform",
          action: "create_company", recordId: tenant.id,
          after: { name: tenant.name, slug: tenant.slug, adminEmail: input.adminEmail },
        } });
        return { id: tenant.id, name: tenant.name, slug: tenant.slug, active: tenant.active, createdAt: tenant.createdAt };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        throw new ConflictException("Empresa ou e-mail já cadastrado");
      throw error;
    }
  }
  async update(req: Request, id: string, raw: unknown) {
    const actor = this.authorize(req, true);
    if (!z.string().uuid().safeParse(id).success) throw new BadRequestException("Empresa inválida");
    const input = parse(companyUpdate, raw);
    return this.db.$transaction(async tx => {
      const before = await tx.tenant.findUnique({ where: { id }, select: { id: true, name: true, slug: true, active: true } });
      if (!before) throw new NotFoundException("Empresa não encontrada");
      const tenant = await tx.tenant.update({ where: { id }, data: input,
        select: { id: true, name: true, slug: true, active: true, createdAt: true } });
      if (input.active === false)
        await tx.session.updateMany({ where: { tenantId: id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({ data: {
        tenantId: id, actorId: actor, ip: req.ip ?? "unknown", module: "platform",
        action: input.active === undefined ? "update_company" : input.active ? "activate_company" : "suspend_company",
        recordId: id, before, after: { name: tenant.name, slug: tenant.slug, active: tenant.active },
      } });
      return tenant;
    });
  }
}

@Public()
@Controller("platform")
export class PlatformController {
  constructor(@Inject(PlatformService) private platform: PlatformService) {}
  @Post("login") login(@Req() req: Request, @Res({ passthrough: true }) res: Response, @Body() body: unknown) {
    return this.platform.login(req, res, body);
  }
  @Post("logout") logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.platform.logout(req, res);
  }
  @Get("me") me(@Req() req: Request) { return { email: this.platform.authorize(req) }; }
  @Get("overview") overview(@Req() req: Request) { return this.platform.overview(req); }
  @Get("companies") companies(@Req() req: Request) { return this.platform.companies(req); }
  @Post("companies") create(@Req() req: Request, @Body() body: unknown) { return this.platform.create(req, body); }
  @Patch("companies/:id") update(@Req() req: Request, @Param("id") id: string, @Body() body: unknown) {
    return this.platform.update(req, id, body);
  }
}
