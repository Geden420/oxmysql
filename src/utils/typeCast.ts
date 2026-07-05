import type { FieldInfo, TypeCastNextFunction, TypeCastResult } from 'mariadb';

const BINARY_CHARSET = 63;

/**
 * node-mysql2 v3.9.0 introduced (breaking) typecasting for execute methods.
 */
export function typeCastExecute(field: FieldInfo, next: TypeCastNextFunction): TypeCastResult {
  switch (field.type as unknown as string) {
    case 'DATETIME':
    case 'DATETIME2':
    case 'TIMESTAMP':
    case 'TIMESTAMP2': {
      const value = (field as any).datetime() as Date | string | null;
      if (!value) return null;
      return value instanceof Date ? value.getTime() : new Date(value).getTime();
    }
    case 'NEWDATE':
    case 'DATE': {
      const value = field.date() as Date | string | null;
      if (!value) return null;
      return value instanceof Date ? value.getTime() : new Date(`${value} 00:00:00`).getTime();
    }
    case 'BIT':
    case 'TINY_BLOB':
    case 'MEDIUM_BLOB':
    case 'LONG_BLOB':
    case 'BLOB':
    case 'VARCHAR':
    case 'VAR_STRING':
    case 'STRING': {
      if (field.collation.index !== BINARY_CHARSET) return next();

      const value = field.buffer();
      return value === null ? null : ([...value] as unknown as TypeCastResult);
    }
    default:
      return next();
  }
}

/**
 * mysql-async compatible typecasting.
 */
export function typeCast(field: FieldInfo, next: TypeCastNextFunction): TypeCastResult {
  switch (field.type as unknown as string) {
    case 'DATETIME':
    case 'DATETIME2':
    case 'TIMESTAMP':
    case 'TIMESTAMP2':
    case 'NEWDATE': {
      const value = field.string();
      return value ? new Date(value).getTime() : null;
    }
    case 'DATE': {
      const value = field.string();
      return value ? new Date(`${value} 00:00:00`).getTime() : null;
    }
    case 'TINY': {
      if (field.columnLength !== 1) return next();

      const value = field.string();

      if (value === null) return null;
      if (value === '0') return false;
      if (value === '1') return true;

      return parseInt(value, 10);
    }
    case 'BIT': {
      const value = field.buffer();

      if (value === null) return null;
      if (value.length === 1 && value[0] <= 1) return value[0] === 1;

      return value;
    }
    case 'TINY_BLOB':
    case 'MEDIUM_BLOB':
    case 'LONG_BLOB':
    case 'BLOB': {
      if (field.collation.index === BINARY_CHARSET) {
        const value = field.buffer();
        if (value === null) return [value] as unknown as TypeCastResult;
        return [...value] as unknown as TypeCastResult;
      }

      return field.string();
    }
    default:
      return next();
  }
}
