export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      leads: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string;
          name: string;
          email: string;
          phone: string;
          address: string | null;
          property_type: string;
          island: string;
          roof_type: string;
          installation_timeline: string;
          monthly_bill: number;
          estimated_savings_monthly: number | null;
          estimated_savings_annual: number | null;
          estimated_subsidy: number | null;
          status: string;
          assigned_installer_id: string | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          name: string;
          email: string;
          phone: string;
          address?: string | null;
          property_type: string;
          island: string;
          roof_type: string;
          installation_timeline: string;
          monthly_bill: number;
          estimated_savings_monthly?: number | null;
          estimated_savings_annual?: number | null;
          estimated_subsidy?: number | null;
          status?: string;
          assigned_installer_id?: string | null;
          notes?: string | null;
        };
        Update: {
          id?: string;
          created_at?: string;
          updated_at?: string;
          name?: string;
          email?: string;
          phone?: string;
          address?: string | null;
          property_type?: string;
          island?: string;
          roof_type?: string;
          installation_timeline?: string;
          monthly_bill?: number;
          estimated_savings_monthly?: number | null;
          estimated_savings_annual?: number | null;
          estimated_subsidy?: number | null;
          status?: string;
          assigned_installer_id?: string | null;
          notes?: string | null;
        };
      };
      installers: {
        Row: {
          id: string;
          user_id: string;
          company_name: string;
          contact_name: string;
          email: string;
          phone: string | null;
          islands: string[];
          is_active: boolean;
          role: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          company_name: string;
          contact_name: string;
          email: string;
          phone?: string | null;
          islands?: string[];
          is_active?: boolean;
          role?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          company_name?: string;
          contact_name?: string;
          email?: string;
          phone?: string | null;
          islands?: string[];
          is_active?: boolean;
          role?: string;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}

export type Lead = Database["public"]["Tables"]["leads"]["Row"];
export type LeadInsert = Database["public"]["Tables"]["leads"]["Insert"];
export type LeadUpdate = Database["public"]["Tables"]["leads"]["Update"];

export type Installer = Database["public"]["Tables"]["installers"]["Row"];
export type InstallerInsert = Database["public"]["Tables"]["installers"]["Insert"];
