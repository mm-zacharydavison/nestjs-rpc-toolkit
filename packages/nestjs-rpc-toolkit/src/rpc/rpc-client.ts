import { Injectable } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class RpcClient {
  constructor(private readonly client: ClientProxy<any, any>) {}

  /**
   * Create domain proxies dynamically based on the RPC methods available
   */
  createDomainProxy(domain: string): any {
    return new Proxy({}, {
      get: (_target, methodName: string) => {
        return async (params: any) => {
          const pattern = `${domain}.${methodName}`;
          try {
            const observable = this.client.send(pattern, params);
            const result = await firstValueFrom(observable);
            return result;
          } catch (error) {
            throw new Error(`RPC call to '${pattern}' failed: ${error instanceof Error ? error.message : String(error)}`);
          }
        };
      }
    });
  }
}

// Base interface for the typed RPC client
export interface ITypedRpcClient {
  [domain: string]: {
    [method: string]: (params: any) => Promise<any>;
  };
}