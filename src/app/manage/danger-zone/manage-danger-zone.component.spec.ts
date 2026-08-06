import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { ManageDangerZoneComponent } from './manage-danger-zone.component';
import { AuthService } from '../../core/auth.service';
import { createFakeAuthService, createFakeProfile } from '../../testing/fakes';

describe('ManageDangerZoneComponent', () => {
  let component: ManageDangerZoneComponent;
  let fixture: ComponentFixture<ManageDangerZoneComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ManageDangerZoneComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: createFakeAuthService(createFakeProfile({ role: 'admin' })) }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ManageDangerZoneComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
