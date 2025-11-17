import 'reflect-metadata';
import { rpcRegistry } from '@zdavison/nestjs-rpc-toolkit';
// Import services to trigger decorator execution
import '@modules/user/src/user.service';
import '@modules/auth/src/auth.service';

describe('@RpcMethod decorator - Code generation and metadata registration', () => {
  // Decorators execute at import time, so registry is already populated

  describe('RPC Method Registration', () => {
    it('should register @RpcMethod decorated methods in the RPC registry', () => {
      const allMethods = rpcRegistry.getAllMethods();

      expect(allMethods.length).toBeGreaterThan(0);

      const userCreateMethod = allMethods.find(m => m.pattern === 'user.create');
      expect(userCreateMethod).toBeDefined();
      expect(userCreateMethod?.module).toBe('user');
      expect(userCreateMethod?.methodName).toBe('create');

      const authRegisterMethod = allMethods.find(m => m.pattern === 'auth.register');
      expect(authRegisterMethod).toBeDefined();
      expect(authRegisterMethod?.module).toBe('auth');
      expect(authRegisterMethod?.methodName).toBe('register');
    });

    it('should generate correct RPC patterns as module.methodName', () => {
      const userMethods = rpcRegistry.getModuleMethods('user');

      expect(userMethods.length).toBeGreaterThan(0);

      const createMethod = userMethods.find(m => m.methodName === 'create');
      expect(createMethod?.pattern).toBe('user.create');

      const lookupUsersMethod = userMethods.find(m => m.methodName === 'lookupUsers');
      expect(lookupUsersMethod?.pattern).toBe('user.lookupUsers');
    });

    it('should register all @RpcMethod decorated methods from a controller', () => {
      const userMethods = rpcRegistry.getModuleMethods('user');
      const userMethodNames = userMethods.map(m => m.methodName);

      expect(userMethodNames).toContain('create');
      expect(userMethodNames).toContain('lookupUsers');

      const authMethods = rpcRegistry.getModuleMethods('auth');
      const authMethodNames = authMethods.map(m => m.methodName);

      expect(authMethodNames).toContain('register');
      expect(authMethodNames).toContain('getUserEmailsById');
    });
  });


  describe('RPC Pattern Inference', () => {
    it('should infer module name from service class name for UserService', () => {
      const userMethods = rpcRegistry.getModuleMethods('user');

      expect(userMethods.length).toBeGreaterThan(0);
      userMethods.forEach(method => {
        expect(method.module).toBe('user');
        expect(method.pattern.startsWith('user.')).toBe(true);
      });
    });

    it('should infer module name from service class name for AuthService', () => {
      const authMethods = rpcRegistry.getModuleMethods('auth');

      expect(authMethods.length).toBeGreaterThan(0);
      authMethods.forEach(method => {
        expect(method.module).toBe('auth');
        expect(method.pattern.startsWith('auth.')).toBe(true);
      });
    });

    it('should use method name as the second part of the pattern', () => {
      const createMethod = rpcRegistry.getMethod('user.create');
      expect(createMethod?.methodName).toBe('create');

      const registerMethod = rpcRegistry.getMethod('auth.register');
      expect(registerMethod?.methodName).toBe('register');

      const lookupMethod = rpcRegistry.getMethod('user.lookupUsers');
      expect(lookupMethod?.methodName).toBe('lookupUsers');
    });
  });

  describe('Multiple RPC Methods', () => {
    it('should support multiple @RpcMethod decorators in the same class', () => {
      const userMethods = rpcRegistry.getModuleMethods('user');

      expect(userMethods.length).toBeGreaterThanOrEqual(2);

      const methodNames = userMethods.map(m => m.methodName);
      expect(methodNames).toContain('create');
      expect(methodNames).toContain('lookupUsers');
    });

    it('should register methods from multiple services', () => {
      const userMethods = rpcRegistry.getModuleMethods('user');
      const authMethods = rpcRegistry.getModuleMethods('auth');

      expect(userMethods.length).toBeGreaterThan(0);
      expect(authMethods.length).toBeGreaterThan(0);

      // Verify they're kept separate
      const allPatterns = [...userMethods, ...authMethods].map(m => m.pattern);
      const uniquePatterns = new Set(allPatterns);
      expect(allPatterns.length).toBe(uniquePatterns.size);
    });
  });
});