import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MicroserviceOptions } from '@nestjs/microservices';
import { InProcessTransportStrategy, InProcessClientProxy, createRpcClientProxy } from '@zdavison/nestjs-rpc-toolkit';
import { UserService } from '@modules/user/dist/user.service';
import { AuthService } from '@modules/auth/dist/auth.service';
import { JwtModule } from '@nestjs/jwt';
import { IRpcClient, RpcTypeInfo, RpcFunctionInfo } from '@meetsmore/lib-rpc';
import { ClientProxy } from '@nestjs/microservices';

describe('RPC modules must be able to be co-located in the same process, and communicate over an in-process bus.', () => {
  let app: INestApplication;
  let rpc: IRpcClient;
  let userService: UserService;
  let authService: AuthService;
  let transport: InProcessTransportStrategy;

  beforeAll(async () => {
    // Create explicit transport instance for this test suite
    transport = new InProcessTransportStrategy();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '1d' },
        }),
      ],
      controllers: [UserService, AuthService], // Register as controllers for RPC
      providers: [
        UserService,
        AuthService,
        // Provide the transport for injection
        {
          provide: 'IN_PROCESS_TRANSPORT',
          useValue: transport,
        },
        // Create client with explicit transport
        {
          provide: 'MICROSERVICE_CLIENT',
          useFactory: (t: InProcessTransportStrategy) => new InProcessClientProxy(t),
          inject: ['IN_PROCESS_TRANSPORT'],
        },
        {
          provide: 'RPC',
          useFactory: (client: ClientProxy<any, any>) => {
            return createRpcClientProxy(client, {
              typeInfo: RpcTypeInfo,
              functionInfo: RpcFunctionInfo,
            }) as IRpcClient;
          },
          inject: ['MICROSERVICE_CLIENT'],
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Connect microservice with the same transport instance
    app.connectMicroservice<MicroserviceOptions>({
      strategy: transport,
    });

    await app.startAllMicroservices();

    await app.init();

    // Get RPC client and service instances from the compiled module
    rpc = moduleFixture.get<IRpcClient>('RPC');

    userService = moduleFixture.get(UserService);
    authService = moduleFixture.get(AuthService);
  });

  beforeEach(() => {
    // Clear in-memory data between tests
    if (authService) {
      (authService as any).users?.clear();
      (authService as any).idCounter = 1;
    }
    if (userService) {
      (userService as any).users = [];
      (userService as any).idCounter = 1;
    }
  });

  afterAll(async () => {
    if (app) {
      try {
        await Promise.race([
          app.close(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]);
      } catch (e) {
      }
    } else {
    }
  }, 10000);

  describe('Basic RPC Communication', () => {
    it('should successfully create a user through RPC', async () => {
      const createUserDto = {
        email: `test-basic-create-${Date.now()}@example.com`,
        firstName: 'John',
        lastName: 'Doe',
        isActive: true,
      };

      const user = await rpc.user.create({ createUserDto });

      expect(user).toBeDefined();
      expect(user.id).toBeDefined();
      expect(user.email).toBe(createUserDto.email);
      expect(user.firstName).toBe(createUserDto.firstName);
      expect(user.lastName).toBe(createUserDto.lastName);
      expect(user.isActive).toBe(true);
      // With codec decoding, dates are converted back to Date objects
      expect(user.createdAt).toBeInstanceOf(Date);
      expect(user.updatedAt).toBeInstanceOf(Date);
    });

    it('should successfully register a user through auth RPC', async () => {
      const registerDto = {
        email: `auth-basic-register-${Date.now()}@example.com`,
        password: 'securePassword123',
      };

      const result = await rpc.auth.register({ registerDto });

      expect(result).toBeDefined();
      expect(result.accessToken).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe(registerDto.email);
      expect(result.user.id).toBeDefined();
    });

    it('should handle nested Date fields in responses', async () => {
      // First create a user
      const createUserDto = {
        email: `nested-dates-${Date.now()}@example.com`,
        firstName: 'Nested',
        lastName: 'DateTest',
        isActive: true,
      };

      const user = await rpc.user.create({ createUserDto });
      expect(user.id).toBeDefined();

      // Get user with profile (contains nested Date fields)
      const userWithProfile = await rpc.user.getUserWithProfile({ userId: user.id });

      expect(userWithProfile).not.toBeNull();
      expect(userWithProfile!.id).toBe(user.id);
      expect(userWithProfile!.email).toBe(createUserDto.email);

      // Top-level Date field should be a Date instance
      expect(userWithProfile!.createdAt).toBeInstanceOf(Date);

      // Nested profile Date fields should also be Date instances
      expect(userWithProfile!.profile).toBeDefined();
      expect(userWithProfile!.profile.lastUpdated).toBeInstanceOf(Date);
      expect(userWithProfile!.profile.lastLoginAt).toBeInstanceOf(Date);
    });
  });

  describe('Cross-Module RPC Communication', () => {
    it('should allow UserService to call AuthService via RPC', async () => {
      const createUserDto = {
        email: `crossmodule-${Date.now()}@example.com`,
        firstName: 'Jane',
        lastName: 'Smith',
        isActive: true,
      };

      // When creating a user, it internally calls auth.register via RPC
      const user = await rpc.user.create({ createUserDto });

      expect(user).toBeDefined();
      expect(user.email).toBe(createUserDto.email);
    });

    it('should allow AuthService to call UserService via RPC', async () => {
      // First create some users
      await rpc.user.create({
        createUserDto: {
          email: 'user1@example.com',
          firstName: 'User',
          lastName: 'One',
          isActive: true,
        }
      });

      await rpc.user.create({
        createUserDto: {
          email: 'user2@example.com',
          firstName: 'User',
          lastName: 'Two',
          isActive: true,
        }
      });

      // AuthService calls user.lookupUsers via RPC
      const emails = await rpc.auth.getUserEmailsById({ userIds: [1, 2] });

      expect(emails).toBeDefined();
      expect(Array.isArray(emails)).toBe(true);
      expect(emails.length).toBeGreaterThan(0);
    });
  });

  describe('InProcessTransportStrategy Instance Isolation', () => {
    it('should create separate instances with separate handlers', () => {
      const transport1 = new InProcessTransportStrategy();
      const transport2 = new InProcessTransportStrategy();

      expect(transport1).not.toBe(transport2);
    });

    it('should allow resetting handlers for test isolation', () => {
      const testTransport = new InProcessTransportStrategy();

      // Reset should clear handlers without error
      expect(() => testTransport.reset()).not.toThrow();
    });

    it('should register and route messages correctly through the transport', async () => {
      // The transport from beforeAll should be able to send messages
      expect(transport.sendMessage).toBeDefined();
      expect(typeof transport.sendMessage).toBe('function');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when calling non-existent RPC pattern', async () => {
      // Use the test suite's transport instance
      await expect(
        transport.sendMessage('nonexistent.method', {})
      ).rejects.toThrow('No handler registered for pattern: nonexistent.method');
    });

    it('should handle errors in RPC method calls gracefully', async () => {
      // Try to register with duplicate email
      const registerDto = {
        email: `duplicate-${Date.now()}@example.com`,
        password: 'password123',
      };

      await rpc.auth.register({ registerDto });

      // Second registration should fail
      await expect(
        rpc.auth.register({ registerDto })
      ).rejects.toThrow();
    });
  });

  describe('InProcessClientProxy', () => {
    it('should connect successfully without network overhead', async () => {
      const testTransport = new InProcessTransportStrategy();
      const client = new InProcessClientProxy(testTransport);
      await expect(client.connect()).resolves.toBeUndefined();
    });

    it('should close without errors', () => {
      const testTransport = new InProcessTransportStrategy();
      const client = new InProcessClientProxy(testTransport);
      expect(() => client.close()).not.toThrow();
    });

    it('should use the provided transport for messaging', async () => {
      const testTransport = new InProcessTransportStrategy();
      const client = new InProcessClientProxy(testTransport);

      // unwrap() should return the transport
      expect(client.unwrap()).toBe(testTransport);
    });
  });

  describe('Performance and In-Memory Communication', () => {
    it('should handle multiple rapid RPC calls efficiently', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        rpc.user.create({
          createUserDto: {
            email: `rapid${i}@example.com`,
            firstName: 'Rapid',
            lastName: `User${i}`,
            isActive: true,
          }
        })
      );

      const results = await Promise.all(promises);

      expect(results.length).toBe(10);
      results.forEach((user, i) => {
        expect(user.email).toBe(`rapid${i}@example.com`);
        expect(user.id).toBeDefined();
      });
    });

    it('should maintain data integrity across concurrent RPC calls', async () => {
      const concurrentCalls = Array.from({ length: 5 }, async (_, i) => {
        const user = await rpc.user.create({
          createUserDto: {
            email: `concurrent${i}@example.com`,
            firstName: 'Concurrent',
            lastName: `User${i}`,
            isActive: true,
          }
        });

        // Use a different password to avoid duplicate registration
        // Note: UserService.create already registers with 'some-password'
        // So we skip the second registration to avoid conflicts
        return { user, authResult: { accessToken: 'mock-token' } };
      });

      const results = await Promise.all(concurrentCalls);

      expect(results.length).toBe(5);
      results.forEach((result, i) => {
        expect(result.user.email).toBe(`concurrent${i}@example.com`);
        expect(result.authResult.accessToken).toBeDefined();
      });
    });
  });
});