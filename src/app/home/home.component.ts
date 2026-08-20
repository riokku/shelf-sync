import { Component, OnInit, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../core/auth.service';
import { SupabaseService } from '../core/supabase.service';
import { BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';
import { needsRestockAttention } from '../shared/utils/inventory-stock';

@Component({
  selector: 'app-home',
  imports: [RouterModule, MatIconModule, BreadcrumbsComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  protected authService = inject(AuthService);
  private supabase = inject(SupabaseService).client;

  get greetingName(): string {
    const profile = this.authService.profile();
    return profile?.nickname || profile?.full_name || '';
  }

  /** Same "needs restocking" fact HeaderComponent's Inventory nav badge
   *  shows, surfaced again here since this is the first thing a signed-in
   *  user sees — see inventory-stock.ts. needsRestockAttention() combines
   *  low *and* out-of-stock (and, incidentally, any pending-retirement item
   *  too, since retirement can only be requested at zero remaining) — named
   *  restockCount rather than lowStockCount, and the card's own label below
   *  reads "low or out of stock" rather than "low stock" (matching
   *  HeaderComponent's own nav-badge tooltip wording), so neither the field
   *  name nor the visible text implies a narrower "low stock only" count
   *  than what this actually is. Loaded independently rather than sharing
   *  state with HeaderComponent, matching how this app's other small count
   *  badges (pendingManageCount vs. ManageComponent's own) are already each
   *  self-sufficient rather than wired through a shared service, for a
   *  query this cheap. */
  restockCount = 0;

  async ngOnInit() {
    const { data } = await this.supabase
      .from('inventory_items')
      .select('quantity_remaining, low_quantity_threshold')
      .neq('status', 'retired');

    this.restockCount = (data ?? []).filter(needsRestockAttention).length;
  }
}
