import type { PixiMood } from './scene';

// What Pixi says in each mood, shown in its thought bubble. Pass the page's
// t() to get the Filipino (the texts are in src/i18n/fil.ts).
export function pixiLine(mood: PixiMood, t: (text: string) => string = (text) => text) {
  switch (mood) {
    case 'idle':
      return t("Hi, I'm Pixi! Tell me your wish!");
    case 'listening':
      return t("I'm listening…");
    case 'thinking':
      return t("Wow! Let's draw that together!");
    case 'generating':
      return t('Thinking… painting… creating!');
    case 'printing':
      return t('Your picture is ready!');
    case 'success':
      return t('Yay! Look what we made!');
  }
}
