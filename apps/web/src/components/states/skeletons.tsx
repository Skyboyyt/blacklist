import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';

export function LoadingStatus({ label }: { readonly label: string }) {
  return (
    <p role="status" className="mb-4 flex items-center gap-2 text-sm text-muted">
      <Spinner size="sm" />
      {label}
    </p>
  );
}

export function ResultsSkeleton() {
  return (
    <div>
      <LoadingStatus label="Searching…" />
      <div className="flex flex-col gap-3">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-lg border border-border bg-surface p-4">
            <Skeleton className="mb-2 h-4 w-24" />
            <Skeleton className="mb-2 h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ResearchSkeleton() {
  return (
    <div>
      <LoadingStatus label="Loading research…" />
      <Skeleton className="mb-3 h-4 w-32" />
      <Skeleton className="mb-6 h-8 w-2/3" />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-5 lg:col-span-2">
          <Skeleton className="mb-4 h-6 w-28" />
          <Skeleton className="mb-2 h-4 w-full" />
          <Skeleton className="mb-2 h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="rounded-lg border border-border bg-surface p-5">
          <Skeleton className="mb-2 h-4 w-1/2" />
          <Skeleton className="mb-2 h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div>
      <LoadingStatus label="Loading…" />
      <Skeleton className="mb-6 h-8 w-48" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    </div>
  );
}
