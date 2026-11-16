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
      ai_recommendations: {
        Row: {
          email: string
          suggestions: string
        }
        Insert: {
          email: string
          suggestions: string
        }
        Update: {
          email?: string
          suggestions?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          auto_send: boolean
          created_at: string | null
          email: string
          id: string
          learned_patterns_enabled: boolean
          preferences_ai_enabled: boolean
        }
        Insert: {
          auto_send?: boolean
          created_at?: string | null
          email: string
          id?: string
          learned_patterns_enabled?: boolean
          preferences_ai_enabled?: boolean
        }
        Update: {
          auto_send?: boolean
          created_at?: string | null
          email?: string
          id?: string
          learned_patterns_enabled?: boolean
          preferences_ai_enabled?: boolean
        }
        Relationships: []
      }
      correction_clusters: {
        Row: {
          centroid: string
          client_email: string
          id: number
          member_count: number
          rule: string | null
          rule_locked: boolean
          rule_written_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          centroid: string
          client_email: string
          id?: never
          member_count?: number
          rule?: string | null
          rule_locked?: boolean
          rule_written_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          centroid?: string
          client_email?: string
          id?: never
          member_count?: number
          rule?: string | null
          rule_locked?: boolean
          rule_written_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "correction_clusters_client_email_fkey"
            columns: ["client_email"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["email"]
          },
        ]
      }
      documents: {
        Row: {
          client_email: string | null
          content: string | null
          embedding: string | null
          id: number
          metadata: Json | null
        }
        Insert: {
          client_email?: string | null
          content?: string | null
          embedding?: string | null
          id?: number
          metadata?: Json | null
        }
        Update: {
          client_email?: string | null
          content?: string | null
          embedding?: string | null
          id?: number
          metadata?: Json | null
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          ai_response: string | null
          client_email: string | null
          created_at: string | null
          final_response: string | null
          id: number
          incoming_message: string | null
          label: string | null
          message_id: string | null
          sender_email: string | null
          status: string | null
          subject: string | null
          thread_id: string | null
        }
        Insert: {
          ai_response?: string | null
          client_email?: string | null
          created_at?: string | null
          final_response?: string | null
          id?: number
          incoming_message?: string | null
          label?: string | null
          message_id?: string | null
          sender_email?: string | null
          status?: string | null
          subject?: string | null
          thread_id?: string | null
        }
        Update: {
          ai_response?: string | null
          client_email?: string | null
          created_at?: string | null
          final_response?: string | null
          id?: number
          incoming_message?: string | null
          label?: string | null
          message_id?: string | null
          sender_email?: string | null
          status?: string | null
          subject?: string | null
          thread_id?: string | null
        }
        Relationships: []
      }
      learned_patterns: {
        Row: {
          client_email: string
          created_at: string
          id: number
          rules: string
          source_count: number
        }
        Insert: {
          client_email: string
          created_at?: string
          id?: never
          rules: string
          source_count: number
        }
        Update: {
          client_email?: string
          created_at?: string
          id?: never
          rules?: string
          source_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "learned_patterns_client_email_fkey"
            columns: ["client_email"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["email"]
          },
        ]
      }
      login_logs: {
        Row: {
          created_at: string
          email: string
          event_type: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          event_type?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          event_type?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      policy_requests: {
        Row: {
          created_at: string
          id: number
          request_details: string
          status: string
          user_email: string
        }
        Insert: {
          created_at?: string
          id?: number
          request_details: string
          status?: string
          user_email: string
        }
        Update: {
          created_at?: string
          id?: number
          request_details?: string
          status?: string
          user_email?: string
        }
        Relationships: []
      }
      reply_corrections: {
        Row: {
          ai_draft: string
          client_email: string
          cluster_id: number | null
          correction_note: string | null
          created_at: string
          email_log_id: number | null
          embedding: string | null
          final_sent: string
          id: number
          note_embedding: string | null
          source: string
          thread_id: string | null
        }
        Insert: {
          ai_draft: string
          client_email: string
          cluster_id?: number | null
          correction_note?: string | null
          created_at?: string
          email_log_id?: number | null
          embedding?: string | null
          final_sent: string
          id?: never
          note_embedding?: string | null
          source?: string
          thread_id?: string | null
        }
        Update: {
          ai_draft?: string
          client_email?: string
          cluster_id?: number | null
          correction_note?: string | null
          created_at?: string
          email_log_id?: number | null
          embedding?: string | null
          final_sent?: string
          id?: never
          note_embedding?: string | null
          source?: string
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reply_corrections_client_email_fkey"
            columns: ["client_email"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["email"]
          },
          {
            foreignKeyName: "reply_corrections_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "correction_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reply_corrections_email_log_id_fkey"
            columns: ["email_log_id"]
            isOneToOne: false
            referencedRelation: "email_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      thread_messages: {
        Row: {
          body: string
          client_email: string
          created_at: string
          direction: string
          id: number
          message_id: string | null
          sender_email: string | null
          thread_id: string
        }
        Insert: {
          body: string
          client_email: string
          created_at?: string
          direction: string
          id?: never
          message_id?: string | null
          sender_email?: string | null
          thread_id: string
        }
        Update: {
          body?: string
          client_email?: string
          created_at?: string
          direction?: string
          id?: never
          message_id?: string | null
          sender_email?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "thread_messages_client_email_fkey"
            columns: ["client_email"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["email"]
          },
        ]
      }
      waitlist_signups: {
        Row: {
          created_at: string
          current_products: string | null
          email: string
          id: string
          module_interest: string
        }
        Insert: {
          created_at?: string
          current_products?: string | null
          email: string
          id?: string
          module_interest: string
        }
        Update: {
          created_at?: string
          current_products?: string | null
          email?: string
          id?: string
          module_interest?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_standing_rules: {
        Args: { target_client_email: string }
        Returns: {
          rule: string
        }[]
      }
      match_documents: {
        Args: { filter?: Json; match_count?: number; query_embedding: string }
        Returns: {
          content: string
          embedding: string
          id: number
          metadata: Json
          similarity: number
        }[]
      }
      match_reply_corrections: {
        Args: {
          match_client_email: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          correction_note: string
          id: number
          similarity: number
          thread_id: string
        }[]
      }
      prune_duplicate_corrections: {
        Args: { sim_threshold?: number; target_client_email: string }
        Returns: number
      }
      prune_learned_patterns: {
        Args: { p_client_email: string; p_keep?: number }
        Returns: undefined
      }
      report_clusters: {
        Args: { target_client_email: string }
        Returns: {
          cluster_id: number
          member_count: number
          rule: string
          rule_locked: boolean
          rule_written_at: string
          status: string
          updated_at: string
        }[]
      }
      report_duplicate_corrections: {
        Args: { sim_threshold?: number; target_client_email: string }
        Returns: {
          newer_id: number
          newer_note: string
          older_id: number
          older_note: string
          similarity: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
