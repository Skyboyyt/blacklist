import { EmptyState } from '@/components/app/empty-state';
import { ButtonLink } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-dvh max-w-lg items-center px-4">
      <EmptyState
        titleAs="h1"
        title="Page not found"
        description="The page you are looking for does not exist or has moved."
        action={<ButtonLink href="/">Go to research</ButtonLink>}
      />
    </main>
  );
}
