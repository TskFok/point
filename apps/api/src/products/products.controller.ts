import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import {
  ApiContract,
  productIdParam,
  productQueries,
} from '../openapi/api-contract.decorator';
import {
  ProductDto,
  ProductListResponseDto,
} from '../openapi/api-contract.models';
import { ListProductsDto } from './dto/list-products.dto';
import { ProductsService } from './products.service';

@Controller('products')
@Roles('STUDENT')
@ApiTags('学生端-商品')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiContract({
    operationId: 'productsList',
    summary: '分页查询可兑换商品',
    responseType: ProductListResponseDto,
    authenticated: true,
    queries: productQueries,
  })
  list(@Query() query: ListProductsDto) {
    return this.productsService.list(query, true);
  }

  @Get(':productId')
  @ApiContract({
    operationId: 'productsGet',
    summary: '获取可兑换商品详情',
    responseType: ProductDto,
    authenticated: true,
    params: [productIdParam],
  })
  get(@Param('productId') productId: string) {
    return this.productsService.getForLearner(productId);
  }
}
