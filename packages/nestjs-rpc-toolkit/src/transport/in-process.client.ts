import { ClientProxy, ReadPacket, WritePacket } from '@nestjs/microservices';
import { InProcessTransportStrategy } from './in-process.transport';
import { Observable, defer, from, ReplaySubject, distinctUntilChanged } from 'rxjs';

/**
 * In-process client proxy for RPC communication within a single process.
 *
 * This client sends messages directly to an InProcessTransportStrategy instance,
 * bypassing network overhead entirely.
 *
 * @example
 * ```typescript
 * const transport = new InProcessTransportStrategy();
 * const client = new InProcessClientProxy(transport);
 *
 * // Or use via RpcModule which handles the wiring:
 * RpcModule.forRoot({ transport })
 * ```
 */
export class InProcessClientProxy extends ClientProxy {
  // Required for NestJS v11 compatibility
  protected _status$ = new ReplaySubject<string>(1);

  constructor(private readonly transport: InProcessTransportStrategy) {
    super();
    // Initialize with 'connected' status for in-memory transport
    this._status$.next('connected');
  }

  // Required for NestJS v11 compatibility
  get status(): Observable<string> {
    return this._status$.asObservable().pipe(distinctUntilChanged());
  }

  // Required for NestJS v11 compatibility
  on<EventKey extends string = string>(
    _event: EventKey,
    _callback: (...args: any[]) => void,
  ): void {
    // In-process transport doesn't emit events, but we implement this for compatibility
    // Subclasses can override if they need event handling
  }

  // Required for NestJS v11 compatibility
  unwrap<T>(): T {
    // Return the transport strategy as the underlying "client"
    return this.transport as unknown as T;
  }

  async connect(): Promise<void> {
    this._status$.next('connected');
    return Promise.resolve();
  }

  close(): void {
    this._status$.next('disconnected');
    // Nothing to close for in-memory transport
  }

  protected async dispatchEvent(packet: ReadPacket): Promise<any> {
    const { pattern, data } = packet;
    this.transport.emitEvent(pattern as string, data);
    return Promise.resolve();
  }

  protected publish(packet: ReadPacket, callback: (packet: WritePacket) => void): () => void {
    const { pattern, data } = packet;

    this.transport.sendMessage(pattern as string, data)
      .then(result => {
        callback({ response: result });
      })
      .catch(error => {
        callback({ err: error });
      });

    return () => {}; // Return cleanup function (no-op for in-memory)
  }

  // Override send() to return a proper Observable
  send<TResult = any, TInput = any>(pattern: any, data: TInput): Observable<TResult> {
    return defer(() => from(this.transport.sendMessage(pattern as string, data))) as Observable<TResult>;
  }
}