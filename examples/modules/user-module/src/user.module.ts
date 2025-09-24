import { Module, DynamicModule } from '@nestjs/common';
import { ClientsModule, Transport, ClientProxy } from '@nestjs/microservices';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { InProcessClientProxy, MessageBus } from '@zdavison/nestjs-rpc-toolkit';

@Module({
  imports: [
    // Default configuration uses InProcessClientProxy for monolith mode
    ClientsModule.register([
      {
        name: 'MICROSERVICE_CLIENT',
        customClass: InProcessClientProxy,
      },
    ]),
  ],
  controllers: [UserController, UserService],
  providers: [
    UserService,
    {
      provide: 'MESSAGE_BUS',
      useFactory: (client: ClientProxy) => {
        return new MessageBus(client);
      },
      inject: ['MICROSERVICE_CLIENT'],
    },
  ],
  exports: [UserService],
})
export class UserModule {
  /**
   * Configure module for microservice mode with TCP transport
   */
  static forMicroservice(): DynamicModule {
    return {
      module: UserModule,
      imports: [
        ClientsModule.register([
          {
            name: 'MICROSERVICE_CLIENT',
            transport: Transport.TCP,
            options: {
              host: 'localhost',
              port: 3003, // Connect to auth service
            },
          },
        ]),
      ],
      controllers: [UserController, UserService],
      providers: [
        UserService,
        {
          provide: 'MESSAGE_BUS',
          useFactory: (client: ClientProxy) => {
            return new MessageBus(client);
          },
          inject: ['MICROSERVICE_CLIENT'],
        },
      ],
      exports: [UserService],
    };
  }
}