import { describe, it, expect } from 'vitest';
import { keccak256, toHex } from 'viem';
import { decodeEvmTransaction } from './evm-transaction.ts';
import { registry } from '../registry.ts';
import { evmAdapter } from './identity.ts';
const chain = registry.bySlug('ethereum');
if (!chain) throw new Error('fixture_invalid');
const sender = '0x' + '1'.repeat(40),
  recipient = '0x' + '2'.repeat(40),
  token = '0x' + '3'.repeat(40),
  spender = '0x' + '4'.repeat(40);
const topic = (s: string) => '0x' + s.slice(2).padStart(64, '0');
const amount = '0x' + 9007199254740993n.toString(16).padStart(64, '0');
const tx = {
  hash: '0x' + 'a'.repeat(64),
  from: sender,
  to: token,
  value: '0x0',
  input: '0xa9059cbb' + topic(recipient).slice(2) + amount.slice(2),
  blockHash: '0x' + 'b'.repeat(64),
  blockNumber: '0x10',
  transactionIndex: '0x0',
};
const log = {
  address: token,
  topics: [keccak256(toHex('Transfer(address,address,uint256)')), topic(sender), topic(recipient)],
  data: amount,
  transactionHash: tx.hash,
  blockHash: tx.blockHash,
  logIndex: '0x0',
  removed: false,
};
const receipt = {
  transactionHash: tx.hash,
  blockHash: tx.blockHash,
  blockNumber: '0x10',
  transactionIndex: '0x0',
  status: '0x1',
  gasUsed: '0x5208',
  effectiveGasPrice: '0x3b9aca00',
  logs: [log],
};
const known = evmAdapter.parseAddress(token);
if (!known) throw new Error('fixture_invalid');
describe('EVM transfer evidence is separate from authorization', () => {
  it('preserves integer precision and only labels a direct matching known-asset call', () => {
    const out = decodeEvmTransaction(chain.chainId, tx, receipt, new Date(), new Set([known]));
    expect(out.transfers[0]).toMatchObject({
      amountRaw: '9007199254740993',
      evidenceLevel: 'asset_contract_log',
      authorization: 'subject_signed_direct',
    });
    expect(out.feeRaw).toBe('21000000000000');
  });
  it('never upgrades an unclassified/fake emitter or a relayed call', () => {
    expect(decodeEvmTransaction(chain.chainId, tx, receipt, new Date()).transfers[0]).toMatchObject({
      evidenceLevel: 'observed_log',
      authorization: 'unknown',
    });
    expect(
      decodeEvmTransaction(chain.chainId, { ...tx, to: spender }, receipt, new Date(), new Set([known]))
        .transfers[0]?.authorization,
    ).toBe('unknown');
  });
  it('identifies transferFrom spender delegation rather than attributing it to the victim', () => {
    const call = {
      ...tx,
      from: spender,
      input: '0x23b872dd' + topic(sender).slice(2) + topic(recipient).slice(2) + amount.slice(2),
    };
    expect(
      decodeEvmTransaction(chain.chainId, call, receipt, new Date(), new Set([known])).transfers[0],
    ).toMatchObject({ authorization: 'delegated', authority: spender, from: sender });
  });
  it('does not create transfers from failed execution or orphaned/mismatched receipts', () => {
    expect(
      decodeEvmTransaction(chain.chainId, tx, { ...receipt, status: '0x0' }, new Date()).transfers,
    ).toEqual([]);
    for (const bad of [
      { ...receipt, blockHash: '0x' + 'c'.repeat(64) },
      { ...receipt, logs: [{ ...log, removed: true }] },
      { ...receipt, logs: [log, log] },
    ])
      expect(() => decodeEvmTransaction(chain.chainId, tx, bad, new Date())).toThrow();
  });
});
