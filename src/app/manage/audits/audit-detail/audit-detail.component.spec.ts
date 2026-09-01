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

  async function setup(
    responses: Record<string, { data?: unknown; error?: unknown }> = {},
    role: 'admin' | 'manager' | 'staff' = 'admin'
  ) {
    await TestBed.configureTestingModule({
      imports: [AuditDetailComponent],
      providers: [
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role })) },
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
    it('does nothing when that item\'s own form is invalid (no quantity entered)', async () => {
      await setup();
      const notYetCounted = createTestCount({ id: 'count-9', itemName: 'Round Table' });
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');

      await component.submitCount(notYetCounted);

      expect(successSpy).not.toHaveBeenCalled();
      expect(component.countErrorFor('count-9')).toBeNull();
    });

    it('submits the count, reloads, clears that item\'s own form, and toasts on success', async () => {
      await setup();
      const notYetCounted = createTestCount({ id: 'count-9', itemName: 'Round Table' });
      component.counts = [notYetCounted];
      component.countFormFor(notYetCounted).controls.quantity.setValue(4);
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');

      await component.submitCount(notYetCounted);

      expect(component.countErrorFor('count-9')).toBeNull();
      // A fresh (never-before-seen) form for the same count id comes back
      // blank — proof the cached, filled-in one was actually cleared out.
      expect(component.countFormFor(notYetCounted).controls.quantity.value).toBeNull();
      expect(successSpy).toHaveBeenCalledWith('Count submitted');
    });

    it('surfaces an RPC error against just that one item, leaving its own entered values in place', async () => {
      await setup({ __rpc__: { data: null, error: { message: 'this audit is no longer in progress' } } });
      const notYetCounted = createTestCount({ id: 'count-9' });
      component.counts = [notYetCounted];
      component.countFormFor(notYetCounted).controls.quantity.setValue(4);

      await component.submitCount(notYetCounted);

      expect(component.countErrorFor('count-9')).toBe('this audit is no longer in progress');
      expect(component.countFormFor(notYetCounted).controls.quantity.value).toBe(4);
    });

    it('tracks isSubmittingCount() per item, not as one shared flag', async () => {
      await setup();
      const itemA = createTestCount({ id: 'count-a' });
      component.countFormFor(itemA).controls.quantity.setValue(4);

      const submitPromise = component.submitCount(itemA);

      expect(component.isSubmittingCount('count-a')).toBeTrue();
      expect(component.isSubmittingCount('count-b')).toBeFalse();

      await submitPromise;

      expect(component.isSubmittingCount('count-a')).toBeFalse();
    });

    // Regression test for a real bug: the count-entry card's <form
    // (ngSubmit)="submitCount(count)"> has no [formGroup] (each field binds
    // its own [formControl] directly), so nothing provides Angular's
    // ngSubmit output without FormsModule imported alongside
    // ReactiveFormsModule — same shape (and same fix) as the one caught in
    // LockUserAccountModalComponent/SuspendOrganizationModalComponent/
    // DeleteOrganizationModalComponent, see CLAUDE.md. Without it, clicking
    // "Submit count" fell through to a real native form submit — an actual
    // page navigation, with submitCount() never called and nothing saved —
    // which is exactly what this bug looked like in the app ("it refreshes
    // the page but no data is saved"). Every other test above calls
    // submitCount() directly and can't catch this, since that bypasses the
    // DOM entirely; only dispatching a real 'submit' event does.
    it('intercepts the native form submit (via NgForm) rather than letting the browser navigate', async () => {
      await setup();
      const notYetCounted = createTestCount({ id: 'count-9', itemName: 'Round Table' });
      component.counts = [notYetCounted];
      component.countFormFor(notYetCounted).controls.quantity.setValue(4);
      fixture.detectChanges();
      const rpcSpy = spyOn(TestBed.inject(SupabaseService).client, 'rpc').and.callThrough();

      const formEl: HTMLFormElement = fixture.nativeElement.querySelector('form');
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      formEl.dispatchEvent(submitEvent);
      await fixture.whenStable();

      expect(submitEvent.defaultPrevented).toBeTrue();
      expect(rpcSpy).toHaveBeenCalledWith('submit_audit_count', jasmine.objectContaining({ audit_count_id: 'count-9' }));
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

  describe('canCompleteAudit / canCancelAudit', () => {
    it('admin/manager can complete and cancel regardless of how much is counted', async () => {
      await setup({}, 'admin');
      component.counts = [createTestCount({ id: 'c1', countedQuantity: null })];

      expect(component.canCancelAudit).toBeTrue();
      expect(component.canCompleteAudit).toBeTrue();
    });

    it('staff cannot complete or cancel while anything is still uncounted', async () => {
      await setup({}, 'staff');
      component.counts = [createTestCount({ id: 'c1', countedQuantity: null })];

      expect(component.canCancelAudit).toBeFalse();
      expect(component.canCompleteAudit).toBeFalse();
    });

    it('staff can complete (but never cancel) once nothing is left uncounted', async () => {
      await setup({}, 'staff');
      component.counts = [createTestCount({ id: 'c1', countedQuantity: 10, expectedQuantity: 10 })];

      expect(component.canCancelAudit).toBeFalse();
      expect(component.canCompleteAudit).toBeTrue();
    });

    it('neither is available once the audit is no longer in progress, regardless of role', async () => {
      await setup({ inventory_audits: { data: { ...AUDIT_ROW, status: 'completed' }, error: null } }, 'admin');
      component.counts = [createTestCount({ id: 'c1', countedQuantity: 10, expectedQuantity: 10 })];

      expect(component.canCancelAudit).toBeFalse();
      expect(component.canCompleteAudit).toBeFalse();
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

  describe('audit team (lead/support)', () => {
    const PROFILE_ROWS = [
      { id: 'user-1', full_name: 'Ada Lovelace', nickname: null, email: 'ada@example.com', membership_status: 'approved' },
      { id: 'user-2', full_name: 'Grace Hopper', nickname: null, email: 'grace@example.com', membership_status: 'approved' },
      { id: 'user-3', full_name: 'Pending Person', nickname: null, email: 'pending@example.com', membership_status: 'pending' }
    ];

    it('approvedProfiles excludes a pending join request', async () => {
      await setup({ profiles: { data: PROFILE_ROWS, error: null } });

      expect(component.approvedProfiles.map(p => p.id)).toEqual(['user-1', 'user-2']);
    });

    it('availableSupportProfiles excludes whoever is currently selected as lead', async () => {
      await setup({ profiles: { data: PROFILE_ROWS, error: null } });
      component.teamForm.controls.leadId.setValue('user-1');

      expect(component.availableSupportProfiles.map(p => p.id)).toEqual(['user-2']);
    });

    it('onLeadChange() drops the newly-picked lead out of the local support selection', async () => {
      await setup({ profiles: { data: PROFILE_ROWS, error: null } });
      component.teamForm.controls.supportIds.setValue(['user-1', 'user-2']);
      component.teamForm.controls.leadId.setValue('user-1');

      component.onLeadChange();

      expect(component.teamForm.controls.supportIds.value).toEqual(['user-2']);
    });

    it('onLeadChange() does nothing when the lead is cleared back to Unclaimed', async () => {
      await setup({ profiles: { data: PROFILE_ROWS, error: null } });
      component.teamForm.controls.supportIds.setValue(['user-2']);
      component.teamForm.controls.leadId.setValue(null);

      component.onLeadChange();

      expect(component.teamForm.controls.supportIds.value).toEqual(['user-2']);
    });

    it('startEditingTeam() opens the dropdowns, seeded from the audit\'s own current team', async () => {
      await setup({
        profiles: { data: PROFILE_ROWS, error: null },
        inventory_audit_supporters: { data: [{ user_id: 'user-2' }], error: null }
      });

      component.startEditingTeam();

      expect(component.isEditingTeam).toBeTrue();
      expect(component.teamForm.controls.supportIds.value).toEqual(['user-2']);
    });

    it('cancelEditingTeam() discards local changes and closes the dropdowns', async () => {
      await setup({
        profiles: { data: PROFILE_ROWS, error: null },
        inventory_audit_supporters: { data: [{ user_id: 'user-2' }], error: null }
      });
      component.startEditingTeam();
      component.teamForm.controls.leadId.setValue('user-1');
      component.teamForm.controls.supportIds.setValue([]);

      component.cancelEditingTeam();

      expect(component.isEditingTeam).toBeFalse();
      expect(component.teamForm.controls.leadId.value).toBeNull();
      expect(component.teamForm.controls.supportIds.value).toEqual(['user-2']);
    });

    it('saveTeam() does nothing until called explicitly — no auto-save on selection change', async () => {
      await setup({ profiles: { data: PROFILE_ROWS, error: null } });
      const rpcSpy = spyOn(TestBed.inject(SupabaseService).client, 'rpc').and.callThrough();
      component.startEditingTeam();

      component.teamForm.controls.leadId.setValue('user-1');
      component.onLeadChange();

      expect(rpcSpy).not.toHaveBeenCalled();
    });

    it('saveTeam() writes the RPC, closes the dropdowns, and reloads on success', async () => {
      await setup({ profiles: { data: PROFILE_ROWS, error: null } });
      const rpcSpy = spyOn(TestBed.inject(SupabaseService).client, 'rpc').and.callThrough();
      component.startEditingTeam();
      component.teamForm.controls.leadId.setValue('user-1');
      component.teamForm.controls.supportIds.setValue(['user-2']);

      await component.saveTeam();

      expect(rpcSpy).toHaveBeenCalledWith('set_audit_team', {
        p_audit_id: 'audit-1',
        p_lead_id: 'user-1',
        p_support_ids: ['user-2']
      });
      expect(component.isEditingTeam).toBeFalse();
      expect(component.teamError).toBeNull();
    });

    it('saveTeam() stays in edit mode with the entered values intact on an RPC error', async () => {
      await setup({
        profiles: { data: PROFILE_ROWS, error: null },
        inventory_audit_supporters: { data: [{ user_id: 'user-2' }], error: null },
        __rpc__: { data: null, error: { message: 'boom' } }
      });
      component.startEditingTeam();
      component.teamForm.controls.leadId.setValue('user-1');

      await component.saveTeam();

      expect(component.teamError).toBe('boom');
      expect(component.isEditingTeam).toBeTrue();
      // Not reverted — Cancel is the explicit way to discard now, a failed
      // Save should stay retryable/adjustable.
      expect(component.teamForm.controls.leadId.value).toBe('user-1');
      expect(component.teamForm.controls.supportIds.value).toEqual(['user-2']);
    });
  });
});
