// Activities, sub-types and themes the teacher can pick in Session Setup,
// plus the prompt templates that turn a child's words into an image prompt.

export const activities = [
  {
    id: 'color_create',
    name: 'Color & Create',
    description: 'Child generates coloring pages.',
    subtypes: [
      { id: 'single_object', name: 'Single Object Coloring', description: 'One big, simple picture to color.' },
      { id: 'scene', name: 'Scene Coloring', description: 'The object in a simple background.' },
      { id: 'craft_cutout', name: 'Craft Cut-out', description: 'A mask or puppet with thick cut lines.' },
      { id: 'coloring_card', name: 'Coloring Card', description: 'A card with a border, for special days.' },
    ],
  },
  {
    id: 'trace_learn',
    name: 'Trace & Learn',
    description: 'Child generates tracing worksheets.',
    subtypes: [
      { id: 'letter', name: 'Letter Tracing', description: 'A dotted first letter, like A is for apple.' },
      { id: 'number', name: 'Number Tracing & Counting', description: 'Count the pictures and trace the number.' },
      { id: 'shape', name: 'Shape Tracing', description: 'Dotted circles, squares, triangles and more.' },
      { id: 'prewriting', name: 'Pre-writing Lines', description: 'Zigzags, waves and loops to follow.' },
      { id: 'word', name: 'Word Tracing', description: 'Trace the word, in English or Filipino.' },
    ],
  },
  {
    id: 'free_play',
    name: 'Free Play',
    description: 'Open generation.',
    subtypes: [
      { id: 'storybook', name: 'Storybook Picture', description: 'A colorful picture of anything they say.' },
      { id: 'flashcard', name: 'Flashcard', description: 'One clear picture with its word.' },
      { id: 'character', name: 'Character / Sticker', description: 'A cute character with a white border.' },
    ],
  },
];

export const themes = [
  { id: 'animals', name: 'Animals', examples: ['Cat', 'Dog', 'Lion'] },
  { id: 'transportation', name: 'Transportation', examples: ['Car', 'Jeepney', 'Airplane'] },
  { id: 'fruits', name: 'Fruits', examples: ['Apple', 'Mango', 'Banana'] },
  { id: 'community_helpers', name: 'Community Helpers', examples: ['Doctor', 'Teacher', 'Firefighter'] },
  { id: 'shapes', name: 'Shapes', examples: ['Circle', 'Square', 'Triangle'] },
  { id: 'colors', name: 'Colors', examples: ['Red', 'Blue', 'Yellow'] },
  { id: 'nature', name: 'Nature', examples: ['Tree', 'Flower', 'Butterfly'] },
];

const LINE_ART = 'black and white coloring book line art, outline only, thick clean black outlines, monochrome, no shading, no fill, plain white background, very simple for preschool children aged 3 to 5';
const COLORFUL = 'bright friendly colors, cute cartoon style, simple shapes, child friendly, for preschool children';

// Trace & Learn sheets only get the picture from the AI; the dotted letters,
// numbers and lines are drawn by the kiosk on top so they are always correct.
const templates = {
  color_create: {
    single_object: (s) => `coloring book page of a single ${s}, centered, large, ${LINE_ART}`,
    scene: (s) => `coloring book page of ${s} in a simple scene with a few background details, ${LINE_ART}`,
    craft_cutout: (s) => `printable paper craft cut-out mask of ${s}, thick bold cut lines, ${LINE_ART}`,
    coloring_card: (s) => `greeting card coloring book page featuring ${s}, decorative simple border, ${LINE_ART}`,
  },
  trace_learn: {
    letter: (s) => `one small simple ${s}, ${LINE_ART}`,
    number: (s, sheet) => `exactly ${sheet.count} identical simple ${s} in a row, ${LINE_ART}`,
    shape: (s) => `one simple ${s}, ${LINE_ART}`,
    prewriting: (s) => `one small simple ${s}, ${LINE_ART}`,
    word: (s) => `one small simple ${s}, ${LINE_ART}`,
  },
  free_play: {
    storybook: (s) => `storybook illustration of ${s}, ${COLORFUL}`,
    flashcard: (s) => `flashcard picture of ${s}, single subject centered, plain white background, ${COLORFUL}`,
    character: (s) => `cute sticker of ${s} with a thick white outline border, ${COLORFUL}`,
  },
};

const NEGATIVE_LINE_ART = 'color, colors, shading, gray, grayscale shading, gradient, shadow, photo, realistic, text, letters, words, watermark, signature, frame';
const NEGATIVE_COLORFUL = 'text, letters, words, watermark, signature, scary, dark, realistic photo';

export function findActivity(type, subtype) {
  const activity = activities.find((a) => a.id === type);
  const sub = activity?.subtypes.find((s) => s.id === subtype);
  return activity && sub ? { activity, subtype: sub } : null;
}

const NUMBER_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  isa: 1, isang: 1, dalawa: 2, dalawang: 2, tatlo: 3, tatlong: 3, apat: 4, lima: 5, limang: 5,
  anim: 6, pito: 7, pitong: 7, walo: 8, walong: 8, siyam: 9, sampu: 10, sampung: 10,
};
const FILLER = new Set(['a', 'an', 'the', 'some', 'ang', 'mga', 'ng', 'na', 'please', 'i', 'want', 'gusto', 'ko']);
const SHAPES = { circle: 'circle', bilog: 'circle', square: 'square', parisukat: 'square', triangle: 'triangle', tatsulok: 'triangle', star: 'star', bituin: 'star', heart: 'heart', puso: 'heart' };
const PATHS = ['zigzag', 'wave', 'loops', 'bumps'];

// What the kiosk draws on the printed sheet for Trace & Learn. The AI image
// never contains these, so letters and numbers always come out right.
function buildSheet(session, words) {
  if (session.activity_type !== 'trace_learn') return null;
  // The object is usually the last real word ("a big elephant", "malaking aso").
  const content = words.filter((w) => !FILLER.has(w) && !(w in NUMBER_WORDS) && !/^\d+$/.test(w));
  const objects = content.filter((w) => !(w in SHAPES));
  const main = objects.at(-1) ?? content.at(-1) ?? words.at(-1) ?? 'apple';
  switch (session.activity_subtype) {
    case 'letter':
      return { kind: 'letter', letter: main[0].toUpperCase(), word: main };
    case 'number': {
      const n = words.map((w) => NUMBER_WORDS[w] ?? Number(w)).find((n) => n >= 1 && n <= 10);
      return { kind: 'number', count: n ?? 3, word: main };
    }
    case 'shape': {
      const shape = words.map((w) => SHAPES[w]).find(Boolean) ?? 'circle';
      return { kind: 'shape', shape, word: main };
    }
    case 'prewriting':
      return { kind: 'prewriting', path: PATHS[Math.floor(Math.random() * PATHS.length)], word: main };
    case 'word':
      return { kind: 'word', word: main.slice(0, 10) };
    default:
      return null;
  }
}

export function buildPrompt(session, childText) {
  const subject = childText.trim().replace(/[.!?]+$/, '').replace(/^(a|an|the)\s+/i, '');
  const words = subject.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const sheet = buildSheet(session, words);
  const template = templates[session.activity_type][session.activity_subtype];
  // Counting sheets draw the number themselves, so the picture gets just the object.
  const pictureSubject = sheet?.kind === 'number' ? sheet.word : subject;
  const themeHint = session.theme ? `, theme: ${session.theme}` : '';
  return {
    prompt: template(pictureSubject, sheet) + themeHint,
    negative: session.activity_type === 'free_play' ? NEGATIVE_COLORFUL : NEGATIVE_LINE_ART,
    sheet,
  };
}
