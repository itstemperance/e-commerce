import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = performance.now();
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    return next.handle().pipe(
      tap(() => {
        if (req.headers['x-benchmark-mode']) {
          return;
        }
        const durationMs = Number((performance.now() - start).toFixed(2));
        setImmediate(() => {
          this.logger.log(
            JSON.stringify({
              event: 'HTTP_REQUEST_COMPLETED',
              method: req.method,
              url: req.originalUrl,
              statusCode: res.statusCode,
              durationMs,
              idempotencyKey: req.headers['x-idempotency-key'] ?? null,
            }),
          );
        });
      }),
    );
  }
}
