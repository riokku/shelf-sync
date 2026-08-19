export interface AvatarPreset {
  key: string;
  icon: string;
  color: string;
}

// Keys must match the check constraint in
// supabase/migrations/20260724190000_add_avatar_to_profiles.sql (the
// original 8 "shapes") and 20260820120000_add_more_avatar_presets.sql (the
// people/animal options added after it).
export const AVATAR_PRESETS: AvatarPreset[] = [
  { key: 'sunrise', icon: 'wb_sunny', color: '#f59f00' },
  { key: 'ocean', icon: 'water_drop', color: '#1971c2' },
  { key: 'forest', icon: 'eco', color: '#2f9e44' },
  { key: 'berry', icon: 'favorite', color: '#c2255c' },
  { key: 'lavender', icon: 'spa', color: '#7048e8' },
  { key: 'ember', icon: 'local_fire_department', color: '#e8590c' },
  { key: 'sky', icon: 'bolt', color: '#0c8599' },
  { key: 'stone', icon: 'terrain', color: '#495057' },
  // People
  { key: 'smiley', icon: 'mood', color: '#c92a2a' },
  { key: 'face', icon: 'face', color: '#9c36b5' },
  { key: 'wanderer', icon: 'emoji_people', color: '#3b5bdb' },
  { key: 'buddy', icon: 'person', color: '#0ca678' },
  // Animals
  { key: 'paws', icon: 'pets', color: '#66a80f' },
  { key: 'bunny', icon: 'cruelty_free', color: '#a61e4d' },
  { key: 'ladybug', icon: 'bug_report', color: '#7d5a50' },
];

export function avatarPresetFor(key: string | null | undefined): AvatarPreset | null {
  return AVATAR_PRESETS.find(preset => preset.key === key) ?? null;
}
