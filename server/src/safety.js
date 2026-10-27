// Safety filter. Every child request is checked here before an image is made.
//
// Levels (chosen in Session Setup):
//   standard  blocks violence, weapons, adult content, drugs and alcohol,
//             bad words, hate, self-harm and personal information.
//   strict    standard + scary things and rough play, for the youngest groups.
//   custom    standard + the teacher's own blocked words; the teacher's
//             allowed words are never blocked by the built-in lists.
//
// Word lists cover English and Filipino (and so Taglish). Matching works on
// whole words, ignores accents and letter stretching ("kiiill"), and reads
// simple look-alike spellings ("k1ll", "$hoot").

export const CATEGORIES = {
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

const STANDARD = {
  violence: [
    'kill', 'killed', 'killing', 'murder', 'stab', 'stabbed', 'stabbing', 'shoot', 'shooting', 'blood', 'bloody',
    'gore', 'dead body', 'corpse', 'behead', 'torture', 'strangle', 'choke', 'beat up', 'explode', 'exploded',
    'explosion', 'terrorist', 'war', 'massacre', 'die', 'died', 'dead', 'death', 'kidnap',
    'patay', 'patayin', 'pumatay', 'pinatay', 'mamatay', 'saksak', 'sinaksak', 'saksakin', 'dugo', 'duguan',
    'barilin', 'binaril', 'bugbog', 'bugbugin', 'binugbog', 'gyera', 'giyera', 'pugot', 'sakalin', 'kidnapin',
  ],
  weapons: [
    'gun', 'pistol', 'rifle', 'shotgun', 'machine gun', 'bullet', 'bomb', 'grenade', 'knife', 'knives',
    'dagger', 'missile', 'cannon', 'weapon', 'ammo',
    'baril', 'bomba', 'granada', 'kutsilyo', 'itak', 'patalim', 'balisong', 'armas',
  ],
  adult: [
    'sex', 'sexy', 'naked', 'nude', 'nudity', 'boobs', 'breasts', 'penis', 'vagina', 'porn', 'bikini', 'underwear',
    'kiss on the lips', 'make out', 'butt',
    'hubad', 'hubo', 'bastos', 'kantot', 'iyot', 'titi', 'burat', 'puke', 'pekpek', 'jakol', 'libog', 'malibog',
  ],
  drugs: [
    'drug', 'cocaine', 'marijuana', 'meth', 'cigarette', 'cigar', 'vape', 'smoking', 'beer', 'wine',
    'vodka', 'whiskey', 'alcohol', 'drunk', 'syringe',
    'droga', 'shabu', 'adik', 'sigarilyo', 'yosi', 'alak', 'lasing', 'serbesa', 'tagay', 'tsongki',
  ],
  bad_language: [
    'fuck', 'shit', 'bitch', 'damn', 'ass', 'asshole', 'bastard', 'crap', 'dick', 'piss', 'wtf', 'stfu',
    'puta', 'putang ina', 'putangina', 'tangina', 'tang ina', 'gago', 'gaga', 'ulol', 'ulul', 'tarantado', 'leche',
    'letse', 'pakyu', 'punyeta', 'kupal', 'pokpok', 'hayop ka', 'bwisit', 'buwisit', 'lintik', 'peste', 'kingina',
  ],
  hate: [
    'stupid', 'idiot', 'dumb', 'ugly', 'fatty', 'loser', 'hate', 'retard', 'nazi', 'slave',
    'bobo', 'tanga', 'tonta', 'tonto', 'pangit', 'baboy ka', 'inutil', 'abnoy', 'mongoloid',
  ],
  self_harm: [
    'suicide', 'kill myself', 'hurt myself', 'cut myself', 'self harm',
    'magpakamatay', 'nagpakamatay', 'saktan ang sarili',
  ],
};

const STRICT_ONLY = {
  scary: [
    'monster', 'ghost', 'zombie', 'skeleton', 'skull', 'vampire', 'witch', 'devil', 'demon', 'scary', 'creepy',
    'horror', 'nightmare', 'evil', 'grave', 'coffin', 'werewolf', 'clown',
    'multo', 'aswang', 'manananggal', 'kapre', 'tikbalang', 'halimaw', 'demonyo', 'diyablo', 'mangkukulam',
    'bungo', 'kabaong', 'nakakatakot', 'tiyanak', 'white lady',
  ],
  rough_play: [
    'fight', 'punch', 'kick', 'hit', 'slap', 'sword', 'angry', 'attack', 'pirate', 'ninja', 'soldier',
    'awayan', 'suntok', 'sapak', 'sampal', 'sipa', 'espada', 'galit', 'sundalo',
  ],
};

// Harmless phrases that contain a listed word. They are removed before
// matching, so "shooting star" and "leche flan" are fine.
const SAFE_PHRASES = [
  'shooting star', 'killer whale', 'water gun', 'glue gun', 'bath bomb', 'bamboo shoot', 'root beer',
  'ugly duckling', 'sword fish', 'friendly ghost', 'leche flan', 'letse flan',
];

// Look-alike spellings, applied only inside words that mix letters and
// symbols. End punctuation is dropped first, so "kill!" stays "kill".
const LOOKALIKE = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i' };
function lookalikes(w) {
  const word = w.replace(/[!?.,]+$/, '');
  return /\p{L}/u.test(word) && /[0-9@$!]/.test(word) ? word.replace(/[0134578@$!]/g, (c) => LOOKALIKE[c]) : word;
}

export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // accents: "ñ" -> "n", "é" -> "e"
    .split(/\s+/)
    .map(lookalikes)
    .join(' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// One regex per word or phrase. Each letter may be stretched ("kiiill"),
// spaces between words are flexible, and plain English endings are
// allowed ("bombs", "punches", "fighting").
function termPattern(term, flags = 'u') {
  const body = normalize(term)
    .split(' ')
    .map((word) => word.replace(/(.)\1*/g, (run, c) => `${escape(c)}{${run.length},}`))
    .join('\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${body}(?:s|es|ed|ing)?(?![\\p{L}\\p{N}])`, flags);
}
const escape = (c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const compile = (lists) =>
  Object.entries(lists).flatMap(([category, terms]) => terms.map((term) => ({ category, term, re: termPattern(term) })));

const STANDARD_RULES = compile(STANDARD);
const STRICT_RULES = [...STANDARD_RULES, ...compile(STRICT_ONLY)];

// A phone number has 7+ digits with a run of at least 3, so counting out
// loud ("1 2 3 4 5 6 7") is not mistaken for one.
const isPhoneNumber = (t) =>
  (t.match(/\d[\d\s-]*\d/g) ?? []).some((m) => m.replace(/\D/g, '').length >= 7 && /\d{3}/.test(m));

// Phone numbers, emails and street addresses should never reach the image service.
const PERSONAL_INFO = [
  { test: isPhoneNumber, what: 'a phone number' },
  { test: (t) => /[^\s@]+@[^\s@]+\.[^\s@]+/.test(t), what: 'an email address' },
  { test: (t) => /\b\d+\s+\p{L}+\s+(street|st|avenue|ave|road|rd|kalye)\b/iu.test(t), what: 'an address' },
];

const SAFE_PATTERNS = SAFE_PHRASES.map((p) => termPattern(p, 'gu'));
const removePhrases = (text, patterns) => patterns.reduce((t, re) => t.replace(re, ' '), text);

function blocked(category, term) {
  return {
    allowed: false,
    category,
    matched: term,
    reason: category === 'personal_info' ? `Contains ${term}.` : `Said "${term}" (${CATEGORIES[category].toLowerCase()}).`,
  };
}

// session: { safety_level, blocked_words, allowed_words } as saved in the database.
export function checkSafety(text, session) {
  const level = session?.safety_level ?? 'standard';
  const raw = String(text ?? '');

  for (const { test, what } of PERSONAL_INFO) if (test(raw)) return blocked('personal_info', what);

  const said = normalize(raw);
  const custom = level === 'custom';
  const teacherBlocked = custom ? (session.blocked_words ?? []).filter((w) => normalize(w)) : [];
  const teacherAllowed = custom ? (session.allowed_words ?? []).filter((w) => normalize(w)) : [];

  // The teacher's own blocked words win over everything else.
  for (const word of teacherBlocked) if (termPattern(word).test(said)) return blocked('custom', word);

  const rest = removePhrases(said, [...SAFE_PATTERNS, ...teacherAllowed.map((w) => termPattern(w, 'gu'))]);
  const rules = level === 'strict' ? STRICT_RULES : STANDARD_RULES;
  for (const { category, term, re } of rules) if (re.test(rest)) return blocked(category, term);

  return { allowed: true };
}
