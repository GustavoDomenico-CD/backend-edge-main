import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import * as bcrypt from 'bcrypt';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

/** Limite do body (JSON / urlencoded). Base64 de imagem no WhatsApp ultrapassa o padrão ~100kb. */
const HTTP_BODY_LIMIT = process.env.HTTP_BODY_LIMIT ?? '15mb';

async function seedSuperAdmin(prisma: PrismaService) {
  const username = 'edgemachine';
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return;
  const password = await bcrypt.hash('072025', 10);
  await prisma.user.create({
    data: {
      username,
      email: 'edgemachine@edge.local',
      password,
      name: 'Edge Machine',
      role: 'superadmin',
      isActive: true,
    },
  });
  console.log('Superadmin "edgemachine" created.');
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.use(json({ limit: HTTP_BODY_LIMIT }));
  app.use(urlencoded({ extended: true, limit: HTTP_BODY_LIMIT }));
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  const frontend = process.env.FRONTEND_URL;
  app.enableCors(
    frontend
      ? { origin: frontend, credentials: true }
      : { origin: true, credentials: true },
  );

  const prisma = app.get(PrismaService);
  await seedSuperAdmin(prisma);

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}
void bootstrap();
