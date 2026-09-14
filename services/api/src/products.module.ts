import { Module } from "@nestjs/common";
import { DatabaseModule } from "./database.module";
import {
  ProductsController,
  ProductRepository,
  CreateProduct,
} from "./products";
@Module({
  imports: [DatabaseModule],
  controllers: [ProductsController],
  providers: [ProductRepository, CreateProduct],
})
export class ProductsModule {}
