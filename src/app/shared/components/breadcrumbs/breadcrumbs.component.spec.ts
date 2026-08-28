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

  it('truncates a crumb longer than 24 characters with an ellipsis, keeping the full text as a title attribute', () => {
    const longName = 'A Very Long Inventory Item Name Indeed';
    component.labelOverride = longName;
    fixture.detectChanges();

    const current = fixture.debugElement.query(By.css('.breadcrumb-current'));
    expect(current.nativeElement.textContent.trim()).toBe('A Very Long Inventory It…');
    expect(current.nativeElement.getAttribute('title')).toBe(longName);
  });

  it('leaves a crumb of exactly 24 characters untouched (the truncation boundary)', () => {
    const exactName = 'Twenty Four Characters!!';
    expect(exactName.length).toBe(24);
    component.labelOverride = exactName;
    fixture.detectChanges();

    const current = fixture.debugElement.query(By.css('.breadcrumb-current'));
    expect(current.nativeElement.textContent.trim()).toBe(exactName);
  });
});

/** Covers the Home / Tasks / {task title} / {item name} shape
 *  TasksComponent's own related-item view uses — see
 *  BreadcrumbsComponent.secondaryLabel's own doc comment. */
describe('BreadcrumbsComponent with a secondaryLabel', () => {
  it('renders parent / secondaryLabel / label, with secondaryLabel as a clickable button (not a routerLink)', async () => {
    await TestBed.configureTestingModule({
      imports: [BreadcrumbsComponent],
      providers: [provideRouter([])]
    }).compileComponents();

    const fixture = TestBed.createComponent(BreadcrumbsComponent);
    fixture.componentInstance.parentOverride = { label: 'Tasks', link: '/tasks' };
    fixture.componentInstance.secondaryLabel = 'Fix the projector';
    fixture.componentInstance.labelOverride = 'Ceiling-Mount Projector';
    fixture.detectChanges();

    const parentLink = fixture.debugElement.query(By.css('a[href="/tasks"]'));
    expect(parentLink.nativeElement.textContent.trim()).toBe('Tasks');

    const secondaryButton = fixture.debugElement.query(By.css('.breadcrumb-link-button'));
    expect(secondaryButton.nativeElement.tagName).toBe('BUTTON');
    expect(secondaryButton.nativeElement.textContent.trim()).toBe('Fix the projector');

    const current = fixture.debugElement.query(By.css('.breadcrumb-current'));
    expect(current.nativeElement.textContent.trim()).toBe('Ceiling-Mount Projector');
  });

  it('emits secondaryLabelClick when the secondaryLabel button is clicked', async () => {
    await TestBed.configureTestingModule({
      imports: [BreadcrumbsComponent],
      providers: [provideRouter([])]
    }).compileComponents();

    const fixture = TestBed.createComponent(BreadcrumbsComponent);
    fixture.componentInstance.secondaryLabel = 'Fix the projector';
    fixture.detectChanges();

    const clicked = jasmine.createSpy('secondaryLabelClick');
    fixture.componentInstance.secondaryLabelClick.subscribe(clicked);

    fixture.debugElement.query(By.css('.breadcrumb-link-button')).nativeElement.click();

    expect(clicked).toHaveBeenCalled();
  });

  it('omits the secondaryLabel segment entirely when unset', async () => {
    await TestBed.configureTestingModule({
      imports: [BreadcrumbsComponent],
      providers: [provideRouter([])]
    }).compileComponents();

    const fixture = TestBed.createComponent(BreadcrumbsComponent);
    fixture.componentInstance.parentOverride = { label: 'Tasks', link: '/tasks' };
    fixture.componentInstance.labelOverride = 'Fix the projector';
    fixture.detectChanges();

    expect(fixture.debugElement.query(By.css('.breadcrumb-link-button'))).toBeNull();
    const segments = fixture.debugElement.queryAll(By.css('.breadcrumb-current'));
    expect(segments.length).toBe(1);
    expect(segments[0].nativeElement.textContent.trim()).toBe('Fix the projector');
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
    // Route data (routeLabel/routeParent) is read once from ActivatedRoute's
    // constructor-time snapshot, so it's easier to drive this test via the
    // public labelOverride/parentOverride inputs (which the label/parent
    // getters prefer anyway) than to fight TestBed's ActivatedRoute provider
    // order for a two-field object.
    fixture.componentInstance.labelOverride = 'Inventory';
    fixture.componentInstance.parentOverride = { label: 'Manage', link: '/manage' };
    fixture.detectChanges();

    const parentLink = fixture.debugElement.query(By.css('a[href="/manage"]'));
    expect(parentLink.nativeElement.textContent.trim()).toBe('Manage');

    const current = fixture.debugElement.query(By.css('.breadcrumb-current'));
    expect(current.nativeElement.textContent.trim()).toBe('Inventory');
  });

  it('calls the parent segment\'s own onClick on click, alongside its routerLink navigation', async () => {
    await TestBed.configureTestingModule({
      imports: [BreadcrumbsComponent],
      providers: [provideRouter([])]
    }).compileComponents();

    const fixture = TestBed.createComponent(BreadcrumbsComponent);
    const onClick = jasmine.createSpy('onClick');
    fixture.componentInstance.parentOverride = { label: 'Tasks', link: '/tasks', onClick };
    fixture.detectChanges();

    fixture.debugElement.query(By.css('a[href="/tasks"]')).nativeElement.click();

    expect(onClick).toHaveBeenCalled();
  });
});
