import { Component, OnInit, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService, Profile } from '../core/auth.service';

@Component({
  selector: 'app-account',
  imports: [MatCardModule, MatProgressSpinnerModule],
  templateUrl: './account.component.html',
  styleUrl: './account.component.scss',
})
export class AccountComponent implements OnInit {
  private authService = inject(AuthService);

  profile: Profile | null = null;
  isLoading = true;

  async ngOnInit() {
    this.profile = await this.authService.getProfile();
    this.isLoading = false;
  }
}
