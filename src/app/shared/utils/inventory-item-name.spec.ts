import { isDuplicateItemName } from './inventory-item-name';

describe('isDuplicateItemName', () => {
  it('matches an exact name', () => {
    expect(isDuplicateItemName('Folding Chair', ['Folding Chair', 'Round Table'])).toBeTrue();
  });

  it('matches case-insensitively', () => {
    expect(isDuplicateItemName('folding chair', ['Folding Chair'])).toBeTrue();
  });

  it('ignores leading/trailing whitespace on both sides', () => {
    expect(isDuplicateItemName('  Folding Chair  ', ['Folding Chair'])).toBeTrue();
    expect(isDuplicateItemName('Folding Chair', ['  Folding Chair  '])).toBeTrue();
  });

  it('returns false when nothing matches', () => {
    expect(isDuplicateItemName('Round Table', ['Folding Chair'])).toBeFalse();
  });

  it('returns false against an empty list', () => {
    expect(isDuplicateItemName('Folding Chair', [])).toBeFalse();
  });
});
