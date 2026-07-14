import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SiteSettingsService } from './core/site-settings.service';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss'],
    standalone: false
})
export class AppComponent {
  title = 'ShelfSync';
  private siteSettings = inject(SiteSettingsService);

  constructor(
    public router: Router
  ){
    this.siteSettings.load();
  }

}
