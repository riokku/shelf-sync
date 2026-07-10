import { Component, Input, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { ImageLightboxComponent } from '../image-lightbox/image-lightbox.component';

@Component({
  selector: 'app-image-gallery',
  imports: [MatIconModule, MatButtonModule],
  templateUrl: './image-gallery.component.html',
  styleUrl: './image-gallery.component.scss',
})
export class ImageGalleryComponent {
  private dialog = inject(MatDialog);

  @Input({ required: true }) images!: string[];
  @Input({ required: true }) itemName!: string;

  currentIndex = 0;

  prev() {
    this.currentIndex = (this.currentIndex - 1 + this.images.length) % this.images.length;
  }

  next() {
    this.currentIndex = (this.currentIndex + 1) % this.images.length;
  }

  selectIndex(index: number) {
    this.currentIndex = index;
  }

  expand() {
    this.dialog.open(ImageLightboxComponent, {
      data: { images: this.images, startIndex: this.currentIndex, itemName: this.itemName },
      maxWidth: '95vw',
      maxHeight: '95vh',
      panelClass: 'image-lightbox-dialog'
    });
  }
}
