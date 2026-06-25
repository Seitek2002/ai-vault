import { Controller, Get, Param, Res } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { ExportService } from './export.service';
import { CurrentUser, type JwtPayload } from '../common/decorators/current-user.decorator';

@Controller('documents')
export class ExportController {
  constructor(private service: ExportService) {}

  @Get(':id/export/pdf')
  async exportPdf(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Res() reply: FastifyReply,
  ) {
    const { buffer, filename } = await this.service.generatePdf(id, user.organizationId);
    const safeName = encodeURIComponent(filename);
    void reply
      .header('Content-Type', 'application/pdf')
      .header('Content-Disposition', `attachment; filename="${safeName}.pdf"`)
      .send(buffer);
  }

  @Get(':id/export/docx')
  async exportDocx(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Res() reply: FastifyReply,
  ) {
    const { buffer, filename } = await this.service.generateDocx(id, user.organizationId);
    const safeName = encodeURIComponent(filename);
    void reply
      .header('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      .header('Content-Disposition', `attachment; filename="${safeName}.docx"`)
      .send(buffer);
  }

  @Get(':id/export/original')
  async exportOriginal(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const url = await this.service.getOriginalFileUrl(id, user.organizationId);
    return { url };
  }
}
