import { CHAIN_SLUGS, type ChainSlugDto } from '@blacklist/contracts';
import { cn } from '@/lib/cn';

export const CHAIN_NAMES: Readonly<Record<ChainSlugDto, string>> = {
  ethereum: 'Ethereum',
  solana: 'Solana',
};

export function isSupportedChain(value: string): value is ChainSlugDto {
  return (CHAIN_SLUGS as readonly string[]).includes(value);
}

const dots: Record<ChainSlugDto, string> = {
  ethereum: 'bg-[#627eea]',
  solana: 'bg-[#14f195]',
};

export function ChainBadge({
  chain,
  className,
}: {
  readonly chain: ChainSlugDto;
  readonly className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2 py-0.5 text-xs font-medium text-text',
        className,
      )}
    >
      <span aria-hidden="true" className={cn('size-2 rounded-full', dots[chain])} />
      {CHAIN_NAMES[chain]}
    </span>
  );
}
