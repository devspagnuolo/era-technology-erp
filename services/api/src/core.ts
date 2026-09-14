import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Req,
  Inject,
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { z } from "zod";
import { Database } from "./database";
import { Permission, AuthRequest, parse } from "./auth";
import { rolePresets, mayGrant } from "../../../packages/shared/permissions";
const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  permissions: true,
  active: true,
} as const;
export const branchInput = z.object({
  name: z.string().trim().min(2).max(120),
  code: z
    .string()
    .trim()
    .min(1)
    .max(30)
    .regex(/^[A-Za-z0-9_-]+$/),
});
export const userInput = z.object({
  name: z.string().trim().min(2).max(120),
  email: z
    .string()
    .email()
    .max(200)
    .transform((v) => v.toLowerCase()),
  password: z
    .string()
    .min(12)
    .refine(
      (value) => Buffer.byteLength(value, "utf8") <= 72,
      "Senha deve ter até 72 bytes",
    ),
  role: z
    .string()
    .refine((v) => Object.hasOwn(rolePresets, v), "Perfil inválido"),
});
@Injectable()
export class CoreRepository {
  constructor(@Inject(Database) private db: Database) {}
  branches(tenantId: string) {
    return this.db.branch.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
    });
  }
  users(tenantId: string) {
    return this.db.user.findMany({
      where: { tenantId },
      select: userSelect,
      orderBy: { name: "asc" },
      take: 100,
    });
  }
  audit(tenantId: string) {
    return this.db.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }
  createBranch(req: AuthRequest, input: z.output<typeof branchInput>) {
    const { tenantId, userId } = req.principal;
    return this.db.$transaction(async (tx) => {
      const branch = await tx.branch.create({ data: { ...input, tenantId } });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: userId,
          ip: req.ip ?? "unknown",
          module: "branches",
          action: "create",
          recordId: branch.id,
          after: branch,
        },
      });
      return branch;
    });
  }
  createUser(
    req: AuthRequest,
    input: {
      name: string;
      email: string;
      passwordHash: string;
      role: string;
      permissions: string[];
    },
  ) {
    const { tenantId, userId } = req.principal;
    return this.db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { ...input, tenantId },
        select: userSelect,
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: userId,
          ip: req.ip ?? "unknown",
          module: "users",
          action: "create",
          recordId: user.id,
          after: user,
        },
      });
      return user;
    });
  }
  setUserActive(req: AuthRequest, id: string, active: boolean) {
    const { tenantId, userId, permissions } = req.principal;
    return this.db.$transaction(async (tx) => {
      const before = await tx.user.findFirst({
        where: { id, tenantId },
        select: userSelect,
      });
      if (!before) throw new NotFoundException("Usuário não encontrado");
      if (!mayGrant(permissions, before.permissions))
        throw new ForbiddenException(
          "Não é permitido gerenciar um usuário com permissões superiores",
        );
      const user = await tx.user.update({
        where: { tenantId_id: { tenantId, id } },
        data: { active },
        select: userSelect,
      });
      if (!active)
        await tx.session.updateMany({
          where: { tenantId, userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId: userId,
          ip: req.ip ?? "unknown",
          module: "users",
          action: active ? "activate" : "deactivate",
          recordId: id,
          before,
          after: user,
        },
      });
      return user;
    });
  }
}
@Injectable()
export class CoreService {
  constructor(@Inject(CoreRepository) private repository: CoreRepository) {}
  async createBranch(req: AuthRequest, raw: unknown) {
    try {
      return await this.repository.createBranch(req, parse(branchInput, raw));
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException("Código de filial já cadastrado");
      throw error;
    }
  }
  async createUser(req: AuthRequest, raw: unknown) {
    const input = parse(userInput, raw);
    const granted = rolePresets[input.role].permissions;
    if (!mayGrant(req.principal.permissions, granted))
      throw new ForbiddenException(
        "Você não pode conceder permissões que não possui",
      );
    const { password, ...data } = input;
    try {
      return await this.repository.createUser(req, {
        ...data,
        passwordHash: await hash(password, 12),
        permissions: granted,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException("E-mail já cadastrado nesta empresa");
      throw error;
    }
  }
  setUserActive(req: AuthRequest, id: string, raw: unknown) {
    const { active } = parse(z.object({ active: z.boolean() }), raw);
    if (id === req.principal.userId)
      throw new ForbiddenException("Não é permitido alterar o próprio status");
    return this.repository.setUserActive(req, id, active);
  }
}
@Controller()
export class CoreController {
  constructor(
    @Inject(CoreRepository) private repository: CoreRepository,
    @Inject(CoreService) private service: CoreService,
  ) {}
  @Permission("core:read") @Get("branches") branches(@Req() req: AuthRequest) {
    return this.repository.branches(req.principal.tenantId);
  }
  @Permission("branches:create") @Post("branches") createBranch(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.createBranch(req, body);
  }
  @Permission("users:read") @Get("users") users(@Req() req: AuthRequest) {
    return this.repository.users(req.principal.tenantId);
  }
  @Permission("users:create") @Post("users") createUser(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.service.createUser(req, body);
  }
  @Permission("users:update") @Patch("users/:id/status") status(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    return this.service.setUserActive(req, id, body);
  }
  @Permission("profiles:read") @Get("profiles") profiles() {
    return Object.entries(rolePresets).map(([key, value]) => ({
      key,
      ...value,
    }));
  }
  @Permission("audit:read") @Get("audit") audit(@Req() req: AuthRequest) {
    return this.repository.audit(req.principal.tenantId);
  }
}
