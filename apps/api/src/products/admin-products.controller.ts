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
import { ApiTags } from '@nestjs/swagger';
import { type Observable } from 'rxjs';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  ApiContract,
  productIdParam,
  productQueries,
} from '../openapi/api-contract.decorator';
import {
  CreateProductRequestDto,
  ProductDto,
  ProductImageUploadResponseDto,
  ProductListResponseDto,
  UpdateProductRequestDto,
} from '../openapi/api-contract.models';
import {
  MAX_PRODUCT_IMAGE_SIZE,
  validateAndNormalizeProductImage,
} from '../storage/image-validator';
import { StorageProvider } from '../storage/storage.provider';
import { CreateProductDto } from './dto/create-product.dto';
import { ListProductsDto } from './dto/list-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductsService } from './products.service';

type UploadedProductImage = {
  buffer: Buffer;
  mimetype?: string;
  originalname?: string;
};

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
@ApiTags('管理端-商品')
export class AdminProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiContract({
    operationId: 'adminListProducts',
    summary: '分页查询全部商品',
    responseType: ProductListResponseDto,
    authenticated: true,
    queries: productQueries,
  })
  list(@Query() query: ListProductsDto) {
    return this.productsService.list(query);
  }

  @Post()
  @ApiContract({
    operationId: 'adminCreateProduct',
    summary: '创建商品',
    responseType: ProductDto,
    responseStatus: 201,
    authenticated: true,
    mutation: true,
    bodyType: CreateProductRequestDto,
  })
  create(@Body() body: CreateProductDto) {
    return this.productsService.create(body);
  }

  @Patch(':productId')
  @ApiContract({
    operationId: 'adminUpdateProduct',
    summary: '更新商品、库存或上下架状态',
    responseType: ProductDto,
    authenticated: true,
    mutation: true,
    bodyType: UpdateProductRequestDto,
    params: [productIdParam],
  })
  update(
    @Param('productId') productId: string,
    @Body() body: UpdateProductDto,
  ) {
    return this.productsService.update(productId, body);
  }
}

@Controller('admin/uploads')
@Roles('ADMIN')
@ApiTags('管理端-上传')
export class AdminProductUploadsController {
  constructor(private readonly storage: StorageProvider) {}

  @Post('product-images')
  @UseInterceptors(ProductImageUploadInterceptor)
  @ApiContract({
    operationId: 'adminUploadProductImage',
    summary: '上传并规范化商品图片',
    responseType: ProductImageUploadResponseDto,
    responseStatus: 201,
    authenticated: true,
    mutation: true,
    multipart: true,
    body: {
      required: true,
      schema: {
        type: 'object',
        required: ['file'],
        properties: {
          file: {
            type: 'string',
            format: 'binary',
            description: 'JPEG、PNG 或 WebP，最大 5 MiB、2500 万像素、单帧',
          },
        },
      },
    },
  })
  async upload(@UploadedFile() file?: UploadedProductImage) {
    if (!file?.buffer) {
      throw uploadValidationFailed('必须上传商品图片');
    }
    const normalized = await validateAndNormalizeProductImage(
      file.buffer,
      MAX_PRODUCT_IMAGE_SIZE,
    );
    return this.storage.putProductImage(normalized);
  }
}
