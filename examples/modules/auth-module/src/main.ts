import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AuthModule } from './auth.module';

async function bootstrap() {
  // Create HTTP application
  const app = await NestFactory.create(AuthModule.forMicroservice());

  // Connect TCP microservice for RPC communication
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: 'localhost',
      port: 3003,
    },
  });

  // Start all microservices
  await app.startAllMicroservices();

  // Start HTTP server
  await app.listen(4003);

  console.log('Auth service is running:');
  console.log('  - HTTP API on port 4003');
  console.log('  - TCP microservice on port 3003');
}

bootstrap();