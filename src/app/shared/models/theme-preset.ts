export interface ThemePreset {
  key: string;
  label: string;
  swatch: string;
}

// key must match a [data-theme='key'] block in src/styles.scss. There's a
// sixth block there, 'party' — deliberately left out of this list, since
// it's not a real org-wide choice: PartyModeService applies it temporarily
// via the Konami code easter egg, never persisted, always reverting.
export const THEME_PRESETS: ThemePreset[] = [
  { key: 'default', label: 'Azure (default)', swatch: '#4a7fd6' },
  { key: 'violet', label: 'Violet', swatch: '#8c5fd6' },
  { key: 'rose', label: 'Rose', swatch: '#d65f8c' },
  { key: 'green', label: 'Green', swatch: '#4fae5e' },
  { key: 'orange', label: 'Orange', swatch: '#d68a3f' }
];
