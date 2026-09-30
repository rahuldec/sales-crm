const { parseSheetDate, fmtSheetDate } = require('../lib/dates');

// ---------------------------------------------------------------------------
// TC 1-10: fmtSheetDate unit tests
// ---------------------------------------------------------------------------

describe('fmtSheetDate', () => {
  // TC-1: single-digit day AND month
  test('TC-1: pads single-digit day and month', () => {
    expect(fmtSheetDate('5/9/2026')).toBe('05/09/2026');
  });

  // TC-2: two-digit day, single-digit month
  test('TC-2: pads single-digit month only', () => {
    expect(fmtSheetDate('15/9/2026')).toBe('15/09/2026');
  });

  // TC-3: single-digit day, two-digit month
  test('TC-3: pads single-digit day only', () => {
    expect(fmtSheetDate('5/10/2026')).toBe('05/10/2026');
  });

  // TC-4: already two-digit day and month
  test('TC-4: leaves two-digit day and month unchanged', () => {
    expect(fmtSheetDate('15/10/2026')).toBe('15/10/2026');
  });

  // TC-5: already zero-padded input
  test('TC-5: keeps already zero-padded date unchanged', () => {
    expect(fmtSheetDate('05/09/2026')).toBe('05/09/2026');
  });

  // TC-6: all-ones boundary
  test('TC-6: formats 01/01/2026', () => {
    expect(fmtSheetDate('01/01/2026')).toBe('01/01/2026');
  });

  // TC-7: empty string
  test('TC-7: returns "—" for empty string', () => {
    expect(fmtSheetDate('')).toBe('—');
  });

  // TC-8: null
  test('TC-8: returns "—" for null', () => {
    expect(fmtSheetDate(null)).toBe('—');
  });

  // TC-9: undefined
  test('TC-9: returns "—" for undefined', () => {
    expect(fmtSheetDate(undefined)).toBe('—');
  });

  // TC-10: invalid date — returns the raw string, does not produce a date
  test('TC-10: returns raw string for an unparseable value', () => {
    const result = fmtSheetDate('abc');
    expect(result).toBe('abc');
    // Must not look like a formatted date
    expect(result).not.toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });
});

// ---------------------------------------------------------------------------
// TC-17: boundary / month-end dates
// ---------------------------------------------------------------------------

describe('fmtSheetDate — boundary dates', () => {
  const cases = [
    ['9/9/2026',   '09/09/2026'],
    ['30/9/2026',  '30/09/2026'],
    ['1/10/2026',  '01/10/2026'],
    ['31/12/2026', '31/12/2026'],
    ['1/1/2027',   '01/01/2027'],
  ];

  cases.forEach(([input, expected]) => {
    test(`${input} → ${expected}`, () => {
      expect(fmtSheetDate(input)).toBe(expected);
    });
  });
});

// ---------------------------------------------------------------------------
// parseSheetDate — stays separate from fmtSheetDate (regression guard TC-14)
// ---------------------------------------------------------------------------

describe('parseSheetDate', () => {
  test('parses D/M/YYYY correctly', () => {
    const d = parseSheetDate('5/9/2026');
    expect(d).not.toBeNull();
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(8); // 0-indexed → September
    expect(d.getUTCDate()).toBe(5);
  });

  test('parses DD/MM/YYYY correctly', () => {
    const d = parseSheetDate('05/09/2026');
    expect(d).not.toBeNull();
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(8);
    expect(d.getUTCDate()).toBe(5);
  });

  test('returns null for empty string', () => {
    expect(parseSheetDate('')).toBeNull();
  });

  test('returns null for null', () => {
    expect(parseSheetDate(null)).toBeNull();
  });

  test('returns null for undefined', () => {
    expect(parseSheetDate(undefined)).toBeNull();
  });

  test('returns null for an invalid string', () => {
    expect(parseSheetDate('abc')).toBeNull();
  });

  test('parses 2-digit year as 20xx', () => {
    const d = parseSheetDate('5/9/26');
    expect(d).not.toBeNull();
    expect(d.getUTCFullYear()).toBe(2026);
  });

  // Regression: parseSheetDate and fmtSheetDate must remain independent —
  // parseSheetDate returns a Date object; fmtSheetDate formats for display only.
  test('parseSheetDate returns a Date, not a formatted string', () => {
    const result = parseSheetDate('5/9/2026');
    expect(result).toBeInstanceOf(Date);
  });
});

// ---------------------------------------------------------------------------
// TC-16: display-only — fmtSheetDate must not alter the underlying raw value
// ---------------------------------------------------------------------------

describe('fmtSheetDate does not mutate input', () => {
  test('raw variable is unchanged after calling fmtSheetDate', () => {
    const raw = '5/9/2026';
    fmtSheetDate(raw);
    expect(raw).toBe('5/9/2026');
  });

  test('TC-15: already valid two-digit day is not re-padded or altered', () => {
    expect(fmtSheetDate('15/9/2026')).toBe('15/09/2026');
    expect(fmtSheetDate('15/09/2026')).toBe('15/09/2026');
  });
});
