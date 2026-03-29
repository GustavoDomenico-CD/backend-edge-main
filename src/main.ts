import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as bcrypt from 'bcrypt';
import { AppModule } from './app.module';
import { PrismaService } from './prisma/prisma.service';

async function seedSuperAdmin(prisma: PrismaService) {
  try {
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
  } catch (err) {
    console.warn('Could not seed superadmin (run "npx prisma migrate deploy" first):', (err as Error).message);
  }
}

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

  const prisma = app.get(PrismaService);
  await seedSuperAdmin(prisma);

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}
void bootstrap();
