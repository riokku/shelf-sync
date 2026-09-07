import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MfaService } from '../../../core/mfa.service';

/** Self-contained (it generates the codes itself via
 *  MfaService.generateRecoveryCodes() in ngOnInit(), same "does its own
 *  write" convention every self-contained modal in this app follows) —
 *  opened with no data from two call sites: AccountComponent's
 *  openTwoFactorSetup() right after TwoFactorSetupModalComponent's own
 *  setup dialog closes successfully, and AccountComponent's own
 *  "Regenerate recovery codes" button. Either way, this is the one place in
 *  the app that ever shows a recovery code in plaintext — the server only
 *  ever persists each code's hash (see add_mfa_recovery_codes' own doc
 *  comment), so a viewer who closes this without saving them has no way to
 *  see the same codes again short of regenerating (which invalidates them).
 *
 *  Closing is gated on an explicit "I've saved these codes" checkbox rather
 *  than a plain Close button — the same one-time-reveal moment GitHub/
 *  Google/AWS's own recovery-code UIs gate the same way, worth the extra
 *  friction here specifically because there's no way back in without a
 *  regenerate afterward. */
@Component({
  selector: 'app-recovery-codes-modal',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCheckboxModule,
    MatDialogModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule
  ],
  templateUrl: './recovery-codes-modal.component.html',
  styleUrl: './recovery-codes-modal.component.scss',
})
export class RecoveryCodesModalComponent implements OnInit {
  private readonly mfaService = inject(MfaService);
  readonly dialogRef = inject(MatDialogRef<RecoveryCodesModalComponent>);

  isLoading = true;
  errorMessage: string | null = null;
  codes: string[] | null = null;
  confirmedSaved = false;
  copied = false;

  async ngOnInit() {
    const { codes, error } = await this.mfaService.generateRecoveryCodes();
    this.isLoading = false;
    this.codes = codes;
    this.errorMessage = error;
  }

  /** Grouped as e.g. "a1b2-c3d4-e5f6-a7b8" purely for on-screen/printed
   *  readability — redeem_mfa_recovery_code() strips non-hex characters
   *  before hashing, so the dashes are cosmetic only and typing the code
   *  back without them (or in any case) still matches. */
  formatCode(code: string): string {
    return code.match(/.{1,4}/g)?.join('-') ?? code;
  }

  async copyAll() {
    if (!this.codes) {
      return;
    }
    try {
      await navigator.clipboard.writeText(this.codes.map(code => this.formatCode(code)).join('\n'));
      this.copied = true;
    } catch {
      // Clipboard access can fail (permissions, insecure context) — the
      // codes are still on screen to copy by hand, so this is a silent
      // no-op rather than a surfaced error.
    }
  }

  download() {
    if (!this.codes) {
      return;
    }
    const content = [
      'ShelfSync two-factor recovery codes',
      'Each code can be used once if you lose access to your authenticator app.',
      '',
      ...this.codes.map(code => this.formatCode(code))
    ].join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'shelfsync-recovery-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  /** Gated on the confirmation checkbox — the normal, success-path close. */
  close() {
    if (!this.confirmedSaved) {
      return;
    }
    this.dialogRef.close();
  }

  /** The error-path close (generation itself failed) — nothing was ever
   *  shown to confirm saving, so there's nothing to gate. */
  cancel() {
    this.dialogRef.close();
  }
}
