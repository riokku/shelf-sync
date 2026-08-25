import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PageIntroComponent } from './page-intro.component';
import { AuthService } from '../../../core/auth.service';
import { createFakeAuthService, createFakeProfile } from '../../../testing/fakes';

describe('PageIntroComponent', () => {
  async function createComponent(userId: string): Promise<ComponentFixture<PageIntroComponent>> {
    await TestBed.resetTestingModule().configureTestingModule({
      imports: [PageIntroComponent],
      providers: [{ provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ id: userId })) }]
    }).compileComponents();

    const fixture = TestBed.createComponent(PageIntroComponent);
    fixture.componentInstance.pageKey = 'inventory';
    fixture.componentInstance.text = 'This is your inventory.';
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => {
    try {
      localStorage.clear();
    } catch {
      // Same "best effort" reasoning this component's own storage access has.
    }
  });

  it('shows for a user who has never dismissed it', async () => {
    const fixture = await createComponent('user-1');
    expect(fixture.componentInstance.dismissed).toBeFalse();
  });

  it('dismiss() hides it and persists across a fresh load for the same user', async () => {
    const fixture = await createComponent('user-1');
    fixture.componentInstance.dismiss();
    expect(fixture.componentInstance.dismissed).toBeTrue();

    const secondVisit = await createComponent('user-1');
    expect(secondVisit.componentInstance.dismissed).toBeTrue();
  });

  it('dismissal by one user does not hide it for another', async () => {
    const first = await createComponent('user-1');
    first.componentInstance.dismiss();

    const second = await createComponent('user-2');
    expect(second.componentInstance.dismissed).toBeFalse();
  });

  it('dismissal on one page does not hide a different page\'s hint for the same user', async () => {
    const inventoryHint = await createComponent('user-1');
    inventoryHint.componentInstance.dismiss();

    await TestBed.resetTestingModule().configureTestingModule({
      imports: [PageIntroComponent],
      providers: [{ provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ id: 'user-1' })) }]
    }).compileComponents();
    const tasksHint = TestBed.createComponent(PageIntroComponent);
    tasksHint.componentInstance.pageKey = 'tasks';
    tasksHint.componentInstance.text = 'This is your task queue.';
    tasksHint.detectChanges();

    expect(tasksHint.componentInstance.dismissed).toBeFalse();
  });
});
