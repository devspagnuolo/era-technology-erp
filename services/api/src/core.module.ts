import { Module } from "@nestjs/common";
import { DatabaseModule } from "./database.module";
import { CoreController, CoreRepository, CoreService } from "./core";
@Module({
  imports: [DatabaseModule],
  controllers: [CoreController],
  providers: [CoreRepository, CoreService],
})
export class CoreModule {}
