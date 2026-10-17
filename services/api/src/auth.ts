import {
  Body,
  Controller,
  Post,
  Get,
  Req,
  Injectable,
  UnauthorizedException,
  BadRequestException,
  CanActivate,
  ExecutionContext,
  SetMetadata,
  ForbiddenException,
  Inject,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Reflector } from "@nestjs/core";
import { compare } from "bcryptjs";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import type { Request } from "express";
import { Database } from "./database";
import { Principal, can } from "../../../packages/shared/security";
export type AuthRequest = Request & { principal: Principal };
export const Public = () => SetMetadata("public", true);
export const Permission = (permission: string) =>
  SetMetadata("permission", permission);
const digest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export function parse<T extends z.ZodTypeAny>(
  schema: T,
  value: unknown,
): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    // message legível para a interface; fieldErrors para destacar os campos.
    const issue = result.error.issues[0];
    const field = issue.path.join(".");
    throw new BadRequestException({
      message:
        "Dados inválidos" +
        (field ? " em " + field : "") +
        ": " +
        issue.message,
      ...result.error.flatten(),
    });
  }
  return result.data;
}
@Injectable()
export class AuthService {
  constructor(
    @Inject(Database) private db: Database,
    @Inject(JwtService) private jwt: JwtService,
  ) {}
  async login(body: unknown) {
    const input = parse(
      z.object({
        company: z.string().min(1),
        email: z.string().email(),
        password: z
          .string()
          .min(1)
          .refine((value) => Buffer.byteLength(value, "utf8") <= 72),
      }),
      body,
    );
    const tenant = await this.db.tenant.findUnique({
      where: { slug: input.company },
    });
    const user =
      tenant &&
      (await this.db.user.findUnique({
        where: {
          tenantId_email: {
            tenantId: tenant.id,
            email: input.email.toLowerCase(),
          },
        },
      }));
    if (
      !tenant?.active ||
      !user ||
      !user.active ||
      !(await compare(input.password, user.passwordHash))
    )
      throw new UnauthorizedException("Credenciais inválidas");
    return this.issue(user.tenantId, user.id);
  }
  private async issue(tenantId: string, userId: string) {
    const refreshToken = randomBytes(48).toString("hex");
    const session = await this.db.session.create({
      data: {
        tenantId,
        userId,
        tokenHash: digest(refreshToken),
        expiresAt: new Date(Date.now() + 7 * 86400000),
      },
    });
    return {
      accessToken: await this.jwt.signAsync({
        sub: userId,
        tenantId,
        sid: session.id,
      }),
      refreshToken,
      expiresIn: 900,
    };
  }
  async refresh(body: unknown) {
    const { refreshToken } = parse(
      z.object({ refreshToken: z.string().length(96) }),
      body,
    );
    const replacement = randomBytes(48).toString("hex");
    const session = await this.db.$transaction(async (tx) => {
      const old = await tx.session.findUnique({
        where: { tokenHash: digest(refreshToken) },
        include: { user: true, tenant: true },
      });
      if (
        !old ||
        old.revokedAt ||
        old.expiresAt <= new Date() ||
        !old.user.active ||
        !old.tenant.active
      )
        throw new UnauthorizedException();
      const claimed = await tx.session.updateMany({
        where: {
          id: old.id,
          tenantId: old.tenantId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { revokedAt: new Date() },
      });
      if (claimed.count !== 1) throw new UnauthorizedException();
      return tx.session.create({
        data: {
          tenantId: old.tenantId,
          userId: old.userId,
          tokenHash: digest(replacement),
          expiresAt: new Date(Date.now() + 7 * 86400000),
        },
      });
    });
    return {
      accessToken: await this.jwt.signAsync({
        sub: session.userId,
        tenantId: session.tenantId,
        sid: session.id,
      }),
      refreshToken: replacement,
      expiresIn: 900,
    };
  }
}
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private reflector: Reflector,
    @Inject(JwtService) private jwt: JwtService,
    @Inject(Database) private db: Database,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride("public", [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = request.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new UnauthorizedException();
    let payload: { sub: string; tenantId: string; sid: string };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException();
    }
    if (!payload.sub || !payload.tenantId || !payload.sid)
      throw new UnauthorizedException();
    const session = await this.db.session.findFirst({
      where: {
        id: payload.sid,
        tenantId: payload.tenantId,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true, tenant: true },
    });
    if (!session?.user.active || !session.tenant.active)
      throw new UnauthorizedException();
    request.principal = {
      tenantId: session.tenantId,
      userId: session.userId,
      sessionId: session.id,
      permissions: session.user.permissions,
    };
    const permission = this.reflector.getAllAndOverride<string>("permission", [
      context.getHandler(),
      context.getClass(),
    ]);
    if (permission && !can(request.principal, permission))
      throw new ForbiddenException("Permissão insuficiente");
    return true;
  }
}
@Controller("auth")
export class AuthController {
  constructor(
    @Inject(AuthService) private auth: AuthService,
    @Inject(Database) private db: Database,
  ) {}
  @Public() @Post("login") login(@Body() body: unknown) {
    return this.auth.login(body);
  }
  @Public() @Post("refresh") refresh(@Body() body: unknown) {
    return this.auth.refresh(body);
  }
  @Post("logout") async logout(@Req() req: AuthRequest) {
    await this.db.session.updateMany({
      where: { id: req.principal.sessionId, tenantId: req.principal.tenantId },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }
  @Get("me") me(@Req() req: AuthRequest) {
    return this.db.user.findFirst({
      where: { id: req.principal.userId, tenantId: req.principal.tenantId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        permissions: true,
        tenant: { select: { id: true, name: true, slug: true } },
      },
    });
  }
}
