import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Inject,
  Injectable,
  ConflictException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { Database } from "./database";
import { AuthRequest, Permission, parse } from "./auth";
import { tenantScope } from "../../../packages/shared/security";
export const productInput = z.object({
  sku: z.string().trim().min(1).max(64),
  name: z.string().trim().min(2).max(200),
  unit: z.string().trim().min(1).max(8).default("UN"),
  salePrice: z
    .string()
    .regex(
      /^\d{1,12}(\.\d{1,2})?$/,
      "Informe um preço positivo com até duas casas decimais",
    ),
});
const searchInput = z.object({
  q: z.string().max(100).default(""),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
@Injectable()
export class ProductRepository {
  constructor(@Inject(Database) private db: Database) {}
  list(tenantId: string, raw: unknown) {
    const { q, page, pageSize } = parse(searchInput, raw);
    const where: Prisma.ProductWhereInput = {
      ...tenantScope(tenantId),
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
      ],
    };
    return this.db.$transaction(
      async (tx) => ({
        items: await tx.product.findMany({
          where,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        total: await tx.product.count({ where }),
        page,
        pageSize,
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
  create(
    tenantId: string,
    actorId: string,
    ip: string,
    data: z.infer<typeof productInput>,
  ) {
    return this.db.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: { ...data, ...tenantScope(tenantId) },
      });
      const after = {
        ...product,
        salePrice: product.salePrice.toString(),
        createdAt: product.createdAt.toISOString(),
        updatedAt: product.updatedAt.toISOString(),
      };
      await tx.auditLog.create({
        data: {
          tenantId,
          actorId,
          ip,
          module: "products",
          action: "create",
          recordId: product.id,
          after,
        },
      });
      await tx.outboxEvent.create({
        data: { tenantId, type: "product.created.v1", payload: after },
      });
      return product;
    });
  }
}
@Injectable()
export class CreateProduct {
  constructor(
    @Inject(ProductRepository) private repository: ProductRepository,
  ) {}
  async execute(req: AuthRequest, raw: unknown) {
    const input = parse(productInput, raw);
    try {
      return await this.repository.create(
        req.principal.tenantId,
        req.principal.userId,
        req.ip ?? "unknown",
        input,
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        throw new ConflictException("SKU já cadastrado nesta empresa");
      throw error;
    }
  }
}
@Controller("products")
export class ProductsController {
  constructor(
    @Inject(ProductRepository) private repository: ProductRepository,
    @Inject(CreateProduct) private createProduct: CreateProduct,
  ) {}
  @Get() @Permission("products:read") list(
    @Req() req: AuthRequest,
    @Query() query: unknown,
  ) {
    return this.repository.list(req.principal.tenantId, query);
  }
  @Post() @Permission("products:create") create(
    @Req() req: AuthRequest,
    @Body() body: unknown,
  ) {
    return this.createProduct.execute(req, body);
  }
}
