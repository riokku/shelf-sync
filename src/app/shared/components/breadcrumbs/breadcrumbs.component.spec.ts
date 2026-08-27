import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';

import { BreadcrumbsComponent } from './breadcrumbs.component';

describe('BreadcrumbsComponent', () => {
  let component: BreadcrumbsComponent;
  let fixture: ComponentFixture<BreadcrumbsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BreadcrumbsComponent],
      providers: [provideRouter([])]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BreadcrumbsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('omits the parent breadcrumb segment when no breadcrumbParent route data is set', () => {
    expect(component.parent).toBeNull();
    expect(fixture.debugElement.query(By.css('.breadcrumb-separator'))).toBeNull();
  });

  it('falls back to the empty route label when labelOverride is unset', () => {
    expect(component.label).toBe('');
  });

  it('prefers labelOverride over the route label once set (e.g. an entity name resolving after async load)', () => {
    component.labelOverride = 'Gatherwell Events Co.';
    fixture.detectChanges();

    expect(component.label).toBe('Gatherwell Events Co.');
    const current = fixture.debugElement.query(By.css('.breadcrumb-current'));
    expect(current.nativeElement.textContent.trim()).toBe('Gatherwell Events Co.');
  });
});

/** Covers the Home / Manage / {page} shape every page under Manage now
 *  uses (see MANAGE_BREADCRUMB_PARENT in app-routing.module.ts) — the
 *  middle segment is a real link back to the hub, not just plain text. */
describe('BreadcrumbsComponent with a breadcrumbParent', () => {
  it('renders Home / {parent} / {label} with the parent as a link', async () => {
    await TestBed.configureTestingModule({
      imports: [BreadcrumbsComponent],
      providers: [provideRouter([])]
    }).compileComponents();

    const fixture = TestBed.createComponent(BreadcrumbsComponent);
    // Route data (routeLabel/parent) is read once from ActivatedRoute's
    // constructor-time snapshot, so it's easier to drive this test via the
    // public labelOverride input (which the label getter prefers anyway)
    // than to fight TestBed's ActivatedRoute provider order for a two-field
    // object; parent has no such override, so it's still assigned directly.
    fixture.componentInstance.labelOverride = 'Inventory';
    fixture.componentInstance.parent = { label: 'Manage', link: '/manage' };
    fixture.detectChanges();

    const parentLink = fixture.debugElement.query(By.css('a[href="/manage"]'));
    expect(parentLink.nativeElement.textContent.trim()).toBe('Manage');

    const current = fixture.debugElement.query(By.css('.breadcrumb-current'));
    expect(current.nativeElement.textContent.trim()).toBe('Inventory');
  });
});
