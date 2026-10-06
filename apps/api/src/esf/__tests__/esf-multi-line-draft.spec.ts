import { describe, expect, it, vi } from 'vitest';
import { EsfDraftClient } from '../esf-draft.client';
import { EsfPortalClient } from '../esf-portal.client';
import { formAction, formFields, parseServiceTable } from '../esf-form';
import { DRAFT_UUID, editForm, listPage, SERVICE_LINES, serviceTable, SOURCE_UUID } from './esf-form-fixture';

function fixture() {
  let copied = false;
  let shift = 0;
  const lines = structuredClone(SERVICE_LINES);
  const catalogue = new Map(SERVICE_LINES.map((line, i) => [line.name, `service-${i}`]));
  const createdNames: string[] = [];
  let saved: URLSearchParams | null = null;
  const response = (url: string, html: string) => ({ url: `https://esf.salyk.kg${url}`, text: async () => html });
  const update = (id: string, html: string) => `<partial-response><changes><update id="${id}"><![CDATA[${html}]]></update><update id="javax.faces.ViewState"><![CDATA[state-2]]></update></changes></partial-response>`;
  const goodsForm = `<form id="add-card-form" action="/esf/view/profile/goods_form.xhtml?cid=9"><input name="add-card-form" value="add-card-form"><input name="cea_input" value=""><input name="cea_hinput" value=""><input name="unitClassification_input" value=""><input name="unitClassification_hinput" value=""><input name="name" value=""><input name="javax.faces.ViewState" value="goods-state"><input name="goods-save" type="submit" value="Сохранить"></form>`;
  const session = {
    get: vi.fn(async (path: string) => {
      if (path.startsWith('/esf/view/document/realization_list')) return listPage(copied);
      if (path.startsWith('/esf/view/document/realization_form')) return editForm(lines, shift);
      if (path.includes('/goods_list')) return `<form id="top" action="/esf/view/profile/goods_list.xhtml?cid=9"><input name="top" value="top"><input name="javax.faces.ViewState" value="goods-state"><a onclick="mojarra.jsfcljs(document.getElementById('top'),{'top:add':'top:add'},'');return false">Добавить новую услугу</a></form>`;
      throw new Error(`Unexpected GET ${path}`);
    }),
    post: vi.fn(async (path: string, body: URLSearchParams) => {
      if (body.has(`action-${SOURCE_UUID}-Просмотр`)) return response('/esf/view/document/realization_view.xhtml?cid=7', serviceTable(SERVICE_LINES, false));
      if (body.has(`action-${SOURCE_UUID}-Создать копию`)) { copied = true; return response('/esf/view/document/realization_list.xhtml?cid=7', listPage(true)); }
      if (body.has(`action-${DRAFT_UUID}-Редактировать`)) return response('/esf/view/document/realization_form.xhtml?cid=7', editForm(lines, shift));
      if (body.has('top:add')) return response('/esf/view/profile/goods_form.xhtml?cid=9', goodsForm);
      if (body.has('goods-save')) {
        const name = body.get('name')!;
        createdNames.push(name); catalogue.set(name, `new-service-${createdNames.length}`);
        expect(body.get('unitClassification_hinput')).toBe('unit-id');
        expect(body.get('cea_hinput')).toBe('gked-id');
        return response('/esf/view/profile/goods_list.xhtml?cid=9', '');
      }
      const source = body.get('javax.faces.source');
      if (source && body.has(`${source}_query`)) {
        const query = body.get(`${source}_query`)!;
        const id = source === 'cea' ? 'gked-id' : catalogue.get(query);
        const label = source === 'cea' ? '62.02.0 - IT' : query;
        return response(path, update(source, id ? `<tr data-item-value="${id}" data-item-label="${label}"></tr>` : ''));
      }
      if (source && source.startsWith('detailTable:')) {
        const index = Number(source.split(':')[1]);
        const current = parseServiceTable(editForm(lines, shift))[index]!;
        if (body.get('javax.faces.behavior.event') === 'itemSelect') lines[index]!.name = body.get(`${source}_input`)!;
        else if (source === current.keys.quantity) lines[index]!.quantity = Number(body.get(`${source}_hinput`));
        else if (source === current.keys.price) lines[index]!.price = Number(body.get(`${source}_hinput`));
        else throw new Error('Wrong generated number control');
        shift += 17;
        return response(path, update('detailTable', serviceTable(lines, true, shift)));
      }
      if (body.has('j_idt316')) { saved = body; return response('/esf/view/document/realization_list.xhtml?cid=7', listPage(true)); }
      throw new Error(`Unexpected POST ${path}`);
    }),
  };
  const portal = new EsfPortalClient();
  vi.spyOn(portal, 'openSession').mockResolvedValue(session as never);
  const client = new EsfDraftClient(portal);
  const request = async () => ({ login: 'test', password: 'test', sourceUuid: SOURCE_UUID, amount: 35000,
    deliveryDate: '30-09-2026', crmRef: 'ErkinAI.Docs-settlement-1', note: 'September',
    sourceSignature: (await client.getTemplate('test', 'test', SOURCE_UUID)).sourceSignature,
    lines: SERVICE_LINES.map(({ name, quantity, price }) => ({ name, quantity, price })) });
  return { client, session, request, lines, catalogue, createdNames, saved: () => saved, copied: () => copied, shift: () => shift };
}

describe('ЭСФ с несколькими услугами', () => {
  it('читает 2 строки без создания копии и без сохранения', async () => {
    const f = fixture();
    const template = await f.client.getTemplate('test', 'test', SOURCE_UUID);
    expect(template.lines.map(l => l.price)).toEqual([30000, 5000]);
    expect(f.copied()).toBe(false);
    expect(f.saved()).toBeNull();
    expect(f.session.post.mock.calls).toHaveLength(1);
  });

  it('сохраняет обе строки, ErkinAI.Docs и реквизиты при изменении generated IDs', async () => {
    const f = fixture();
    const req = await f.request();
    req.lines[0]!.quantity = 2; req.lines[0]!.price = 15000;
    await expect(f.client.createByCopy(req)).resolves.toEqual({ uuid: DRAFT_UUID });
    const saved = f.saved()!;
    expect(saved.get('ownedCrmReceiptCode')).toBe(req.crmRef);
    expect(saved.get('deliveryDate_input')).toBe('30-09-2026');
    expect(saved.get('contractor_hinput')).toBe('buyer-original');
    expect(saved.get('bankAccountBuyer_hinput')).toBe('bank-original');
    const final = parseServiceTable(editForm(f.lines, f.shift()));
    expect(saved.get(`${final[0]!.keys.quantity}_hinput`)).toBe('2.00000');
    expect(saved.get(`${final[0]!.keys.price}_hinput`)).toBe('15000.00000');
    expect(saved.get(`${final[0]!.keys.total}_hinput`)).toBe('30000.00');
    expect(saved.get(`${final[1]!.keys.total}_hinput`)).toBe('5000.00');
    expect(f.session.post.mock.calls.every(([path]) => path.includes('?cid='))).toBe(true);
  });

  it('создаёт отдельные услуги для нового периода и выбирает их по ID', async () => {
    const f = fixture(); const req = await f.request();
    req.lines = req.lines.map(line => ({ ...line, name: line.name.replace('август', 'сентябрь') }));
    await f.client.createByCopy(req);
    expect(f.createdNames).toEqual(req.lines.map(line => line.name));
    expect(f.catalogue.has(SERVICE_LINES[0]!.name)).toBe(true);
    expect(f.lines.map(l => l.name)).toEqual(req.lines.map(l => l.name));
  });

  it('использует уже существующую услугу без повторного добавления в справочник', async () => {
    const f = fixture(); const req = await f.request();
    req.lines[0]!.name = 'ИИ-робот — сентябрь 2026';
    f.catalogue.set(req.lines[0]!.name, 'catalog-existing');
    await f.client.createByCopy(req);
    expect(f.createdNames).toEqual([]);
  });

  it.each(['amount', 'signature', 'quantity', 'row-count'] as const)('проверяет %s до создания копии', async mode => {
    const f = fixture(); const req = await f.request();
    if (mode === 'amount') req.lines[0]!.price = 30001;
    if (mode === 'signature') req.sourceSignature = 'bad-signature';
    if (mode === 'quantity') req.lines[0]!.quantity = -1;
    if (mode === 'row-count') req.lines.pop();
    await expect(f.client.createByCopy(req)).rejects.toThrow();
    expect(f.copied()).toBe(false);
    expect(f.createdNames).toEqual([]);
  });
});

describe('Разбор реальной структуры таблицы ЭСФ', () => {
  it('находит цену по заголовку, а не по прежнему id единиц измерения', () => {
    const lines = parseServiceTable(editForm());
    expect(lines[0]!.keys.price).toBe('detailTable:0:j_idt248');
    expect(lines[0]!.keys.price).not.toBe('detailTable:0:j_idt233');
    expect(lines[1]!.price).toBe(5000);
  });
  it('ограничивает поля нужной формой и сохраняет cid', () => {
    const html = `<form id="other"><input name="private" value="wrong"></form>${editForm()}`;
    expect(formFields(html)).not.toHaveProperty('private');
    expect(formAction(html, 'mainform')).toBe('/esf/view/document/realization_form.xhtml?cid=7');
  });
});
