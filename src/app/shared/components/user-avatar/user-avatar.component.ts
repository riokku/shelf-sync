import { Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { avatarPresetFor } from '../../models/avatar-preset';

@Component({
  selector: 'app-user-avatar',
  imports: [MatIconModule],
  templateUrl: './user-avatar.component.html',
  styleUrl: './user-avatar.component.scss',
})
export class UserAvatarComponent {
  @Input() avatarKey: string | null | undefined = null;
  @Input() size: 'sm' | 'md' | 'lg' = 'md';

  get preset() {
    return avatarPresetFor(this.avatarKey);
  }
}
