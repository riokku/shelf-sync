export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          message: string
          organization_id: string
          via_impersonation: boolean
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          message: string
          organization_id?: string
          via_impersonation?: boolean
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          message?: string
          organization_id?: string
          via_impersonation?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_references: {
        Row: {
          broadcast_id: string
          id: string
          item_id: string | null
          member_id: string | null
          reference_type: string
        }
        Insert: {
          broadcast_id: string
          id?: string
          item_id?: string | null
          member_id?: string | null
          reference_type: string
        }
        Update: {
          broadcast_id?: string
          id?: string
          item_id?: string | null
          member_id?: string | null
          reference_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_references_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_references_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcast_references_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          message: string
          organization_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          message: string
          organization_id?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          message?: string
          organization_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      client_error_log: {
        Row: {
          app_env: string | null
          created_at: string
          id: string
          message: string
          organization_id: string | null
          stack: string | null
          url: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          app_env?: string | null
          created_at?: string
          id?: string
          message: string
          organization_id?: string | null
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          app_env?: string | null
          created_at?: string
          id?: string
          message?: string
          organization_id?: string | null
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_error_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_error_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          created_at: string
          id: string
          message: string
          organization_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          organization_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          organization_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      impersonation_sessions: {
        Row: {
          ended_at: string | null
          id: string
          platform_admin_id: string | null
          reason: string
          started_at: string
          target_label: string
          target_organization_id: string | null
          target_organization_label: string
          target_user_id: string | null
        }
        Insert: {
          ended_at?: string | null
          id?: string
          platform_admin_id?: string | null
          reason: string
          started_at?: string
          target_label: string
          target_organization_id?: string | null
          target_organization_label: string
          target_user_id?: string | null
        }
        Update: {
          ended_at?: string | null
          id?: string
          platform_admin_id?: string | null
          reason?: string
          started_at?: string
          target_label?: string
          target_organization_id?: string | null
          target_organization_label?: string
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "impersonation_sessions_platform_admin_id_fkey"
            columns: ["platform_admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_sessions_target_organization_id_fkey"
            columns: ["target_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "impersonation_sessions_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_audit_counts: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          audit_id: string
          counted_at: string | null
          counted_by: string | null
          counted_quantity: number | null
          expected_quantity: number
          id: string
          item_id: string
          note: string | null
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          audit_id: string
          counted_at?: string | null
          counted_by?: string | null
          counted_quantity?: number | null
          expected_quantity: number
          id?: string
          item_id: string
          note?: string | null
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          audit_id?: string
          counted_at?: string | null
          counted_by?: string | null
          counted_quantity?: number | null
          expected_quantity?: number
          id?: string
          item_id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_audit_counts_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_audit_counts_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "inventory_audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_audit_counts_counted_by_fkey"
            columns: ["counted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_audit_counts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_audit_schedules: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          frequency: string
          id: string
          next_occurrence_date: string
          note: string | null
          organization_id: string
          physical_location: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          frequency: string
          id?: string
          next_occurrence_date: string
          note?: string | null
          organization_id?: string
          physical_location?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          frequency?: string
          id?: string
          next_occurrence_date?: string
          note?: string | null
          organization_id?: string
          physical_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_audit_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_audit_schedules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_audit_supporters: {
        Row: {
          audit_id: string
          id: string
          user_id: string
        }
        Insert: {
          audit_id: string
          id?: string
          user_id: string
        }
        Update: {
          audit_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_audit_supporters_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "inventory_audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_audit_supporters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_audits: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          completed_by: string | null
          id: string
          lead_id: string | null
          note: string | null
          organization_id: string
          physical_location: string | null
          schedule_id: string | null
          started_at: string
          started_by: string | null
          status: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          id?: string
          lead_id?: string | null
          note?: string | null
          organization_id?: string
          physical_location?: string | null
          schedule_id?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          completed_by?: string | null
          id?: string
          lead_id?: string | null
          note?: string | null
          organization_id?: string
          physical_location?: string | null
          schedule_id?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_audits_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_audits_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_audits_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_audits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_audits_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "inventory_audit_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_audits_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_field_options: {
        Row: {
          created_at: string
          field_name: string
          id: string
          organization_id: string
          value: string
        }
        Insert: {
          created_at?: string
          field_name: string
          id?: string
          organization_id: string
          value: string
        }
        Update: {
          created_at?: string
          field_name?: string
          id?: string
          organization_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_field_options_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_item_activity: {
        Row: {
          created_at: string
          id: string
          item_id: string
          message: string
          user_id: string | null
          via_impersonation: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          message: string
          user_id?: string | null
          via_impersonation?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          message?: string
          user_id?: string | null
          via_impersonation?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "inventory_item_activity_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_item_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_item_containers: {
        Row: {
          created_at: string
          id: string
          item_id: string
          location: string | null
          quantity: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          location?: string | null
          quantity?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          location?: string | null
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_item_containers_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_item_discards: {
        Row: {
          container_id: string | null
          discarded_at: string
          discarded_by: string | null
          id: string
          item_id: string
          quantity: number
          reason: string[]
        }
        Insert: {
          container_id?: string | null
          discarded_at?: string
          discarded_by?: string | null
          id?: string
          item_id: string
          quantity: number
          reason: string[]
        }
        Update: {
          container_id?: string | null
          discarded_at?: string
          discarded_by?: string | null
          id?: string
          item_id?: string
          quantity?: number
          reason?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "inventory_item_discards_container_id_fkey"
            columns: ["container_id"]
            isOneToOne: false
            referencedRelation: "inventory_item_containers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_item_discards_discarded_by_fkey"
            columns: ["discarded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_item_discards_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_item_images: {
        Row: {
          created_at: string
          id: string
          item_id: string
          position: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          position?: number
          storage_path: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          position?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_item_images_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_item_orders: {
        Row: {
          id: string
          item_id: string
          note: string | null
          ordered_at: string
          ordered_by: string | null
          quantity: number
          received_at: string | null
          received_by: string | null
          status: string
          supplier_id: string | null
          supplier_name: string
        }
        Insert: {
          id?: string
          item_id: string
          note?: string | null
          ordered_at?: string
          ordered_by?: string | null
          quantity: number
          received_at?: string | null
          received_by?: string | null
          status?: string
          supplier_id?: string | null
          supplier_name: string
        }
        Update: {
          id?: string
          item_id?: string
          note?: string | null
          ordered_at?: string
          ordered_by?: string | null
          quantity?: number
          received_at?: string | null
          received_by?: string | null
          status?: string
          supplier_id?: string | null
          supplier_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_item_orders_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_item_orders_ordered_by_fkey"
            columns: ["ordered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_item_orders_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_item_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_item_reservations: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          end_date: string
          id: string
          item_id: string
          note: string | null
          picked_up_at: string | null
          picked_up_by: string | null
          quantity: number
          reservation_group_id: string | null
          reserved_at: string
          reserved_by: string | null
          reserved_for: string
          returned_at: string | null
          returned_by: string | null
          start_date: string
          status: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          end_date: string
          id?: string
          item_id: string
          note?: string | null
          picked_up_at?: string | null
          picked_up_by?: string | null
          quantity: number
          reservation_group_id?: string | null
          reserved_at?: string
          reserved_by?: string | null
          reserved_for: string
          returned_at?: string | null
          returned_by?: string | null
          start_date: string
          status?: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          end_date?: string
          id?: string
          item_id?: string
          note?: string | null
          picked_up_at?: string | null
          picked_up_by?: string | null
          quantity?: number
          reservation_group_id?: string | null
          reserved_at?: string
          reserved_by?: string | null
          reserved_for?: string
          returned_at?: string | null
          returned_by?: string | null
          start_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_item_reservations_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_item_reservations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_item_reservations_picked_up_by_fkey"
            columns: ["picked_up_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_item_reservations_reserved_by_fkey"
            columns: ["reserved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_item_reservations_returned_by_fkey"
            columns: ["returned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          activity_log: string | null
          applicable_year: string | null
          barcode: string | null
          category: string | null
          checked_out_to: string | null
          checkout_due_at: string | null
          checkout_overdue_notified_at: string | null
          created_at: string
          description: string | null
          digital_location: string | null
          expiration_date: string | null
          id: string
          image: string | null
          is_checked_out: boolean
          is_locked: boolean
          locked_at: string | null
          locked_by: string | null
          low_quantity_threshold: number | null
          name: string
          order_link: string | null
          organization_id: string
          physical_location: string | null
          price_per_container: number | null
          price_per_unit: number | null
          quantity_allocated: number
          quantity_per_container: number | null
          quantity_remaining: number
          quantity_total: number
          retired_at: string | null
          retired_by: string | null
          retirement_request_note: string | null
          retirement_requested_at: string | null
          retirement_requested_by: string | null
          status: string
          supplier_id: string | null
          supplier_lead_time: string | null
          updated_at: string
        }
        Insert: {
          activity_log?: string | null
          applicable_year?: string | null
          barcode?: string | null
          category?: string | null
          checked_out_to?: string | null
          checkout_due_at?: string | null
          checkout_overdue_notified_at?: string | null
          created_at?: string
          description?: string | null
          digital_location?: string | null
          expiration_date?: string | null
          id?: string
          image?: string | null
          is_checked_out?: boolean
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          low_quantity_threshold?: number | null
          name: string
          order_link?: string | null
          organization_id?: string
          physical_location?: string | null
          price_per_container?: number | null
          price_per_unit?: number | null
          quantity_allocated?: number
          quantity_per_container?: number | null
          quantity_remaining?: number
          quantity_total?: number
          retired_at?: string | null
          retired_by?: string | null
          retirement_request_note?: string | null
          retirement_requested_at?: string | null
          retirement_requested_by?: string | null
          status?: string
          supplier_id?: string | null
          supplier_lead_time?: string | null
          updated_at?: string
        }
        Update: {
          activity_log?: string | null
          applicable_year?: string | null
          barcode?: string | null
          category?: string | null
          checked_out_to?: string | null
          checkout_due_at?: string | null
          checkout_overdue_notified_at?: string | null
          created_at?: string
          description?: string | null
          digital_location?: string | null
          expiration_date?: string | null
          id?: string
          image?: string | null
          is_checked_out?: boolean
          is_locked?: boolean
          locked_at?: string | null
          locked_by?: string | null
          low_quantity_threshold?: number | null
          name?: string
          order_link?: string | null
          organization_id?: string
          physical_location?: string | null
          price_per_container?: number | null
          price_per_unit?: number | null
          quantity_allocated?: number
          quantity_per_container?: number | null
          quantity_remaining?: number
          quantity_total?: number
          retired_at?: string | null
          retired_by?: string | null
          retirement_request_note?: string | null
          retirement_requested_at?: string | null
          retirement_requested_by?: string | null
          status?: string
          supplier_id?: string | null
          supplier_lead_time?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_checked_out_to_fkey"
            columns: ["checked_out_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_locked_by_fkey"
            columns: ["locked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_retired_by_fkey"
            columns: ["retired_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_retirement_requested_by_fkey"
            columns: ["retirement_requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_email_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          organization_id: string | null
          recipient_email: string
          success: boolean
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          organization_id?: string | null
          recipient_email: string
          success: boolean
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          organization_id?: string | null
          recipient_email?: string
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notification_email_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          link: string
          message: string
          organization_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          link: string
          message: string
          organization_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          link?: string
          message?: string
          organization_id?: string
          read_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          slug: string
          suspended_at: string | null
          suspended_by: string | null
          suspension_reason: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          slug: string
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          slug?: string
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_suspended_by_fkey"
            columns: ["suspended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_action_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          reason: string | null
          target_id: string
          target_label: string
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          target_id: string
          target_label: string
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          target_id?: string
          target_label?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_action_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_locked_at: string | null
          account_locked_by: string | null
          account_locked_reason: string | null
          avatar_key: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_platform_admin: boolean
          last_active_at: string | null
          membership_status: Database["public"]["Enums"]["membership_status"]
          nickname: string | null
          organization_id: string
          quick_menu_enabled: boolean
          quick_menu_items: string[]
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          account_locked_at?: string | null
          account_locked_by?: string | null
          account_locked_reason?: string | null
          avatar_key?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_platform_admin?: boolean
          last_active_at?: string | null
          membership_status?: Database["public"]["Enums"]["membership_status"]
          nickname?: string | null
          organization_id: string
          quick_menu_enabled?: boolean
          quick_menu_items?: string[]
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          account_locked_at?: string | null
          account_locked_by?: string | null
          account_locked_reason?: string | null
          avatar_key?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_platform_admin?: boolean
          last_active_at?: string | null
          membership_status?: Database["public"]["Enums"]["membership_status"]
          nickname?: string | null
          organization_id?: string
          quick_menu_enabled?: boolean
          quick_menu_items?: string[]
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_account_locked_by_fkey"
            columns: ["account_locked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      release_notes: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          id: string
          posted_at: string
          severity: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          posted_at?: string
          severity?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          posted_at?: string
          severity?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "release_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_kit_items: {
        Row: {
          id: string
          item_id: string
          kit_id: string
          quantity: number
        }
        Insert: {
          id?: string
          item_id: string
          kit_id: string
          quantity: number
        }
        Update: {
          id?: string
          item_id?: string
          kit_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "reservation_kit_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_kit_items_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "reservation_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_kits: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          organization_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_kits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          bulk_edit_enabled: boolean
          id: string
          inventory_form_fields: string[]
          inventory_table_columns: string[]
          logo_storage_path: string | null
          notify_checkout_overdue: boolean
          notify_join_request: boolean
          notify_retirement_request: boolean
          notify_task_assigned: boolean
          notify_task_transfer: boolean
          organization_id: string
          require_mfa_for_all: boolean
          require_retirement_approval: boolean
          restrict_price_supplier_edits: boolean
          theme: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bulk_edit_enabled?: boolean
          id?: string
          inventory_form_fields?: string[]
          inventory_table_columns?: string[]
          logo_storage_path?: string | null
          notify_checkout_overdue?: boolean
          notify_join_request?: boolean
          notify_retirement_request?: boolean
          notify_task_assigned?: boolean
          notify_task_transfer?: boolean
          organization_id: string
          require_mfa_for_all?: boolean
          require_retirement_approval?: boolean
          restrict_price_supplier_edits?: boolean
          theme?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bulk_edit_enabled?: boolean
          id?: string
          inventory_form_fields?: string[]
          inventory_table_columns?: string[]
          logo_storage_path?: string | null
          notify_checkout_overdue?: boolean
          notify_join_request?: boolean
          notify_retirement_request?: boolean
          notify_task_assigned?: boolean
          notify_task_transfer?: boolean
          organization_id?: string
          require_mfa_for_all?: boolean
          require_retirement_approval?: boolean
          restrict_price_supplier_edits?: boolean
          theme?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          contact_name: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          organization_id: string
          phone: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          contact_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_id?: string
          phone?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          organization_id: string
          pending_transfer_to: string | null
          related_item_name: string | null
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          organization_id?: string
          pending_transfer_to?: string | null
          related_item_name?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          organization_id?: string
          pending_transfer_to?: string | null
          related_item_name?: string | null
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_pending_transfer_to_fkey"
            columns: ["pending_transfer_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_task_transfer: { Args: { task_id: string }; Returns: undefined }
      admin_approve_member: { Args: { target_id: string }; Returns: undefined }
      admin_set_user_role: {
        Args: {
          new_role: Database["public"]["Enums"]["user_role"]
          target_id: string
        }
        Returns: undefined
      }
      apply_audit_count: {
        Args: { audit_count_id: string }
        Returns: undefined
      }
      approve_item_retirement: { Args: { item_id: string }; Returns: undefined }
      cancel_inventory_audit: { Args: { audit_id: string }; Returns: undefined }
      cancel_inventory_item_order: {
        Args: { order_id: string }
        Returns: undefined
      }
      cancel_item_retirement_request: {
        Args: { item_id: string }
        Returns: undefined
      }
      cancel_reservation: {
        Args: { reservation_id: string }
        Returns: undefined
      }
      cancel_task_transfer: { Args: { task_id: string }; Returns: undefined }
      complete_inventory_audit: {
        Args: { audit_id: string }
        Returns: undefined
      }
      create_audit_schedule: {
        Args: {
          p_first_occurrence_date?: string
          p_frequency?: string
          p_note?: string
          p_physical_location?: string
        }
        Returns: string
      }
      create_broadcast: {
        Args: {
          p_item_ids?: string[]
          p_member_ids?: string[]
          p_message: string
          p_title: string
        }
        Returns: string
      }
      create_reservation: {
        Args: {
          end_date: string
          group_id?: string
          item_id: string
          note?: string
          quantity: number
          reserved_for: string
          start_date: string
        }
        Returns: string
      }
      current_org_requires_mfa: { Args: never; Returns: boolean }
      current_user_org_id: { Args: never; Returns: string }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      decline_item_retirement: { Args: { item_id: string }; Returns: undefined }
      decline_task_transfer: { Args: { task_id: string }; Returns: undefined }
      end_current_impersonation: { Args: never; Returns: undefined }
      get_inventory_photo_storage_usage: { Args: never; Returns: number }
      get_item_upcoming_reservations: {
        Args: { p_item_id: string }
        Returns: {
          cancelled_at: string | null
          cancelled_by: string | null
          end_date: string
          id: string
          item_id: string
          note: string | null
          picked_up_at: string | null
          picked_up_by: string | null
          quantity: number
          reservation_group_id: string | null
          reserved_at: string
          reserved_by: string | null
          reserved_for: string
          returned_at: string | null
          returned_by: string | null
          start_date: string
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "inventory_item_reservations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      is_platform_admin: { Args: never; Returns: boolean }
      log_client_error: {
        Args: {
          p_app_env?: string
          p_message: string
          p_stack?: string
          p_url?: string
          p_user_agent?: string
        }
        Returns: undefined
      }
      mark_reservation_picked_up: {
        Args: { reservation_id: string }
        Returns: undefined
      }
      mark_reservation_returned: {
        Args: { reservation_id: string }
        Returns: undefined
      }
      notify_overdue_checkouts: { Args: never; Returns: undefined }
      platform_end_impersonation_session: {
        Args: { session_id: string }
        Returns: undefined
      }
      platform_get_organization_usage: {
        Args: { p_organization_id?: string }
        Returns: {
          broadcast_count: number
          completed_audit_count: number
          container_count: number
          item_count: number
          member_count: number
          order_count: number
          organization_id: string
          reservation_count: number
          storage_bytes: number
          task_count: number
        }[]
      }
      platform_lock_user_account: {
        Args: { reason?: string; target_id: string }
        Returns: undefined
      }
      platform_restore_organization: {
        Args: { org_id: string }
        Returns: undefined
      }
      platform_retire_organization: {
        Args: { org_id: string }
        Returns: undefined
      }
      platform_suspend_organization: {
        Args: { org_id: string; reason?: string }
        Returns: undefined
      }
      platform_unlock_user_account: {
        Args: { target_id: string }
        Returns: undefined
      }
      platform_unsuspend_organization: {
        Args: { org_id: string }
        Returns: undefined
      }
      profile_display_name: { Args: { target_id: string }; Returns: string }
      purge_expired_organizations: { Args: never; Returns: undefined }
      receive_inventory_item_order: {
        Args: { order_id: string }
        Returns: undefined
      }
      request_item_retirement: {
        Args: { item_id: string; note?: string }
        Returns: undefined
      }
      request_task_transfer: {
        Args: { target_id: string; task_id: string }
        Returns: undefined
      }
      run_scheduled_inventory_audits: { Args: never; Returns: undefined }
      set_audit_schedule_active: {
        Args: { p_active: boolean; p_schedule_id: string }
        Returns: undefined
      }
      set_audit_team: {
        Args: {
          p_audit_id: string
          p_lead_id?: string
          p_support_ids?: string[]
        }
        Returns: undefined
      }
      set_inventory_item_lock: {
        Args: { item_id: string; locked: boolean }
        Returns: undefined
      }
      start_inventory_audit: {
        Args: { p_note?: string; p_physical_location?: string }
        Returns: string
      }
      submit_audit_count: {
        Args: {
          audit_count_id: string
          p_counted_quantity: number
          p_note?: string
        }
        Returns: undefined
      }
      update_audit_schedule: {
        Args: {
          p_frequency?: string
          p_note?: string
          p_physical_location?: string
          p_schedule_id: string
        }
        Returns: undefined
      }
      update_task_status: {
        Args: {
          new_status: Database["public"]["Enums"]["task_status"]
          task_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      membership_status: "pending" | "approved"
      notification_kind:
        | "task_assigned"
        | "task_transfer"
        | "retirement_request"
        | "join_request"
        | "broadcast"
        | "checkout_overdue"
        | "impersonation_started"
        | "feedback"
      task_status: "todo" | "in_progress" | "done"
      user_role: "admin" | "manager" | "staff"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      membership_status: ["pending", "approved"],
      notification_kind: [
        "task_assigned",
        "task_transfer",
        "retirement_request",
        "join_request",
        "broadcast",
        "checkout_overdue",
        "impersonation_started",
        "feedback",
      ],
      task_status: ["todo", "in_progress", "done"],
      user_role: ["admin", "manager", "staff"],
    },
  },
} as const
