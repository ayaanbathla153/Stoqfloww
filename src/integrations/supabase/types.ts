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
  public: {
    Tables: {
      complaints: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string | null
          media_url: string | null
          product_id: string | null
          quantity: number | null
          reason: string | null
          retailer_id: string
          status: Database["public"]["Enums"]["complaint_status"]
          supplier_id: string
          type: Database["public"]["Enums"]["complaint_type"]
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id?: string | null
          media_url?: string | null
          product_id?: string | null
          quantity?: number | null
          reason?: string | null
          retailer_id: string
          status?: Database["public"]["Enums"]["complaint_status"]
          supplier_id: string
          type?: Database["public"]["Enums"]["complaint_type"]
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string | null
          media_url?: string | null
          product_id?: string | null
          quantity?: number | null
          reason?: string | null
          retailer_id?: string
          status?: Database["public"]["Enums"]["complaint_status"]
          supplier_id?: string
          type?: Database["public"]["Enums"]["complaint_type"]
        }
        Relationships: [
          {
            foreignKeyName: "complaints_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_logs: {
        Row: {
          change_type: Database["public"]["Enums"]["inventory_change_type"]
          created_at: string
          id: string
          linked_invoice_id: string | null
          note: string | null
          product_id: string
          quantity: number
          retailer_id: string | null
          supplier_id: string
        }
        Insert: {
          change_type: Database["public"]["Enums"]["inventory_change_type"]
          created_at?: string
          id?: string
          linked_invoice_id?: string | null
          note?: string | null
          product_id: string
          quantity: number
          retailer_id?: string | null
          supplier_id: string
        }
        Update: {
          change_type?: Database["public"]["Enums"]["inventory_change_type"]
          created_at?: string
          id?: string
          linked_invoice_id?: string | null
          note?: string | null
          product_id?: string
          quantity?: number
          retailer_id?: string | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_logs_linked_invoice_id_fkey"
            columns: ["linked_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_logs_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_counters: {
        Row: {
          day: string
          last_seq: number
          supplier_id: string
        }
        Insert: {
          day: string
          last_seq?: number
          supplier_id: string
        }
        Update: {
          day?: string
          last_seq?: number
          supplier_id?: string
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          final_qty: number
          id: string
          invoice_id: string
          price: number
          product_id: string
        }
        Insert: {
          final_qty: number
          id?: string
          invoice_id: string
          price: number
          product_id: string
        }
        Update: {
          final_qty?: number
          id?: string
          invoice_id?: string
          price?: number
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_invoices_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_products_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          delivered_at: string | null
          finalized_at: string | null
          id: string
          invoice_number: string
          kind: string
          order_id: string | null
          pdf_url: string | null
          retailer_id: string
          short_code: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          supplier_id: string
          total_amount: number
        }
        Insert: {
          created_at?: string
          delivered_at?: string | null
          finalized_at?: string | null
          id?: string
          invoice_number: string
          kind?: string
          order_id?: string | null
          pdf_url?: string | null
          retailer_id: string
          short_code?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          supplier_id: string
          total_amount?: number
        }
        Update: {
          created_at?: string
          delivered_at?: string | null
          finalized_at?: string | null
          id?: string
          invoice_number?: string
          kind?: string
          order_id?: string | null
          pdf_url?: string | null
          retailer_id?: string
          short_code?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          supplier_id?: string
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_orders_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_retailer_id_profiles_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_supplier_id_profiles_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          approved_qty: number | null
          id: string
          order_id: string
          product_id: string
          requested_qty: number
        }
        Insert: {
          approved_qty?: number | null
          id?: string
          order_id: string
          product_id: string
          requested_qty: number
        }
        Update: {
          approved_qty?: number | null
          id?: string
          order_id?: string
          product_id?: string
          requested_qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_orders_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_products_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          created_by: string
          id: string
          notes: string | null
          retailer_id: string
          status: Database["public"]["Enums"]["order_status"]
          supplier_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          retailer_id: string
          status?: Database["public"]["Enums"]["order_status"]
          supplier_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          retailer_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_created_by_profiles_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_retailer_id_profiles_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_supplier_id_profiles_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments_ledger: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          id: string
          note: string | null
          reference_invoice_id: string | null
          retailer_id: string
          supplier_id: string
          type: Database["public"]["Enums"]["ledger_entry_type"]
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          id?: string
          note?: string | null
          reference_invoice_id?: string | null
          retailer_id: string
          supplier_id: string
          type: Database["public"]["Enums"]["ledger_entry_type"]
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          id?: string
          note?: string | null
          reference_invoice_id?: string | null
          retailer_id?: string
          supplier_id?: string
          type?: Database["public"]["Enums"]["ledger_entry_type"]
        }
        Relationships: [
          {
            foreignKeyName: "payments_ledger_reference_invoice_id_fkey"
            columns: ["reference_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_ledger_reference_invoice_id_invoices_fkey"
            columns: ["reference_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_ledger_retailer_id_profiles_fkey"
            columns: ["retailer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_ledger_supplier_id_profiles_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          created_at: string
          id: string
          low_stock_threshold: number
          name: string
          price: number
          supplier_id: string
          supplier_stock: number
          unit: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          id?: string
          low_stock_threshold?: number
          name: string
          price?: number
          supplier_id: string
          supplier_stock?: number
          unit?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          id?: string
          low_stock_threshold?: number
          name?: string
          price?: number
          supplier_id?: string
          supplier_stock?: number
          unit?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_role: Database["public"]["Enums"]["app_role"] | null
          created_at: string
          id: string
          linked_supplier_id: string | null
          name: string
          phone: string
          shop_name: string | null
          updated_at: string
        }
        Insert: {
          active_role?: Database["public"]["Enums"]["app_role"] | null
          created_at?: string
          id: string
          linked_supplier_id?: string | null
          name: string
          phone: string
          shop_name?: string | null
          updated_at?: string
        }
        Update: {
          active_role?: Database["public"]["Enums"]["app_role"] | null
          created_at?: string
          id?: string
          linked_supplier_id?: string | null
          name?: string
          phone?: string
          shop_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      refill_predictions: {
        Row: {
          confidence: string | null
          created_at: string
          id: string
          meta: Json
          predicted_refill_date: string | null
          product_id: string
          retailer_id: string
          supplier_id: string
        }
        Insert: {
          confidence?: string | null
          created_at?: string
          id?: string
          meta?: Json
          predicted_refill_date?: string | null
          product_id: string
          retailer_id: string
          supplier_id: string
        }
        Update: {
          confidence?: string | null
          created_at?: string
          id?: string
          meta?: Json
          predicted_refill_date?: string | null
          product_id?: string
          retailer_id?: string
          supplier_id?: string
        }
        Relationships: []
      }
      retailer_inventory: {
        Row: {
          avg_daily_sales: number
          id: string
          last_verified_at: string | null
          last_verified_qty: number | null
          product_id: string
          retailer_id: string
          stock_quantity: number
          updated_at: string
        }
        Insert: {
          avg_daily_sales?: number
          id?: string
          last_verified_at?: string | null
          last_verified_qty?: number | null
          product_id: string
          retailer_id: string
          stock_quantity?: number
          updated_at?: string
        }
        Update: {
          avg_daily_sales?: number
          id?: string
          last_verified_at?: string | null
          last_verified_qty?: number | null
          product_id?: string
          retailer_id?: string
          stock_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "retailer_inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_verifications: {
        Row: {
          anomaly: string | null
          avg_daily_sales: number
          closing_stock: number
          cycle_days: number
          delivered_qty: number
          estimated_sales: number | null
          id: string
          meta: Json
          note: string | null
          opening_stock: number
          product_id: string
          retailer_id: string
          returned_qty: number
          supplier_id: string
          verified_at: string
          verified_by: string
        }
        Insert: {
          anomaly?: string | null
          avg_daily_sales?: number
          closing_stock?: number
          cycle_days?: number
          delivered_qty?: number
          estimated_sales?: number | null
          id?: string
          meta?: Json
          note?: string | null
          opening_stock?: number
          product_id: string
          retailer_id: string
          returned_qty?: number
          supplier_id: string
          verified_at?: string
          verified_by: string
        }
        Update: {
          anomaly?: string | null
          avg_daily_sales?: number
          closing_stock?: number
          cycle_days?: number
          delivered_qty?: number
          estimated_sales?: number | null
          id?: string
          meta?: Json
          note?: string | null
          opening_stock?: number
          product_id?: string
          retailer_id?: string
          returned_qty?: number
          supplier_id?: string
          verified_at?: string
          verified_by?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      find_supplier_by_phone: { Args: { _phone: string }; Returns: string }
      get_linked_supplier: { Args: { _user_id: string }; Returns: string }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_supplier_for_retailer: {
        Args: { _retailer_id: string; _supplier_id: string }
        Returns: boolean
      }
      next_invoice_number: { Args: { _supplier: string }; Returns: string }
    }
    Enums: {
      app_role: "supplier" | "retailer" | "staff"
      complaint_status: "open" | "resolved"
      complaint_type: "defect" | "return"
      inventory_change_type: "in" | "out"
      invoice_status: "pending_delivery" | "delivered" | "disputed"
      ledger_entry_type: "invoice" | "payment"
      order_status:
        | "pending"
        | "approved"
        | "modified"
        | "rejected"
        | "confirmed"
        | "invoiced"
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
  public: {
    Enums: {
      app_role: ["supplier", "retailer", "staff"],
      complaint_status: ["open", "resolved"],
      complaint_type: ["defect", "return"],
      inventory_change_type: ["in", "out"],
      invoice_status: ["pending_delivery", "delivered", "disputed"],
      ledger_entry_type: ["invoice", "payment"],
      order_status: [
        "pending",
        "approved",
        "modified",
        "rejected",
        "confirmed",
        "invoiced",
      ],
    },
  },
} as const
