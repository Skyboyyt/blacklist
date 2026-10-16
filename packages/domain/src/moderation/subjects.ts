import { schema, eq, and, type Database } from '@blacklist/db';
import { DomainError } from '../shared/errors.ts';

export type ChainSlug = 'ethereum' | 'solana';

/** EVM addresses are case-insensitive and stored lower-case; Solana base58 is case-sensitive. */
export function normalizeAddress(chain: ChainSlug, address: string) {
  return chain === 'ethereum' ? address.toLowerCase() : address;
}

/** Finds or creates the address subject (data-model §4). Format is validated at the boundary. */
export async function addressSubject(tx: Database, chain: ChainSlug, rawAddress: string) {
  const [network] = await tx.select().from(schema.chains).where(eq(schema.chains.slug, chain));
  if (!network?.enabled) throw new DomainError('invalid_request');
  const address = normalizeAddress(chain, rawAddress);
  const find = async () => {
    const [row] = await tx
      .select({ subjectId: schema.addresses.subjectId })
      .from(schema.addresses)
      .where(and(eq(schema.addresses.chainId, network.chainId), eq(schema.addresses.address, address)));
    return row?.subjectId;
  };
  const existing = await find();
  if (existing) return { subjectId: existing, chainId: network.chainId, address };
  const [subject] = await tx.insert(schema.subjects).values({ kind: 'address' }).returning();
  if (!subject) throw new Error('subject_creation_failed');
  const inserted = await tx
    .insert(schema.addresses)
    .values({ subjectId: subject.id, chainId: network.chainId, address })
    .onConflictDoNothing()
    .returning();
  if (inserted.length) return { subjectId: subject.id, chainId: network.chainId, address };
  // A concurrent request created it first; the unused subject row is harmless.
  const raced = await find();
  if (!raced) throw new Error('subject_creation_failed');
  return { subjectId: raced, chainId: network.chainId, address };
}

export async function addressOf(tx: Database, subjectId: string) {
  const [row] = await tx
    .select({ address: schema.addresses.address, slug: schema.chains.slug })
    .from(schema.addresses)
    .innerJoin(schema.chains, eq(schema.chains.chainId, schema.addresses.chainId))
    .where(eq(schema.addresses.subjectId, subjectId));
  if (!row) return null;
  return { chain: row.slug as ChainSlug, address: row.address };
}
