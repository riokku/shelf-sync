import { Component, OnInit, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatExpansionModule } from '@angular/material/expansion';
import { SupabaseService } from '../core/supabase.service';
import { AuthService, Profile } from '../core/auth.service';
import { BreadcrumbsComponent } from '../shared/components/breadcrumbs/breadcrumbs.component';
import { Database } from '../shared/models/database.types';
import { TASK_STATUSES, TASK_STATUS_LABELS, TaskStatus } from '../shared/models/task-status';

type Task = Database['public']['Tables']['tasks']['Row'];

interface TeamMember {
  profile: Profile;
  tasksByStatus: Record<TaskStatus, Task[]>;
}

@Component({
  selector: 'app-manage',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatExpansionModule,
    BreadcrumbsComponent
  ],
  templateUrl: './manage.component.html',
  styleUrl: './manage.component.scss',
})
export class ManageComponent implements OnInit {
  private supabase = inject(SupabaseService).client;
  private authService = inject(AuthService);

  private currentUserId: string | null = null;
  assignableProfiles: Profile[] = [];

  readonly statuses = TASK_STATUSES;
  readonly statusLabels = TASK_STATUS_LABELS;
  teamMembers: TeamMember[] = [];
  isLoadingTeam = true;

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

    await this.loadTeamTasks();
  }

  profileLabel(profile: Profile): string {
    return profile.nickname || profile.full_name || profile.email;
  }

  private async loadTeamTasks() {
    this.isLoadingTeam = true;

    const { data } = await this.supabase
      .from('tasks')
      .select('*')
      .order('due_date', { ascending: true, nullsFirst: false });
    const tasks = data ?? [];

    const tasksByUser = new Map<string, Task[]>();
    for (const task of tasks) {
      if (!task.assigned_to) {
        continue;
      }
      const existing = tasksByUser.get(task.assigned_to) ?? [];
      existing.push(task);
      tasksByUser.set(task.assigned_to, existing);
    }

    this.teamMembers = this.assignableProfiles.map(profile => {
      const userTasks = tasksByUser.get(profile.id) ?? [];
      return {
        profile,
        tasksByStatus: {
          todo: userTasks.filter(task => task.status === 'todo'),
          in_progress: userTasks.filter(task => task.status === 'in_progress'),
          done: userTasks.filter(task => task.status === 'done')
        }
      };
    });

    this.isLoadingTeam = false;
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
    await this.loadTeamTasks();
  }
}
