import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
    selector: 'app-footer',
    imports: [RouterLink],
    templateUrl: './footer.component.html',
    styleUrl: './footer.component.scss'
})
export class FooterComponent {
  /** Pricing/Privacy/Terms are pre-login, marketing-facing pages — showing
   *  them again on every authenticated page (this same component embedded
   *  in AppComponent's shell) added noise a signed-in user has no reason to
   *  click through to. Defaults true so landing/pricing (the pre-login
   *  contexts that also render this component) keep them unchanged;
   *  AppComponent's own usage is the one place that opts out. */
  @Input() showLegalLinks = true;
}
