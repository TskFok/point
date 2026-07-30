import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { type RequestUser } from '../auth/strategies/access-token.strategy';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@Roles('STUDENT')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: CreateOrderDto,
  ) {
    return this.ordersService.redeem(user.id, body.productId, idempotencyKey);
  }

  @Get()
  list(@CurrentUser() user: RequestUser, @Query() query: ListOrdersDto) {
    return this.ordersService.listForLearner(user.id, query);
  }

  @Get(':orderId')
  get(@CurrentUser() user: RequestUser, @Param('orderId') orderId: string) {
    return this.ordersService.getForLearner(user.id, orderId);
  }
}
