import { Test, TestingModule } from '@nestjs/testing';
import { RpcController, RpcMethod } from '@zdavison/nestjs-rpc-toolkit';
import { Injectable } from '@nestjs/common';
import 'reflect-metadata';

describe('@RpcController decorator integration tests', () => {
  describe('Auto-inferring module prefix from class name', () => {
    it('should infer "user" from UserService', () => {
      @Injectable()
      @RpcController()
      class UserService {}

      const modulePrefix = Reflect.getMetadata('rpc:module', UserService);
      expect(modulePrefix).toBe('user');
    });

    it('should infer "product" from ProductService', () => {
      @Injectable()
      @RpcController()
      class ProductService {}

      const modulePrefix = Reflect.getMetadata('rpc:module', ProductService);
      expect(modulePrefix).toBe('product');
    });

    it('should infer "order" from OrderApplication', () => {
      @Injectable()
      @RpcController()
      class OrderApplication {}

      const modulePrefix = Reflect.getMetadata('rpc:module', OrderApplication);
      expect(modulePrefix).toBe('order');
    });

    it('should infer "customer" from CustomerHandler', () => {
      @Injectable()
      @RpcController()
      class CustomerHandler {}

      const modulePrefix = Reflect.getMetadata('rpc:module', CustomerHandler);
      expect(modulePrefix).toBe('customer');
    });

    it('should infer "invoice" from InvoiceRepository', () => {
      @Injectable()
      @RpcController()
      class InvoiceRepository {}

      const modulePrefix = Reflect.getMetadata('rpc:module', InvoiceRepository);
      expect(modulePrefix).toBe('invoice');
    });

    it('should handle class names without known suffixes', () => {
      @Injectable()
      @RpcController()
      class Payment {}

      const modulePrefix = Reflect.getMetadata('rpc:module', Payment);
      expect(modulePrefix).toBe('payment');
    });

    it('should convert to lowercase', () => {
      @Injectable()
      @RpcController()
      class InventoryService {}

      const modulePrefix = Reflect.getMetadata('rpc:module', InventoryService);
      expect(modulePrefix).toBe('inventory');
    });
  });

  describe('Custom prefix configuration', () => {
    it('should use custom prefix when provided', () => {
      @Injectable()
      @RpcController('custom-prefix')
      class UserService {}

      const modulePrefix = Reflect.getMetadata('rpc:module', UserService);
      expect(modulePrefix).toBe('custom-prefix');
    });

    it('should override inferred prefix with custom prefix', () => {
      @Injectable()
      @RpcController('account')
      class UserService {}

      const modulePrefix = Reflect.getMetadata('rpc:module', UserService);
      expect(modulePrefix).toBe('account');
      expect(modulePrefix).not.toBe('user');
    });

    it('should support hyphenated custom prefixes', () => {
      @Injectable()
      @RpcController('user-management')
      class UserService {}

      const modulePrefix = Reflect.getMetadata('rpc:module', UserService);
      expect(modulePrefix).toBe('user-management');
    });

    it('should support dot-notation custom prefixes', () => {
      @Injectable()
      @RpcController('api.v1.user')
      class UserService {}

      const modulePrefix = Reflect.getMetadata('rpc:module', UserService);
      expect(modulePrefix).toBe('api.v1.user');
    });
  });

  describe('Metadata verification with reflect-metadata', () => {
    it('should correctly store and retrieve metadata', () => {
      @Injectable()
      @RpcController('user')
      class UserService {}

      const modulePrefix = Reflect.getMetadata('rpc:module', UserService);
      expect(modulePrefix).toBe('user');
      expect(typeof modulePrefix).toBe('string');
    });

    it('should not interfere with other metadata', () => {
      @Injectable()
      @RpcController('product')
      class ProductService {}

      Reflect.defineMetadata('custom:key', 'custom-value', ProductService);

      const rpcModule = Reflect.getMetadata('rpc:module', ProductService);
      const customValue = Reflect.getMetadata('custom:key', ProductService);

      expect(rpcModule).toBe('product');
      expect(customValue).toBe('custom-value');
    });

    it('should have different metadata per class', () => {
      @Injectable()
      @RpcController('user')
      class UserService {}

      @Injectable()
      @RpcController('auth')
      class AuthService {}

      const userModule = Reflect.getMetadata('rpc:module', UserService);
      const authModule = Reflect.getMetadata('rpc:module', AuthService);

      expect(userModule).toBe('user');
      expect(authModule).toBe('auth');
      expect(userModule).not.toBe(authModule);
    });
  });

  describe('NestJS Controller decorator application', () => {
    it('should apply NestJS Controller decorator internally', () => {
      @Injectable()
      @RpcController()
      class TestService {}

      const controllerPath = Reflect.getMetadata('path', TestService);
      expect(controllerPath).toBeDefined();
    });

    it('should be instantiable as a NestJS controller', async () => {
      @Injectable()
      @RpcController()
      class TestService {
        getValue(): string {
          return 'test';
        }
      }

      const moduleRef = await Test.createTestingModule({
        controllers: [TestService],
        providers: [TestService],
      }).compile();

      const service = moduleRef.get(TestService);
      expect(service).toBeDefined();
      expect(service.getValue()).toBe('test');
    });
  });

  describe('Controller registration in NestJS module', () => {
    it('should be registered as both controller and provider', async () => {
      @Injectable()
      @RpcController()
      class TestService {
        getData(): string {
          return 'test-data';
        }
      }

      const moduleRef = await Test.createTestingModule({
        controllers: [TestService],
        providers: [TestService],
      }).compile();

      const service = moduleRef.get(TestService);
      expect(service).toBeDefined();
      expect(service.getData()).toBe('test-data');
    });

    it('should maintain metadata when used as controller', async () => {
      @Injectable()
      @RpcController('custom')
      class MyService {}

      const moduleRef = await Test.createTestingModule({
        controllers: [MyService],
        providers: [MyService],
      }).compile();

      const service = moduleRef.get(MyService);
      const modulePrefix = Reflect.getMetadata('rpc:module', service.constructor);

      expect(service).toBeDefined();
      expect(modulePrefix).toBe('custom');
    });
  });

  describe('Edge cases and error handling', () => {
    it('should fall back to auto-inference when empty string prefix is provided', () => {
      @Injectable()
      @RpcController('')
      class TestService {}

      const modulePrefix = Reflect.getMetadata('rpc:module', TestService);
      expect(modulePrefix).toBe('test');
    });

    it('should handle single character class names', () => {
      @Injectable()
      @RpcController()
      class X {}

      const modulePrefix = Reflect.getMetadata('rpc:module', X);
      expect(modulePrefix).toBe('x');
    });

    it('should handle class names ending with multiple suffixes', () => {
      @Injectable()
      @RpcController()
      class UserServiceHandler {}

      const modulePrefix = Reflect.getMetadata('rpc:module', UserServiceHandler);
      expect(modulePrefix).toBe('userservice');
    });

    it('should handle numeric prefixes', () => {
      @Injectable()
      @RpcController('v1')
      class ApiService {}

      const modulePrefix = Reflect.getMetadata('rpc:module', ApiService);
      expect(modulePrefix).toBe('v1');
    });

    it('should preserve case in custom prefixes', () => {
      @Injectable()
      @RpcController('UserAPI')
      class UserService {}

      const modulePrefix = Reflect.getMetadata('rpc:module', UserService);
      expect(modulePrefix).toBe('UserAPI');
    });
  });
});