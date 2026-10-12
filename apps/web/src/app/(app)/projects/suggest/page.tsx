import type { Metadata } from 'next';
import { PageHeader } from '@/components/app/page-header';
import { SuggestionForm } from '@/components/submissions/suggestion-form';

export const metadata: Metadata = { title: 'Suggest a project' };

/** ADR 0010 Part A: a private suggestion. Staff decide whether a public profile is created. */
export default function SuggestProjectPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Suggest a project"
        description="Propose a project that is missing from the directory. Your suggestion stays private; staff check it and decide whether to create a public profile."
      />
      <SuggestionForm />
    </div>
  );
}
