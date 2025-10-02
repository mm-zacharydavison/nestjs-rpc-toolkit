import { ValidateRpcMethod } from '../types/serializable';
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
export function RpcMethod() {
  return function <TMethod extends (...args: any[]) => any>(
    target: any,
    propertyKey: string,
    descriptor: TypedPropertyDescriptor<ValidateRpcMethod<TMethod>>
  ): void {
    const originalMethod = descriptor.value!;

    // Defer the module lookup and pattern registration until runtime
    // This is necessary because method decorators execute before class decorators
    const getModuleAndPattern = () => {
      const module = Reflect.getMetadata('rpc:module', target.constructor);
      if (!module) {
        throw new Error(`@RpcMethod can only be used in classes decorated with @RpcController. Class: ${target.constructor.name}`);
      }
      return {
        module,
        pattern: `${module}.${propertyKey}`
      };
    };

    // Create wrapper method that handles RPC parameter unwrapping
    descriptor.value = function (this: any, ...args: any[]) {
      // Defer the module check until the method is actually called
      // This allows the class decorator to run first
      getModuleAndPattern();

      // NestJS microservices sends parameters as a single object: { paramName: value }
      // We need to unwrap this and pass the actual values to the method
      let unwrappedArgs = args;

      if (args.length === 1 && typeof args[0] === 'object' && args[0] !== null) {
        // Extract parameter names from the original method
        const methodStr = originalMethod.toString();
        const paramMatch = methodStr.match(/^(?:async\s+)?(?:function\s*)?\w*\s*\(([^)]*)\)/);

        if (paramMatch) {
          const paramNames = paramMatch[1]
            .split(',')
            .map(p => p.trim().split(/[:\s=]/)[0])
            .filter(p => p.length > 0);

          // If the incoming object has exactly the parameter names as keys, unwrap them
          const incomingKeys = Object.keys(args[0]);
          if (paramNames.length > 0 && incomingKeys.length === paramNames.length) {
            const allMatch = paramNames.every(name => incomingKeys.includes(name));
            if (allMatch) {
              unwrappedArgs = paramNames.map(name => args[0][name]);
            }
          }
        }
      }

      // Call the original method with the unwrapped arguments
      return originalMethod.apply(this, unwrappedArgs as any);
    } as any;

    // Store the method for lazy pattern registration
    // We'll register it when @RpcController is applied
    if (!Reflect.hasMetadata('rpc:pending-methods', target.constructor)) {
      Reflect.defineMetadata('rpc:pending-methods', [], target.constructor);
    }
    const pendingMethods = Reflect.getMetadata('rpc:pending-methods', target.constructor);
    pendingMethods.push({
      propertyKey,
      originalMethod,
      descriptor,
    });
  };
}