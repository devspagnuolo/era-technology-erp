import { Module } from "@nestjs/common";
import { DatabaseModule } from "./database.module";
import { PlatformController, PlatformService } from "./platform";

@Module({
  imports: [DatabaseModule],
  controllers: [PlatformController],
  providers: [PlatformService],
})
export class PlatformModule {}
