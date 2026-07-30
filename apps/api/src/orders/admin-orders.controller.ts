import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { type RequestUser } from '../auth/strategies/access-token.strategy';
import { ListAdminOrdersDto } from './dto/list-orders.dto';
import { OrdersService } from './orders.service';

@Controller('admin/orders')
@Roles('ADMIN')
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  list(@Query() query: ListAdminOrdersDto) {
    return this.ordersService.listAdmin(query);
  }

  @Get(':orderId')
  get(@Param('orderId') orderId: string) {
    return this.ordersService.getForAdmin(orderId);
  }

  @Post(':orderId/complete')
  complete(
    @CurrentUser() user: RequestUser,
    @Param('orderId') orderId: string,
  ) {
    return this.ordersService.complete(orderId, user.id);
  }

  @Post(':orderId/cancel')
  cancel(@CurrentUser() user: RequestUser, @Param('orderId') orderId: string) {
    return this.ordersService.cancel(orderId, user.id);
  }
}
