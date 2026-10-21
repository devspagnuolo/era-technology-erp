import { Module } from "@nestjs/common";
import { DatabaseModule } from "./database.module";
import { OdooModule } from "./odoo.module";
import { PlatformController, PlatformService } from "./platform";
import { OdooProvisioning } from "./odoo-provision";

@Module({
  imports: [DatabaseModule, OdooModule],
  controllers: [PlatformController],
  providers: [PlatformService, OdooProvisioning],
})
export class PlatformModule {}
