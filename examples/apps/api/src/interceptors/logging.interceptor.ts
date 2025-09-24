import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const { method, originalUrl, body, query, params } = request;
    const userAgent = request.get('User-Agent') || '';
    const ip = request.ip;

    const now = Date.now();

    this.logger.log(
      `📥 [${method}] ${originalUrl} - ${ip} - ${userAgent}${
        Object.keys(body || {}).length ? ` - Body: ${JSON.stringify(body)}` : ''
      }${
        Object.keys(query || {}).length ? ` - Query: ${JSON.stringify(query)}` : ''
      }${
        Object.keys(params || {}).length ? ` - Params: ${JSON.stringify(params)}` : ''
      }`
    );

    return next.handle().pipe(
      tap(() => {
        const statusCode = response.statusCode;
        const delay = Date.now() - now;

        this.logger.log(
          `📤 [${method}] ${originalUrl} - ${statusCode} - ${delay}ms`
        );
      })
    );
  }
}