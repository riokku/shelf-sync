import { profileDisplayName, resolveProfileAvatarKey, resolveProfileName } from './profile-label';
import { createFakeProfile } from '../../testing/fakes';

describe('profileDisplayName', () => {
  it('prefers nickname over full_name and email', () => {
    const profile = createFakeProfile({ nickname: 'Kirsty', full_name: 'Kirsten Smith', email: 'k@example.com' });
    expect(profileDisplayName(profile)).toBe('Kirsty');
  });

  it('falls back to full_name when there is no nickname', () => {
    const profile = createFakeProfile({ nickname: null, full_name: 'Kirsten Smith', email: 'k@example.com' });
    expect(profileDisplayName(profile)).toBe('Kirsten Smith');
  });

  it('falls back to email when there is neither a nickname nor a full_name', () => {
    const profile = createFakeProfile({ nickname: null, full_name: null, email: 'k@example.com' });
    expect(profileDisplayName(profile)).toBe('k@example.com');
  });

  it('treats an empty-string nickname/full_name the same as unset, not as a real value', () => {
    const profile = createFakeProfile({ nickname: '', full_name: '', email: 'k@example.com' });
    expect(profileDisplayName(profile)).toBe('k@example.com');
  });
});

describe('resolveProfileName', () => {
  const profiles = [
    createFakeProfile({ id: 'user-1', nickname: 'Kirsty' }),
    createFakeProfile({ id: 'user-2', nickname: null, full_name: 'Jamie Lee' })
  ];

  it('returns an empty string for a null id', () => {
    expect(resolveProfileName(null, profiles)).toBe('');
  });

  it('returns an empty string when the id matches no profile in the list', () => {
    expect(resolveProfileName('user-nonexistent', profiles)).toBe('');
  });

  it('resolves a matching id to that profile\'s display name', () => {
    expect(resolveProfileName('user-1', profiles)).toBe('Kirsty');
    expect(resolveProfileName('user-2', profiles)).toBe('Jamie Lee');
  });
});

describe('resolveProfileAvatarKey', () => {
  const profiles = [
    createFakeProfile({ id: 'user-1', avatar_key: 'ocean' }),
    createFakeProfile({ id: 'user-2', avatar_key: null })
  ];

  it('returns null for a null id', () => {
    expect(resolveProfileAvatarKey(null, profiles)).toBeNull();
  });

  it('returns null when the id matches no profile in the list', () => {
    expect(resolveProfileAvatarKey('user-nonexistent', profiles)).toBeNull();
  });

  it('returns the matching profile\'s avatar_key', () => {
    expect(resolveProfileAvatarKey('user-1', profiles)).toBe('ocean');
  });

  it('returns null when the matching profile has no avatar_key set', () => {
    expect(resolveProfileAvatarKey('user-2', profiles)).toBeNull();
  });
});
