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
    // Route data is read once in the constructor's field initializers, so
    // this has to be set before that runs — easier to just assign the
    // resulting fields directly than to fight TestBed's ActivatedRoute
    // provider order for a two-field object.
    fixture.componentInstance.label = 'Inventory';
    fixture.componentInstance.parent = { label: 'Manage', link: '/manage' };
    fixture.detectChanges();

    const parentLink = fixture.debugElement.query(By.css('a[href="/manage"]'));
    expect(parentLink.nativeElement.textContent.trim()).toBe('Manage');

    const current = fixture.debugElement.query(By.css('.breadcrumb-current'));
    expect(current.nativeElement.textContent.trim()).toBe('Inventory');
  });
});
