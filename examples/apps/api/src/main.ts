import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { MicroserviceOptions } from '@nestjs/microservices';
import { AppModule, transport } from './app.module';
import { LoggingInterceptor } from './interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });

  // Connect microservice using the same transport instance from the module
  app.connectMicroservice<MicroserviceOptions>({
    strategy: transport,
  });

  // Add global HTTP request logging
  app.useGlobalInterceptors(new LoggingInterceptor());

  app.setGlobalPrefix('api');

  const config = new DocumentBuilder()
    .setTitle('Modular Monolith API')
    .setDescription('API composing auth and user microservice modules')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.startAllMicroservices();

  const port = process.env.PORT || 3001;
  await app.listen(port);

  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger documentation available at: http://localhost:${port}/api/docs`);
  console.log('Using in-memory transport for modular monolith');
  console.log('HTTP request logging enabled');
}

bootstrap();