import { Global, Module } from '@nestjs/common';
import { InventoryModule } from '../modules/inventory/inventory.module';
import { NotificationWorker } from './notification.worker';
import { StockSettlementWorker } from './stock-settlement.worker';
import { OrderExpirationWorker } from './order-expiration.worker';
import { KafkaEventService } from './kafka-event.service';

@Global()
@Module({
  imports: [InventoryModule],
  providers: [
    NotificationWorker,
    StockSettlementWorker,
    OrderExpirationWorker,
    KafkaEventService,
  ],
  exports: [
    NotificationWorker,
    StockSettlementWorker,
    OrderExpirationWorker,
    KafkaEventService,
  ],
})
export class WorkersModule {}
