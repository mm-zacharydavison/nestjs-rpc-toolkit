import { Module, DynamicModule, type Type } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import type { RpcClientProxy } from '../interfaces';

/**
 * Options for RpcModule.forRoot()
 */
export interface RpcModuleOptions {
  /**
   * The ClientProxy class to use for RPC communication.
   * Typically InProcessClientProxy for monolith deployments.
   * Uses a flexible type to support both NestJS 10 (non-generic) and NestJS 11 (generic) ClientProxy.
   */
  clientProxyClass: Type<RpcClientProxy>;

  /**
   * Optional injection token for the client.
   * Defaults to 'RPC_CLIENT'.
   */
  clientToken?: string;
}

/**
 * Token used to inject the RPC ClientProxy.
 */
export const RPC_CLIENT = 'RPC_CLIENT';

/**
 * Module that configures RPC communication for a NestJS application.
 *
 * @example
 * ```typescript
 * import { RpcModule, InProcessClientProxy } from '@zdavison/nestjs-rpc-toolkit';
 *
 * @Module({
 *   imports: [
 *     RpcModule.forRoot({
 *       clientProxyClass: InProcessClientProxy,
 *     }),
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Module({})
export class RpcModule {
  /**
   * Configure the RPC module with a specific ClientProxy implementation.
   *
   * @param options - Configuration options including the ClientProxy class
   * @returns Dynamic module configuration
   */
  static forRoot(options: RpcModuleOptions): DynamicModule {
    const clientToken = options.clientToken ?? RPC_CLIENT;

    return {
      module: RpcModule,
      imports: [
        ClientsModule.register([
          {
            name: clientToken,
            // Cast to any to support both NestJS 10 and 11 ClientProxy types
            customClass: options.clientProxyClass as any,
          },
        ]),
      ],
      exports: [ClientsModule],
      global: true,
    };
  }
}
