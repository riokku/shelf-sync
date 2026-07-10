import { Component, HostListener, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

export interface ImageLightboxData {
  images: string[];
  startIndex: number;
  itemName: string;
}

@Component({
  selector: 'app-image-lightbox',
  imports: [MatDialogModule, MatIconModule, MatButtonModule],
  templateUrl: './image-lightbox.component.html',
  styleUrl: './image-lightbox.component.scss',
})
export class ImageLightboxComponent {
  dialogRef = inject(MatDialogRef<ImageLightboxComponent>);
  data = inject<ImageLightboxData>(MAT_DIALOG_DATA);

  currentIndex = this.data.startIndex;

  @HostListener('window:keydown.arrowLeft')
  prev() {
    this.currentIndex = (this.currentIndex - 1 + this.data.images.length) % this.data.images.length;
  }

  @HostListener('window:keydown.arrowRight')
  next() {
    this.currentIndex = (this.currentIndex + 1) % this.data.images.length;
  }

  close() {
    this.dialogRef.close();
  }
}
