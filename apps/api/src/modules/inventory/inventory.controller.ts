import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { InventoryAuditReport, InventoryService } from './inventory.service';

export class ResetStockDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  stock?: number;
}

@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get(':productId')
  async getStock(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Headers('x-benchmark-mode') benchmarkMode?: string,
    @Query('nocache') nocache?: string,
  ) {
    const bypassCache = benchmarkMode === 'no-cache' || nocache === '1';
    return this.inventoryService.getStockSnapshot(productId, bypassCache);
  }

  @Get(':productId/audit')
  async auditStock(
    @Param('productId', new ParseUUIDPipe()) productId: string,
  ): Promise<InventoryAuditReport> {
    return this.inventoryService.auditProductStock(productId);
  }

  @Post(':productId/reset')
  @HttpCode(HttpStatus.OK)
  async resetStock(
    @Param('productId', new ParseUUIDPipe()) productId: string,
    @Body() dto: ResetStockDto,
  ): Promise<InventoryAuditReport> {
    return this.inventoryService.resetProductForBenchmark(productId, dto.stock ?? 50);
  }
}
