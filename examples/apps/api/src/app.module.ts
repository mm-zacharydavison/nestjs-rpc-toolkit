import { Module } from '@nestjs/common';
import { AuthModule } from '@modules/auth';
import { UserModule } from '@modules/user';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RpcModule, InProcessTransportStrategy } from '@zdavison/nestjs-rpc-toolkit';

// Create a shared transport instance for the application
export const transport = new InProcessTransportStrategy();

@Module({
  imports: [
    // RpcModule.forRoot() is global and provides both the transport and RPC client
    // Cast to any for NestJS 10/11 type compatibility
    RpcModule.forRoot({
      transport,
      clientToken: 'MICROSERVICE_CLIENT',
    }) as any,
    AuthModule,
    UserModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}