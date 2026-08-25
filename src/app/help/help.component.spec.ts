import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { HelpComponent } from './help.component';
import { AuthService } from '../core/auth.service';
import { createFakeAuthService, createFakeProfile } from '../testing/fakes';
import { CHANGELOG_ENTRIES } from '../shared/models/changelog';
import { getUnseenChangelogCount } from '../shared/utils/changelog';

describe('HelpComponent', () => {
  let component: HelpComponent;
  let fixture: ComponentFixture<HelpComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HelpComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ id: 'user-1' })) }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(HelpComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    try {
      localStorage.clear();
    } catch {
      // Same "best effort" reasoning this app's own storage access has.
    }
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('exposes every changelog entry for the "What\'s new" section', () => {
    expect(component.changelogEntries).toEqual(CHANGELOG_ENTRIES);
  });

  it('marks the changelog seen for the signed-in user on init', async () => {
    // Force a genuinely unseen entry *before* the component (and its own
    // ngOnInit) is created — setting it afterward would race the fixture's
    // own already-in-flight ngOnInit from the shared beforeEach above.
    localStorage.setItem('shelf-sync:changelog-last-seen:user-1', '2000-01-01');
    expect(getUnseenChangelogCount('user-1')).toBeGreaterThan(0);
    // getUnseenChangelogCount() above is read-only once a value is already
    // stored (see its own doc comment — the bootstrap-and-write path only
    // fires for a never-checked user), so the forced value survives it.

    await TestBed.resetTestingModule().configureTestingModule({
      imports: [HelpComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ id: 'user-1' })) }
      ]
    }).compileComponents();
    const freshFixture = TestBed.createComponent(HelpComponent);
    freshFixture.detectChanges();
    await freshFixture.whenStable();

    expect(getUnseenChangelogCount('user-1')).toBe(0);
  });
});
