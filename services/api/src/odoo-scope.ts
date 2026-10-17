import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { Database } from "./database";
import { AuthRequest } from "./auth";
import { OdooClient } from "./odoo";

// Regras comuns aos módulos que leem e gravam no Odoo: empresa Odoo vinculada
// ao tenant autenticado e registro de cada gravação na auditoria ERA.
@Injectable()
export class OdooScope {
  constructor(
    @Inject(OdooClient) readonly odoo: OdooClient,
    @Inject(Database) private db: Database,
  ) {}

  async company(req: AuthRequest) {
    const tenant = await this.db.tenant.findUnique({
      where: { id: req.principal.tenantId },
      select: { slug: true },
    });
    if (!tenant) throw new NotFoundException("Empresa não encontrada");
    return this.odoo.companyFor(tenant.slug);
  }

  audit(
    req: AuthRequest,
    module: string,
    model: string,
    action: string,
    id: number,
    before: object | null,
    after: object,
  ) {
    return this.db.auditLog.create({
      data: {
        tenantId: req.principal.tenantId,
        actorId: req.principal.userId,
        ip: req.ip ?? "unknown",
        module,
        action,
        recordId: model + ":" + id,
        before: before ?? undefined,
        after,
      },
    });
  }
}

export function auditAction(
  requested: boolean | undefined,
  current: boolean,
): "update" | "activate" | "deactivate" {
  if (requested === undefined || requested === current) return "update";
  return requested ? "activate" : "deactivate";
}
