import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { UpdateContractDto } from '../dto/contract.dto';

describe('Валидация правок договора', () => {
  it.each(['defaultAmount', 'title', 'counterpartyId', 'billingPeriod', 'autoRenew'])('отклоняет null в обязательном поле %s вместо ошибки БД', async (field) => {
    expect((await validate(plainToInstance(UpdateContractDto, { [field]: null }))).some(error => error.property === field)).toBe(true);
  });
  it('позволяет явно убрать даты, срок и вложения', async () => {
    expect(await validate(plainToInstance(UpdateContractDto, {
      startDate: null, endDate: null, termValue: null, termUnit: null, contractPdfId: null, ndaPdfId: null,
    }))).toEqual([]);
  });
  it('позволяет менять только выбранные поля', async () => {
    expect(await validate(plainToInstance(UpdateContractDto, { defaultAmount: 49291.66 }))).toEqual([]);
  });
  it('отклоняет пустой ID партнёра', async () => {
    expect((await validate(plainToInstance(UpdateContractDto, { counterpartyId: '' }))).some(error => error.property === 'counterpartyId')).toBe(true);
  });
});
