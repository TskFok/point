import { Controller, Get, Param, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { ListProductsDto } from './dto/list-products.dto';
import { ProductsService } from './products.service';

@Controller('products')
@Roles('STUDENT')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  list(@Query() query: ListProductsDto) {
    return this.productsService.list(query, true);
  }

  @Get(':productId')
  get(@Param('productId') productId: string) {
    return this.productsService.getForLearner(productId);
  }
}
