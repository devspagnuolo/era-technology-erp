import { Module } from "@nestjs/common";
import { DatabaseModule } from "./database.module";
import { OdooModule } from "./odoo.module";
import { PlatformController, PlatformService } from "./platform";

@Module({
  imports: [DatabaseModule, OdooModule],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
