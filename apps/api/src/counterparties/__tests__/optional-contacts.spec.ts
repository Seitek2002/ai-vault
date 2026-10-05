import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';
import { CreateCounterpartyDto, UpdateCounterpartyDto } from '../dto/counterparty.dto';
import { CounterpartiesService } from '../counterparties.service';

describe('Необязательные контакты компании', () => {
  it.each([{}, { phone: '', email: '' }, { phone: '  ', email: '  ' }, { phone: null, email: null }, { phone: '+996 700 000 000' }, { email: 'qa@example.invalid' }])('создаёт компанию с контактами %j', async contacts => {
    const dto = plainToInstance(CreateCounterpartyDto, { name: 'Компания без контактов', ...contacts });
    expect(await validate(dto)).toEqual([]);
    const prisma = { counterparty: { create: vi.fn().mockResolvedValue({ id: 'company-1' }) } };
    await new CounterpartiesService(prisma as never).create('org-1', dto);
    const saved = prisma.counterparty.create.mock.calls[0]![0].data;
    expect(saved.email).toBe(dto.email ?? null);
    expect(saved.phone).toBe(dto.phone ?? null);
    expect(saved.email).not.toBe('');
    expect(saved.phone).not.toBe('');
  });

  it('сохраняет формат email и обрезает пробелы', async () => {
    const dto = plainToInstance(CreateCounterpartyDto, { name: 'Компания', email: '  qa@example.invalid  ', phone: '  +996 700 000 000  ' });
    expect(await validate(dto)).toEqual([]);
    expect(dto.email).toBe('qa@example.invalid');
    expect(dto.phone).toBe('+996 700 000 000');
  });

  it('продолжает отклонять некорректную почту', async () => {
    const dto = plainToInstance(CreateCounterpartyDto, { name: 'Компания', email: 'no-email' });
    expect((await validate(dto)).map(e => e.property)).toContain('email');
  });

  it('позволяет убрать контакты при редактировании', async () => {
    const dto = plainToInstance(UpdateCounterpartyDto, { name: 'Компания', phone: '', email: '' });
    expect(await validate(dto)).toEqual([]);
    const prisma = { counterparty: { findFirst: vi.fn().mockResolvedValue({ id: 'company-1' }), update: vi.fn().mockResolvedValue({}) } };
    await new CounterpartiesService(prisma as never).update('company-1', 'org-1', dto);
    expect(prisma.counterparty.update).toHaveBeenCalledWith({ where: { id: 'company-1' }, data: expect.objectContaining({ email: null, phone: null }) });
  });
});
