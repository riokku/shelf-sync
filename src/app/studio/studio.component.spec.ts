import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { StudioComponent } from './studio.component';
import { SupabaseService } from '../core/supabase.service';
import { createFakeSupabaseService } from '../testing/fakes';

describe('StudioComponent', () => {
  let component: StudioComponent;
  let fixture: ComponentFixture<StudioComponent>;

  async function createComponent(count: number) {
    await TestBed.configureTestingModule({
      imports: [StudioComponent],
      providers: [
        provideRouter([]),
        { provide: SupabaseService, useValue: createFakeSupabaseService({ data: [], count, error: null }) }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(StudioComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  }

  it('should create', async () => {
    await createComponent(0);
    expect(component).toBeTruthy();
  });

  it('badges the Feedback card with the count of not-yet-reviewed feedback', async () => {
    await createComponent(4);
    expect(component.newFeedbackCount).toBe(4);
  });

  it('shows zero when nothing new is waiting', async () => {
    await createComponent(0);
    expect(component.newFeedbackCount).toBe(0);
  });
});
