import { AfterViewInit, Component, OnDestroy, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { BrowserMultiFormatReader, IScannerControls } from '@zxing/browser';

/** id of the <video> element in the template — passed straight to ZXing's
 *  decodeFromConstraints() rather than an Angular ViewChild ref, since it
 *  accepts either. */
const VIDEO_ELEMENT_ID = 'barcode-scanner-video';

/** Live-camera barcode/QR scanner, shared by the inventory create form
 *  (scan-to-dedup a new item) and the item detail popup (scan/rescan an
 *  existing item's barcode). Resolves with the decoded text either way —
 *  callers don't need to know whether it came from the camera or the
 *  manual-entry fallback below. Closes with `undefined` on cancel. */
@Component({
  selector: 'app-barcode-scanner-modal',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './barcode-scanner-modal.component.html',
  styleUrl: './barcode-scanner-modal.component.scss',
})
export class BarcodeScannerModalComponent implements AfterViewInit, OnDestroy {
  dialogRef = inject(MatDialogRef<BarcodeScannerModalComponent, string | undefined>);

  readonly videoElementId = VIDEO_ELEMENT_ID;

  private reader = new BrowserMultiFormatReader();
  private controls: IScannerControls | null = null;

  cameraError: string | null = null;

  // Manual fallback — always available, not just when the camera fails:
  // covers devices with no camera (desktop dev/testing), a denied
  // permission prompt, or someone who'd just rather type a short code.
  manualForm = new FormGroup({
    code: new FormControl('', { nonNullable: true })
  });

  async ngAfterViewInit() {
    try {
      this.controls = await this.reader.decodeFromConstraints(
        { video: { facingMode: 'environment' } },
        VIDEO_ELEMENT_ID,
        (result) => {
          if (result) {
            this.finish(result.getText());
          }
          // Per-frame decode failures (Exception) are expected constantly
          // while the camera is pointed at anything other than a code —
          // not surfaced as cameraError, which is reserved for "the camera
          // itself never started" below.
        }
      );
    } catch (error) {
      // getUserMedia rejected — no camera, permission denied, or in use by
      // another app. The manual-entry fallback above still works.
      this.cameraError = error instanceof Error
        ? error.message
        : 'Could not access the camera.';
    }
  }

  ngOnDestroy() {
    this.controls?.stop();
  }

  private finish(code: string) {
    this.controls?.stop();
    this.dialogRef.close(code);
  }

  submitManualCode() {
    const code = this.manualForm.controls.code.value.trim();
    if (code) {
      this.finish(code);
    }
  }

  cancel() {
    this.dialogRef.close();
  }
}
