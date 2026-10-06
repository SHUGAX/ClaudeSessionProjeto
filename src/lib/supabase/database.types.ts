export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      alerts: {
        Row: {
          created_at: string;
          dedupe_key: string;
          dismissed_at: string | null;
          dismissed_by: string | null;
          document_id: string | null;
          due_date: string | null;
          id: string;
          organization_id: string;
          resolved_at: string | null;
          status: Database["public"]["Enums"]["alert_status"];
          type: Database["public"]["Enums"]["alert_type"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          dedupe_key: string;
          dismissed_at?: string | null;
          dismissed_by?: string | null;
          document_id?: string | null;
          due_date?: string | null;
          id?: string;
          organization_id: string;
          resolved_at?: string | null;
          status?: Database["public"]["Enums"]["alert_status"];
          type: Database["public"]["Enums"]["alert_type"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          dedupe_key?: string;
          dismissed_at?: string | null;
          dismissed_by?: string | null;
          document_id?: string | null;
          due_date?: string | null;
          id?: string;
          organization_id?: string;
          resolved_at?: string | null;
          status?: Database["public"]["Enums"]["alert_status"];
          type?: Database["public"]["Enums"]["alert_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "alerts_dismissed_by_fkey";
            columns: ["dismissed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "alerts_document_id_organization_id_fkey";
            columns: ["document_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "alerts_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      audit_logs: {
        Row: {
          action: string;
          actor_type: string;
          actor_user_id: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string;
          id: string;
          metadata: NonNullable<Json>;
          new_values: Json | null;
          old_values: Json | null;
          organization_id: string | null;
        };
        Insert: {
          action: string;
          actor_type?: string;
          actor_user_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type: string;
          id?: string;
          metadata?: NonNullable<Json>;
          new_values?: Json | null;
          old_values?: Json | null;
          organization_id?: string | null;
        };
        Update: {
          action?: string;
          actor_type?: string;
          actor_user_id?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string;
          id?: string;
          metadata?: NonNullable<Json>;
          new_values?: Json | null;
          old_values?: Json | null;
          organization_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey";
            columns: ["actor_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_logs_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          code: string | null;
          created_at: string;
          created_by: string | null;
          id: string;
          name: string;
          organization_id: string;
          updated_at: string;
        };
        Insert: {
          code?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name: string;
          organization_id: string;
          updated_at?: string;
        };
        Update: {
          code?: string | null;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          name?: string;
          organization_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "categories_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      document_extractions: {
        Row: {
          confidence: Json | null;
          created_at: string;
          document_id: string;
          error_code: string | null;
          error_message: string | null;
          id: string;
          input_tokens: number | null;
          model: string;
          organization_id: string;
          output_tokens: number | null;
          processing_duration_ms: number | null;
          prompt_version: string;
          provider: string;
          raw_response: Json | null;
          schema_version: string;
          status: string;
          structured_data: Json | null;
          triggered_by: string | null;
        };
        Insert: {
          confidence?: Json | null;
          created_at?: string;
          document_id: string;
          error_code?: string | null;
          error_message?: string | null;
          id?: string;
          input_tokens?: number | null;
          model: string;
          organization_id: string;
          output_tokens?: number | null;
          processing_duration_ms?: number | null;
          prompt_version: string;
          provider: string;
          raw_response?: Json | null;
          schema_version: string;
          status: string;
          structured_data?: Json | null;
          triggered_by?: string | null;
        };
        Update: {
          confidence?: Json | null;
          created_at?: string;
          document_id?: string;
          error_code?: string | null;
          error_message?: string | null;
          id?: string;
          input_tokens?: number | null;
          model?: string;
          organization_id?: string;
          output_tokens?: number | null;
          processing_duration_ms?: number | null;
          prompt_version?: string;
          provider?: string;
          raw_response?: Json | null;
          schema_version?: string;
          status?: string;
          structured_data?: Json | null;
          triggered_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "document_extractions_document_id_organization_id_fkey";
            columns: ["document_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "document_extractions_triggered_by_fkey";
            columns: ["triggered_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      document_line_items: {
        Row: {
          created_at: string;
          description: string | null;
          document_id: string;
          id: string;
          line_total: number | null;
          organization_id: string;
          position: number;
          quantity: number | null;
          tax_amount: number | null;
          tax_rate: number | null;
          unit_price: number | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          document_id: string;
          id?: string;
          line_total?: number | null;
          organization_id: string;
          position: number;
          quantity?: number | null;
          tax_amount?: number | null;
          tax_rate?: number | null;
          unit_price?: number | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          document_id?: string;
          id?: string;
          line_total?: number | null;
          organization_id?: string;
          position?: number;
          quantity?: number | null;
          tax_amount?: number | null;
          tax_rate?: number | null;
          unit_price?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_line_items_document_id_organization_id_fkey";
            columns: ["document_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      document_status_history: {
        Row: {
          changed_by: string | null;
          created_at: string;
          document_id: string;
          from_status: Database["public"]["Enums"]["document_status"] | null;
          id: string;
          organization_id: string;
          to_status: Database["public"]["Enums"]["document_status"];
        };
        Insert: {
          changed_by?: string | null;
          created_at?: string;
          document_id: string;
          from_status?: Database["public"]["Enums"]["document_status"] | null;
          id?: string;
          organization_id: string;
          to_status: Database["public"]["Enums"]["document_status"];
        };
        Update: {
          changed_by?: string | null;
          created_at?: string;
          document_id?: string;
          from_status?: Database["public"]["Enums"]["document_status"] | null;
          id?: string;
          organization_id?: string;
          to_status?: Database["public"]["Enums"]["document_status"];
        };
        Relationships: [
          {
            foreignKeyName: "document_status_history_changed_by_fkey";
            columns: ["changed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_status_history_document_id_organization_id_fkey";
            columns: ["document_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      document_validation_events: {
        Row: {
          created_at: string;
          created_by: string | null;
          document_id: string;
          error_count: number;
          id: string;
          issues: NonNullable<Json>;
          organization_id: string;
          source: string;
          warning_count: number;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          document_id: string;
          error_count?: number;
          id?: string;
          issues?: NonNullable<Json>;
          organization_id: string;
          source: string;
          warning_count?: number;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          document_id?: string;
          error_count?: number;
          id?: string;
          issues?: NonNullable<Json>;
          organization_id?: string;
          source?: string;
          warning_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "document_validation_events_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "document_validation_events_document_id_organization_id_fkey";
            columns: ["document_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id", "organization_id"];
          },
        ];
      };
      documents: {
        Row: {
          archived_at: string | null;
          archived_by: string | null;
          category_id: string | null;
          created_at: string;
          currency: string;
          current_extraction_id: string | null;
          document_number: string | null;
          document_number_normalized: string | null;
          document_type: Database["public"]["Enums"]["document_type"];
          due_date: string | null;
          file_sha256: string | null;
          file_size: number | null;
          iban: string | null;
          id: string;
          issue_date: string | null;
          mime_type: string | null;
          notes: string | null;
          organization_id: string;
          original_filename: string;
          paid_at: string | null;
          payment_reference: string | null;
          possible_duplicate_of: string | null;
          processing_error: string | null;
          processing_started_at: string | null;
          processing_status: Database["public"]["Enums"]["processing_status"];
          purchase_order: string | null;
          review_status: Database["public"]["Enums"]["review_status"];
          status: Database["public"]["Enums"]["document_status"];
          storage_path: string;
          subtotal: number | null;
          supplier_id: string | null;
          supplier_name: string | null;
          supplier_tax_id: string | null;
          supplier_tax_id_normalized: string | null;
          tax_total: number | null;
          total: number | null;
          updated_at: string;
          updated_by: string | null;
          uploaded_by: string | null;
          validated_at: string | null;
          validated_by: string | null;
          validation_issues: NonNullable<Json>;
        };
        Insert: {
          archived_at?: string | null;
          archived_by?: string | null;
          category_id?: string | null;
          created_at?: string;
          currency?: string;
          current_extraction_id?: string | null;
          document_number?: string | null;
          document_number_normalized?: never;
          document_type?: Database["public"]["Enums"]["document_type"];
          due_date?: string | null;
          file_sha256?: string | null;
          file_size?: number | null;
          iban?: string | null;
          id?: string;
          issue_date?: string | null;
          mime_type?: string | null;
          notes?: string | null;
          organization_id: string;
          original_filename: string;
          paid_at?: string | null;
          payment_reference?: string | null;
          possible_duplicate_of?: string | null;
          processing_error?: string | null;
          processing_started_at?: string | null;
          processing_status?: Database["public"]["Enums"]["processing_status"];
          purchase_order?: string | null;
          review_status?: Database["public"]["Enums"]["review_status"];
          status?: Database["public"]["Enums"]["document_status"];
          storage_path: string;
          subtotal?: number | null;
          supplier_id?: string | null;
          supplier_name?: string | null;
          supplier_tax_id?: string | null;
          supplier_tax_id_normalized?: never;
          tax_total?: number | null;
          total?: number | null;
          updated_at?: string;
          updated_by?: string | null;
          uploaded_by?: string | null;
          validated_at?: string | null;
          validated_by?: string | null;
          validation_issues?: NonNullable<Json>;
        };
        Update: {
          archived_at?: string | null;
          archived_by?: string | null;
          category_id?: string | null;
          created_at?: string;
          currency?: string;
          current_extraction_id?: string | null;
          document_number?: string | null;
          document_number_normalized?: never;
          document_type?: Database["public"]["Enums"]["document_type"];
          due_date?: string | null;
          file_sha256?: string | null;
          file_size?: number | null;
          iban?: string | null;
          id?: string;
          issue_date?: string | null;
          mime_type?: string | null;
          notes?: string | null;
          organization_id?: string;
          original_filename?: string;
          paid_at?: string | null;
          payment_reference?: string | null;
          possible_duplicate_of?: string | null;
          processing_error?: string | null;
          processing_started_at?: string | null;
          processing_status?: Database["public"]["Enums"]["processing_status"];
          purchase_order?: string | null;
          review_status?: Database["public"]["Enums"]["review_status"];
          status?: Database["public"]["Enums"]["document_status"];
          storage_path?: string;
          subtotal?: number | null;
          supplier_id?: string | null;
          supplier_name?: string | null;
          supplier_tax_id?: string | null;
          supplier_tax_id_normalized?: never;
          tax_total?: number | null;
          total?: number | null;
          updated_at?: string;
          updated_by?: string | null;
          uploaded_by?: string | null;
          validated_at?: string | null;
          validated_by?: string | null;
          validation_issues?: NonNullable<Json>;
        };
        Relationships: [
          {
            foreignKeyName: "documents_archived_by_fkey";
            columns: ["archived_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_category_id_organization_id_fkey";
            columns: ["category_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "documents_current_extraction_fk";
            columns: ["current_extraction_id"];
            isOneToOne: false;
            referencedRelation: "document_extractions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_possible_duplicate_of_fkey";
            columns: ["possible_duplicate_of"];
            isOneToOne: false;
            referencedRelation: "documents";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_supplier_id_organization_id_fkey";
            columns: ["supplier_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "documents_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "documents_validated_by_fkey";
            columns: ["validated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          invited_by: string | null;
          organization_id: string;
          revoked_at: string | null;
          role: Database["public"]["Enums"]["member_role"];
          status: Database["public"]["Enums"]["invitation_status"];
          token_hash: string;
          updated_at: string;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email: string;
          expires_at: string;
          id?: string;
          invited_by?: string | null;
          organization_id: string;
          revoked_at?: string | null;
          role?: Database["public"]["Enums"]["member_role"];
          status?: Database["public"]["Enums"]["invitation_status"];
          token_hash: string;
          updated_at?: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          invited_by?: string | null;
          organization_id?: string;
          revoked_at?: string | null;
          role?: Database["public"]["Enums"]["member_role"];
          status?: Database["public"]["Enums"]["invitation_status"];
          token_hash?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invitations_accepted_by_fkey";
            columns: ["accepted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_members: {
        Row: {
          created_at: string;
          id: string;
          invited_at: string | null;
          invited_by: string | null;
          joined_at: string;
          organization_id: string;
          role: Database["public"]["Enums"]["member_role"];
          status: Database["public"]["Enums"]["membership_status"];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          invited_at?: string | null;
          invited_by?: string | null;
          joined_at?: string;
          organization_id: string;
          role?: Database["public"]["Enums"]["member_role"];
          status?: Database["public"]["Enums"]["membership_status"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          invited_at?: string | null;
          invited_by?: string | null;
          joined_at?: string;
          organization_id?: string;
          role?: Database["public"]["Enums"]["member_role"];
          status?: Database["public"]["Enums"]["membership_status"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_members_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_settings: {
        Row: {
          brand_color: string | null;
          created_at: string;
          default_currency: string;
          default_language: string;
          due_soon_days: number;
          organization_id: string;
          timezone: string;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          brand_color?: string | null;
          created_at?: string;
          default_currency?: string;
          default_language?: string;
          due_soon_days?: number;
          organization_id: string;
          timezone?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          brand_color?: string | null;
          created_at?: string;
          default_currency?: string;
          default_language?: string;
          due_soon_days?: number;
          organization_id?: string;
          timezone?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "organization_settings_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: true;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_settings_updated_by_fkey";
            columns: ["updated_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organization_usage: {
        Row: {
          ai_calls: number;
          ai_failures: number;
          documents_processed: number;
          documents_uploaded: number;
          organization_id: string;
          period: string;
          updated_at: string;
        };
        Insert: {
          ai_calls?: number;
          ai_failures?: number;
          documents_processed?: number;
          documents_uploaded?: number;
          organization_id: string;
          period: string;
          updated_at?: string;
        };
        Update: {
          ai_calls?: number;
          ai_failures?: number;
          documents_processed?: number;
          documents_uploaded?: number;
          organization_id?: string;
          period?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organization_usage_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          legal_name: string | null;
          logo_path: string | null;
          max_ai_calls_per_month: number | null;
          max_documents_per_month: number | null;
          max_storage_bytes: number | null;
          max_users: number | null;
          name: string;
          plan_id: string | null;
          slug: string;
          status: Database["public"]["Enums"]["organization_status"];
          suspended_at: string | null;
          suspended_reason: string | null;
          tax_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          legal_name?: string | null;
          logo_path?: string | null;
          max_ai_calls_per_month?: number | null;
          max_documents_per_month?: number | null;
          max_storage_bytes?: number | null;
          max_users?: number | null;
          name: string;
          plan_id?: string | null;
          slug: string;
          status?: Database["public"]["Enums"]["organization_status"];
          suspended_at?: string | null;
          suspended_reason?: string | null;
          tax_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          legal_name?: string | null;
          logo_path?: string | null;
          max_ai_calls_per_month?: number | null;
          max_documents_per_month?: number | null;
          max_storage_bytes?: number | null;
          max_users?: number | null;
          name?: string;
          plan_id?: string | null;
          slug?: string;
          status?: Database["public"]["Enums"]["organization_status"];
          suspended_at?: string | null;
          suspended_reason?: string | null;
          tax_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organizations_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      plans: {
        Row: {
          active: boolean;
          code: string;
          created_at: string;
          features: NonNullable<Json>;
          id: string;
          monthly_ai_limit: number | null;
          monthly_document_limit: number | null;
          name: string;
          storage_limit_bytes: number | null;
          updated_at: string;
          user_limit: number | null;
        };
        Insert: {
          active?: boolean;
          code: string;
          created_at?: string;
          features?: NonNullable<Json>;
          id?: string;
          monthly_ai_limit?: number | null;
          monthly_document_limit?: number | null;
          name: string;
          storage_limit_bytes?: number | null;
          updated_at?: string;
          user_limit?: number | null;
        };
        Update: {
          active?: boolean;
          code?: string;
          created_at?: string;
          features?: NonNullable<Json>;
          id?: string;
          monthly_ai_limit?: number | null;
          monthly_document_limit?: number | null;
          name?: string;
          storage_limit_bytes?: number | null;
          updated_at?: string;
          user_limit?: number | null;
        };
        Relationships: [];
      };
      platform_admins: {
        Row: {
          created_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_admins_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          email: string;
          full_name: string | null;
          id: string;
          preferred_language: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          full_name?: string | null;
          id: string;
          preferred_language?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          full_name?: string | null;
          id?: string;
          preferred_language?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      rate_limits: {
        Row: {
          count: number;
          key: string;
          window_start: string;
        };
        Insert: {
          count: number;
          key: string;
          window_start: string;
        };
        Update: {
          count?: number;
          key?: string;
          window_start?: string;
        };
        Relationships: [];
      };
      suppliers: {
        Row: {
          address: string | null;
          created_at: string;
          created_by: string | null;
          default_category_id: string | null;
          email: string | null;
          iban: string | null;
          id: string;
          legal_name: string | null;
          name: string;
          notes: string | null;
          organization_id: string;
          phone: string | null;
          tax_country: string | null;
          tax_id: string | null;
          tax_id_normalized: string | null;
          updated_at: string;
        };
        Insert: {
          address?: string | null;
          created_at?: string;
          created_by?: string | null;
          default_category_id?: string | null;
          email?: string | null;
          iban?: string | null;
          id?: string;
          legal_name?: string | null;
          name: string;
          notes?: string | null;
          organization_id: string;
          phone?: string | null;
          tax_country?: string | null;
          tax_id?: string | null;
          tax_id_normalized?: never;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          created_at?: string;
          created_by?: string | null;
          default_category_id?: string | null;
          email?: string | null;
          iban?: string | null;
          id?: string;
          legal_name?: string | null;
          name?: string;
          notes?: string | null;
          organization_id?: string;
          phone?: string | null;
          tax_country?: string | null;
          tax_id?: string | null;
          tax_id_normalized?: never;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "suppliers_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "suppliers_default_category_id_organization_id_fkey";
            columns: ["default_category_id", "organization_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id", "organization_id"];
          },
          {
            foreignKeyName: "suppliers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      check_rate_limit: {
        Args: { p_key: string; p_max: number; p_window_seconds: number };
        Returns: boolean;
      };
      dashboard_metrics: { Args: { p_org: string }; Returns: Json };
      get_tenant_public_info: {
        Args: { p_slug: string };
        Returns: {
          id: string;
          logo_path: string;
          name: string;
          slug: string;
          status: Database["public"]["Enums"]["organization_status"];
        }[];
      };
      has_org_role: {
        Args: { p_org: string; p_roles: Database["public"]["Enums"]["member_role"][] };
        Returns: boolean;
      };
      increment_usage: {
        Args: {
          p_ai_calls?: number;
          p_ai_failures?: number;
          p_documents_processed?: number;
          p_documents_uploaded?: number;
          p_org: string;
        };
        Returns: undefined;
      };
      is_end_user_request: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_org_member: { Args: { p_org: string }; Returns: boolean };
      is_platform_admin: { Args: Record<PropertyKey, never>; Returns: boolean };
      is_reserved_slug: { Args: { p_slug: string }; Returns: boolean };
      jwt_role: { Args: Record<PropertyKey, never>; Returns: string };
      my_memberships: {
        Args: Record<PropertyKey, never>;
        Returns: {
          logo_path: string;
          organization_id: string;
          organization_name: string;
          organization_slug: string;
          organization_status: Database["public"]["Enums"]["organization_status"];
          role: Database["public"]["Enums"]["member_role"];
        }[];
      };
      normalize_document_number: { Args: { p_value: string }; Returns: string };
      normalize_tax_id: { Args: { p_value: string }; Returns: string };
      organization_limits: {
        Args: { p_org: string };
        Returns: {
          active_users: number;
          ai_calls_this_month: number;
          documents_this_month: number;
          max_ai_calls_per_month: number;
          max_documents_per_month: number;
          max_storage_bytes: number;
          max_users: number;
          pending_invitations: number;
          storage_bytes: number;
        }[];
      };
      organization_overview: {
        Args: Record<PropertyKey, never>;
        Returns: {
          created_at: string;
          document_count: number;
          id: string;
          member_count: number;
          name: string;
          plan_name: string;
          slug: string;
          status: Database["public"]["Enums"]["organization_status"];
          storage_bytes: number;
        }[];
      };
      platform_stats: { Args: Record<PropertyKey, never>; Returns: Json };
      refresh_alerts: { Args: { p_org?: string }; Returns: number };
      replace_document_line_items: {
        Args: { p_document_id: string; p_items: Json };
        Returns: number;
      };
      shares_org_with: { Args: { p_user: string }; Returns: boolean };
      supplier_summaries: {
        Args: { p_org: string };
        Returns: {
          document_count: number;
          last_issue_date: string;
          supplier_id: string;
          total_amount: number;
        }[];
      };
      try_uuid: { Args: { p_value: string }; Returns: string };
      user_org_ids: {
        Args: { p_roles?: Database["public"]["Enums"]["member_role"][] };
        Returns: string[];
      };
    };
    Enums: {
      alert_status: "open" | "dismissed" | "resolved";
      alert_type:
        "due_soon" | "overdue" | "review_required" | "possible_duplicate" | "processing_failed";
      document_status:
        | "uploading"
        | "uploaded"
        | "processing"
        | "review_required"
        | "validated"
        | "failed"
        | "archived";
      document_type:
        | "invoice"
        | "receipt"
        | "credit_note"
        | "quotation"
        | "delivery_note"
        | "contract"
        | "other";
      invitation_status: "pending" | "accepted" | "revoked" | "expired";
      member_role: "owner" | "admin" | "manager" | "member" | "viewer";
      membership_status: "active" | "disabled";
      organization_status: "active" | "suspended";
      processing_status: "pending" | "processing" | "success" | "error";
      review_status: "pending" | "needs_review" | "validated";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      alert_status: ["open", "dismissed", "resolved"],
      alert_type: [
        "due_soon",
        "overdue",
        "review_required",
        "possible_duplicate",
        "processing_failed",
      ],
      document_status: [
        "uploading",
        "uploaded",
        "processing",
        "review_required",
        "validated",
        "failed",
        "archived",
      ],
      document_type: [
        "invoice",
        "receipt",
        "credit_note",
        "quotation",
        "delivery_note",
        "contract",
        "other",
      ],
      invitation_status: ["pending", "accepted", "revoked", "expired"],
      member_role: ["owner", "admin", "manager", "member", "viewer"],
      membership_status: ["active", "disabled"],
      organization_status: ["active", "suspended"],
      processing_status: ["pending", "processing", "success", "error"],
      review_status: ["pending", "needs_review", "validated"],
    },
  },
} as const;
