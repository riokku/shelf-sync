import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';

import { ImageLightboxComponent, ImageLightboxData } from './image-lightbox.component';
import { createFakeMatDialogRef } from '../../../testing/fakes';

describe('ImageLightboxComponent', () => {
  let component: ImageLightboxComponent;
  let fixture: ComponentFixture<ImageLightboxComponent>;

  beforeEach(async () => {
    const data: ImageLightboxData = { images: ['photo-1.jpg', 'photo-2.jpg'], startIndex: 0, itemName: 'Test Item' };

    await TestBed.configureTestingModule({
      imports: [ImageLightboxComponent],
      providers: [
        { provide: MatDialogRef, useValue: createFakeMatDialogRef() },
        { provide: MAT_DIALOG_DATA, useValue: data }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ImageLightboxComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
