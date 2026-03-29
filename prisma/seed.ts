import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const username = 'edgemachine';
  const password = '072025';
  const email = 'edgemachine@edge.local';

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log('Superadmin user "edgemachine" already exists.');
    return;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      username,
      email,
      password: hashedPassword,
      name: 'Edge Machine',
      role: 'superadmin',
      isActive: true,
    },
  });
  console.log('Superadmin user "edgemachine" created successfully.');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
