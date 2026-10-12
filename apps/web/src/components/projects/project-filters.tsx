import {
  CHAIN_SLUGS,
  PROJECT_CATEGORIES,
  PROJECT_QUERY_MAX_LENGTH,
  projectFindingsFilterSchema,
  projectSortSchema,
  type ProjectDirectoryQuery,
} from '@blacklist/contracts';
import Link from 'next/link';
import { CHAIN_NAMES } from '@/components/app/chain-badge';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { CATEGORY_LABEL, FINDINGS_FILTER_LABEL, SORT_LABEL } from '@/lib/projects/copy';

/**
 * Directory search and filters as a plain GET form: works without JavaScript, is
 * keyboard-native, and keeps the URL as the shareable source of truth.
 * Submitting always returns to page 1.
 */
export function ProjectFilters({ query }: { readonly query: ProjectDirectoryQuery }) {
  return (
    <form
      method="get"
      action="/projects"
      role="search"
      aria-label="Search and filter projects"
      className="grid gap-4 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-6"
    >
      <Field
        id="project-q"
        label="Search projects"
        hint="Name, official domain, or official address. Address searches need a network."
        className="sm:col-span-2 lg:col-span-3"
      >
        {(control) => (
          <Input
            {...control}
            name="q"
            type="search"
            defaultValue={query.query ?? ''}
            maxLength={PROJECT_QUERY_MAX_LENGTH}
            autoComplete="off"
            spellCheck={false}
          />
        )}
      </Field>
      <Field id="project-chain" label="Network" className="lg:col-span-3">
        {(control) => (
          <Select {...control} name="chain" defaultValue={query.chain ?? ''}>
            <option value="">All supported networks</option>
            {CHAIN_SLUGS.map((c) => (
              <option key={c} value={c}>
                {CHAIN_NAMES[c]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field id="project-category" label="Category" className="lg:col-span-2">
        {(control) => (
          <Select {...control} name="category" defaultValue={query.category ?? ''}>
            <option value="">All categories</option>
            {PROJECT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field id="project-status" label="Findings status" className="lg:col-span-2">
        {(control) => (
          <Select {...control} name="status" defaultValue={query.findings}>
            {projectFindingsFilterSchema.options.map((f) => (
              <option key={f} value={f}>
                {FINDINGS_FILTER_LABEL[f]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field id="project-sort" label="Sort by" className="lg:col-span-2">
        {(control) => (
          <Select {...control} name="sort" defaultValue={query.sort}>
            {projectSortSchema.options.map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-6">
        <Button type="submit">Apply</Button>
        <Link href="/projects" className="text-sm font-medium text-accent hover:underline">
          Clear filters
        </Link>
      </div>
    </form>
  );
}
