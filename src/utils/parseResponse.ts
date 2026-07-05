import type { QueryResponse, QueryType, ResultSetHeader, RowDataPacket } from '../types';

export const parseResponse = (type: QueryType, result: QueryResponse): any => {
  switch (type) {
    case 'insert':
      return (result as ResultSetHeader)?.insertId ?? null;

    case 'update':
      return (result as ResultSetHeader)?.affectedRows ?? null;

    case 'single':
      return (result as RowDataPacket[])?.[0] ?? null;

    case 'scalar':
      const row = (result as RowDataPacket[])?.[0];
      return (row && Object.values(row)[0]) ?? null;

    default:
      return result ?? null;
  }
};
