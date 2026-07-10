import { Component, OnInit, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SupabaseService } from '../core/supabase.service';
import { AuthService, Profile } from '../core/auth.service';

@Component({
  selector: 'app-manage',
  imports: [
    ReactiveFormsModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './manage.component.html',
  styleUrl: './manage.component.scss',
})
export class ManageComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);

  private currentUserId: string | null = null;
  assignableProfiles: Profile[] = [];

  inventoryForm = new FormGroup({
    name: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    category: new FormControl('', { nonNullable: true }),
    description: new FormControl('', { nonNullable: true }),
    image: new FormControl('', { nonNullable: true }),
    physicalLocation: new FormControl('', { nonNullable: true }),
    digitalLocation: new FormControl('', { nonNullable: true }),
    applicableYear: new FormControl('', { nonNullable: true }),
    expirationDate: new FormControl('', { nonNullable: true }),
    supplierName: new FormControl('', { nonNullable: true }),
    supplierLeadTime: new FormControl('', { nonNullable: true }),
    orderLink: new FormControl('', { nonNullable: true }),
    quantityTotal: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    quantityPerContainer: new FormControl<number | null>(null),
    lowQuantityThreshold: new FormControl<number | null>(null),
    pricePerUnit: new FormControl<number | null>(null),
    pricePerContainer: new FormControl<number | null>(null)
  });

  isSavingItem = false;
  itemError: string | null = null;
  itemSaved = false;

  taskForm = new FormGroup({
    title: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true }),
    status: new FormControl<'todo' | 'in_progress' | 'done'>('todo', { nonNullable: true }),
    assignedTo: new FormControl<string | null>(null),
    dueDate: new FormControl('', { nonNullable: true })
  });

  isSavingTask = false;
  taskError: string | null = null;
  taskSaved = false;

  async ngOnInit() {
    const session = await this.authService.getSession();
    this.currentUserId = session?.user.id ?? null;

    const { data } = await this.supabase.from('profiles').select('*').order('full_name');
    this.assignableProfiles = data ?? [];
  }

  profileLabel(profile: Profile): string {
    return profile.nickname || profile.full_name || profile.email;
  }

  async submitInventoryItem() {
    if (this.inventoryForm.invalid || this.isSavingItem) {
      return;
    }

    this.isSavingItem = true;
    this.itemError = null;
    this.itemSaved = false;

    const value = this.inventoryForm.getRawValue();
    const { error } = await this.supabase.from('inventory_items').insert({
      name: value.name,
      category: value.category || null,
      description: value.description || null,
      image: value.image || null,
      physical_location: value.physicalLocation || null,
      digital_location: value.digitalLocation || null,
      applicable_year: value.applicableYear || null,
      expiration_date: value.expirationDate || null,
      supplier_name: value.supplierName || null,
      supplier_lead_time: value.supplierLeadTime || null,
      order_link: value.orderLink || null,
      quantity_total: value.quantityTotal,
      quantity_allocated: 0,
      quantity_remaining: value.quantityTotal,
      quantity_per_container: value.quantityPerContainer,
      low_quantity_threshold: value.lowQuantityThreshold,
      price_per_unit: value.pricePerUnit,
      price_per_container: value.pricePerContainer
    });

    this.isSavingItem = false;

    if (error) {
      this.itemError = error.message;
      return;
    }

    this.itemSaved = true;
    this.inventoryForm.reset();
  }

  async submitTask() {
    if (this.taskForm.invalid || this.isSavingTask || !this.currentUserId) {
      return;
    }

    this.isSavingTask = true;
    this.taskError = null;
    this.taskSaved = false;

    const value = this.taskForm.getRawValue();
    const { error } = await this.supabase.from('tasks').insert({
      title: value.title,
      description: value.description || null,
      status: value.status,
      assigned_to: value.assignedTo,
      due_date: value.dueDate || null,
      created_by: this.currentUserId
    });

    this.isSavingTask = false;

    if (error) {
      this.taskError = error.message;
      return;
    }

    this.taskSaved = true;
    this.taskForm.reset();
  }
}
