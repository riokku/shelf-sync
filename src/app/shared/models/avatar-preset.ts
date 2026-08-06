export interface AvatarPreset {
  key: string;
  icon: string;
  color: string;
}

// Keys must match the check constraint in
// supabase/migrations/20260724190000_add_avatar_to_profiles.sql.
export const AVATAR_PRESETS: AvatarPreset[] = [
  { key: 'sunrise', icon: 'wb_sunny', color: '#f59f00' },
  { key: 'ocean', icon: 'water_drop', color: '#1971c2' },
  { key: 'forest', icon: 'eco', color: '#2f9e44' },
  { key: 'berry', icon: 'favorite', color: '#c2255c' },
  { key: 'lavender', icon: 'spa', color: '#7048e8' },
  { key: 'ember', icon: 'local_fire_department', color: '#e8590c' },
  { key: 'sky', icon: 'bolt', color: '#0c8599' },
  { key: 'stone', icon: 'terrain', color: '#495057' },
];

export function avatarPresetFor(key: string | null | undefined): AvatarPreset | null {
  return AVATAR_PRESETS.find(preset => preset.key === key) ?? null;
}
