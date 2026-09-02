import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '../models/database.types';
import { Profile } from '../../core/auth.service';
import { AuditFrequency, InventoryAuditSchedule } from '../models/inventory-audit.model';
import { resolveProfileName } from './profile-label';

type InventoryAuditScheduleRow = Database['public']['Tables']['inventory_audit_schedules']['Row'];

function toInventoryAuditSchedule(row: InventoryAuditScheduleRow, profiles: Profile[]): InventoryAuditSchedule {
  return {
    id: row.id,
    physicalLocation: row.physical_location ?? '',
    frequency: row.frequency as AuditFrequency,
    note: row.note ?? '',
    nextOccurrenceDate: row.next_occurrence_date,
    active: row.active,
    createdByLabel: resolveProfileName(row.created_by, profiles) || 'Unknown user',
    createdAt: row.created_at
  };
}

/** Every recurring audit schedule in the org, soonest next-occurrence first
 *  — backs both ManageAuditsComponent's admin/manager-only management list
 *  and its Upcoming section (see isAuditScheduleUpcoming()), which filters
 *  this same list down further. Returns `{ schedules, error }` rather than a
 *  bare array, same reasoning loadAuditSummaries() already gives for its
 *  own identical shape. */
export async function loadAuditSchedules(
  supabase: SupabaseClient<Database>,
  profiles: Profile[]
): Promise<{ schedules: InventoryAuditSchedule[]; error: string | null }> {
  const { data, error } = await supabase
    .from('inventory_audit_schedules')
    .select('*')
    .order('next_occurrence_date', { ascending: true });

  if (error) {
    return { schedules: [], error: error.message };
  }

  return { schedules: (data ?? []).map(row => toInventoryAuditSchedule(row, profiles)), error: null };
}
