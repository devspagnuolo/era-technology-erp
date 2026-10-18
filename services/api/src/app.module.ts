import { Controller, Get, Module, Inject } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Database } from "./database";
import { DatabaseModule } from "./database.module";
import { AuthModule } from "./auth.module";
import { CoreModule } from "./core.module";
import { ProductsModule } from "./products.module";
import { OdooModule } from "./odoo.module";
import { PlatformModule } from "./platform.module";
import { AccessGuard, Public } from "./auth";
@Controller()
class HealthController {
  constructor(@Inject(Database) private db: Database) {}
  @Public() @Get("health") async health() {
    await this.db.$queryRaw`SELECT 1`;
    return { status: "ok" };
  }
}
@Module({
  imports: [DatabaseModule, AuthModule, CoreModule, ProductsModule, OdooModule, PlatformModule],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AccessGuard }],
})
export class AppModule {}
