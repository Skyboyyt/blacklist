import { z } from 'zod';
import type { ProviderCallOptions } from '../ports.ts';
import { hash, hexQuantity } from '../adapters/evm-transaction.ts';
import { ProviderFault, type RpcTransport } from './rpc-transport.ts';
export const evmBlockSchema = z.object({ number: hexQuantity, hash, timestamp: hexQuantity });
export const evmCodeSchema = z
  .string()
  .regex(/^0x(?:[\da-f]{2})*$/u)
  .max(2 * 1024 * 1024);
export function createEvmStateReader(rpc: RpcTransport) {
  let identity: Promise<void> | undefined;
  const network = () =>
    (identity ??= rpc
      .call('eth_chainId', [], z.literal('0x1'))
      .then(() => undefined)
      .catch((error: unknown) => {
        identity = undefined;
        throw error;
      }));
  async function anchor(options: ProviderCallOptions) {
    if (!['latest', 'finalized'].includes(options.commitment)) throw new ProviderFault('not_supported');
    const head = await rpc.call(
      'eth_getBlockByNumber',
      [options.commitment, false],
      evmBlockSchema,
      options.signal,
    );
    const block = options.blockHash
      ? await rpc.call('eth_getBlockByHash', [options.blockHash, false], evmBlockSchema, options.signal)
      : head;
    if (options.blockHash && block.hash !== options.blockHash) throw new ProviderFault('invalid_response');
    const canonical = await rpc.call(
      'eth_getBlockByNumber',
      [block.number, false],
      evmBlockSchema,
      options.signal,
    );
    if (
      canonical.hash !== block.hash ||
      canonical.number !== block.number ||
      BigInt(block.number) > BigInt(head.number)
    )
      throw new ProviderFault('invalid_response');
    return block;
  }
  return { network, anchor };
}
