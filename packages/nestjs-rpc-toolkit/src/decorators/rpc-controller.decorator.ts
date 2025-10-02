import { Controller } from '@nestjs/common';
import { MessagePattern as NestMessagePattern } from '@nestjs/microservices';
import { rpcRegistry, RpcMethodMetadata } from '../rpc/rpc-registry';
import 'reflect-metadata';

/**
 * RPC Controller decorator for classes that contain RPC methods.
 * This decorator applies the NestJS @Controller decorator internally
 * and sets metadata for RPC method discovery and pattern generation.
 *
 * @param prefix - Optional module prefix for RPC patterns (e.g., 'user', 'product').
 *                 If not provided, infers from class name by removing common suffixes:
 *                 Service, Application, Handler, Repository
 * @example
 * ```typescript
 * @RpcController('user')
 * export class UserService {
 *   @RpcMethod()
 *   async findAll(): Promise<User[]> {
 *     // Pattern: auto-generated as 'user.findAll'
 *     return this.users;
 *   }
 * }
 *
 * @RpcController() // Infers 'user' from UserService
 * export class UserService { ... }
 *
 * @RpcController() // Infers 'product' from ProductApplication
 * export class ProductApplication { ... }
 *
 * @RpcController() // Infers 'order' from OrderHandler
 * export class OrderHandler { ... }
 *
 * @RpcController() // Infers 'customer' from CustomerRepository
 * export class CustomerRepository { ... }
 * ```
 */
export function RpcController(prefix?: string): ClassDecorator {
  return function (target: any) {
    // Apply the NestJS Controller decorator
    Controller()(target);

    // Set RPC-specific metadata for pattern generation
    let modulePrefix = prefix;
    if (!modulePrefix) {
      // Infer from class name: UserService -> 'user', ProductApplication -> 'product', OrderHandler -> 'order'
      modulePrefix = target.name
        .replace(/(Service|Application|Handler|Repository)$/, '')
        .toLowerCase();
    }

    Reflect.defineMetadata('rpc:module', modulePrefix, target);

    // Process any pending @RpcMethod decorators that were applied before @RpcController
    const pendingMethods = Reflect.getMetadata('rpc:pending-methods', target) || [];
    for (const { propertyKey, descriptor } of pendingMethods) {
      const methodName = propertyKey;
      const actualPattern = `${modulePrefix}.${methodName}`;

      // Register in RPC registry
      const metadata: RpcMethodMetadata = {
        pattern: actualPattern,
        module: modulePrefix as string,
        methodName,
        target,
        propertyKey,
      };
      rpcRegistry.registerMethod(metadata);

      // Apply the NestJS MessagePattern decorator
      NestMessagePattern(actualPattern)(target.prototype, propertyKey, descriptor);
    }

    // Clear the pending methods
    Reflect.deleteMetadata('rpc:pending-methods', target);

    return target;
  };
}