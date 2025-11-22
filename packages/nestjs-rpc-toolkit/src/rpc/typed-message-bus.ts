import { Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';

// Base message interface
export interface RpcMessage<TData = any, TReturns = any> {
  pattern: string;
  data: TData;
  // Phantom type for return value (not used at runtime, just for TypeScript)
  _returns?: TReturns;
}

export interface IMessageBus<TRpcMethods = any> {
  /**
   * Send a typed RPC message using pattern and data
   * @param pattern - The RPC pattern (e.g., 'user.findOne')
   * @param data - The message data
   * @returns Promise of the RPC response with correct typing
   */
  send<TPattern extends keyof TRpcMethods>(
    pattern: TPattern,
    data: TRpcMethods[TPattern] extends { params: infer P } ? P : any
  ): Promise<TRpcMethods[TPattern] extends { returns: infer R } ? R : any>;

  /**
   * Emit a message (fire-and-forget)
   * @param pattern - The event pattern
   * @param data - The event data
   */
  emit(pattern: string, data: any): void;
}

@Injectable()
export class MessageBus<TRpcMethods = any> implements IMessageBus<TRpcMethods> {
  constructor(private readonly client: ClientProxy<any, any>) {}

  async send<TPattern extends keyof TRpcMethods>(
    pattern: TPattern,
    data: TRpcMethods[TPattern] extends { params: infer P } ? P : any
  ): Promise<TRpcMethods[TPattern] extends { returns: infer R } ? R : any> {
    try {
      const result = await this.client.send(pattern, data).toPromise();
      return result;
    } catch (error) {
      // Re-throw with pattern context for better debugging
      throw new Error(`RPC call to '${String(pattern)}' failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  emit(pattern: string, data: any): void {
    this.client.emit(pattern, data);
  }
}