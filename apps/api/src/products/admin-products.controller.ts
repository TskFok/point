import {
  BadRequestException,
  Body,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  NestInterceptor,
  Param,
  Patch,
  PayloadTooLargeException,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  type CallHandler,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { type Observable } from 'rxjs';
import { Roles } from '../auth/decorators/roles.decorator';
import { MAX_PRODUCT_IMAGE_SIZE } from '../storage/image-validator';
import {
  type ProductImageFile,
  StorageProvider,
} from '../storage/storage.provider';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

function uploadValidationFailed(message: string): BadRequestException {
  return new BadRequestException({
    code: 'VALIDATION_FAILED',
    message,
  });
}

const MemoryProductImageInterceptor = FileInterceptor('file', {
  limits: {
    fileSize: MAX_PRODUCT_IMAGE_SIZE,
    files: 1,
    fields: 10,
    fieldNameSize: 100,
    fieldSize: 1024,
    parts: 12,
  },
});

@Injectable()
class ProductImageUploadInterceptor
  extends MemoryProductImageInterceptor
  implements NestInterceptor
{
  override async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    try {
      return await super.intercept(context, next);
    } catch (error) {
      if (error instanceof PayloadTooLargeException) {
        throw uploadValidationFailed('商品图片不能超过 5 MiB');
      }
      throw error;
    }
  }
}

@Controller('admin/products')
@Roles('ADMIN')
export class AdminProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  list(@Query() query: ListProductsDto) {
    return this.productsService.list(query);
  }

  @Post()
  create(@Body() body: CreateProductDto) {
    return this.productsService.create(body);
  }

  @Patch(':productId')
  update(
    @Param('productId') productId: string,
    @Body() body: UpdateProductDto,
  ) {
    return this.productsService.update(productId, body);
  }
}

@Controller('admin/uploads')
@Roles('ADMIN')
export class AdminProductUploadsController {
  constructor(private readonly storage: StorageProvider) {}

  @Post('product-images')
  @UseInterceptors(ProductImageUploadInterceptor)
  upload(@UploadedFile() file?: ProductImageFile) {
    if (!file?.buffer) {
      throw uploadValidationFailed('必须上传商品图片');
    }
    return this.storage.putProductImage(file);
  }
}
