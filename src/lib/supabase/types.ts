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
      client_profiles: {
        Row: {
          id: string;
          lead_id: string | null;
          full_name: string;
          dni_nie: string;
          nationality: string | null;
          birth_date: string | null;
          phone: string | null;
          email: string | null;
          address: string;
          postal_code: string;
          municipality: string;
          province: string;
          island: string;
          property_address: string | null;
          property_postal_code: string | null;
          property_municipality: string | null;
          catastral_reference: string | null;
          property_type: string | null;
          property_use: string | null;
          property_surface_m2: number | null;
          iban: string | null;
          bank_name: string | null;
          account_holder: string | null;
          installation_power_kw: number | null;
          panel_count: number | null;
          panel_model: string | null;
          panel_power_w: number | null;
          inverter_model: string | null;
          inverter_power_kw: number | null;
          battery_model: string | null;
          battery_capacity_kwh: number | null;
          estimated_annual_production_kwh: number | null;
          total_cost: number | null;
          panel_cost: number | null;
          inverter_cost: number | null;
          battery_cost: number | null;
          installation_cost: number | null;
          other_costs: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lead_id?: string | null;
          full_name: string;
          dni_nie: string;
          nationality?: string | null;
          birth_date?: string | null;
          phone?: string | null;
          email?: string | null;
          address: string;
          postal_code: string;
          municipality: string;
          province?: string;
          island: string;
          property_address?: string | null;
          property_postal_code?: string | null;
          property_municipality?: string | null;
          catastral_reference?: string | null;
          property_type?: string | null;
          property_use?: string | null;
          property_surface_m2?: number | null;
          iban?: string | null;
          bank_name?: string | null;
          account_holder?: string | null;
          installation_power_kw?: number | null;
          panel_count?: number | null;
          panel_model?: string | null;
          panel_power_w?: number | null;
          inverter_model?: string | null;
          inverter_power_kw?: number | null;
          battery_model?: string | null;
          battery_capacity_kwh?: number | null;
          estimated_annual_production_kwh?: number | null;
          total_cost?: number | null;
          panel_cost?: number | null;
          inverter_cost?: number | null;
          battery_cost?: number | null;
          installation_cost?: number | null;
          other_costs?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["client_profiles"]["Insert"]>;
      };
      subsidy_applications: {
        Row: {
          id: string;
          lead_id: string | null;
          client_profile_id: string | null;
          installer_id: string | null;
          application_number: string | null;
          subsidy_type: string;
          status: string;
          requested_amount: number | null;
          approved_amount: number | null;
          submission_date: string | null;
          approval_date: string | null;
          payment_date: string | null;
          internal_notes: string | null;
          rejection_reason: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lead_id?: string | null;
          client_profile_id?: string | null;
          installer_id?: string | null;
          application_number?: string | null;
          subsidy_type?: string;
          status?: string;
          requested_amount?: number | null;
          approved_amount?: number | null;
          submission_date?: string | null;
          approval_date?: string | null;
          payment_date?: string | null;
          internal_notes?: string | null;
          rejection_reason?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["subsidy_applications"]["Insert"]>;
      };
      application_documents: {
        Row: {
          id: string;
          application_id: string;
          document_type_id: string;
          status: string;
          file_path: string | null;
          file_name: string | null;
          file_size: number | null;
          mime_type: string | null;
          is_auto_generated: boolean;
          generated_at: string | null;
          verified_by: string | null;
          verified_at: string | null;
          rejection_reason: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          application_id: string;
          document_type_id: string;
          status?: string;
          file_path?: string | null;
          file_name?: string | null;
          file_size?: number | null;
          mime_type?: string | null;
          is_auto_generated?: boolean;
          generated_at?: string | null;
          verified_by?: string | null;
          verified_at?: string | null;
          rejection_reason?: string | null;
          notes?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["application_documents"]["Insert"]>;
      };
      document_types: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          is_required: boolean;
          sort_order: number;
        };
        Insert: {
          id: string;
          name: string;
          description?: string | null;
          is_required?: boolean;
          sort_order?: number;
        };
        Update: Partial<Database["public"]["Tables"]["document_types"]["Insert"]>;
      };
      solar_assessments: {
        Row: {
          id: string;
          lead_id: string | null;
          address_input: string;
          business_segment: string;
          latitude: number | null;
          longitude: number | null;
          formatted_address: string | null;
          solar_api_status: string;
          raw_api_response: Record<string, unknown> | null;
          roof_area_m2: number | null;
          max_array_area_m2: number | null;
          panels_count: number | null;
          roof_segment_count: number | null;
          max_sunshine_hours_per_year: number | null;
          is_manual_fallback: boolean;
          manual_roof_area_m2: number | null;
          cadastral_reference: string | null;
          number_of_floors: number | null;
          pvgis_kwh_per_kwp: number | null;
          pvgis_optimal_angle: number | null;
          pvgis_raw_response: Record<string, unknown> | null;
          building_orientation: number | null;
          lifetime_production_kwh: number | null;
          lifetime_savings_eur: number | null;
          degradation_rate: number | null;
          system_size_kw: number;
          annual_production_kwh: number;
          annual_savings_eur: number;
          payback_years: number | null;
          electricity_price_eur: number;
          total_score: number;
          solar_potential_score: number;
          economic_potential_score: number;
          execution_simplicity_score: number;
          segment_fit_score: number;
          assessed_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lead_id?: string | null;
          address_input: string;
          business_segment: string;
          latitude?: number | null;
          longitude?: number | null;
          formatted_address?: string | null;
          solar_api_status: string;
          raw_api_response?: Record<string, unknown> | null;
          roof_area_m2?: number | null;
          max_array_area_m2?: number | null;
          panels_count?: number | null;
          roof_segment_count?: number | null;
          max_sunshine_hours_per_year?: number | null;
          is_manual_fallback?: boolean;
          manual_roof_area_m2?: number | null;
          cadastral_reference?: string | null;
          number_of_floors?: number | null;
          pvgis_kwh_per_kwp?: number | null;
          pvgis_optimal_angle?: number | null;
          pvgis_raw_response?: Record<string, unknown> | null;
          building_orientation?: number | null;
          lifetime_production_kwh?: number | null;
          lifetime_savings_eur?: number | null;
          degradation_rate?: number | null;
          system_size_kw: number;
          annual_production_kwh: number;
          annual_savings_eur: number;
          payback_years?: number | null;
          electricity_price_eur: number;
          total_score: number;
          solar_potential_score: number;
          economic_potential_score: number;
          execution_simplicity_score: number;
          segment_fit_score: number;
          assessed_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["solar_assessments"]["Insert"]>;
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

export type ClientProfile = Database["public"]["Tables"]["client_profiles"]["Row"];
export type ClientProfileInsert = Database["public"]["Tables"]["client_profiles"]["Insert"];

export type SubsidyApplication = Database["public"]["Tables"]["subsidy_applications"]["Row"];
export type SubsidyApplicationInsert = Database["public"]["Tables"]["subsidy_applications"]["Insert"];

export type ApplicationDocument = Database["public"]["Tables"]["application_documents"]["Row"];
export type ApplicationDocumentInsert = Database["public"]["Tables"]["application_documents"]["Insert"];

export type DocumentType = Database["public"]["Tables"]["document_types"]["Row"];

// Application status types
export type ApplicationStatus =
  | "draft"
  | "collecting_documents"
  | "ready_to_submit"
  | "submitted"
  | "under_review"
  | "approved"
  | "rejected"
  | "paid";

export type DocumentStatus =
  | "pending"
  | "uploaded"
  | "verified"
  | "rejected"
  | "not_applicable";

export type SolarAssessment = Database["public"]["Tables"]["solar_assessments"]["Row"];
export type SolarAssessmentInsert = Database["public"]["Tables"]["solar_assessments"]["Insert"];

export type SolarApiStatus = "success" | "failed" | "fallback";
