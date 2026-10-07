import { describe, expect, it } from 'vitest';
import { pmToHtml } from '../pm-to-html.util';

const table = (colwidth: unknown) => ({ type: 'doc', content: [{ type: 'table', content: [
  { type: 'tableRow', content: [{ type: 'tableCell', attrs: { colwidth, colspan: 2 }, content: [] }] },
] }] });

describe('exported table column widths', () => {
  it('preserves editor widths, including cells spanning multiple columns', () => {
    expect(pmToHtml(table([72, 128]))).toContain('<td colspan="2" style="width:200px">');
  });

  it.each([undefined, [], [0], [-1], [NaN], [Infinity], ['100;display:none']])('ignores invalid width %j', width => {
    expect(pmToHtml(table(width))).toContain('<td colspan="2">');
  });
});
