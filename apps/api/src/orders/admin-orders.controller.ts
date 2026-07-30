import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { type RequestUser } from '../auth/strategies/access-token.strategy';
import {
  adminOrderQueries,
  ApiContract,
  orderIdParam,
} from '../openapi/api-contract.decorator';
import {
  AdminOrderDto,
  AdminOrderListResponseDto,
} from '../openapi/api-contract.models';
import { ListAdminOrdersDto } from './dto/list-orders.dto';
import { OrdersService } from './orders.service';

@Controller('admin/orders')
@Roles('ADMIN')
@ApiTags('管理端-订单')
export class AdminOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiContract({
    operationId: 'adminListOrders',
    summary: '筛选并分页查询订单',
    responseType: AdminOrderListResponseDto,
    authenticated: true,
    queries: adminOrderQueries,
  })
  list(@Query() query: ListAdminOrdersDto) {
    return this.ordersService.listAdmin(query);
  }

  @Get(':orderId')
  @ApiContract({
    operationId: 'adminGetOrder',
    summary: '获取订单管理详情',
    responseType: AdminOrderDto,
    authenticated: true,
    params: [orderIdParam],
  })
  get(@Param('orderId') orderId: string) {
    return this.ordersService.getForAdmin(orderId);
  }

  @Post(':orderId/complete')
  @ApiContract({
    operationId: 'adminCompleteOrder',
    summary: '将待领取订单标记为已完成',
    responseType: AdminOrderDto,
    responseStatus: 201,
    authenticated: true,
    mutation: true,
    params: [orderIdParam],
  })
  complete(
    @CurrentUser() user: RequestUser,
    @Param('orderId') orderId: string,
  ) {
    return this.ordersService.complete(orderId, user.id);
  }

  @Post(':orderId/cancel')
  @ApiContract({
    operationId: 'adminCancelOrder',
    summary: '取消待领取订单并退还积分与库存',
    responseType: AdminOrderDto,
    responseStatus: 201,
    authenticated: true,
    mutation: true,
    params: [orderIdParam],
  })
  cancel(@CurrentUser() user: RequestUser, @Param('orderId') orderId: string) {
    return this.ordersService.cancel(orderId, user.id);
  }
}
