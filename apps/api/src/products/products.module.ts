import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import {
  AdminProductsController,
  AdminProductUploadsController,
} from './admin-products.controller';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [StorageModule],
  controllers: [
    ProductsController,
    AdminProductsController,
    AdminProductUploadsController,
  ],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
