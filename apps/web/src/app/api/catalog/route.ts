import { activities, themes, LANGUAGES } from '@/server/catalog';
import { teacherRoute } from '@/server/auth';
import { json } from '@/server/http';

export const GET = teacherRoute(async () => json({ activities, themes, languages: LANGUAGES }));
