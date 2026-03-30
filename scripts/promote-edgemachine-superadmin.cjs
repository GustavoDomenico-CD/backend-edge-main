const { PrismaClient } = require('@prisma/client')

async function main() {
  const prisma = new PrismaClient()
  try {
    const email = 'edgemachine'
    const user =
      (await prisma.user.findUnique({ where: { email } })) ||
      (await prisma.user.findUnique({ where: { username: email } }))

    if (!user) {
      console.log('Usuario "edgemachine" nao encontrado por email ou username.')
      return
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { role: 'superadmin', isActive: true },
      select: { id: true, email: true, username: true, role: true, isActive: true },
    })

    console.log('Usuario atualizado:', updated)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

