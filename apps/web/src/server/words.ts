// The one word printed on a page ("CAT / PUSA" on tracing sheets, "CAT" or
// "PUSA" under a coloring picture). With OpenAI set up, the AI picks the
// word and translates it (src/server/ai/openai.ts). Without it, this list of
// everyday words a preschooler is likely to say does the translating; a word
// not on the list prints in the language the child said it.

export type WordPair = { en: string; fil: string };

// English -> Filipino. Singular, lower case.
const EN_FIL: Record<string, string> = {
  // Animals
  cat: 'pusa', kitten: 'kuting', dog: 'aso', puppy: 'tuta', bird: 'ibon', fish: 'isda', chicken: 'manok', hen: 'inahin',
  rooster: 'tandang', duck: 'pato', pig: 'baboy', cow: 'baka', carabao: 'kalabaw', horse: 'kabayo', goat: 'kambing',
  sheep: 'tupa', rabbit: 'kuneho', mouse: 'daga', frog: 'palaka', snake: 'ahas', turtle: 'pagong', monkey: 'unggoy',
  lion: 'leon', tiger: 'tigre', elephant: 'elepante', bear: 'oso', giraffe: 'dyirap', zebra: 'sebra', butterfly: 'paru-paro',
  bee: 'bubuyog', ant: 'langgam', spider: 'gagamba', crab: 'alimango', shrimp: 'hipon', owl: 'kuwago', eagle: 'agila',
  dinosaur: 'dinosauro', dragon: 'dragon', whale: 'balyena', shark: 'pating', octopus: 'pugita', snail: 'suso', lizard: 'butiki',
  // Fruits and food
  apple: 'mansanas', mango: 'mangga', banana: 'saging', orange: 'dalandan', grapes: 'ubas', grape: 'ubas', pineapple: 'pinya',
  watermelon: 'pakwan', papaya: 'papaya', coconut: 'niyog', strawberry: 'strawberry', lemon: 'limon', guava: 'bayabas',
  rice: 'kanin', bread: 'tinapay', egg: 'itlog', cake: 'keyk', milk: 'gatas', candy: 'kendi', 'ice cream': 'sorbetes',
  // Transportation
  car: 'kotse', jeepney: 'dyip', jeep: 'dyip', bus: 'bus', truck: 'trak', bike: 'bisikleta', bicycle: 'bisikleta',
  boat: 'bangka', ship: 'barko', airplane: 'eroplano', plane: 'eroplano', train: 'tren', tricycle: 'traysikel',
  helicopter: 'helikopter', rocket: 'rocket',
  // Community helpers
  doctor: 'doktor', nurse: 'nars', teacher: 'guro', firefighter: 'bumbero', police: 'pulis', farmer: 'magsasaka',
  fisherman: 'mangingisda', cook: 'kusinero', baker: 'panadero', dentist: 'dentista',
  // Shapes
  circle: 'bilog', square: 'parisukat', triangle: 'tatsulok', star: 'bituin', heart: 'puso', rectangle: 'parihaba',
  // Colors
  red: 'pula', blue: 'asul', yellow: 'dilaw', green: 'berde', violet: 'lila', purple: 'lila',
  pink: 'rosas', black: 'itim', white: 'puti', brown: 'kayumanggi',
  // Nature and things around
  tree: 'puno', flower: 'bulaklak', leaf: 'dahon', sun: 'araw', moon: 'buwan', cloud: 'ulap', rain: 'ulan',
  rainbow: 'bahaghari', mountain: 'bundok', sea: 'dagat', river: 'ilog', house: 'bahay', school: 'paaralan',
  ball: 'bola', doll: 'manika', book: 'aklat', kite: 'saranggola', chair: 'upuan', table: 'mesa', robot: 'robot',
  family: 'pamilya', mother: 'nanay', father: 'tatay', baby: 'sanggol', friend: 'kaibigan', boy: 'batang lalaki',
  girl: 'batang babae', princess: 'prinsesa', king: 'hari', queen: 'reyna', castle: 'kastilyo',
};

// Filipino -> English, plus common Filipino spellings and forms.
const FIL_EN: Record<string, string> = {
  ...Object.fromEntries(Object.entries(EN_FIL).map(([en, fil]) => [fil, en])),
  kahel: 'orange',
  jeep: 'jeepney',
  dyipni: 'jeepney',
  eroplano: 'airplane',
  bisikleta: 'bicycle',
  lila: 'purple',
  aklat: 'book',
  libro: 'book',
  pinya: 'pineapple',
  piña: 'pineapple',
  ubas: 'grapes',
  paruparo: 'butterfly',
  'paru-paro': 'butterfly',
  pating: 'shark',
  bola: 'ball',
};

// Words that are not the thing itself ("a big happy cat", "isang malaking aso").
const FILLER = new Set([
  'a', 'an', 'the', 'some', 'my', 'please', 'i', 'want', 'like', 'and', 'with', 'of', 'in', 'on', 'is',
  'you', 'me', 'it', 'for', 'to', 'how', 'about', 'what', 'can', 'make', 'draw', 'give', 'your', 'this', 'that',
  'are', 'be', 'do', 'so', 'very', 'too', 'now',
  'ako', 'ikaw', 'mo', 'ka', 'naman', 'ito', 'iyan', 'gawa', 'gumawa', 'iguhit', 'pa', 'din', 'rin',
  'ang', 'mga', 'ng', 'na', 'sa', 'ko', 'gusto', 'isang', 'isa', 'at', 'si', 'yung', 'iyong', 'po',
]);
const NUMBERS = /^(\d+|one|two|three|four|five|six|seven|eight|nine|ten|dalawa(ng)?|tatlo(ng)?|apat( na)?|lima(ng)?|anim|pito(ng)?|walo(ng)?|siyam|sampu(ng)?)$/;

const clean = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

// "cats" -> "cat" when the singular is a known word.
function singular(word: string) {
  if (EN_FIL[word] || FIL_EN[word]) return word;
  for (const cut of [word.replace(/ies$/, 'y'), word.replace(/es$/, ''), word.replace(/s$/, '')]) {
    if (cut !== word && EN_FIL[cut]) return cut;
  }
  return word;
}

// The thing the child asked for: usually the last real word ("a big
// elephant", "malaking aso"), or a known word anywhere in the sentence.
export function mainWord(text: string): string {
  const words = clean(text).filter((w) => !FILLER.has(w) && !NUMBERS.test(w));
  const known = [...words].reverse().map(singular).find((w) => EN_FIL[w] || FIL_EN[w]);
  return known ?? singular(words.at(-1) ?? clean(text).at(-1) ?? '');
}

export function wordPair(text: string): WordPair {
  const word = mainWord(text).slice(0, 16);
  if (EN_FIL[word]) return { en: word, fil: EN_FIL[word] };
  if (FIL_EN[word]) return { en: FIL_EN[word], fil: word };
  return { en: word, fil: '' };
}

// A word from the AI: one word, lower case, no punctuation.
export function tidyWord(word: string | null | undefined): string {
  return clean(word ?? '').slice(0, 2).join(' ').slice(0, 16);
}
