import { Component, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SupabaseService } from '../../../core/supabase.service';
import { Profile } from '../../../core/auth.service';

const ROLES: Profile['role'][] = ['admin', 'manager', 'staff'];
const ROLE_LABELS: Record<Profile['role'], string> = {
  admin: 'Admin',
  manager: 'Manager',
  staff: 'Staff'
};

@Component({
  selector: 'app-edit-profile-modal',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './edit-profile-modal.component.html',
  styleUrl: './edit-profile-modal.component.scss',
})
export class EditProfileModalComponent {
  private supabase = inject(SupabaseService).client;
  dialogRef = inject(MatDialogRef<EditProfileModalComponent>);
  profile = inject<Profile>(MAT_DIALOG_DATA);

  readonly roles = ROLES;
  readonly roleLabels = ROLE_LABELS;

  form = new FormGroup({
    fullName: new FormControl(this.profile.full_name ?? '', { nonNullable: true }),
    nickname: new FormControl(this.profile.nickname ?? '', { nonNullable: true }),
    email: new FormControl(this.profile.email ?? '', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    role: new FormControl<Profile['role']>(this.profile.role, { nonNullable: true })
  });

  isSaving = false;
  error: string | null = null;

  async save() {
    if (this.isSaving) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSaving = true;
    this.error = null;

    const value = this.form.getRawValue();

    const { error: profileError } = await this.supabase
      .from('profiles')
      .update({
        full_name: value.fullName || null,
        nickname: value.nickname || null,
        email: value.email
      })
      .eq('id', this.profile.id);

    if (profileError) {
      this.isSaving = false;
      this.error = profileError.message;
      return;
    }

    if (value.role !== this.profile.role) {
      const { error: roleError } = await this.supabase.rpc('admin_set_user_role', {
        target_id: this.profile.id,
        new_role: value.role
      });

      if (roleError) {
        this.isSaving = false;
        this.error = roleError.message;
        return;
      }
    }

    this.isSaving = false;
    this.dialogRef.close({
      ...this.profile,
      full_name: value.fullName || null,
      nickname: value.nickname || null,
      email: value.email,
      role: value.role
    });
  }

  closeModal() {
    this.dialogRef.close();
  }
}
