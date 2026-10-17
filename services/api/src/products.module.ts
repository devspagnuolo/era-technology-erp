import { Module } from "@nestjs/common";
import { DatabaseModule } from "./database.module";
import {
  ProductsController,
  ProductRepository,
  CreateProduct,
  UpdateProduct,
} from "./products";
@Module({
  imports: [DatabaseModule],
  controllers: [ProductsController],
  providers: [ProductRepository, CreateProduct, UpdateProduct],
})
export class ProductsModule {}
