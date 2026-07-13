import { Profile } from '../../core/auth.service';

export function profileDisplayName(profile: Profile): string {
  return profile.nickname || profile.full_name || profile.email;
}

export function resolveProfileName(id: string | null, profiles: Profile[]): string {
  if (!id) {
    return '';
  }
  const profile = profiles.find(p => p.id === id);
  return profile ? profileDisplayName(profile) : '';
}
