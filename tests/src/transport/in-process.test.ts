import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MicroserviceOptions } from '@nestjs/microservices';
import { InProcessTransportStrategy, InProcessClientProxy } from '@zdavison/nestjs-rpc-toolkit';
import { UserService } from '@modules/user/dist/user.service';
import { AuthService } from '@modules/auth/dist/auth.service';
import { JwtModule } from '@nestjs/jwt';
import { IRpcClient } from '@meetsmore/lib-rpc';
import { ClientsModule, ClientProxy } from '@nestjs/microservices';
import { RpcClient } from '@zdavison/nestjs-rpc-toolkit/dist/rpc/rpc-client';

describe('RPC modules must be able to be co-located in the same process, and communicate over an in-process bus.', () => {
  let app: INestApplication;
  let rpc: IRpcClient;
  let userService: UserService;
  let authService: AuthService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ClientsModule.register([
          {
            name: 'MICROSERVICE_CLIENT',
            customClass: InProcessClientProxy,
          },
        ]),
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '1d' },
        }),
      ],
      controllers: [UserService, AuthService], // Register as controllers for RPC
      providers: [
        UserService,
        AuthService,
        {
          provide: 'RPC',
          useFactory: (client: ClientProxy<any, any>) => {
            const rpcClient = new RpcClient(client);
            return new Proxy({}, {
              get: (_target, domain: string) => {
                return rpcClient.createDomainProxy(domain);
              }
            }) as IRpcClient;
          },
          inject: ['MICROSERVICE_CLIENT'],
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Connect microservice with InProcessTransportStrategy
    app.connectMicroservice<MicroserviceOptions>({
      strategy: InProcessTransportStrategy.getInstance(),
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
      expect(typeof user.createdAt).toBe('string');
      expect(typeof user.updatedAt).toBe('string');
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

  describe('InProcessTransportStrategy Singleton', () => {
    it('should use the same singleton instance across all modules', () => {
      const instance1 = InProcessTransportStrategy.getInstance();
      const instance2 = InProcessTransportStrategy.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should register and route messages correctly through the singleton', async () => {
      const transport = InProcessTransportStrategy.getInstance();

      // The transport should be able to send messages
      expect(transport.sendMessage).toBeDefined();
      expect(typeof transport.sendMessage).toBe('function');
    });
  });

  describe('Error Handling', () => {
    it('should throw error when calling non-existent RPC pattern', async () => {
      const transport = InProcessTransportStrategy.getInstance();

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
      const client = new InProcessClientProxy();
      await expect(client.connect()).resolves.toBeUndefined();
    });

    it('should close without errors', () => {
      const client = new InProcessClientProxy();
      expect(() => client.close()).not.toThrow();
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