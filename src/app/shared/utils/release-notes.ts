import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../models/database.types';
import { ReleaseNote, ReleaseNoteSeverity } from '../models/release-note.model';

type ReleaseNoteRow = Database['public']['Tables']['release_notes']['Row'];

function toReleaseNote(row: ReleaseNoteRow): ReleaseNote {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    // The DB column is a plain checked text, not a real Postgres enum (see
    // the migration's own doc comment) — same shape activity_log.entity_type/
    // notifications.kind already have, so this cast is safe as long as the
    // check constraint and ReleaseNoteSeverity's own union stay in sync.
    severity: row.severity as ReleaseNoteSeverity,
    postedAt: row.posted_at,
    createdById: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

/** Every release note ever posted, newest-first (posted_at desc, then
 *  created_at desc as a same-day tiebreak — matches the index
 *  add_release_notes' migration defines) — backs both
 *  ManageReleaseNotesComponent (read-only) and StudioReleaseNotesComponent
 *  (full CRUD). RLS (release_notes' own SELECT policy) is what actually
 *  gates read access to any authenticated user; this issues no
 *  organization_id filter at all since the table has none — see the
 *  add_release_notes migration's own doc comment for why this list is
 *  platform-wide, not per-org. Returns `{ releaseNotes, error }` rather
 *  than a bare array, same "primary page content load needs to distinguish
 *  a genuine failure from an empty list" reasoning loadBroadcasts()/
 *  loadAllInventoryItemReservations() already give for their own identical
 *  shape. */
export async function loadReleaseNotes(
  supabase: SupabaseClient<Database>
): Promise<{ releaseNotes: ReleaseNote[]; error: string | null }> {
  const { data, error } = await supabase
    .from('release_notes')
    .select('*')
    .order('posted_at', { ascending: false })
    .order('created_at', { ascending: false });

  if (error) {
    return { releaseNotes: [], error: error.message };
  }
  return { releaseNotes: (data ?? []).map(toReleaseNote), error: null };
}

export interface ReleaseNoteInput {
  title: string;
  description: string;
  severity: ReleaseNoteSeverity;
  postedAt: string;
}

/** Plain insert — release_notes' own INSERT policy (add_release_notes) is
 *  what actually restricts this to a platform admin; no RPC needed, unlike
 *  createBroadcast()/create_reservation(), since nothing here needs an
 *  atomic side effect on another table. created_by is left for the DB's
 *  own default-less column to stay null unless a caller sets it — callers
 *  of this function (ReleaseNoteFormModalComponent) don't set it, so every
 *  newly-created row's author is only ever known from auth context, not
 *  recorded — a deliberate simplification, since Studio's audience is
 *  small enough that "who posted this" isn't yet worth surfacing in the
 *  UI. Returns the error message on failure, or null on success. */
export async function createReleaseNote(supabase: SupabaseClient<Database>, input: ReleaseNoteInput): Promise<string | null> {
  const { error } = await supabase.from('release_notes').insert({
    title: input.title,
    description: input.description,
    severity: input.severity,
    posted_at: input.postedAt
  });
  return error?.message ?? null;
}

/** Plain update — same RLS-only gating as createReleaseNote() above. Every
 *  editable field is sent every time (no partial-patch support needed —
 *  ReleaseNoteFormModalComponent's form always has all four populated). */
export async function updateReleaseNote(
  supabase: SupabaseClient<Database>,
  id: string,
  input: ReleaseNoteInput
): Promise<string | null> {
  const { error } = await supabase
    .from('release_notes')
    .update({
      title: input.title,
      description: input.description,
      severity: input.severity,
      posted_at: input.postedAt
    })
    .eq('id', id);
  return error?.message ?? null;
}

/** Plain delete — release_notes' own DELETE policy (add_release_notes) is
 *  what actually restricts this to a platform admin. */
export async function deleteReleaseNote(supabase: SupabaseClient<Database>, id: string): Promise<string | null> {
  const { error } = await supabase.from('release_notes').delete().eq('id', id);
  return error?.message ?? null;
}
