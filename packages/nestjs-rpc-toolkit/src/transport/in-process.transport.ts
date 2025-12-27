import { CustomTransportStrategy, Server, ReadPacket, BaseRpcContext } from '@nestjs/microservices';

/**
 * In-process transport strategy for RPC communication within a single process.
 *
 * Unlike network-based transports, this keeps all communication in-memory,
 * making it ideal for modular monolith architectures where modules communicate
 * via RPC but run in the same process.
 *
 * @example
 * ```typescript
 * // Create a transport instance
 * const transport = new InProcessTransportStrategy();
 *
 * // Use in RpcModule
 * RpcModule.forRoot({ transport })
 *
 * // Use in app bootstrap
 * app.connectMicroservice({ strategy: transport });
 * ```
 */
export class InProcessTransportStrategy extends Server implements CustomTransportStrategy {
  // Required for NestJS v11 compatibility
  on<EventKey extends string = string, EventCallback extends Function = Function>(
    _event: EventKey,
    _callback: EventCallback,
  ): any {
    // In-process transport doesn't emit events, but we implement this for compatibility
  }

  // Required for NestJS v11 compatibility
  unwrap<T>(): T {
    // Return this instance as the underlying "server"
    return this as unknown as T;
  }

  listen(callback: () => void): void {
    callback();
  }

  close(): void {
    // Clean up if needed
  }

  /**
   * Reset the transport by clearing all registered handlers.
   * Useful for testing scenarios where you want a clean state.
   */
  reset(): void {
    this.messageHandlers.clear();
  }

  async handleMessage(
    pattern: string,
    packet: ReadPacket,
    context: BaseRpcContext,
  ): Promise<any> {
    const handler = this.getHandlerByPattern(pattern);
    if (!handler) {
      throw new Error(`No handler registered for pattern: ${pattern}`);
    }

    const result = await handler(packet.data, context);

    // If the handler returns an Observable (error case), we need to convert it to a rejection
    if (result && typeof result === 'object' && '_subscribe' in result) {
      // This is an Observable - convert to promise and await it
      const { firstValueFrom } = require('rxjs');
      return await firstValueFrom(result);
    }

    return result;
  }

  async handleEvent(
    pattern: string,
    packet: ReadPacket,
    context: BaseRpcContext,
  ): Promise<any> {
    const handler = this.getHandlerByPattern(pattern);
    if (handler) {
      try {
        await handler(packet.data, context);
      } catch (error) {
        console.error(`Error in event handler for ${pattern}:`, error);
      }
    }
  }

  // Internal method to send messages
  async sendMessage(pattern: string, data: any): Promise<any> {
    const packet: ReadPacket = { pattern, data };
    const context = new BaseRpcContext([]);
    return await this.handleMessage(pattern, packet, context);
  }

  // Internal method to emit events
  emitEvent(pattern: string, data: any): void {
    const packet: ReadPacket = { pattern, data };
    const context = new BaseRpcContext([]);
    this.handleEvent(pattern, packet, context);
  }
}