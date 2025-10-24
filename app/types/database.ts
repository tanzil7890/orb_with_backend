// Database types for all tables
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string;
          clerk_user_id: string;
          email: string | null;
          first_name: string | null;
          last_name: string | null;
          image_url: string | null;
          last_login_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clerk_user_id: string;
          email?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          image_url?: string | null;
          last_login_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clerk_user_id?: string;
          email?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          image_url?: string | null;
          last_login_at?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      projects: {
        Row: {
          id: string;
          clerk_user_id: string;
          url_id: string;
          title: string;
          description: string | null;
          git_url: string | null;
          git_branch: string | null;
          netlify_site_id: string | null;
          last_opened_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          clerk_user_id: string;
          url_id: string;
          title?: string;
          description?: string | null;
          git_url?: string | null;
          git_branch?: string | null;
          netlify_site_id?: string | null;
          last_opened_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          clerk_user_id?: string;
          url_id?: string;
          title?: string;
          description?: string | null;
          git_url?: string | null;
          git_branch?: string | null;
          netlify_site_id?: string | null;
          last_opened_at?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      chat_messages: {
        Row: {
          id: string;
          project_id: string;
          message_id: string;
          role: 'user' | 'assistant' | 'system';
          content: string;
          parts: Json | null;
          tool_calls: Json | null;
          annotations: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          message_id: string;
          role: 'user' | 'assistant' | 'system';
          content: string;
          parts?: Json | null;
          tool_calls?: Json | null;
          annotations?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          message_id?: string;
          role?: 'user' | 'assistant' | 'system';
          content?: string;
          parts?: Json | null;
          tool_calls?: Json | null;
          annotations?: Json | null;
          created_at?: string;
        };
      };
      project_files: {
        Row: {
          id: string;
          project_id: string;
          file_path: string;
          content: string | null;
          file_type: 'text' | 'binary';
          mime_type: string | null;
          size_bytes: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          file_path: string;
          content?: string | null;
          file_type?: 'text' | 'binary';
          mime_type?: string | null;
          size_bytes?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          file_path?: string;
          content?: string | null;
          file_type?: 'text' | 'binary';
          mime_type?: string | null;
          size_bytes?: number | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      workbench_states: {
        Row: {
          id: string;
          project_id: string;
          selected_file: string | null;
          open_files: Json;
          current_view: 'code' | 'diff' | 'preview' | null;
          show_workbench: boolean;
          terminal_history: Json;
          preview_urls: Json;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          selected_file?: string | null;
          open_files?: Json;
          current_view?: 'code' | 'diff' | 'preview' | null;
          show_workbench?: boolean;
          terminal_history?: Json;
          preview_urls?: Json;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          selected_file?: string | null;
          open_files?: Json;
          current_view?: 'code' | 'diff' | 'preview' | null;
          show_workbench?: boolean;
          terminal_history?: Json;
          preview_urls?: Json;
          updated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}

// Convenience types for user profiles
export type UserProfile = Database['public']['Tables']['user_profiles']['Row'];
export type UserProfileInsert = Database['public']['Tables']['user_profiles']['Insert'];
export type UserProfileUpdate = Database['public']['Tables']['user_profiles']['Update'];

// Convenience types for projects
export type Project = Database['public']['Tables']['projects']['Row'];
export type ProjectInsert = Database['public']['Tables']['projects']['Insert'];
export type ProjectUpdate = Database['public']['Tables']['projects']['Update'];

// Convenience types for chat messages
export type ChatMessage = Database['public']['Tables']['chat_messages']['Row'];
export type ChatMessageInsert = Database['public']['Tables']['chat_messages']['Insert'];
export type ChatMessageUpdate = Database['public']['Tables']['chat_messages']['Update'];

// Convenience types for project files
export type ProjectFile = Database['public']['Tables']['project_files']['Row'];
export type ProjectFileInsert = Database['public']['Tables']['project_files']['Insert'];
export type ProjectFileUpdate = Database['public']['Tables']['project_files']['Update'];

// Convenience types for workbench states
export type WorkbenchState = Database['public']['Tables']['workbench_states']['Row'];
export type WorkbenchStateInsert = Database['public']['Tables']['workbench_states']['Insert'];
export type WorkbenchStateUpdate = Database['public']['Tables']['workbench_states']['Update'];
