import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { UserModule } from './user.module';

async function bootstrap() {
  // Create HTTP application
  const app = await NestFactory.create(UserModule.forMicroservice());

  // Connect TCP microservice for RPC communication
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: 'localhost',
      port: 3004,
    },
  });

  // Start all microservices
  await app.startAllMicroservices();

  // Start HTTP server
  await app.listen(4004);

  console.log('User service is running:');
  console.log('  - HTTP API on port 4004');
  console.log('  - TCP microservice on port 3004');
}

bootstrap();