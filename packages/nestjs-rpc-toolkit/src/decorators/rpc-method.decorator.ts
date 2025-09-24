import { MessagePattern as NestMessagePattern } from '@nestjs/microservices';
import { rpcRegistry, RpcMethodMetadata } from '../rpc/rpc-registry';
import { SerializableRpcMethod } from '../types/serializable';
import 'reflect-metadata';

/**
 * RPC Method decorator with compile-time serialization validation.
 * Ensures all parameters and return types are JSON-serializable for TCP transport.
 * Pattern is automatically generated from the class name or @Controller decorator.
 *
 * @example
 * ```typescript
 * @RpcMethod()
 * async findUser(id: string): Promise<User> {
 *   // ✅ Valid: string param, User return type are serializable
 *   // Pattern: auto-generated as 'user.findUser' or 'controllerName.findUser'
 *   return this.userRepo.findById(id);
 * }
 *
 * @RpcMethod()
 * async invalidMethod(callback: (data: string) => void): Promise<HTMLElement> {
 *   // ❌ Error: callback and HTMLElement are not serializable
 * }
 * ```
 */
export function RpcMethod<T extends (...args: any[]) => any>(): (
  target: any,
  propertyKey: string,
  descriptor: TypedPropertyDescriptor<T>
) => TypedPropertyDescriptor<SerializableRpcMethod<T>> | void {
  return function (
    target: any,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<T>
  ): TypedPropertyDescriptor<SerializableRpcMethod<T>> | void {
    const originalMethod = descriptor.value!;

    // Get module prefix from @RpcController decorator metadata
    const module = Reflect.getMetadata('rpc:module', target.constructor);

    if (!module) {
      throw new Error(`@RpcMethod can only be used in classes decorated with @RpcController. Class: ${target.constructor.name}`);
    }

    // Use method name for the pattern
    const methodName = propertyKey;
    const actualPattern = `${module}.${methodName}`;

    // Register in RPC registry
    const metadata: RpcMethodMetadata = {
      pattern: actualPattern,
      module,
      methodName,
      target: target.constructor,
      propertyKey,
    };
    rpcRegistry.registerMethod(metadata);

    // Create wrapper method that handles array-based payloads
    descriptor.value = function (this: any, args: any[]) {
      // If args is an array, spread it as arguments, otherwise pass as single argument
      if (Array.isArray(args)) {
        return originalMethod.apply(this, args);
      }
      return originalMethod.call(this, args);
    } as any;

    // Apply the NestJS MessagePattern decorator
    NestMessagePattern(actualPattern)(target, propertyKey, descriptor);
  };
}