import { describe, test, expect, mock } from 'bun:test';
import { typeCast, typeCastExecute } from 'utils/typeCast';

type FieldOpts = {
  type: string;
  columnLength?: number;
  collationIndex?: number;
  string?: () => string | null;
  buffer?: () => Buffer | null;
  date?: () => Date | string | null;
  datetime?: () => Date | string | null;
};

function field(opts: FieldOpts) {
  return {
    type: opts.type,
    columnLength: opts.columnLength ?? 0,
    collation: { index: opts.collationIndex ?? 33 },
    string: opts.string ?? (() => null),
    buffer: opts.buffer ?? (() => null),
    date: opts.date ?? (() => null),
    datetime: opts.datetime ?? (() => null),
  } as any;
}

const BINARY_CHARSET = 63;

describe('typeCast (text protocol)', () => {
  test('DATETIME/TIMESTAMP become epoch milliseconds', () => {
    const next = mock(() => 'unused');
    const result = typeCast(field({ type: 'DATETIME', string: () => '2024-01-02 03:04:05' }), next);
    expect(result).toBe(new Date('2024-01-02 03:04:05').getTime());
    expect(next).not.toHaveBeenCalled();
  });

  test('a null date returns null', () => {
    expect(typeCast(field({ type: 'TIMESTAMP', string: () => null }), mock(() => 0))).toBeNull();
  });

  test('DATE is anchored to midnight', () => {
    const result = typeCast(field({ type: 'DATE', string: () => '2024-01-02' }), mock(() => 0));
    expect(result).toBe(new Date('2024-01-02 00:00:00').getTime());
  });

  test('TINY(1) maps to a boolean, wider TINY defers to next()', () => {
    expect(typeCast(field({ type: 'TINY', columnLength: 1, string: () => '1' }), mock(() => 0))).toBe(true);
    expect(typeCast(field({ type: 'TINY', columnLength: 1, string: () => '0' }), mock(() => 0))).toBe(false);
    expect(typeCast(field({ type: 'TINY', columnLength: 3, string: () => '7' }), () => 7)).toBe(7);
    expect(typeCast(field({ type: 'TINY', columnLength: 1, string: () => null }), mock(() => 0))).toBe(null);
  });

  test('TINY(1) with a non-boolean value becomes a number without re-reading', () => {
    const next = mock(() => 0);
    expect(typeCast(field({ type: 'TINY', columnLength: 1, string: () => '7' }), next)).toBe(7);
    expect(typeCast(field({ type: 'TINY', columnLength: 1, string: () => '-1' }), next)).toBe(-1);
    expect(next).not.toHaveBeenCalled();
  });

  test('BIT(1) maps to a boolean', () => {
    expect(typeCast(field({ type: 'BIT', buffer: () => Buffer.from([1]) }), mock(() => 0))).toBe(true);
    expect(typeCast(field({ type: 'BIT', buffer: () => Buffer.from([0]) }), mock(() => 0))).toBe(false);
    expect(typeCast(field({ type: 'BIT', buffer: () => null }), mock(() => 0))).toBe(null);
  });

  test('wider BIT values return the raw buffer', () => {
    const buffer = Buffer.from([5]);
    expect(typeCast(field({ type: 'BIT', buffer: () => buffer }), mock(() => 0))).toBe(buffer);

    const wide = Buffer.from([1, 0]);
    expect(typeCast(field({ type: 'BIT', buffer: () => wide }), mock(() => 0))).toBe(wide);
  });

  test('a binary BLOB becomes a plain number array', () => {
    const result = typeCast(
      field({ type: 'BLOB', collationIndex: BINARY_CHARSET, buffer: () => Buffer.from([1, 2, 3]) }),
      mock(() => 0),
    ) as any;
    expect(result).toEqual([1, 2, 3]);
    expect(Array.isArray(result)).toBe(true);
  });

  test('a NULL binary BLOB returns [null]', () => {
    const result = typeCast(
      field({ type: 'BLOB', collationIndex: BINARY_CHARSET, buffer: () => null }),
      mock(() => 0),
    ) as any;
    expect(result).toEqual([null]);
  });

  test('a non-binary BLOB (text charset) returns its string', () => {
    const result = typeCast(field({ type: 'BLOB', string: () => 'hello' }), mock(() => 0));
    expect(result).toBe('hello');
  });

  test('unknown types defer to next()', () => {
    const next = mock(() => 'defaulted');
    expect(typeCast(field({ type: 'VARCHAR', string: () => 'x' }), next)).toBe('defaulted');
    expect(next).toHaveBeenCalled();
  });
});

describe('typeCastExecute (binary protocol)', () => {
  test('DATETIME/TIMESTAMP become epoch milliseconds', () => {
    const date = new Date('2024-01-02 03:04:05');
    const next = mock(() => 'unused');
    expect(typeCastExecute(field({ type: 'DATETIME', datetime: () => date }), next)).toBe(date.getTime());
    expect(typeCastExecute(field({ type: 'TIMESTAMP', datetime: () => date }), next)).toBe(date.getTime());
    expect(next).not.toHaveBeenCalled();
  });

  test('a null date returns null', () => {
    expect(typeCastExecute(field({ type: 'DATETIME', datetime: () => null }), mock(() => 0))).toBeNull();
    expect(typeCastExecute(field({ type: 'DATE', date: () => null }), mock(() => 0))).toBeNull();
  });

  test('DATE is anchored to midnight', () => {
    const date = new Date('2024-01-02 00:00:00');
    expect(typeCastExecute(field({ type: 'DATE', date: () => date }), mock(() => 0))).toBe(date.getTime());
    expect(typeCastExecute(field({ type: 'DATE', date: () => '2024-01-02' }), mock(() => 0))).toBe(date.getTime());
  });

  test('binary BLOB/VARBINARY/BIT columns become plain number arrays', () => {
    const next = mock(() => 0);
    expect(
      typeCastExecute(
        field({ type: 'BLOB', collationIndex: BINARY_CHARSET, buffer: () => Buffer.from([1, 2, 3]) }),
        next,
      ) as any,
    ).toEqual([1, 2, 3]);
    expect(
      typeCastExecute(
        field({ type: 'VAR_STRING', collationIndex: BINARY_CHARSET, buffer: () => Buffer.from([9]) }),
        next,
      ) as any,
    ).toEqual([9]);
    expect(
      typeCastExecute(
        field({ type: 'BIT', collationIndex: BINARY_CHARSET, buffer: () => Buffer.from([1]) }),
        next,
      ) as any,
    ).toEqual([1]);
    expect(next).not.toHaveBeenCalled();
  });

  test('a NULL binary column returns null', () => {
    expect(
      typeCastExecute(field({ type: 'BLOB', collationIndex: BINARY_CHARSET, buffer: () => null }), mock(() => 0)),
    ).toBeNull();
  });

  test('non-binary string types defer to next()', () => {
    const next = mock(() => 'native');
    expect(typeCastExecute(field({ type: 'VAR_STRING', string: () => 'x' }), next)).toBe('native');
    expect(typeCastExecute(field({ type: 'LONGLONG', string: () => '1' }), next)).toBe('native');
    expect(next).toHaveBeenCalledTimes(2);
  });
});
