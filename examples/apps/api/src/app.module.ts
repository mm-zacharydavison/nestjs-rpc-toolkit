import { Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { AuthModule } from '@modules/auth';
import { UserModule } from '@modules/user';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { InProcessClientProxy } from '@zdavison/nestjs-rpc-toolkit';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'MICROSERVICE_CLIENT',
        customClass: InProcessClientProxy,
      },
    ]),
    AuthModule,
    UserModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}