import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { DocumentsService } from '../documents.service';
import { ListDocumentsDto } from '../dto/document.dto';

describe('document list summaries', () => {
  it.each(['true', undefined, 'false'])('keeps paging and organization scope with summary=%s', async (summary) => {
    const document = { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(55) };
    const prisma = { document, $transaction: vi.fn((queries) => Promise.all(queries)) };
    const service = new DocumentsService(prisma as never, {} as never, {} as never);
    const result = await service.findAll('org-one', { page: 2, limit: 20, archived: 'true', counterpartyId: 'company-one',
      ...(summary !== undefined ? { summary } : {}) });
    expect(result).toMatchObject({ total: 55, page: 2, limit: 20 });
    const options = document.findMany.mock.calls[0]![0];
    expect(options).toMatchObject({ skip: 20, take: 20,
      where: { organizationId: 'org-one', isArchived: true, counterpartyId: 'company-one' } });
    expect(document.count).toHaveBeenCalledWith({ where: options.where });
    expect(options.omit).toEqual(summary === 'true' ? { bodyJson: true } : undefined);
    expect(options.include).toHaveProperty('counterparty');
    expect(options.include).toHaveProperty('category');
  });

  it('rejects invalid summary flags', async () => {
    expect(await validate(plainToInstance(ListDocumentsDto, { summary: 'yes' }))).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: 'summary' })]));
  });
});
