import { CustomTransportStrategy, Server, ReadPacket, BaseRpcContext } from '@nestjs/microservices';

export class InProcessTransportStrategy extends Server implements CustomTransportStrategy {
  private static instance: InProcessTransportStrategy;

  static getInstance(): InProcessTransportStrategy {
    if (!InProcessTransportStrategy.instance) {
      InProcessTransportStrategy.instance = new InProcessTransportStrategy();
    }
    return InProcessTransportStrategy.instance;
  }

  listen(callback: () => void): void {
    callback();
  }

  close(): void {
    // Clean up if needed
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

    return await handler(packet.data, context);
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