// Shapes shared by the server and the screens (type-only, nothing from the
// server is bundled into the browser).
export type { KioskState, KioskMode, Current, SessionView } from '@/server/kiosk';
export type { PrinterState } from '@/server/printer';
export type { Sheet } from '@/server/catalog';
export type { PublicTeacher } from '@/server/auth';

// A request row as the list endpoints return it.
export type RequestItem = {
  id: number;
  session_id: number;
  queue_number: number;
  recognized_text: string;
  language?: string | null;
  status: string;
  block_category?: string | null;
  block_reason?: string | null;
  block_match?: string | null;
  block_source?: string | null;
  category_name?: string | null;
  moderation_status?: string | null;
  moderated_at?: string | null;
  moderated_by_name?: string | null;
  image_url?: string | null;
  image_provider?: string | null;
  label_en?: string | null;
  label_fil?: string | null;
  sheet?: import('@/server/catalog').Sheet | null;
  print_status?: string | null;
  print_error?: string | null;
  print_error_text?: string | null;
  printed_at?: string | null;
  reprint_count?: number | null;
  created_at: string;
  generated_at?: string | null;
  local_time?: string;
  theme?: string;
  activity_type?: string;
  activity_subtype?: string;
  safety_level?: string;
  session_status?: string;
  queued?: boolean;
};
