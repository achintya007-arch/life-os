import type { KeyboardEvent } from 'react';

/**
 * Enter in a single-line input submits the surrounding form. Browsers usually
 * do this implicitly, but not in every environment — make it explicit.
 * Inputs that handle Enter themselves can call preventDefault first.
 */
export function submitOnEnter(e: KeyboardEvent<HTMLFormElement>) {
  if (e.key !== 'Enter' || e.defaultPrevented || e.nativeEvent.isComposing) return;
  const target = e.target as HTMLElement;
  if (target.tagName !== 'INPUT') return;
  e.preventDefault();
  e.currentTarget.requestSubmit();
}
