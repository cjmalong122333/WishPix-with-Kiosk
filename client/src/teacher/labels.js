// Display names for values stored by the server, in English. Pass them
// through t() to show them in the chosen language.
export const ACTIVITY_NAMES = { color_create: 'Color & Create', trace_learn: 'Trace & Learn', free_play: 'Free Play' }
export const SAFETY_NAMES = { strict: 'STRICT', standard: 'STANDARD', custom: 'CUSTOM' }

export const SUBTYPE_NAMES = {
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
}

// Safety filter categories (server/src/safety.js).
export const CATEGORY_NAMES = {
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
}

// Printer problems (server/src/printer.js).
export const PROBLEM_NAMES = {
  offline: 'The printer is turned off',
  jam: 'Paper jam',
  no_paper: 'Out of paper',
  no_ink: 'Out of ink',
}

// Languages a child can choose on the phone.
export const SPEECH_LANGUAGES = { en: 'English', fil: 'Filipino', tl: 'Taglish', unknown: 'Not recorded' }

export const activityName = (session, t = (s) => s) => t(ACTIVITY_NAMES[session?.activity_type] ?? '')
export const subtypeName = (id, t = (s) => s) => t(SUBTYPE_NAMES[id] ?? id ?? '')

// Built-in theme names are translated; a teacher's own theme is shown as typed.
export const themeName = (theme, t) => (theme ? t(theme) : '')

// Why the safety filter stopped a request, worded in the current language.
export function blockReason(r, t) {
  const word = r.block_match ?? r.matched
  const category = r.block_category ?? r.category
  if (!word) return r.block_reason ?? r.reason ?? ''
  if (category === 'personal_info') return t('Contains {what}.', { what: t(word) })
  return t('Said “{word}” ({category}).', { word, category: t(CATEGORY_NAMES[category] ?? category).toLowerCase() })
}
