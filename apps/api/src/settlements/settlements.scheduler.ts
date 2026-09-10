import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { SettlementsService } from './settlements.service';

@Injectable()
export class SettlementsScheduler {
  private readonly logger = new Logger(SettlementsScheduler.name);

  constructor(
    private prisma: PrismaService,
    private settlements: SettlementsService,
  ) {}

  /**
   * Каждое утро создаёт расчёты за текущий месяц по договорам, у которых
   * наступил день выставления. Идемпотентно — повторный запуск ничего не
   * дублирует, поэтому пропущенный день (сервер лежал) догоняется сам.
   */
  @Cron('0 6 * * *', { name: 'generate-settlements' })
  async generateDueSettlements(): Promise<void> {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const day = now.getUTCDate();

    const contracts = await this.prisma.contract.findMany({
      where: {
        active: true,
        billingDay: { lte: day },
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: new Date(Date.UTC(year, month, 0)) } }] },
          {
            OR: [
              { endDate: null },
              { endDate: { gte: new Date(Date.UTC(year, month - 1, 1)) } },
            ],
          },
        ],
      },
    });
    if (contracts.length === 0) return;

    // createdById для сгенерированных документов — администратор организации.
    const adminByOrg = new Map<string, string>();
    let created = 0;

    for (const contract of contracts) {
      let userId = adminByOrg.get(contract.organizationId);
      if (!userId) {
        const admin = await this.prisma.user.findFirst({
          where: { organizationId: contract.organizationId },
          orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
          select: { id: true },
        });
        if (!admin) continue;
        userId = admin.id;
        adminByOrg.set(contract.organizationId, userId);
      }

      try {
        const id = await this.settlements.generateOne(contract, year, month, userId);
        if (id) created += 1;
      } catch (error) {
        this.logger.error(
          `Не удалось создать расчёт по договору ${contract.id}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    if (created > 0) {
      this.logger.log(`Создано расчётов за ${month}.${year}: ${created}`);
    }
  }
}
