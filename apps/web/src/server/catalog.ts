// The modes, sub-modes and themes the teacher picks in Session Setup, plus
// the prompts that turn a child's words into an image prompt.
//
// In the database a mode is a session's activity_type (trace_learn,
// color_create) and its sub-mode the activity_subtype. Sessions saved before
// November 2026 can also have free_play (retired) and older sub-types
// (letter, number, shape, prewriting, word, single_object, scene...); they are
// only shown in history, reports and analytics (src/lib/labels.ts).

import type { WordPair } from './words';

export type ActivityType = 'trace_learn' | 'color_create';

export const activities = [
  {
    id: 'trace_learn',
    name: 'Trace & Learn',
    description: 'Tracing worksheets with dotted words.',
    subtypes: [
      { id: 'trace_word', name: 'Trace Word', description: 'The word in dotted letters, 4 rows, in English and Filipino. No picture.' },
      { id: 'trace_image', name: 'Trace Image', description: 'A dashed picture to trace, with the dotted word below.' },
    ],
  },
  {
    id: 'color_create',
    name: 'Color & Create',
    description: 'A coloring page with the word below.',
    // One output only, so Session Setup skips the "Select Mode" step.
    subtypes: [{ id: 'coloring_page', name: 'Coloring Page', description: 'One big picture with thick outlines to color, and its word.' }],
  },
] as const;

// Free Expression: no theme. The child can ask for anything (the safety
// checks still apply). It is the default and recommended choice.
export const FREE_EXPRESSION = 'Free Expression';

export const themes = [
  { id: 'free_expression', name: FREE_EXPRESSION, examples: ['Dinosaur', 'Rocket', 'Rainbow'], recommended: true },
  { id: 'animals', name: 'Animals', examples: ['Cat', 'Dog', 'Lion'] },
  { id: 'transportation', name: 'Transportation', examples: ['Car', 'Jeepney', 'Airplane'] },
  { id: 'fruits', name: 'Fruits', examples: ['Apple', 'Mango', 'Banana'] },
  { id: 'community_helpers', name: 'Community Helpers', examples: ['Doctor', 'Teacher', 'Firefighter'] },
  { id: 'shapes', name: 'Shapes', examples: ['Circle', 'Square', 'Triangle'] },
  { id: 'colors', name: 'Colors', examples: ['Red', 'Blue', 'Yellow'] },
  { id: 'nature', name: 'Nature', examples: ['Tree', 'Flower', 'Butterfly'] },
];

export const LANGUAGES = ['English', 'Filipino', 'Taglish'];

export const isFreeExpression = (theme: string | null | undefined) => !theme || theme === FREE_EXPRESSION;

// Black on white only: the pages print in black and white (and on a thermal
// roll, only black dots exist).
const TRACE_IMAGE = 'simple cute cartoon, dashed outline only, no fill, no shading, solid black eyes, white background, chunky shapes, big head, simple body, few details';
const COLORING = 'thick bold black outlines, white interior, no shading, no gray, white background';
const NEGATIVE = 'color, colors, shading, gray, grayscale shading, gradient, shadow, photo, realistic, text, letters, words, watermark, signature, frame, border';

// What is printed besides the picture. Letters are drawn by the hardware
// service with a font, never by the AI, so they are always spelled right.
export type PageKind = 'trace_word' | 'trace_image' | 'coloring';
export type Sheet =
  | { kind: PageKind; en: string; fil: string }
  // Saved before November 2026; still shown and reprinted (as Trace Image).
  | { kind: 'letter' | 'number' | 'shape' | 'prewriting' | 'word'; word: string };

export function findActivity(type: unknown, subtype: unknown) {
  const activity = activities.find((a) => a.id === type);
  const sub = activity?.subtypes.find((s) => s.id === subtype);
  return activity && sub ? { activity, subtype: sub } : null;
}

export type SessionRules = {
  activityType: string;
  activitySubtype: string;
  theme: string;
};

// The page a session makes. Old sessions still running after an update
// (letter tracing, Free Play...) get the closest new page.
export function pageKind(session: SessionRules): PageKind {
  if (session.activityType === 'trace_learn') return session.activitySubtype === 'trace_word' ? 'trace_word' : 'trace_image';
  return 'coloring';
}

// needsImage: false for Trace Word, which is letters only (no AI picture).
export type BuiltPrompt = { prompt: string; negative: string; sheet: Sheet; needsImage: boolean };

// subject: the child's idea, already cleaned up (by the prompt enhancer when
// it is available, otherwise the words as recognized). word: the word for the page.
export function buildPrompt(session: SessionRules, childText: string, word: WordPair): BuiltPrompt {
  const subject = childText.trim().replace(/[.!?]+$/, '').replace(/^(a|an|the)\s+/i, '');
  const kind = pageKind(session);
  const sheet: Sheet = { kind, en: word.en, fil: word.fil };
  // Free Expression adds no theme: the child's idea is the whole prompt.
  const theme = isFreeExpression(session.theme) ? '' : `, theme: ${session.theme}`;
  if (kind === 'trace_word') return { prompt: '', negative: '', sheet, needsImage: false };
  const prompt = kind === 'trace_image' ? `${subject}, ${TRACE_IMAGE}` : `coloring book page of ${subject}, one large subject filling the page, ${COLORING}`;
  return { prompt: prompt + theme, negative: NEGATIVE, sheet, needsImage: true };
}
