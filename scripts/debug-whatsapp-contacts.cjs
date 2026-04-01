const { PrismaClient } = require('@prisma/client')

async function main() {
  const prisma = new PrismaClient()
  try {
    const rows = await prisma.whatsAppContact.findMany({
      take: 50,
      orderBy: { id: 'asc' },
    })
    console.log(JSON.stringify(rows, null, 2))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

