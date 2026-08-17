import { Component, inject } from '@angular/core';
import { MAT_SNACK_BAR_DATA } from '@angular/material/snack-bar';
import { MatIconModule } from '@angular/material/icon';

export interface SuccessToastData {
  message: string;
}

/** Content component for NotificationService's success toast — swapped in
 *  for MatSnackBar's plain-text default specifically to get a checkmark
 *  icon with a playful pop-in animation onto every success toast in the
 *  app, rather than the flat default slide-up. */
@Component({
  selector: 'app-success-toast',
  imports: [MatIconModule],
  templateUrl: './success-toast.component.html',
  styleUrl: './success-toast.component.scss',
})
export class SuccessToastComponent {
  data = inject<SuccessToastData>(MAT_SNACK_BAR_DATA);
}
