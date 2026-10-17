/**
 * Plain-text message signing for standing (moderation §6.4). Only `personal_sign` (EVM)
 * and `signMessage` (Solana) are ever requested: never `eth_sign`, typed data or a
 * transaction, and never a seed phrase or key. The server checks the signature against
 * the text it stored, so the text shown here is informational.
 */

export type SignOutcome =
  | { readonly kind: 'signed'; readonly signature: string }
  | { readonly kind: 'error'; readonly message: string };

type Eip1193 = { request(args: { method: string; params?: readonly unknown[] }): Promise<unknown> };
type SolanaProvider = {
  connect(): Promise<{ publicKey: { toString(): string } }>;
  signMessage(message: Uint8Array, encoding: 'utf8'): Promise<{ signature: Uint8Array }>;
};

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = '';
  while (n > 0n) {
    out = ALPHABET.charAt(Number(n % 58n)) + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = `1${out}`;
  }
  return out;
}

function hasMethod(value: unknown, name: string): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>)[name] === 'function'
  );
}

function evmProvider(): Eip1193 | null {
  const candidate: unknown = (globalThis as { ethereum?: unknown }).ethereum;
  return hasMethod(candidate, 'request') ? (candidate as Eip1193) : null;
}

function solanaProvider(): SolanaProvider | null {
  const g = globalThis as { phantom?: { solana?: unknown }; solana?: unknown };
  const candidate: unknown = g.phantom?.solana ?? g.solana;
  return hasMethod(candidate, 'connect') && hasMethod(candidate, 'signMessage')
    ? (candidate as SolanaProvider)
    : null;
}

const toHex = (text: string) =>
  `0x${Array.from(new TextEncoder().encode(text), (b) => b.toString(16).padStart(2, '0')).join('')}`;

const refused = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 4001;

async function signEvm(address: string, message: string): Promise<SignOutcome> {
  const provider = evmProvider();
  if (!provider) return { kind: 'error', message: 'No Ethereum wallet was found in this browser.' };
  try {
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    const list = Array.isArray(accounts) ? accounts.filter((a): a is string => typeof a === 'string') : [];
    const account = list.find((a) => a.toLowerCase() === address.toLowerCase());
    if (!account)
      return {
        kind: 'error',
        message: 'The connected wallet does not control this address. Switch to the account that does.',
      };
    const signature = await provider.request({ method: 'personal_sign', params: [toHex(message), account] });
    return typeof signature === 'string'
      ? { kind: 'signed', signature }
      : { kind: 'error', message: 'The wallet returned no signature.' };
  } catch (error) {
    return {
      kind: 'error',
      message: refused(error) ? 'You declined to sign.' : 'The wallet could not sign.',
    };
  }
}

async function signSolana(address: string, message: string): Promise<SignOutcome> {
  const provider = solanaProvider();
  if (!provider) return { kind: 'error', message: 'No Solana wallet was found in this browser.' };
  try {
    const { publicKey } = await provider.connect();
    if (publicKey.toString() !== address)
      return {
        kind: 'error',
        message: 'The connected wallet does not control this address. Switch to the account that does.',
      };
    const { signature } = await provider.signMessage(new TextEncoder().encode(message), 'utf8');
    return { kind: 'signed', signature: base58(signature) };
  } catch (error) {
    return {
      kind: 'error',
      message: refused(error) ? 'You declined to sign.' : 'The wallet could not sign.',
    };
  }
}

export function signStandingMessage(chain: string, address: string, message: string): Promise<SignOutcome> {
  return chain === 'solana' ? signSolana(address, message) : signEvm(address, message);
}
