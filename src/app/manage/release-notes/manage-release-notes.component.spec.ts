import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ManageReleaseNotesComponent } from './manage-release-notes.component';
import { AuthService } from '../../core/auth.service';
import { createFakeAuthService, createFakeProfile } from '../../testing/fakes';
import { CHANGELOG_ENTRIES } from '../../shared/models/changelog';
import { getUnseenChangelogCount } from '../../shared/utils/changelog';

describe('ManageReleaseNotesComponent', () => {
  let component: ManageReleaseNotesComponent;
  let fixture: ComponentFixture<ManageReleaseNotesComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManageReleaseNotesComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ id: 'user-1' })) }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ManageReleaseNotesComponent);
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

  it('exposes every changelog entry', () => {
    expect(component.changelogEntries).toEqual(CHANGELOG_ENTRIES);
  });

  it('marks the changelog seen for the signed-in user on init', async () => {
    localStorage.setItem('shelf-sync:changelog-last-seen:user-1', '2000-01-01');
    expect(getUnseenChangelogCount('user-1')).toBeGreaterThan(0);

    await TestBed.resetTestingModule().configureTestingModule({
      imports: [ManageReleaseNotesComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ id: 'user-1' })) }
      ]
    }).compileComponents();
    const freshFixture = TestBed.createComponent(ManageReleaseNotesComponent);
    freshFixture.detectChanges();
    await freshFixture.whenStable();

    expect(getUnseenChangelogCount('user-1')).toBe(0);
  });
});
