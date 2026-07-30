import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { type RequestUser } from '../auth/strategies/access-token.strategy';
import {
  ApiContract,
  orderIdParam,
  pageQueries,
} from '../openapi/api-contract.decorator';
import {
  CreateOrderRequestDto,
  OrderDto,
  OrderListResponseDto,
} from '../openapi/api-contract.models';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@Roles('STUDENT')
@ApiTags('学生端-订单')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @ApiContract({
    operationId: 'ordersCreate',
    summary: '兑换商品并创建待领取订单',
    responseType: OrderDto,
    responseStatus: 201,
    authenticated: true,
    mutation: true,
    idempotent: true,
    bodyType: CreateOrderRequestDto,
  })
  create(
    @CurrentUser() user: RequestUser,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: CreateOrderDto,
  ) {
    return this.ordersService.redeem(user.id, body.productId, idempotencyKey);
  }

  @Get()
  @ApiContract({
    operationId: 'ordersList',
    summary: '分页查询我的订单',
    responseType: OrderListResponseDto,
    authenticated: true,
    queries: pageQueries,
  })
  list(@CurrentUser() user: RequestUser, @Query() query: ListOrdersDto) {
    return this.ordersService.listForLearner(user.id, query);
  }

  @Get(':orderId')
  @ApiContract({
    operationId: 'ordersGet',
    summary: '获取我的订单详情',
    responseType: OrderDto,
    authenticated: true,
    params: [orderIdParam],
  })
  get(@CurrentUser() user: RequestUser, @Param('orderId') orderId: string) {
    return this.ordersService.getForLearner(user.id, orderId);
  }
}
