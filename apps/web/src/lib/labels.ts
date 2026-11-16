import type { T } from '@/i18n';

// Display names for values stored by the server, in English. Pass them
// through t() to show them in the chosen language.
// Modes (stored as a session's activity_type). Free Play was removed in
// November 2026; its name stays so old sessions still read right in history,
// reports and analytics.
export const ACTIVITY_NAMES: Record<string, string> = { trace_learn: 'Trace & Learn', color_create: 'Color & Create', free_play: 'Free Play' };
export const MODE_NAMES = ACTIVITY_NAMES;
export const SAFETY_NAMES: Record<string, string> = { strict: 'STRICT', standard: 'STANDARD', custom: 'CUSTOM' };

// Sub-modes (activity_subtype). The ones after the first three are from
// sessions saved before November 2026.
export const SUBTYPE_NAMES: Record<string, string> = {
  trace_word: 'Trace Word',
  trace_image: 'Trace Image',
  coloring_page: 'Coloring Page',
  single_object: 'Single Object Coloring',
  scene: 'Scene Coloring',
  craft_cutout: 'Craft Cut-out',
  coloring_card: 'Coloring Card',
  letter: 'Letter Tracing',
  number: 'Number Tracing & Counting',
  shape: 'Shape Tracing',
  prewriting: 'Pre-writing Lines',
  word: 'Word Tracing',
  storybook: 'Storybook Picture',
  flashcard: 'Flashcard',
  character: 'Character / Sticker',
};

// Safety categories (src/server/safety.ts).
export const CATEGORY_NAMES: Record<string, string> = {
  violence: 'Violence',
  weapons: 'Weapons',
  adult: 'Adult content',
  drugs: 'Drugs or alcohol',
  bad_language: 'Bad language',
  hate: 'Hate or bullying',
  self_harm: 'Self-harm',
  personal_info: 'Personal information',
  scary: 'Scary content',
  rough_play: 'Rough play',
  custom: 'Teacher blocked word',
};

// Printer problems (src/server/printer.ts).
export const PROBLEM_NAMES: Record<string, string> = {
  offline: 'The printer is turned off',
  jam: 'Paper jam',
  no_paper: 'Out of paper',
  no_ink: 'Out of ink',
  service_down: 'The printer service is not running',
  error: 'The printer reported an error',
};

// Languages a child can speak at the kiosk.
export const SPEECH_LANGUAGES: Record<string, string> = { en: 'English', fil: 'Filipino', tl: 'Taglish', unknown: 'Not recorded' };

type HasActivity = { activity_type?: string | null } | null | undefined;
export const activityName = (session: HasActivity, t: (s: string) => string = (s) => s) => t(ACTIVITY_NAMES[session?.activity_type ?? ''] ?? '');
export const subtypeName = (id: string | null | undefined, t: (s: string) => string = (s) => s) => t(SUBTYPE_NAMES[id ?? ''] ?? id ?? '');

// Built-in theme names are translated; a teacher's own theme is shown as typed.
export const themeName = (theme: string | null | undefined, t: T) => (theme ? t(theme) : '');

type Blocked = {
  block_match?: unknown;
  matched?: unknown;
  block_category?: unknown;
  category?: unknown;
  block_reason?: unknown;
  reason?: unknown;
  block_source?: unknown;
};

// Why a request was stopped, worded in the current language.
export function blockReason(r: Blocked, t: T) {
  const category = String(r.block_category ?? r.category ?? '');
  const categoryName = t(CATEGORY_NAMES[category] ?? category).toLowerCase();
  if (r.block_source === 'ai') return t('The AI safety check flagged this ({category}).', { category: categoryName });
  const word = (r.block_match ?? r.matched) as string | undefined;
  if (!word) return String(r.block_reason ?? r.reason ?? '');
  if (category === 'personal_info') return t('Contains {what}.', { what: t(word) });
  return t('Said “{word}” ({category}).', { word, category: categoryName });
}
