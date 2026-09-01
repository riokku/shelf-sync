import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AuditDetailComponent } from './audit-detail.component';
import { SupabaseService } from '../../../core/supabase.service';
import { AuthService } from '../../../core/auth.service';
import { NotificationService } from '../../../core/notification.service';
import { ConfettiService } from '../../../core/confetti.service';
import { InventoryAuditCount } from '../../../shared/models/inventory-audit.model';
import {
  createFakeAuthService,
  createFakeProfile,
  createFakeQueryBuilder,
  createFakeSupabaseService
} from '../../../testing/fakes';

function createTestCount(overrides: Partial<InventoryAuditCount> = {}): InventoryAuditCount {
  return {
    id: 'count-1',
    itemId: 'item-1',
    itemName: 'Folding Chair',
    expectedQuantity: 10,
    countedQuantity: null,
    countedByLabel: '',
    countedAt: '',
    note: '',
    appliedByLabel: '',
    appliedAt: '',
    isContainerTracked: false,
    ...overrides
  };
}

const AUDIT_ROW = {
  id: 'audit-1', organization_id: 'org-1', status: 'in_progress', physical_location: null,
  note: null, started_by: 'user-1', started_at: '2026-01-01T00:00:00.000Z',
  completed_by: null, completed_at: null, cancelled_by: null, cancelled_at: null
};

function createTableAwareFakeSupabaseService(
  responses: Record<string, { data?: unknown; error?: unknown }>
): SupabaseService {
  const base = createFakeSupabaseService();
  return {
    client: {
      ...base.client,
      from: (table: string) => createFakeQueryBuilder(responses[table] ?? { data: [], error: null }),
      rpc: () => createFakeQueryBuilder(responses['__rpc__'] ?? { data: null, error: null })
    }
  } as unknown as SupabaseService;
}

describe('AuditDetailComponent', () => {
  let component: AuditDetailComponent;
  let fixture: ComponentFixture<AuditDetailComponent>;

  async function setup(responses: Record<string, { data?: unknown; error?: unknown }> = {}) {
    await TestBed.configureTestingModule({
      imports: [AuditDetailComponent],
      providers: [
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role: 'admin' })) },
        {
          provide: SupabaseService,
          useValue: createTableAwareFakeSupabaseService({
            inventory_audits: { data: AUDIT_ROW, error: null },
            inventory_audit_counts: { data: [], error: null },
            profiles: { data: [], error: null },
            ...responses
          })
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AuditDetailComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('auditId', 'audit-1');
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('should create and load the audit', async () => {
    await setup();
    expect(component.audit?.id).toBe('audit-1');
    expect(component.isLoading).toBeFalse();
  });

  it('sets loadError instead of silently rendering nothing when the load fails', async () => {
    await setup({ inventory_audits: { data: null, error: { message: 'Network error' } } });
    expect(component.loadError).toBe('Network error');
  });

  it('leaves audit null (no error) when the id does not resolve to anything visible', async () => {
    await setup({ inventory_audits: { data: null, error: null } });
    expect(component.audit).toBeNull();
    expect(component.loadError).toBeNull();
  });

  describe('derived lists', () => {
    beforeEach(async () => {
      await setup();
      component.counts = [
        createTestCount({ id: 'c1', countedQuantity: null }),
        createTestCount({ id: 'c2', countedQuantity: 10, expectedQuantity: 10 }),
        createTestCount({ id: 'c3', countedQuantity: 7, expectedQuantity: 10 }),
        createTestCount({ id: 'c4', countedQuantity: 3, expectedQuantity: 10, isContainerTracked: true }),
        createTestCount({ id: 'c5', countedQuantity: 2, expectedQuantity: 10, appliedAt: '2026-01-03T00:00:00.000Z' })
      ];
    });

    it('notYetCounted is only rows with a null count', () => {
      expect(component.notYetCounted.map(c => c.id)).toEqual(['c1']);
    });

    it('matches is only counted rows equal to expected', () => {
      expect(component.matches.map(c => c.id)).toEqual(['c2']);
    });

    it('discrepancies is every counted row that differs from expected, container-tracked and applied included', () => {
      expect(component.discrepancies.map(c => c.id).sort()).toEqual(['c3', 'c4', 'c5']);
    });

    it('applicableDiscrepancies excludes container-tracked and already-applied rows', () => {
      expect(component.applicableDiscrepancies.map(c => c.id)).toEqual(['c3']);
    });

    it('percentCounted is the share of rows with any count submitted, out of 100', () => {
      // 4 of 5 counted (c1 is the only null) = 80%
      expect(component.percentCounted).toBe(80);
    });
  });

  describe('submitCount()', () => {
    it('requires an item to be selected first', async () => {
      await setup();
      component.countForm.controls.quantity.setValue(5);

      await component.submitCount();

      expect(component.countError).toBe('Pick an item to count.');
    });

    it('submits the count, reloads, resets the form, and toasts on success', async () => {
      await setup();
      const notYetCounted = createTestCount({ id: 'count-9', itemName: 'Round Table' });
      component.counts = [notYetCounted];
      component.selectedCount = notYetCounted;
      component.countForm.controls.quantity.setValue(4);
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');

      await component.submitCount();

      expect(component.countError).toBeNull();
      expect(component.selectedCount).toBeNull();
      expect(successSpy).toHaveBeenCalledWith('Count submitted');
    });

    it('surfaces an RPC error rather than clearing the selection', async () => {
      await setup({ __rpc__: { data: null, error: { message: 'this audit is no longer in progress' } } });
      const notYetCounted = createTestCount({ id: 'count-9' });
      component.counts = [notYetCounted];
      component.selectedCount = notYetCounted;
      component.countForm.controls.quantity.setValue(4);

      await component.submitCount();

      expect(component.countError).toBe('this audit is no longer in progress');
      expect(component.selectedCount).toBe(notYetCounted);
    });
  });

  describe('applyCount()', () => {
    it('applies, reloads, and toasts on success', async () => {
      await setup();
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');

      await component.applyCount(createTestCount({ itemName: 'Folding Chair', countedQuantity: 7, expectedQuantity: 10 }));

      expect(component.applyError).toBeNull();
      expect(successSpy).toHaveBeenCalledWith('Applied count for Folding Chair');
    });

    it('surfaces an RPC error', async () => {
      await setup({ __rpc__: { data: null, error: { message: 'this item is tracked by container' } } });

      await component.applyCount(createTestCount());

      expect(component.applyError).toBe('this item is tracked by container');
    });
  });

  describe('applyAllDiscrepancies()', () => {
    it('does nothing when there are no applicable discrepancies', async () => {
      await setup();
      component.counts = [];
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');

      await component.applyAllDiscrepancies();

      expect(successSpy).not.toHaveBeenCalled();
    });

    it('tallies success across every applicable discrepancy', async () => {
      await setup();
      component.counts = [
        createTestCount({ id: 'c1', countedQuantity: 7, expectedQuantity: 10 }),
        createTestCount({ id: 'c2', countedQuantity: 4, expectedQuantity: 10 })
      ];
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');

      await component.applyAllDiscrepancies();

      expect(successSpy).toHaveBeenCalledWith('Applied 2 counts');
      expect(component.applyError).toBeNull();
    });

    it('tallies a partial failure into applyError rather than failing the whole batch', async () => {
      await setup({ __rpc__: { data: null, error: { message: 'boom' } } });
      component.counts = [
        createTestCount({ id: 'c1', countedQuantity: 7, expectedQuantity: 10 }),
        createTestCount({ id: 'c2', countedQuantity: 4, expectedQuantity: 10 })
      ];

      await component.applyAllDiscrepancies();

      expect(component.applyError).toBe('2 of 2 counts couldn\'t be applied.');
    });
  });

  describe('completeAudit() / cancelAudit()', () => {
    it('completeAudit() reloads and toasts on success', async () => {
      await setup();
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');

      await component.completeAudit();

      expect(component.finishError).toBeNull();
      expect(successSpy).toHaveBeenCalledWith('Audit completed');
    });

    it('fires a confetti burst and a celebratory toast when every item matched with nothing left uncounted', async () => {
      await setup();
      component.counts = [
        createTestCount({ id: 'c1', countedQuantity: 10, expectedQuantity: 10 }),
        createTestCount({ id: 'c2', countedQuantity: 4, expectedQuantity: 4 })
      ];
      const notification = TestBed.inject(NotificationService);
      const confetti = TestBed.inject(ConfettiService);
      const successSpy = spyOn(notification, 'success');
      const burstSpy = spyOn(confetti, 'burst');

      await component.completeAudit();

      expect(burstSpy).toHaveBeenCalled();
      expect(successSpy).toHaveBeenCalledWith('🎉 Perfect count — every item matched, zero discrepancies!');
    });

    it('does not fire confetti when a discrepancy or an uncounted item remains', async () => {
      await setup();
      component.counts = [
        createTestCount({ id: 'c1', countedQuantity: 7, expectedQuantity: 10 })
      ];
      const confetti = TestBed.inject(ConfettiService);
      const burstSpy = spyOn(confetti, 'burst');

      await component.completeAudit();

      expect(burstSpy).not.toHaveBeenCalled();
    });

    it('cancelAudit() surfaces an RPC error', async () => {
      await setup({ __rpc__: { data: null, error: { message: 'this audit is not in progress' } } });

      await component.cancelAudit();

      expect(component.finishError).toBe('this audit is not in progress');
    });
  });
});
