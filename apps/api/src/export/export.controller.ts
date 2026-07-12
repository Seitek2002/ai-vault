import { Controller, Get, Param, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { ExportService } from './export.service';
import { CurrentOrgId } from '../common/decorators/current-user.decorator';

@Controller('documents')
export class ExportController {
  constructor(private service: ExportService) {}

  @Get(':id/export/pdf')
  async exportPdf(
    @Param('id') id: string,
    @CurrentOrgId() organizationId: string,
    @Res() reply: FastifyReply,
  ) {
    const { buffer, filename } = await this.service.generatePdf(id, organizationId);
    const safeName = encodeURIComponent(filename);
    void reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${safeName}.pdf"`)
      .send(buffer);
  }

  @Get(':id/export/docx')
  async exportDocx(
    @Param('id') id: string,
    @CurrentOrgId() organizationId: string,
    @Res() reply: FastifyReply,
  ) {
    const { buffer, filename } = await this.service.generateDocx(id, organizationId);
    const safeName = encodeURIComponent(filename);
    void reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      .header('Content-Disposition', `attachment; filename="${safeName}.docx"`)
      .send(buffer);
  }

  @Get(':id/export/original')
  async exportOriginal(
    @Param('id') id: string,
    @CurrentOrgId() organizationId: string,
  ) {
    const url = await this.service.getOriginalFileUrl(id, organizationId);
    return { url };
  }
}
