import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Profile } from '../../../core/auth.service';
import { profileDisplayName } from '../../utils/profile-label';

export interface TransferTaskModalData {
  people: Profile[];
}

/** A pure data-collector, same shape as RequestRetirementModalComponent —
 *  closes with the picked target's id (or nothing, on Cancel) rather than
 *  making the request_task_transfer() RPC call itself. TaskDetailModalComponent's
 *  own afterClosed() handler still owns the actual call/error state, same
 *  as ModalTableComponent.openRequestRetirement()'s own pattern. */
@Component({
  selector: 'app-transfer-task-modal',
  imports: [
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './transfer-task-modal.component.html',
  styleUrl: './transfer-task-modal.component.scss',
})
export class TransferTaskModalComponent {
  dialogRef = inject(MatDialogRef<TransferTaskModalComponent, string>);
  data = inject<TransferTaskModalData>(MAT_DIALOG_DATA);

  targetId: string | null = null;

  profileLabel(profile: Profile): string {
    return profileDisplayName(profile);
  }

  submit() {
    if (!this.targetId) {
      return;
    }
    this.dialogRef.close(this.targetId);
  }

  cancel() {
    this.dialogRef.close();
  }
}
