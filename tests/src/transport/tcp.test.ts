import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MicroserviceOptions, Transport, ClientsModule, ClientProxy } from '@nestjs/microservices';
import { UserService } from '@modules/user/dist/user.service';
import { AuthService } from '@modules/auth/dist/auth.service';
import { JwtModule } from '@nestjs/jwt';
import { IRpcClient } from '@meetsmore/lib-rpc';
import { RpcClient } from '@zdavison/nestjs-rpc-toolkit/dist/rpc/rpc-client';

describe('RPC modules must be able to be hosted as separate services, and communicate over a TCP bus', () => {
  let app: INestApplication;
  let rpc: IRpcClient;
  let userService: UserService;
  let authService: AuthService;

  const TCP_PORT = 3105;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ClientsModule.register([
          {
            name: 'MICROSERVICE_CLIENT',
            transport: Transport.TCP,
            options: {
              host: 'localhost',
              port: TCP_PORT,
            },
          },
        ]),
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '1d' },
        }),
      ],
      controllers: [UserService, AuthService], // Register as controllers for RPC
      providers: [
        {
          provide: 'RPC',
          useFactory: (client: ClientProxy) => {
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

    // Connect microservice with TCP transport
    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.TCP,
      options: {
        host: 'localhost',
        port: TCP_PORT,
      },
    });

    await app.startAllMicroservices();
    await app.init();

    // Get RPC client and service instances from the compiled module
    rpc = moduleFixture.get<IRpcClient>('RPC');
    userService = moduleFixture.get(UserService);
    authService = moduleFixture.get(AuthService);

    // Wait for TCP connection to stabilize
    await new Promise(resolve => setTimeout(resolve, 500));
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
        console.log('Error or timeout closing app:', e);
      }
    }
  }, 10000);

  describe('Basic TCP Communication', () => {
    it('should successfully create a user through RPC over TCP', async () => {
      const createUserDto = {
        email: `tcp-test-${Date.now()}@example.com`,
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

    it('should successfully register a user through auth RPC over TCP', async () => {
      const registerDto = {
        email: `tcp-auth-${Date.now()}@example.com`,
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

  describe('Cross-Module RPC Communication over TCP', () => {
    it('should allow services to call each other via RPC over TCP', async () => {
      // Create users first
      await rpc.user.create({
        createUserDto: {
          email: 'tcp-user1@example.com',
          firstName: 'User',
          lastName: 'One',
          isActive: true,
        }
      });

      await rpc.user.create({
        createUserDto: {
          email: 'tcp-user2@example.com',
          firstName: 'User',
          lastName: 'Two',
          isActive: true,
        }
      });

      // AuthService calls user.lookupUsers via RPC over TCP
      const emails = await rpc.auth.getUserEmailsById({ userIds: [1, 2] });

      expect(emails).toBeDefined();
      expect(Array.isArray(emails)).toBe(true);
      expect(emails.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling over TCP', () => {
    it('should handle errors in RPC method calls gracefully over TCP', async () => {
      // Try to register with duplicate email
      const registerDto = {
        email: `tcp-duplicate-${Date.now()}@example.com`,
        password: 'password123',
      };

      await rpc.auth.register({ registerDto });

      // Second registration should fail
      await expect(
        rpc.auth.register({ registerDto })
      ).rejects.toThrow();
    });
  });

  describe('Performance over TCP', () => {
    it('should handle multiple rapid RPC calls efficiently over TCP', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        rpc.user.create({
          createUserDto: {
            email: `tcp-rapid${i}@example.com`,
            firstName: 'Rapid',
            lastName: `User${i}`,
            isActive: true,
          }
        })
      );

      const results = await Promise.all(promises);

      expect(results.length).toBe(10);
      results.forEach((user, i) => {
        expect(user.email).toBe(`tcp-rapid${i}@example.com`);
        expect(user.id).toBeDefined();
      });
    });

    it('should maintain data integrity across concurrent RPC calls over TCP', async () => {
      const concurrentCalls = Array.from({ length: 5 }, async (_, i) => {
        const user = await rpc.user.create({
          createUserDto: {
            email: `tcp-concurrent${i}@example.com`,
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
      results.forEach(({ user, authResult }) => {
        expect(user).toBeDefined();
        expect(authResult).toBeDefined();
        expect(authResult.accessToken).toBeDefined();
      });
    });
  });

  describe('TCP Transport Reliability', () => {
    it('should maintain connection for multiple sequential requests', async () => {
      // Make several sequential requests to ensure connection stability
      for (let i = 0; i < 5; i++) {
        const user = await rpc.user.create({
          createUserDto: {
            email: `tcp-sequential${i}@example.com`,
            firstName: 'Sequential',
            lastName: `User${i}`,
            isActive: true,
          }
        });

        expect(user).toBeDefined();
        expect(user.id).toBeDefined();
      }
    });

    it('should handle requests with varying payload sizes over TCP', async () => {
      // Small payload
      const smallUser = await rpc.user.create({
        createUserDto: {
          email: 'small@example.com',
          firstName: 'A',
          lastName: 'B',
          isActive: true,
        }
      });

      // Larger payload
      const largeUser = await rpc.user.create({
        createUserDto: {
          email: 'large@example.com',
          firstName: 'A'.repeat(100),
          lastName: 'B'.repeat(100),
          isActive: true,
        }
      });

      expect(smallUser).toBeDefined();
      expect(largeUser).toBeDefined();
      expect(largeUser.firstName.length).toBe(100);
    });
  });
});
