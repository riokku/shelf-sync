import { resolveSupplierName } from './supplier-label';
import { Supplier } from '../models/supplier.model';

function createFakeSupplier(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: 'supplier-1',
    name: 'Acme Co.',
    contactName: '',
    email: '',
    phone: '',
    website: '',
    notes: '',
    ...overrides,
  };
}

describe('resolveSupplierName', () => {
  const suppliers = [
    createFakeSupplier({ id: 'supplier-1', name: 'Gatherwell Event Furniture Co.' }),
    createFakeSupplier({ id: 'supplier-2', name: 'Linen & Lace Event Textiles' })
  ];

  it('returns an empty string for a null id', () => {
    expect(resolveSupplierName(null, suppliers)).toBe('');
  });

  it('returns an empty string when the id matches no supplier in the list', () => {
    expect(resolveSupplierName('supplier-nonexistent', suppliers)).toBe('');
  });

  it('resolves a matching id to that supplier\'s name', () => {
    expect(resolveSupplierName('supplier-1', suppliers)).toBe('Gatherwell Event Furniture Co.');
    expect(resolveSupplierName('supplier-2', suppliers)).toBe('Linen & Lace Event Textiles');
  });
});
