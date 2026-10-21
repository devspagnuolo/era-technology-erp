import { Module } from "@nestjs/common";
import { DatabaseModule } from "./database.module";
import { OdooModule } from "./odoo.module";
import { PlatformController, PlatformService } from "./platform";
import { OdooProvisioning } from "./odoo-provision";
import { PlatformGovernance, PlatformGovernanceController } from "./platform-governance";

@Module({
  imports: [DatabaseModule, OdooModule],
  controllers: [PlatformController, PlatformGovernanceController],
  providers: [PlatformService, PlatformGovernance, OdooProvisioning],
})
export class PlatformModule {}
