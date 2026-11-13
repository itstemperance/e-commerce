import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrderStatus, Role } from '@prisma/client';
import { FlashCheckoutResponseDto } from '@repo/types';
import { OrdersService } from './orders.service';
import {
  CreateOrderDto,
  FlashCheckoutDto,
  LookupOrderDto,
  UpdateCheckoutConfigDto,
  UpdateFulfillmentDto,
  UpdateOrderStatusDto,
  UpdatePaymentPlanDto,
} from './dto/flash-checkout.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../common/decorators/current-user.decorator';

@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('checkout-config')
  async getCheckoutConfig() {
    return this.ordersService.getCheckoutConfig();
  }

  @Patch('checkout-config')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async updateCheckoutConfig(@Body() dto: UpdateCheckoutConfigDto) {
    return this.ordersService.updateCheckoutConfig(dto);
  }

  @Post('flash-checkout')
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async flashCheckout(
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @Headers('x-benchmark-mode') benchmarkMode: string | undefined,
    @Body() dto: FlashCheckoutDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FlashCheckoutResponseDto> {
    if (!idempotencyKey) {
      throw new BadRequestException('Header X-Idempotency-Key is required');
    }
    return this.ordersService.executeFlashCheckout(
      user.sub,
      idempotencyKey,
      dto,
      benchmarkMode,
    );
  }

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createOrder(
    @Headers('x-idempotency-key') idempotencyKey: string | undefined,
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ordersService.createOrder(user.sub, idempotencyKey, dto);
  }

  @Get('admin/overview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async getAdminOverview() {
    return this.ordersService.getAdminDashboardOverview();
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  async listOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query('all') all?: string,
    @Query('status') status?: OrderStatus,
  ) {
    if (all === 'true' && user.role !== Role.ADMIN) {
      throw new ForbiddenException(
        'Không có quyền hạn: Chỉ Quản trị viên mới được xem toàn bộ danh sách đơn hàng.',
      );
    }
    const includeAll = all === 'true' && user.role === Role.ADMIN;
    return this.ordersService.findUserOrders(user.sub, includeAll, status);
  }

  @Get('lookup')
  async lookupOrderGet(
    @Query('phone') phone?: string,
    @Query('orderCode') orderCode?: string,
  ) {
    if (!phone) {
      throw new BadRequestException(
        'Vui lòng cung cấp số điện thoại người nhận để tra cứu đơn hàng',
      );
    }
    return this.ordersService.lookupOrder(phone, orderCode);
  }

  @Post('lookup')
  @HttpCode(HttpStatus.OK)
  async lookupOrderPost(@Body() dto: LookupOrderDto) {
    return this.ordersService.lookupOrder(dto.phone, dto.orderCode);
  }

  @Patch(':id/fulfillment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async updateFulfillment(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateFulfillmentDto,
  ) {
    return this.ordersService.updateOrderFulfillment(id, dto);
  }

  @Get(':id')
  async getOrder(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.ordersService.findOrderById(id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelOrder(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.ordersService.cancelOrder(id);
  }

  @Patch(':id/payment-plan')
  async updatePaymentPlan(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePaymentPlanDto,
  ) {
    return this.ordersService.updateOrderPaymentPlan(id, dto.paymentPlan);
  }

  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  async updateOrderStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.adminUpdateOrderStatus(id, dto.status);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @HttpCode(HttpStatus.OK)
  async deleteOrder(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.ordersService.deleteOrder(id);
  }
}
