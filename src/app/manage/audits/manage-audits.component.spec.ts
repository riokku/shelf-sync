import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { of } from 'rxjs';

import { ManageAuditsComponent } from './manage-audits.component';
import { SupabaseService } from '../../core/supabase.service';
import { AuthService } from '../../core/auth.service';
import { NotificationService } from '../../core/notification.service';
import { InventoryFieldOptionsService } from '../../core/inventory-field-options.service';
import { StartAuditModalComponent } from '../../shared/components/start-audit-modal/start-audit-modal.component';
import {
  createFakeActivatedRoute,
  createFakeAuthService,
  createFakeInventoryFieldOptionsService,
  createFakeProfile,
  createFakeQueryBuilder,
  createFakeSupabaseService
} from '../../testing/fakes';

/** Table-aware on top of the standard fake — ManageAuditsComponent's own
 *  loadAudits() issues two separate queries (inventory_audits +
 *  inventory_audit_counts) via loadAuditSummaries(), which the plain
 *  same-result-for-every-table fake can't represent. Keeps the base fake's
 *  .channel()/.removeChannel()/.rpc() behavior (needed for ngOnInit's own
 *  realtime subscriptions), only .from() is overridden. */
function createTableAwareFakeSupabaseService(
  responses: Record<string, { data?: unknown; error?: unknown }>
): SupabaseService {
  const base = createFakeSupabaseService();
  return {
    client: {
      ...base.client,
      from: (table: string) => createFakeQueryBuilder(responses[table] ?? { data: [], error: null })
    }
  } as unknown as SupabaseService;
}

function createFakeDialogRef(result: unknown): MatDialogRef<unknown> {
  return { afterClosed: () => of(result) } as unknown as MatDialogRef<unknown>;
}

describe('ManageAuditsComponent', () => {
  let component: ManageAuditsComponent;
  let fixture: ComponentFixture<ManageAuditsComponent>;

  async function setup(options: { auditsError?: { message: string } | null; queryParams?: Record<string, string> } = {}) {
    await TestBed.configureTestingModule({
      imports: [ManageAuditsComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role: 'admin' })) },
        {
          provide: SupabaseService,
          useValue: createTableAwareFakeSupabaseService({
            inventory_audits: { data: options.auditsError ? null : [], error: options.auditsError ?? null },
            inventory_audit_counts: { data: [], error: null }
          })
        },
        { provide: InventoryFieldOptionsService, useValue: createFakeInventoryFieldOptionsService() },
        { provide: ActivatedRoute, useValue: createFakeActivatedRoute(options.queryParams ?? {}) }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ManageAuditsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('should create', async () => {
    await setup();
    expect(component).toBeTruthy();
  });

  it('sets loadError instead of silently rendering an empty list when the query fails', async () => {
    await setup({ auditsError: { message: 'Network error' } });

    expect(component.loadError).toBe('Network error');
    expect(component.audits).toEqual([]);
  });

  it('retryLoad() re-runs the load', async () => {
    await setup({ auditsError: { message: 'Network error' } });
    expect(component.loadError).toBe('Network error');

    (component as unknown as { supabase: SupabaseService['client'] }).supabase =
      createTableAwareFakeSupabaseService({
        inventory_audits: { data: [], error: null },
        inventory_audit_counts: { data: [], error: null }
      }).client;

    component.retryLoad();
    await Promise.resolve();
    await Promise.resolve();

    expect(component.loadError).toBeNull();
  });

  describe('?audit= deep link', () => {
    it('opens straight to the matching audit\'s detail view when the id is present in the list', async () => {
      await setup({ queryParams: { audit: 'audit-1' } });
      // No audit with that id actually loaded (audits stays empty in this
      // fake), so it should NOT open — covered by the sibling test below.
      expect(component.selectedAuditId).toBeNull();
    });
  });

  describe('openStartAudit()', () => {
    it('opens StartAuditModalComponent', async () => {
      await setup();
      const dialog = TestBed.inject(MatDialog);
      const openSpy = spyOn(dialog, 'open').and.returnValue(createFakeDialogRef(undefined));

      component.openStartAudit();

      expect(openSpy).toHaveBeenCalledWith(StartAuditModalComponent, jasmine.anything());
    });
  });

  function handleStartAuditResult(auditId: string | undefined) {
    return (component as unknown as { handleStartAuditResult: (id: string | undefined) => Promise<void> })
      .handleStartAuditResult(auditId);
  }

  describe('handleStartAuditResult() (the start-audit dialog\'s afterClosed() callback)', () => {
    it('reloads, toasts, and opens the new audit\'s detail view on a returned id', async () => {
      await setup();
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');

      await handleStartAuditResult('audit-42');

      expect(successSpy).toHaveBeenCalledWith('Audit started');
      expect(component.selectedAuditId).toBe('audit-42');
    });

    it('does nothing when the modal was dismissed without starting an audit', async () => {
      await setup();
      const notification = TestBed.inject(NotificationService);
      const successSpy = spyOn(notification, 'success');

      await handleStartAuditResult(undefined);

      expect(successSpy).not.toHaveBeenCalled();
      expect(component.selectedAuditId).toBeNull();
    });
  });

  describe('openAuditDetail() / closeAuditDetail()', () => {
    it('openAuditDetail() sets selectedAuditId and merges ?audit= into the URL', async () => {
      await setup();
      const router = TestBed.inject(Router);
      const navigateSpy = spyOn(router, 'navigate');

      component.openAuditDetail('audit-1');

      expect(component.selectedAuditId).toBe('audit-1');
      expect(navigateSpy).toHaveBeenCalledWith([], jasmine.objectContaining({
        queryParams: { audit: 'audit-1' },
        queryParamsHandling: 'merge'
      }));
    });

    it('closeAuditDetail() clears selectedAuditId, clears ?audit=, and reloads the list', async () => {
      await setup();
      component.selectedAuditId = 'audit-1';
      const router = TestBed.inject(Router);
      const navigateSpy = spyOn(router, 'navigate');

      component.closeAuditDetail();
      await fixture.whenStable();

      expect(component.selectedAuditId).toBeNull();
      expect(navigateSpy).toHaveBeenCalledWith([], jasmine.objectContaining({
        queryParams: { audit: null },
        queryParamsHandling: 'merge'
      }));
    });
  });
});
