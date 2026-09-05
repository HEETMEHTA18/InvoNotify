import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function resetRecoveryCases() {
  const demoUserId = "cmtij8glo00008e4ozl1v726y";

  const cases = await prisma.recoveryCase.findMany({
    where: {
      OR: [{ ownerUserId: demoUserId }, { invoice: { ownerUserId: demoUserId } }],
    },
    select: { id: true, invoiceId: true, status: true },
  });

  console.log(`Found ${cases.length} recovery cases`);

  for (const c of cases) {
    await prisma.agentAction.deleteMany({ where: { recoveryCaseId: c.id } });
    await prisma.guardrailEvaluation.deleteMany({ where: { recoveryCaseId: c.id } });
    await prisma.auditLog.deleteMany({ where: { recoveryCaseId: c.id } });
    await prisma.recoveryCase.update({
      where: { id: c.id },
      data: { status: "OPEN", stage: "SCORING", lastDecision: null, nextActionAt: null },
    });
    console.log(`Reset case #${c.id} (invoice ${c.invoiceId})`);
  }

  console.log("Done! All cases reset to OPEN");
}

resetRecoveryCases().catch(console.error).finally(() => prisma.$disconnect());
