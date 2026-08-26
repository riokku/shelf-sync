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
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          message: string
          organization_id?: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          message?: string
          organization_id?: string
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
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          message: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          message?: string
          user_id?: string | null
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
      notifications: {
        Row: {
          created_at: string
          id: string
          kind: string
          link: string
          message: string
          organization_id: string
          read_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          link: string
          message: string
          organization_id: string
          read_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
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
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_key: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          last_active_at: string | null
          membership_status: Database["public"]["Enums"]["membership_status"]
          nickname: string | null
          organization_id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_key?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          last_active_at?: string | null
          membership_status?: Database["public"]["Enums"]["membership_status"]
          nickname?: string | null
          organization_id: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_key?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          last_active_at?: string | null
          membership_status?: Database["public"]["Enums"]["membership_status"]
          nickname?: string | null
          organization_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey"
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
          notify_join_request: boolean
          notify_retirement_request: boolean
          notify_task_assigned: boolean
          notify_task_transfer: boolean
          organization_id: string
          require_retirement_approval: boolean
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
          notify_join_request?: boolean
          notify_retirement_request?: boolean
          notify_task_assigned?: boolean
          notify_task_transfer?: boolean
          organization_id: string
          require_retirement_approval?: boolean
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
          notify_join_request?: boolean
          notify_retirement_request?: boolean
          notify_task_assigned?: boolean
          notify_task_transfer?: boolean
          organization_id?: string
          require_retirement_approval?: boolean
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
      approve_item_retirement: { Args: { item_id: string }; Returns: undefined }
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
      create_reservation: {
        Args: {
          end_date: string
          item_id: string
          note?: string
          quantity: number
          reserved_for: string
          start_date: string
        }
        Returns: string
      }
      current_user_org_id: { Args: never; Returns: string }
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      decline_item_retirement: { Args: { item_id: string }; Returns: undefined }
      decline_task_transfer: { Args: { task_id: string }; Returns: undefined }
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
      set_inventory_item_lock: {
        Args: { item_id: string; locked: boolean }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      task_status: ["todo", "in_progress", "done"],
      user_role: ["admin", "manager", "staff"],
    },
  },
} as const
