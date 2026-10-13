import { sql } from 'drizzle-orm';
import { pgSchema, timestamp, uuid } from 'drizzle-orm/pg-core';

export const bl = pgSchema('blacklist');
export const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`uuidv7()`);
export const at = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();
export const optionalAt = (name: string) => timestamp(name, { withTimezone: true });
