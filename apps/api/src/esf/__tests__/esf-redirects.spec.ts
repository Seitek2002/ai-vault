import { afterEach, describe, expect, it, vi } from 'vitest';
import { EsfPortalClient } from '../esf-portal.client';

afterEach(() => vi.unstubAllGlobals());

describe('HTTPS и cookie при перенаправлениях портала ЭСФ', () => {
  it('сохраняет HTTPS, cid и обновлённую cookie при переходе после POST', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 302, headers: { location: 'http://esf.salyk.kg/esf/view/document/realization_form.xhtml?cid=8', 'set-cookie': 'SESSION=next; Secure' } }))
      .mockResolvedValueOnce(new Response('form', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    let cookie = 'SESSION=old';
    const jar = { header: () => cookie, absorb: (response: Response) => { if (response.headers.get('set-cookie')) cookie = 'SESSION=next'; } };
    const portal = new EsfPortalClient() as unknown as { request(path: string, jarValue: typeof jar, init: RequestInit): Promise<Response> };
    await portal.request('/esf/view/document/realization_list.xhtml?cid=8', jar, { method: 'POST', body: 'form=form', redirect: 'follow' });
    expect(fetch.mock.calls[1]![0]).toBe('https://esf.salyk.kg/esf/view/document/realization_form.xhtml?cid=8');
    expect(fetch.mock.calls[1]![1]).toMatchObject({ method: 'GET', body: null, headers: { Cookie: 'SESSION=next' } });
  });
  it('не отправляет cookie на посторонний сайт', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('', { status: 302, headers: { location: 'https://other.example/path' } }));
    vi.stubGlobal('fetch', fetch);
    const portal = new EsfPortalClient() as unknown as { request(path: string, jar: unknown, init: RequestInit): Promise<Response> };
    await expect(portal.request('/esf/view/main.xhtml', { header: () => 'SESSION=private', absorb: () => {} }, { method: 'GET', redirect: 'follow' })).rejects.toThrow('неизвестный адрес');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
