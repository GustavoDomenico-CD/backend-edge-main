import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  const frontend = process.env.FRONTEND_URL;
  app.enableCors(
    frontend
      ? { origin: frontend, credentials: true }
      : { origin: true, credentials: true },
  );
  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}
void bootstrap();
