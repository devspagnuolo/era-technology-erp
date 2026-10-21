import { Inject, Injectable } from "@nestjs/common";
import { OdooClient } from "./odoo";

// Empresa nova da ERA → empresa própria no Odoo, pronta para os módulos:
// res.company com país Brasil (o Odoo carrega o plano de contas brasileiro),
// acesso do usuário técnico da integração e um depósito, se houver Estoque.
// Os usuários da empresa continuam entrando só na ERA; quem fala com o Odoo
// é a API, sempre limitada à empresa do tenant.
//
// Idempotente: a empresa criada recebe o identificador era.tenant_<slug>; uma
// nova tentativa reaproveita a empresa em vez de duplicar.
export type ProvisionInput = { slug: string; name: string };

export function tenantXmlid(slug: string) {
  return "tenant_" + slug.replace(/-/g, "_");
}
export function warehouseCode(slug: string) {
  return (slug.replace(/[^a-z0-9]/gi, "").slice(0, 5) || "ERA").toUpperCase();
}

@Injectable()
export class OdooProvisioning {
  constructor(@Inject(OdooClient) private odoo: OdooClient) {}

  get available() {
    return this.odoo.configured;
  }

  async provision(input: ProvisionInput): Promise<number> {
    const uid = await this.odoo.userId();
    // Empresa principal do usuário técnico: base para as chamadas antes de a
    // nova empresa existir.
    const [me] = await this.odoo.call<Array<{ company_id: [number, string] }>>(
      "res.users",
      "read",
      [[uid], ["company_id"]],
    );
    const base = me.company_id[0];
    const run = <T>(model: string, method: string, args: unknown[], kw = {}) =>
      this.odoo.execute<T>(base, model, method, args, kw, 120_000);

    const name = tenantXmlid(input.slug);
    const [existing] = await run<Array<{ res_id: number }>>(
      "ir.model.data",
      "search_read",
      [
        [
          ["module", "=", "era"],
          ["name", "=", name],
          ["model", "=", "res.company"],
        ],
        ["res_id"],
      ],
    );
    let companyId = existing?.res_id;
    if (!companyId) {
      const [brazil] = await run<number[]>("res.country", "search", [
        [["code", "=", "BR"]],
      ]);
      companyId = await run<number>("res.company", "create", [
        { name: input.name, ...(brazil ? { country_id: brazil } : {}) },
      ]);
      await run("ir.model.data", "create", [
        { module: "era", name, model: "res.company", res_id: companyId },
      ]);
    }
    await run("res.users", "write", [[uid], { company_ids: [[4, companyId]] }]);

    // Depósito: o Odoo não cria um para empresas novas criadas por API.
    const stock = await run<number>("ir.module.module", "search_count", [
      [
        ["name", "=", "stock"],
        ["state", "=", "installed"],
      ],
    ]);
    if (stock) {
      const inCompany = (kw = {}) => ({
        ...kw,
        context: { allowed_company_ids: [companyId] },
      });
      const warehouses = await this.odoo.execute<number>(
        companyId,
        "stock.warehouse",
        "search_count",
        [[["company_id", "=", companyId]]],
        inCompany(),
      );
      if (!warehouses)
        await this.odoo.execute(
          companyId,
          "stock.warehouse",
          "create",
          [
            {
              name: input.name,
              code: warehouseCode(input.slug),
              company_id: companyId,
            },
          ],
          inCompany(),
          120_000,
        );
    }
    return companyId;
  }
}
