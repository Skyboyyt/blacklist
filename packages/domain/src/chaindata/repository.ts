import { createHash } from 'node:crypto';
import type { DatabaseRuntime } from '@blacklist/db';
import type { ChainId } from '@blacklist/core';
import { canonicalFields, type Sourced, type VerificationReceipt } from '@blacklist/chains';

const digest = (value: unknown) => createHash('sha256').update(canonicalFields(value)).digest('hex');
export async function recordChainRead(
  runtime: DatabaseRuntime,
  capability: string,
  subject: string,
  value: Sourced<unknown>,
  chain?: ChainId,
  cacheScope: unknown = null,
): Promise<void> {
  const receipts = value.provenance.receipts ?? [];
  await runtime.transaction(async (_tx, client) => {
    const ids: string[] = [];
    for (const receipt of receipts) {
      const key = digest({
        ...receipt,
        requestedAt: receipt.requestedAt.toISOString(),
        fetchedAt: receipt.fetchedAt.toISOString(),
      });
      const row = await client.query<{ id: string }>(
        `INSERT INTO blacklist.verification_receipts
        (receipt_key,chain_id,capability,subject,query,snapshot,commitment,finality,provider_id,independence_group,requested_at,fetched_at,fields_digest,normalized_fields,decoder_version,comparison_spec_version)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) ON CONFLICT(receipt_key) DO NOTHING RETURNING id`,
        [
          key,
          receipt.chainId,
          receipt.capability,
          receipt.subject,
          { method: receipt.method, params: receipt.params },
          receipt.snapshot,
          receipt.commitment,
          receipt.finality,
          receipt.providerId,
          receipt.independenceGroup,
          receipt.requestedAt,
          receipt.fetchedAt,
          receipt.fieldsDigest,
          receipt.normalizedFields,
          receipt.decoderVersion,
          receipt.comparisonSpecVersion,
        ],
      );
      let id = row.rows[0]?.id;
      if (!id)
        id = (
          await client.query<{ id: string }>(
            'SELECT id FROM blacklist.verification_receipts WHERE receipt_key=$1',
            [key],
          )
        ).rows[0]?.id;
      if (!id) throw new Error('chain_receipt_write_failed');
      ids.push(id);
    }
    const first: VerificationReceipt | undefined = receipts[0];
    if (first && ids[0]) {
      const ref = { subject },
        result = value.provenance.verification;
      const key = digest({
        chainId: first.chainId,
        capability,
        ref,
        receiptIds: ids,
        result,
        spec: first.comparisonSpecVersion,
      });
      await client.query(
        `INSERT INTO blacklist.chain_fact_verifications
        (verification_key,chain_id,fact_type,fact_ref,receipt_a_id,receipt_b_id,comparison_spec_version,result)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(verification_key) DO NOTHING`,
        [key, first.chainId, capability, ref, ids[0], ids[1] ?? null, first.comparisonSpecVersion, result],
      );
    }
    // Shared public chain cache only: no user/session/handle/email or search activity association.
    const chainId = first?.chainId ?? chain;
    if (chainId && !value.provenance.degraded) {
      // Only disposable public cache rows expire; immutable receipts and user data are untouched.
      await client.query(`DELETE FROM blacklist.research_cache WHERE cache_key IN
        (SELECT cache_key FROM blacklist.research_cache WHERE expires_at<now() ORDER BY expires_at LIMIT 100)`);
      const key = digest({
        chainId,
        capability,
        subject,
        cacheScope,
        finality: value.provenance.finality,
        verification: value.provenance.verification,
        decoderVersion: value.provenance.decoderVersion,
      });
      await client.query(
        `INSERT INTO blacklist.research_cache(cache_key,chain_id,capability,normalized,fetched_at,expires_at,decoder_version)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(cache_key) DO UPDATE SET normalized=EXCLUDED.normalized,
        fetched_at=EXCLUDED.fetched_at,expires_at=EXCLUDED.expires_at,decoder_version=EXCLUDED.decoder_version
        WHERE blacklist.research_cache.fetched_at<=EXCLUDED.fetched_at`,
        [
          key,
          chainId,
          capability,
          {
            data: value.data,
            provenance: {
              finality: value.provenance.finality,
              snapshot: value.provenance.snapshot,
              verification: value.provenance.verification,
              degraded: value.provenance.degraded,
            },
          },
          value.provenance.fetchedAt,
          new Date(value.provenance.fetchedAt.getTime() + 15000),
          value.provenance.decoderVersion,
        ],
      );
    }
  });
}
