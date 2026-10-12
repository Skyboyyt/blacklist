import { MOCK_FIXTURE_MARKER } from '@/lib/api/mock/fixtures/ids';
import { MockPreviewControls } from './mock-preview-controls';

/**
 * Shown on every page in mock mode. Loaded only through a dynamic import guarded by
 * NEXT_PUBLIC_API_MODE, so it (and the fixture marker) never reach production builds.
 */
export function DemoBanner() {
  return (
    <div
      data-mock-marker={MOCK_FIXTURE_MARKER}
      className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-warning/40 bg-warning-soft px-4 py-1.5 text-center text-xs text-text"
    >
      <p>
        <strong>Demo mode.</strong> All data is fictional and served by a mock. Nothing here is a real
        assessment.
      </p>
      <MockPreviewControls />
    </div>
  );
}
