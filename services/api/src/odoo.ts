import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";

// Cliente servidor-a-servidor da API externa do Odoo (JSON-RPC, Odoo 14–18).
// Credenciais ficam apenas no ambiente da API; o navegador nunca as recebe.
export type OdooConfig = {
  url: string;
  db: string;
  login: string;
  apiKey: string;
  // slug do tenant ERA → id de res.company no Odoo.
  companies: Record<string, number>;
  timeoutMs: number;
};
export type Domain = Array<string | [string, string, unknown]>;

export function readOdooConfig(
  env: NodeJS.ProcessEnv = process.env,
): OdooConfig | null {
  const { ODOO_URL, ODOO_DB, ODOO_LOGIN, ODOO_API_KEY } = env;
  if (!ODOO_URL || !ODOO_DB || !ODOO_LOGIN || !ODOO_API_KEY) return null;
  return {
    url: ODOO_URL.replace(/\/+$/, ""),
    db: ODOO_DB,
    login: ODOO_LOGIN,
    apiKey: ODOO_API_KEY,
    companies: parseCompanies(env.ODOO_TENANT_COMPANIES ?? ""),
    timeoutMs: Number(env.ODOO_TIMEOUT_MS ?? 15000),
  };
}

export function parseCompanies(raw: string) {
  const companies: Record<string, number> = {};
  for (const pair of raw.split(",")) {
    const [slug, id] = pair.split(":").map((part) => part?.trim());
    if (!slug || !id) continue;
    const companyId = Number(id);
    if (!Number.isInteger(companyId) || companyId < 1)
      throw new Error("ODOO_TENANT_COMPANIES inválido em " + slug);
    companies[slug] = companyId;
  }
  return companies;
}

type RpcError = {
  message?: string;
  data?: { name?: string; message?: string };
};

@Injectable()
export class OdooClient {
  private uid: Promise<number> | null = null;
  constructor(private config: OdooConfig | null = readOdooConfig()) {}

  get configured() {
    return this.config !== null;
  }

  companyFor(tenantSlug: string) {
    const companyId = this.settings().companies[tenantSlug];
    if (!companyId)
      throw new ServiceUnavailableException(
        "Esta empresa ainda não está vinculada a uma empresa no Odoo",
      );
    return companyId;
  }

  async version() {
    const info = await this.rpc<{ server_version: string }>(
      "common",
      "version",
      [],
    );
    return info.server_version;
  }

  async execute<T>(
    companyId: number,
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown> = {},
  ): Promise<T> {
    const { db, apiKey } = this.settings();
    const uid = await this.login();
    const context = {
      allowed_company_ids: [companyId],
      ...(kwargs.context as object | undefined),
    };
    return this.rpc<T>("object", "execute_kw", [
      db,
      uid,
      apiKey,
      model,
      method,
      args,
      { ...kwargs, context },
    ]);
  }

  private settings() {
    if (!this.config)
      throw new ServiceUnavailableException(
        "Integração com o Odoo não configurada",
      );
    return this.config;
  }

  private login() {
    const { db, login, apiKey } = this.settings();
    this.uid ??= this.rpc<number | false>("common", "authenticate", [
      db,
      login,
      apiKey,
      {},
    ]).then((uid) => {
      if (!uid) throw new ServiceUnavailableException("Odoo recusou o acesso");
      return uid;
    });
    // Falhas não ficam em cache: a próxima chamada tenta autenticar de novo.
    this.uid.catch(() => (this.uid = null));
    return this.uid;
  }

  private async rpc<T>(service: string, method: string, args: unknown[]) {
    const { url, timeoutMs } = this.settings();
    let body: { result?: T; error?: RpcError };
    try {
      const response = await fetch(url + "/jsonrpc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: "call",
          params: { service, method, args },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      body = await response.json();
    } catch {
      throw new BadGatewayException("Odoo indisponível no momento");
    }
    if (body.error) throw translate(body.error);
    return body.result as T;
  }
}

// Erros de regra de negócio do Odoo voltam ao usuário; os demais ficam genéricos
// para não expor rastros internos do servidor.
export function translate(error: RpcError) {
  const name = error.data?.name ?? "";
  if (
    /odoo\.exceptions\.(ValidationError|UserError|AccessError|MissingError)/.test(
      name,
    )
  )
    return new UnprocessableEntityException(
      error.data?.message ?? "Operação recusada pelo Odoo",
    );
  if (name.endsWith("AccessDenied"))
    return new ServiceUnavailableException("Odoo recusou o acesso");
  return new BadGatewayException("O Odoo não conseguiu concluir a operação");
}
