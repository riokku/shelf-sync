import { Component, OnInit, inject } from '@angular/core';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import * as QRCode from 'qrcode';
import { buildItemQrValue } from '../../utils/barcode';

export interface QrLabelModalData {
  itemId: string;
  itemName: string;
}

/** Printable/downloadable QR label for an item that has no manufacturer
 *  barcode of its own (an internal asset) — encodes buildItemQrValue(id),
 *  so scanning the printed label with BarcodeScannerModalComponent later
 *  resolves straight back to this item (see shared/utils/barcode.ts). */
@Component({
  selector: 'app-qr-label-modal',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  templateUrl: './qr-label-modal.component.html',
  styleUrl: './qr-label-modal.component.scss',
})
export class QrLabelModalComponent implements OnInit {
  dialogRef = inject(MatDialogRef<QrLabelModalComponent>);
  data = inject<QrLabelModalData>(MAT_DIALOG_DATA);

  qrDataUrl: string | null = null;
  generateError: string | null = null;

  async ngOnInit() {
    try {
      this.qrDataUrl = await QRCode.toDataURL(buildItemQrValue(this.data.itemId), {
        width: 320,
        margin: 2
      });
    } catch {
      this.generateError = 'Could not generate the label.';
    }
  }

  download() {
    if (!this.qrDataUrl) {
      return;
    }
    const link = document.createElement('a');
    link.href = this.qrDataUrl;
    link.download = `${this.data.itemName || 'item'}-label.png`;
    link.click();
  }

  // Builds the print window's document via DOM APIs (not a raw HTML
  // string via document.write) specifically so data.itemName — arbitrary
  // text any authenticated user can set on an item — can't inject markup
  // into it; assigning to .textContent auto-escapes the same way an
  // Angular template interpolation would.
  print() {
    if (!this.qrDataUrl) {
      return;
    }

    const printWindow = window.open('', '_blank', 'width=420,height=520');
    if (!printWindow) {
      this.generateError = 'Could not open the print window — check your pop-up blocker.';
      return;
    }

    const doc = printWindow.document;
    doc.title = `${this.data.itemName} label`;

    const img = doc.createElement('img');
    img.src = this.qrDataUrl;
    img.style.width = '260px';
    img.style.height = '260px';
    img.style.display = 'block';
    img.style.margin = '2rem auto 0.5rem';

    const caption = doc.createElement('p');
    caption.textContent = this.data.itemName;
    caption.style.fontFamily = 'sans-serif';
    caption.style.fontSize = '14px';
    caption.style.textAlign = 'center';

    doc.body.appendChild(img);
    doc.body.appendChild(caption);

    img.onload = () => printWindow.print();
  }

  close() {
    this.dialogRef.close();
  }
}
