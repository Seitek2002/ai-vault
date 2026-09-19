import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EsfService } from './esf.service';

@Injectable()
export class EsfScheduler {
  private readonly logger = new Logger(EsfScheduler.name);

  constructor(
    private prisma: PrismaService,
    private esf: EsfService,
  ) {}

  /**
   * Ночная синхронизация для организаций с подключённым кабинетом.
   * После генерации расчётов (06:00), чтобы новым ЭСФ было куда цепляться.
   */
  @Cron('30 6 * * *', { name: 'sync-esf' })
  async syncAll(): Promise<void> {
    const configured = await this.prisma.companySettings.findMany({
      where: { esfLogin: { not: null }, esfPasswordEnc: { not: null } },
      select: { organizationId: true },
    });

    for (const { organizationId } of configured) {
      const admin = await this.prisma.user.findFirst({
        where: { organizationId },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
        select: { id: true },
      });
      if (!admin) continue;
      try {
        const report = await this.esf.sync(organizationId, admin.id);
        this.logger.log(
          `ЭСФ ${organizationId}: новых ${report.created}, сопоставлено ${report.matched}, ошибок ${report.errors.length}`,
        );
      } catch (error) {
        this.logger.error(
          `Синхронизация ЭСФ ${organizationId} не удалась`,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }
}
