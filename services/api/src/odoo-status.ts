import { Controller, Get, Inject, Req } from "@nestjs/common";
import { AuthRequest } from "./auth";
import { OdooScope } from "./odoo-scope";

// Qualquer usuário autenticado pode saber se a integração está disponível;
// cada módulo continua exigindo a própria permissão para ler ou gravar dados.
@Controller("odoo")
export class OdooStatusController {
  constructor(@Inject(OdooScope) private scope: OdooScope) {}
  @Get("status") async status(@Req() req: AuthRequest) {
    if (!this.scope.odoo.configured)
      return { configured: false, connected: false, linked: false };
    const linked = await this.scope.company(req).then(
      () => true,
      () => false,
    );
    try {
      return {
        configured: true,
        connected: true,
        linked,
        version: await this.scope.odoo.version(),
      };
    } catch {
      return { configured: true, connected: false, linked };
    }
  }
}
