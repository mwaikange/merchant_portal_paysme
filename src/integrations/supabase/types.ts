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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      admin_users: {
        Row: {
          auth_user_id: string | null
          created_at: string | null
          email: string
          id: string
          name: string | null
          permissions: Json | null
          role: string
          updated_at: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string | null
          email: string
          id?: string
          name?: string | null
          permissions?: Json | null
          role: string
          updated_at?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string | null
          email?: string
          id?: string
          name?: string | null
          permissions?: Json | null
          role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      bulk_subscribers: {
        Row: {
          amount: number
          amount_paid: number | null
          bulk_upload_id: string | null
          created_at: string | null
          date_generated: string | null
          date_paid: string | null
          generated_code: string
          id: string
          invoice_id: string | null
          merchant_client_id: string | null
          merchant_id: string
          net_amount: number | null
          recurring: boolean | null
          recurring_period: string | null
          reference: string | null
          scheduled_date: string | null
          scheduled_send_at: string | null
          sms_parts_reserved: number
          sms_provider_message_id: string | null
          sms_scheduled_at: string | null
          sms_status: string | null
          status: string | null
          tax_mode: string | null
          subscription_base_code: string | null
          subscription_group_id: string | null
          subscription_months: number | null
          subscription_sequence: number | null
          subscription_total_cycles: number | null
          transaction_id: string
          updated_at: string | null
          user_email: string | null
          user_mobile: string | null
          vat_amount: number | null
          vat_rate: number | null
          gross_amount: number | null
        }
        Insert: {
          amount: number
          amount_paid?: number | null
          bulk_upload_id?: string | null
          created_at?: string | null
          date_generated?: string | null
          date_paid?: string | null
          generated_code?: string
          id?: string
          invoice_id?: string | null
          merchant_client_id?: string | null
          merchant_id: string
          net_amount?: number | null
          recurring?: boolean | null
          recurring_period?: string | null
          reference?: string | null
          scheduled_date?: string | null
          scheduled_send_at?: string | null
          sms_parts_reserved?: number
          sms_provider_message_id?: string | null
          sms_scheduled_at?: string | null
          sms_status?: string | null
          status?: string | null
          tax_mode?: string | null
          subscription_base_code?: string | null
          subscription_group_id?: string | null
          subscription_months?: number | null
          subscription_sequence?: number | null
          subscription_total_cycles?: number | null
          transaction_id?: string
          updated_at?: string | null
          user_email?: string | null
          user_mobile?: string | null
          vat_amount?: number | null
          vat_rate?: number | null
          gross_amount?: number | null
        }
        Update: {
          amount?: number
          amount_paid?: number | null
          bulk_upload_id?: string | null
          created_at?: string | null
          date_generated?: string | null
          date_paid?: string | null
          generated_code?: string
          id?: string
          invoice_id?: string | null
          merchant_client_id?: string | null
          merchant_id?: string
          net_amount?: number | null
          recurring?: boolean | null
          recurring_period?: string | null
          reference?: string | null
          scheduled_date?: string | null
          scheduled_send_at?: string | null
          sms_parts_reserved?: number
          sms_provider_message_id?: string | null
          sms_scheduled_at?: string | null
          sms_status?: string | null
          status?: string | null
          tax_mode?: string | null
          subscription_base_code?: string | null
          subscription_group_id?: string | null
          subscription_months?: number | null
          subscription_sequence?: number | null
          subscription_total_cycles?: number | null
          transaction_id?: string
          updated_at?: string | null
          user_email?: string | null
          user_mobile?: string | null
          vat_amount?: number | null
          vat_rate?: number | null
          gross_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bulk_subscribers_bulk_upload_id_fkey"
            columns: ["bulk_upload_id"]
            isOneToOne: false
            referencedRelation: "bulk_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_subscribers_bulk_upload_id_fkey"
            columns: ["bulk_upload_id"]
            isOneToOne: false
            referencedRelation: "bulk_uploads_progress"
            referencedColumns: ["bulk_upload_id"]
          },
          {
            foreignKeyName: "bulk_subscribers_merchant_client_id_fkey"
            columns: ["merchant_client_id"]
            isOneToOne: false
            referencedRelation: "merchant_clients"
            referencedColumns: ["merchant_client_id"]
          },
          {
            foreignKeyName: "bulk_subscribers_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_billing_status"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "bulk_subscribers_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["merchant_id"]
          },
        ]
      }
      bulk_uploads: {
        Row: {
          failed_records: number | null
          filename: string | null
          id: string
          merchant_id: string | null
          processed_records: number | null
          recurring: boolean | null
          recurring_period: string | null
          scheduled_date: string | null
          status: string | null
          total_records: number | null
          upload_date: string | null
        }
        Insert: {
          failed_records?: number | null
          filename?: string | null
          id?: string
          merchant_id?: string | null
          processed_records?: number | null
          recurring?: boolean | null
          recurring_period?: string | null
          scheduled_date?: string | null
          status?: string | null
          total_records?: number | null
          upload_date?: string | null
        }
        Update: {
          failed_records?: number | null
          filename?: string | null
          id?: string
          merchant_id?: string | null
          processed_records?: number | null
          recurring?: boolean | null
          recurring_period?: string | null
          scheduled_date?: string | null
          status?: string | null
          total_records?: number | null
          upload_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bulk_uploads_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_billing_status"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "bulk_uploads_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["merchant_id"]
          },
        ]
      }
      facilitators: {
        Row: {
          created_at: string
          display_name: string
          facilitator_id: string
          facilitator_key: string
          is_card: boolean
          metadata: Json
          payment_method: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name: string
          facilitator_id?: string
          facilitator_key: string
          is_card?: boolean
          metadata?: Json
          payment_method: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          facilitator_id?: string
          facilitator_key?: string
          is_card?: boolean
          metadata?: Json
          payment_method?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      kyc_documents: {
        Row: {
          document_name: string
          document_size: number | null
          document_type: string
          document_url: string
          id: string
          kyc_submission_id: string
          uploaded_at: string
          user_id: string
        }
        Insert: {
          document_name: string
          document_size?: number | null
          document_type: string
          document_url: string
          id?: string
          kyc_submission_id: string
          uploaded_at?: string
          user_id: string
        }
        Update: {
          document_name?: string
          document_size?: number | null
          document_type?: string
          document_url?: string
          id?: string
          kyc_submission_id?: string
          uploaded_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kyc_documents_kyc_submission_id_fkey"
            columns: ["kyc_submission_id"]
            isOneToOne: false
            referencedRelation: "kyc_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      kyc_submissions: {
        Row: {
          account_holder_name: string | null
          account_number: string | null
          account_type: string | null
          address: string | null
          annual_income: string | null
          bank_doc_status: string
          bank_name: string | null
          banking_verified: boolean | null
          branch: string | null
          branch_code: string | null
          business_name: string | null
          business_type: string | null
          created_at: string
          date_of_birth: string | null
          document_urls: string[]
          documents_uploaded: boolean | null
          email: string
          finalized: boolean | null
          first_name: string | null
          id: string
          id_number: string | null
          income_source: string | null
          industry: string | null
          kyc_status: string
          last_name: string | null
          mobile_number: string | null
          proof_of_banking_document_url: string | null
          region: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          town: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_holder_name?: string | null
          account_number?: string | null
          account_type?: string | null
          address?: string | null
          annual_income?: string | null
          bank_doc_status?: string
          bank_name?: string | null
          banking_verified?: boolean | null
          branch?: string | null
          branch_code?: string | null
          business_name?: string | null
          business_type?: string | null
          created_at?: string
          date_of_birth?: string | null
          document_urls?: string[]
          documents_uploaded?: boolean | null
          email: string
          finalized?: boolean | null
          first_name?: string | null
          id?: string
          id_number?: string | null
          income_source?: string | null
          industry?: string | null
          kyc_status?: string
          last_name?: string | null
          mobile_number?: string | null
          proof_of_banking_document_url?: string | null
          region?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          town?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_holder_name?: string | null
          account_number?: string | null
          account_type?: string | null
          address?: string | null
          annual_income?: string | null
          bank_doc_status?: string
          bank_name?: string | null
          banking_verified?: boolean | null
          branch?: string | null
          branch_code?: string | null
          business_name?: string | null
          business_type?: string | null
          created_at?: string
          date_of_birth?: string | null
          document_urls?: string[]
          documents_uploaded?: boolean | null
          email?: string
          finalized?: boolean | null
          first_name?: string | null
          id?: string
          id_number?: string | null
          income_source?: string | null
          industry?: string | null
          kyc_status?: string
          last_name?: string | null
          mobile_number?: string | null
          proof_of_banking_document_url?: string | null
          region?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          town?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "kyc_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_clients: {
        Row: {
          created_at: string | null
          email: string | null
          merchant_client_id: string
          merchant_id: string
          mobile_number: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          merchant_client_id?: string
          merchant_id: string
          mobile_number?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          merchant_client_id?: string
          merchant_id?: string
          mobile_number?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      merchant_fee_invoices: {
        Row: {
          amount: number
          created_at: string
          due_date: string
          email_sent_at: string | null
          generated_code: string | null
          invoice_id: string
          invoice_month: string
          invoice_number: string
          last_notification_error: string | null
          last_notification_sent_at: string | null
          locked_at: string | null
          merchant_id: string
          notification_count: number
          notification_sent_at: string | null
          paid_at: string | null
          payment_link: string | null
          paysme_transaction_id: string | null
          period_end: string
          period_start: string
          sms_sent_at: string | null
          status: string
          transaction_count: number
          updated_at: string
          whatsapp_sent_at: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          due_date: string
          email_sent_at?: string | null
          generated_code?: string | null
          invoice_id?: string
          invoice_month: string
          invoice_number: string
          last_notification_error?: string | null
          last_notification_sent_at?: string | null
          locked_at?: string | null
          merchant_id: string
          notification_count?: number
          notification_sent_at?: string | null
          paid_at?: string | null
          payment_link?: string | null
          paysme_transaction_id?: string | null
          period_end: string
          period_start: string
          sms_sent_at?: string | null
          status?: string
          transaction_count?: number
          updated_at?: string
          whatsapp_sent_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string
          email_sent_at?: string | null
          generated_code?: string | null
          invoice_id?: string
          invoice_month?: string
          invoice_number?: string
          last_notification_error?: string | null
          last_notification_sent_at?: string | null
          locked_at?: string | null
          merchant_id?: string
          notification_count?: number
          notification_sent_at?: string | null
          paid_at?: string | null
          payment_link?: string | null
          paysme_transaction_id?: string | null
          period_end?: string
          period_start?: string
          sms_sent_at?: string | null
          status?: string
          transaction_count?: number
          updated_at?: string
          whatsapp_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchant_fee_invoices_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_billing_status"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "merchant_fee_invoices_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["merchant_id"]
          },
        ]
      }
      merchant_kyc_activity_log: {
        Row: {
          action: string
          admin_email: string | null
          admin_name: string | null
          admin_user_id: string | null
          created_at: string
          from_status: string | null
          id: string
          kyc_submission_id: string
          merchant_id: string | null
          metadata: Json
          note: string | null
          to_status: string | null
        }
        Insert: {
          action: string
          admin_email?: string | null
          admin_name?: string | null
          admin_user_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          kyc_submission_id: string
          merchant_id?: string | null
          metadata?: Json
          note?: string | null
          to_status?: string | null
        }
        Update: {
          action?: string
          admin_email?: string | null
          admin_name?: string | null
          admin_user_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          kyc_submission_id?: string
          merchant_id?: string | null
          metadata?: Json
          note?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchant_kyc_activity_log_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_kyc_activity_log_kyc_submission_id_fkey"
            columns: ["kyc_submission_id"]
            isOneToOne: false
            referencedRelation: "kyc_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_payment_facilitators: {
        Row: {
          created_at: string
          enabled: boolean
          facilitator_id: string | null
          merchant_id: string
          merchant_payment_facilitator_id: string
          metadata: Json
          payment_provider_id: string | null
          provider_application_id: string | null
          provider_display_name: string
          provider_jwt_secret: string | null
          provider_key: string
          provider_merchant_code: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          facilitator_id?: string | null
          merchant_id: string
          merchant_payment_facilitator_id?: string
          metadata?: Json
          payment_provider_id?: string | null
          provider_application_id?: string | null
          provider_display_name: string
          provider_jwt_secret?: string | null
          provider_key: string
          provider_merchant_code: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          facilitator_id?: string | null
          merchant_id?: string
          merchant_payment_facilitator_id?: string
          metadata?: Json
          payment_provider_id?: string | null
          provider_application_id?: string | null
          provider_display_name?: string
          provider_jwt_secret?: string | null
          provider_key?: string
          provider_merchant_code?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_payment_facilitators_facilitator_id_fkey"
            columns: ["facilitator_id"]
            isOneToOne: false
            referencedRelation: "facilitators"
            referencedColumns: ["facilitator_id"]
          },
          {
            foreignKeyName: "merchant_payment_facilitators_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_billing_status"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "merchant_payment_facilitators_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "merchant_payment_facilitators_payment_provider_id_fkey"
            columns: ["payment_provider_id"]
            isOneToOne: false
            referencedRelation: "payment_providers"
            referencedColumns: ["payment_provider_id"]
          },
        ]
      }
      merchant_payouts: {
        Row: {
          admin_notes: string | null
          amount_paid: number
          created_at: string
          created_by: string | null
          fee_amount: number
          gross_amount: number
          kyc_document_urls: string[]
          merchant_id: string
          merchant_kyc_status: string | null
          net_amount: number | null
          paid_at: string | null
          payment_method: string | null
          payout_account_holder_name: string | null
          payout_account_number: string | null
          payout_account_type: string | null
          payout_bank_name: string | null
          payout_branch: string | null
          payout_branch_code: string | null
          payout_id: string
          payout_reference: string | null
          period_end: string
          period_start: string
          processed_by: string | null
          proof_of_banking_document_url: string | null
          scheduled_at: string | null
          source_transaction_id: string | null
          status: string
          transaction_count: number
          transaction_ids: string[]
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          fee_amount?: number
          gross_amount?: number
          kyc_document_urls?: string[]
          merchant_id: string
          merchant_kyc_status?: string | null
          net_amount?: number | null
          paid_at?: string | null
          payment_method?: string | null
          payout_account_holder_name?: string | null
          payout_account_number?: string | null
          payout_account_type?: string | null
          payout_bank_name?: string | null
          payout_branch?: string | null
          payout_branch_code?: string | null
          payout_id?: string
          payout_reference?: string | null
          period_end: string
          period_start: string
          processed_by?: string | null
          proof_of_banking_document_url?: string | null
          scheduled_at?: string | null
          source_transaction_id?: string | null
          status?: string
          transaction_count?: number
          transaction_ids?: string[]
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          amount_paid?: number
          created_at?: string
          created_by?: string | null
          fee_amount?: number
          gross_amount?: number
          kyc_document_urls?: string[]
          merchant_id?: string
          merchant_kyc_status?: string | null
          net_amount?: number | null
          paid_at?: string | null
          payment_method?: string | null
          payout_account_holder_name?: string | null
          payout_account_number?: string | null
          payout_account_type?: string | null
          payout_bank_name?: string | null
          payout_branch?: string | null
          payout_branch_code?: string | null
          payout_id?: string
          payout_reference?: string | null
          period_end?: string
          period_start?: string
          processed_by?: string | null
          proof_of_banking_document_url?: string | null
          scheduled_at?: string | null
          source_transaction_id?: string | null
          status?: string
          transaction_count?: number
          transaction_ids?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_payouts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_billing_status"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "merchant_payouts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["merchant_id"]
          },
        ]
      }
      merchants: {
        Row: {
          api_key: string | null
          business_name: string | null
          created_at: string | null
          email: string
          kyc_status: string | null
          merchant_id: string
          mobile_number: string | null
          return_url: string | null
          setup_complete: boolean | null
          sms_client_id: string | null
          sms_credits: number | null
          sms_key: string | null
          subscription_end_date: string | null
          subscription_status: string | null
          tax_mode: string
          tax_settings_completed_at: string | null
          updated_at: string | null
          vat_rate: number
          vat_registration_number: string | null
          vendor_id: string
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          api_key?: string | null
          business_name?: string | null
          created_at?: string | null
          email: string
          kyc_status?: string | null
          merchant_id?: string
          mobile_number?: string | null
          return_url?: string | null
          setup_complete?: boolean | null
          sms_client_id?: string | null
          sms_credits?: number | null
          sms_key?: string | null
          subscription_end_date?: string | null
          subscription_status?: string | null
          tax_mode?: string
          tax_settings_completed_at?: string | null
          updated_at?: string | null
          vat_rate?: number
          vat_registration_number?: string | null
          vendor_id: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          api_key?: string | null
          business_name?: string | null
          created_at?: string | null
          email?: string
          kyc_status?: string | null
          merchant_id?: string
          mobile_number?: string | null
          return_url?: string | null
          setup_complete?: boolean | null
          sms_client_id?: string | null
          sms_credits?: number | null
          sms_key?: string | null
          subscription_end_date?: string | null
          subscription_status?: string | null
          tax_mode?: string
          tax_settings_completed_at?: string | null
          updated_at?: string | null
          vat_rate?: number
          vat_registration_number?: string | null
          vendor_id?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      payment_providers: {
        Row: {
          api_key: string | null
          api_secret: string | null
          callback_url: string | null
          contact_email: string | null
          contact_number: string | null
          created_at: string | null
          name: string
          payment_provider_id: string
          signature_key: string | null
          status: string | null
          updated_at: string | null
          webhook_url: string | null
        }
        Insert: {
          api_key?: string | null
          api_secret?: string | null
          callback_url?: string | null
          contact_email?: string | null
          contact_number?: string | null
          created_at?: string | null
          name: string
          payment_provider_id?: string
          signature_key?: string | null
          status?: string | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Update: {
          api_key?: string | null
          api_secret?: string | null
          callback_url?: string | null
          contact_email?: string | null
          contact_number?: string | null
          created_at?: string | null
          name?: string
          payment_provider_id?: string
          signature_key?: string | null
          status?: string | null
          updated_at?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      pending_vendor_registrations: {
        Row: {
          attempts: number
          business_name: string | null
          created_at: string
          email: string
          email_confirmed_at: string | null
          email_token_hash: string | null
          first_name: string
          full_name: string
          id: string
          id_back_path: string
          id_front_path: string
          id_number: string
          id_number_hash: string
          mobile_number: string
          selfie_path: string
          sms_code_hash: string
          sms_expires_at: string
          sms_verified_at: string | null
          status: string
          surname: string
          terms_accepted: boolean
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          attempts?: number
          business_name?: string | null
          created_at?: string
          email: string
          email_confirmed_at?: string | null
          email_token_hash?: string | null
          first_name: string
          full_name: string
          id?: string
          id_back_path: string
          id_front_path: string
          id_number: string
          id_number_hash: string
          mobile_number: string
          selfie_path: string
          sms_code_hash: string
          sms_expires_at: string
          sms_verified_at?: string | null
          status?: string
          surname: string
          terms_accepted?: boolean
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          attempts?: number
          business_name?: string | null
          created_at?: string
          email?: string
          email_confirmed_at?: string | null
          email_token_hash?: string | null
          first_name?: string
          full_name?: string
          id?: string
          id_back_path?: string
          id_front_path?: string
          id_number?: string
          id_number_hash?: string
          mobile_number?: string
          selfie_path?: string
          sms_code_hash?: string
          sms_expires_at?: string
          sms_verified_at?: string | null
          status?: string
          surname?: string
          terms_accepted?: boolean
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pending_vendor_registrations_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["vendor_id"]
          },
        ]
      }
      platform_fee_settings: {
        Row: {
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          fee_key: string
          fee_rate: number
          id: string
          is_active: boolean
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          fee_key: string
          fee_rate: number
          id?: string
          is_active?: boolean
        }
        Update: {
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          fee_key?: string
          fee_rate?: number
          id?: string
          is_active?: boolean
        }
        Relationships: []
      }
      referrals: {
        Row: {
          amount_paid: number | null
          codes_generated: number | null
          created_at: string | null
          date_generated: string | null
          id: string
          invoices_paid: number | null
          kyc_status: boolean | null
          referred_id: string | null
          referrer_id: string | null
          setup_status: boolean | null
          status: string | null
          transaction_id: string
          vendor_name: string | null
        }
        Insert: {
          amount_paid?: number | null
          codes_generated?: number | null
          created_at?: string | null
          date_generated?: string | null
          id?: string
          invoices_paid?: number | null
          kyc_status?: boolean | null
          referred_id?: string | null
          referrer_id?: string | null
          setup_status?: boolean | null
          status?: string | null
          transaction_id: string
          vendor_name?: string | null
        }
        Update: {
          amount_paid?: number | null
          codes_generated?: number | null
          created_at?: string | null
          date_generated?: string | null
          id?: string
          invoices_paid?: number | null
          kyc_status?: boolean | null
          referred_id?: string | null
          referrer_id?: string | null
          setup_status?: boolean | null
          status?: string | null
          transaction_id?: string
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: false
            referencedRelation: "merchant_billing_status"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "referrals_referred_id_fkey"
            columns: ["referred_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "merchant_billing_status"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "referrals_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["merchant_id"]
          },
        ]
      }
      sms_transactions: {
        Row: {
          admin_load_notes: string | null
          admin_load_requested_at: string | null
          admin_load_status: string
          admin_loaded_at: string | null
          admin_loaded_by: string | null
          created_at: string
          date_purchased: string
          generated_code: string | null
          id: string
          merchant_id: string
          paycode_status: string | null
          tokens_available: number
          tokens_purchased: number
          transaction_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_load_notes?: string | null
          admin_load_requested_at?: string | null
          admin_load_status?: string
          admin_loaded_at?: string | null
          admin_loaded_by?: string | null
          created_at?: string
          date_purchased?: string
          generated_code?: string | null
          id?: string
          merchant_id: string
          paycode_status?: string | null
          tokens_available?: number
          tokens_purchased?: number
          transaction_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_load_notes?: string | null
          admin_load_requested_at?: string | null
          admin_load_status?: string
          admin_loaded_at?: string | null
          admin_loaded_by?: string | null
          created_at?: string
          date_purchased?: string
          generated_code?: string | null
          id?: string
          merchant_id?: string
          paycode_status?: string | null
          tokens_available?: number
          tokens_purchased?: number
          transaction_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_sms_transactions_transaction_id"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      subscription_plan_rules: {
        Row: {
          bulk_sms_discount_rate: number
          bulk_invoice_enabled: boolean
          bulk_paycode_enabled: boolean
          card_monthly_limit: number | null
          card_payments_enabled: boolean
          created_at: string
          custom_branding_enabled: boolean
          display_name: string
          is_active: boolean
          monthly_amount: number
          other_payment_monthly_limit: number | null
          other_payment_types_enabled: boolean
          paysme_transaction_fee_rate: number
          personalized_sms_sender_id_enabled: boolean
          plan_key: string
          plan_rule_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          bulk_sms_discount_rate?: number
          bulk_invoice_enabled?: boolean
          bulk_paycode_enabled?: boolean
          card_monthly_limit?: number | null
          card_payments_enabled?: boolean
          created_at?: string
          custom_branding_enabled?: boolean
          display_name: string
          is_active?: boolean
          monthly_amount: number
          other_payment_monthly_limit?: number | null
          other_payment_types_enabled?: boolean
          paysme_transaction_fee_rate?: number
          personalized_sms_sender_id_enabled?: boolean
          plan_key: string
          plan_rule_id?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          bulk_sms_discount_rate?: number
          bulk_invoice_enabled?: boolean
          bulk_paycode_enabled?: boolean
          card_monthly_limit?: number | null
          card_payments_enabled?: boolean
          created_at?: string
          custom_branding_enabled?: boolean
          display_name?: string
          is_active?: boolean
          monthly_amount?: number
          other_payment_monthly_limit?: number | null
          other_payment_types_enabled?: boolean
          paysme_transaction_fee_rate?: number
          personalized_sms_sender_id_enabled?: boolean
          plan_key?: string
          plan_rule_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          activated_date: string | null
          amount: number
          created_at: string | null
          duration_months: number
          end_date: string | null
          generated_code: string | null
          id: string
          paycode_status: string | null
          plan_type: string
          recurring: boolean | null
          start_date: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          activated_date?: string | null
          amount: number
          created_at?: string | null
          duration_months: number
          end_date?: string | null
          generated_code?: string | null
          id?: string
          paycode_status?: string | null
          plan_type: string
          recurring?: boolean | null
          start_date?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          activated_date?: string | null
          amount?: number
          created_at?: string | null
          duration_months?: number
          end_date?: string | null
          generated_code?: string | null
          id?: string
          paycode_status?: string | null
          plan_type?: string
          recurring?: boolean | null
          start_date?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "merchant_billing_status"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["merchant_id"]
          },
        ]
      }
      transactions: {
        Row: {
          allowed_payment_methods: string[]
          amount: number
          amount_paid: number | null
          business_name: string | null
          created_at: string | null
          date_generated: string | null
          date_paid: string | null
          facilitator_id: string | null
          facilitator_merchant_code: string | null
          finalized: boolean | null
          generated_code: string
          invoice_id: string | null
          merchant_client_id: string | null
          merchant_id: string
          payer_town: string | null
          payment_method: string | null
          payment_purpose: string
          payment_provider_id: string | null
          payment_provider_signature: string | null
          status: string | null
          sms_notifications_enabled: boolean
          tnx_fee: number | null
          tnx_fee_applies_to: string | null
          tnx_fee_plan_key: string | null
          tnx_fee_plan_type: string | null
          tnx_fee_rate: number | null
          tnx_fee_snapshot_at: string | null
          tnx_fee_source: string | null
          transaction_id: string
          type: string
          updated_at: string | null
          user_email: string | null
          user_mobile: string | null
          vendor_obligation_id: string | null
          vendor_redeemable: boolean
        }
        Insert: {
          allowed_payment_methods?: string[]
          amount: number
          amount_paid?: number | null
          business_name?: string | null
          created_at?: string | null
          date_generated?: string | null
          date_paid?: string | null
          facilitator_id?: string | null
          facilitator_merchant_code?: string | null
          finalized?: boolean | null
          generated_code?: string
          invoice_id?: string | null
          merchant_client_id?: string | null
          merchant_id: string
          payer_town?: string | null
          payment_method?: string | null
          payment_purpose?: string
          payment_provider_id?: string | null
          payment_provider_signature?: string | null
          status?: string | null
          sms_notifications_enabled?: boolean
          tnx_fee?: number | null
          tnx_fee_applies_to?: string | null
          tnx_fee_plan_key?: string | null
          tnx_fee_plan_type?: string | null
          tnx_fee_rate?: number | null
          tnx_fee_snapshot_at?: string | null
          tnx_fee_source?: string | null
          transaction_id?: string
          type: string
          updated_at?: string | null
          user_email?: string | null
          user_mobile?: string | null
          vendor_obligation_id?: string | null
          vendor_redeemable?: boolean
        }
        Update: {
          allowed_payment_methods?: string[]
          amount?: number
          amount_paid?: number | null
          business_name?: string | null
          created_at?: string | null
          date_generated?: string | null
          date_paid?: string | null
          facilitator_id?: string | null
          facilitator_merchant_code?: string | null
          finalized?: boolean | null
          generated_code?: string
          invoice_id?: string | null
          merchant_client_id?: string | null
          merchant_id?: string
          payer_town?: string | null
          payment_method?: string | null
          payment_purpose?: string
          payment_provider_id?: string | null
          payment_provider_signature?: string | null
          status?: string | null
          sms_notifications_enabled?: boolean
          tnx_fee?: number | null
          tnx_fee_applies_to?: string | null
          tnx_fee_plan_key?: string | null
          tnx_fee_plan_type?: string | null
          tnx_fee_rate?: number | null
          tnx_fee_snapshot_at?: string | null
          tnx_fee_source?: string | null
          transaction_id?: string
          type?: string
          updated_at?: string | null
          user_email?: string | null
          user_mobile?: string | null
          vendor_obligation_id?: string | null
          vendor_redeemable?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "fk_merchant"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_billing_status"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "fk_merchant"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "transactions_facilitator_id_fkey"
            columns: ["facilitator_id"]
            isOneToOne: false
            referencedRelation: "facilitators"
            referencedColumns: ["facilitator_id"]
          },
          {
            foreignKeyName: "transactions_merchant_client_id_fkey"
            columns: ["merchant_client_id"]
            isOneToOne: false
            referencedRelation: "merchant_clients"
            referencedColumns: ["merchant_client_id"]
          },
          {
            foreignKeyName: "transactions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_billing_status"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "transactions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "transactions_payment_provider_id_fkey"
            columns: ["payment_provider_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["vendor_id"]
          },
        ]
      }
      vendor_kyc_applications: {
        Row: {
          address_proof_url: string | null
          application_reference: string | null
          application_type: string
          bipa_registered_confirmed: boolean
          bipa_registration_number: string | null
          business_address: string | null
          business_address_proof_url: string | null
          business_bank_statement_url: string | null
          business_email: string | null
          business_name: string | null
          business_owner_id_number: string | null
          business_phone: string | null
          business_registration_address: string | null
          business_registration_document_url: string | null
          business_type: string | null
          company_documents_urls: Json
          contract_url: string | null
          created_at: string | null
          decline_reason_document: string | null
          decline_reason_notes: string | null
          guarantor_address: string | null
          guarantor_address_proof_url: string | null
          guarantor_agreement_url: string | null
          guarantor_bank_statement_url: string | null
          guarantor_document_url: string | null
          guarantor_email: string | null
          guarantor_full_name: string | null
          guarantor_id_document_url: string | null
          guarantor_id_number: string | null
          guarantor_mobile: string | null
          guarantor_payslip_url: string | null
          guarantor_signature_verified_at: string | null
          id: string
          id_document_url: string | null
          income_proof_url: string | null
          income_tax_reg_number: string | null
          is_top_up: boolean | null
          key_person_address: string | null
          key_person_address_proof_url: string | null
          key_person_bank_statement_url: string | null
          key_person_email: string | null
          key_person_full_name: string | null
          key_person_id_number: string | null
          key_person_is_guarantor: boolean | null
          key_person_mobile: string | null
          key_person_payslip_url: string | null
          key_person_signature_verified_at: string | null
          key_person_surety_document_url: string | null
          key_person_title: string | null
          requested_amount: number | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          submitted_at: string | null
          term_months: number | null
          token_advance_agreement_url: string | null
          token_advance_id: string | null
          token_advance_info_url: string | null
          token_advance_notice_acknowledged: boolean
          token_advance_notice_acknowledged_at: string | null
          total_repayable: number | null
          vat_reg_number: string | null
          vendor_id: string
        }
        Insert: {
          address_proof_url?: string | null
          application_reference?: string | null
          application_type: string
          bipa_registered_confirmed?: boolean
          bipa_registration_number?: string | null
          business_address?: string | null
          business_address_proof_url?: string | null
          business_bank_statement_url?: string | null
          business_email?: string | null
          business_name?: string | null
          business_owner_id_number?: string | null
          business_phone?: string | null
          business_registration_address?: string | null
          business_registration_document_url?: string | null
          business_type?: string | null
          company_documents_urls?: Json
          contract_url?: string | null
          created_at?: string | null
          decline_reason_document?: string | null
          decline_reason_notes?: string | null
          guarantor_address?: string | null
          guarantor_address_proof_url?: string | null
          guarantor_agreement_url?: string | null
          guarantor_bank_statement_url?: string | null
          guarantor_document_url?: string | null
          guarantor_email?: string | null
          guarantor_full_name?: string | null
          guarantor_id_document_url?: string | null
          guarantor_id_number?: string | null
          guarantor_mobile?: string | null
          guarantor_payslip_url?: string | null
          guarantor_signature_verified_at?: string | null
          id?: string
          id_document_url?: string | null
          income_proof_url?: string | null
          income_tax_reg_number?: string | null
          is_top_up?: boolean | null
          key_person_address?: string | null
          key_person_address_proof_url?: string | null
          key_person_bank_statement_url?: string | null
          key_person_email?: string | null
          key_person_full_name?: string | null
          key_person_id_number?: string | null
          key_person_is_guarantor?: boolean | null
          key_person_mobile?: string | null
          key_person_payslip_url?: string | null
          key_person_signature_verified_at?: string | null
          key_person_surety_document_url?: string | null
          key_person_title?: string | null
          requested_amount?: number | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          submitted_at?: string | null
          term_months?: number | null
          token_advance_agreement_url?: string | null
          token_advance_id?: string | null
          token_advance_info_url?: string | null
          token_advance_notice_acknowledged?: boolean
          token_advance_notice_acknowledged_at?: string | null
          total_repayable?: number | null
          vat_reg_number?: string | null
          vendor_id: string
        }
        Update: {
          address_proof_url?: string | null
          application_reference?: string | null
          application_type?: string
          bipa_registered_confirmed?: boolean
          bipa_registration_number?: string | null
          business_address?: string | null
          business_address_proof_url?: string | null
          business_bank_statement_url?: string | null
          business_email?: string | null
          business_name?: string | null
          business_owner_id_number?: string | null
          business_phone?: string | null
          business_registration_address?: string | null
          business_registration_document_url?: string | null
          business_type?: string | null
          company_documents_urls?: Json
          contract_url?: string | null
          created_at?: string | null
          decline_reason_document?: string | null
          decline_reason_notes?: string | null
          guarantor_address?: string | null
          guarantor_address_proof_url?: string | null
          guarantor_agreement_url?: string | null
          guarantor_bank_statement_url?: string | null
          guarantor_document_url?: string | null
          guarantor_email?: string | null
          guarantor_full_name?: string | null
          guarantor_id_document_url?: string | null
          guarantor_id_number?: string | null
          guarantor_mobile?: string | null
          guarantor_payslip_url?: string | null
          guarantor_signature_verified_at?: string | null
          id?: string
          id_document_url?: string | null
          income_proof_url?: string | null
          income_tax_reg_number?: string | null
          is_top_up?: boolean | null
          key_person_address?: string | null
          key_person_address_proof_url?: string | null
          key_person_bank_statement_url?: string | null
          key_person_email?: string | null
          key_person_full_name?: string | null
          key_person_id_number?: string | null
          key_person_is_guarantor?: boolean | null
          key_person_mobile?: string | null
          key_person_payslip_url?: string | null
          key_person_signature_verified_at?: string | null
          key_person_surety_document_url?: string | null
          key_person_title?: string | null
          requested_amount?: number | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          submitted_at?: string | null
          term_months?: number | null
          token_advance_agreement_url?: string | null
          token_advance_id?: string | null
          token_advance_info_url?: string | null
          token_advance_notice_acknowledged?: boolean
          token_advance_notice_acknowledged_at?: string | null
          total_repayable?: number | null
          vat_reg_number?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_kyc_applications_token_advance_id_fkey"
            columns: ["token_advance_id"]
            isOneToOne: false
            referencedRelation: "vendor_token_advances"
            referencedColumns: ["advance_id"]
          },
          {
            foreignKeyName: "vendor_kyc_applications_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["vendor_id"]
          },
        ]
      }
      vendor_public_rate_limits: {
        Row: {
          attempted_at: string
          id: number
          scope: string
          subject_hash: string
        }
        Insert: {
          attempted_at?: string
          id?: number
          scope: string
          subject_hash: string
        }
        Update: {
          attempted_at?: string
          id?: number
          scope?: string
          subject_hash?: string
        }
        Relationships: []
      }
      vendor_registration_confirmations: {
        Row: {
          attempts: number
          created_at: string
          email_confirmed_at: string | null
          email_token_hash: string | null
          id: string
          sms_code_hash: string
          sms_expires_at: string
          sms_verified_at: string | null
          vendor_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          email_confirmed_at?: string | null
          email_token_hash?: string | null
          id?: string
          sms_code_hash: string
          sms_expires_at: string
          sms_verified_at?: string | null
          vendor_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          email_confirmed_at?: string | null
          email_token_hash?: string | null
          id?: string
          sms_code_hash?: string
          sms_expires_at?: string
          sms_verified_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_registration_confirmations_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["vendor_id"]
          },
        ]
      }
      vendor_security_otps: {
        Row: {
          attempts: number
          created_at: string
          expires_at: string
          id: string
          otp_hash: string
          purpose: string
          used_at: string | null
          vendor_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          expires_at: string
          id?: string
          otp_hash: string
          purpose: string
          used_at?: string | null
          vendor_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          expires_at?: string
          id?: string
          otp_hash?: string
          purpose?: string
          used_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_security_otps_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["vendor_id"]
          },
        ]
      }
      vendor_payment_obligations: {
        Row: {
          advance_id: string | null
          allowed_payment_methods: string[]
          amount_due: number
          checkout_expires_at: string
          checkout_token_hash: string
          created_at: string
          currency: string
          discount_amount: number
          obligation_id: string
          paid_at: string | null
          provider_reference: string | null
          purpose: string
          requested_amount: number
          selected_payment_method: string | null
          settled_at: string | null
          sms_notifications_enabled: boolean
          status: string
          token_credit_amount: number | null
          token_topup_id: string | null
          transaction_id: string | null
          updated_at: string
          vendor_id: string
          vendor_redeemable: boolean
        }
        Insert: {
          advance_id?: string | null
          allowed_payment_methods?: string[]
          amount_due: number
          checkout_expires_at: string
          checkout_token_hash: string
          created_at?: string
          currency?: string
          discount_amount?: number
          obligation_id?: string
          paid_at?: string | null
          provider_reference?: string | null
          purpose: string
          requested_amount: number
          selected_payment_method?: string | null
          settled_at?: string | null
          sms_notifications_enabled?: boolean
          status?: string
          token_credit_amount?: number | null
          token_topup_id?: string | null
          transaction_id?: string | null
          updated_at?: string
          vendor_id: string
          vendor_redeemable?: boolean
        }
        Update: {
          advance_id?: string | null
          allowed_payment_methods?: string[]
          amount_due?: number
          checkout_expires_at?: string
          checkout_token_hash?: string
          created_at?: string
          currency?: string
          discount_amount?: number
          obligation_id?: string
          paid_at?: string | null
          provider_reference?: string | null
          purpose?: string
          requested_amount?: number
          selected_payment_method?: string | null
          settled_at?: string | null
          sms_notifications_enabled?: boolean
          status?: string
          token_credit_amount?: number | null
          token_topup_id?: string | null
          transaction_id?: string | null
          updated_at?: string
          vendor_id?: string
          vendor_redeemable?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "vendor_payment_obligations_advance_id_fkey"
            columns: ["advance_id"]
            isOneToOne: false
            referencedRelation: "vendor_token_advances"
            referencedColumns: ["advance_id"]
          },
          {
            foreignKeyName: "vendor_payment_obligations_token_topup_id_fkey"
            columns: ["token_topup_id"]
            isOneToOne: false
            referencedRelation: "vendor_topup_credits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_payment_obligations_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: true
            referencedRelation: "transactions"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "vendor_payment_obligations_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["vendor_id"]
          },
        ]
      }
      vendor_token_advances: {
        Row: {
          advance_id: string
          advance_reference: string | null
          approved_at: string | null
          approved_by: string | null
          balance_remaining: number
          created_at: string | null
          installment_payment_day: number | null
          interest_rate: number
          last_payment_amount: number | null
          last_payment_date: string | null
          min_installment: number
          original_advance_id: string | null
          original_amount: number
          payment_count: number | null
          status: string | null
          term_months: number
          total_paid: number | null
          total_repayable: number
          updated_at: string | null
          vendor_id: string
        }
        Insert: {
          advance_id?: string
          advance_reference?: string | null
          approved_at?: string | null
          approved_by?: string | null
          balance_remaining: number
          created_at?: string | null
          installment_payment_day?: number | null
          interest_rate?: number
          last_payment_amount?: number | null
          last_payment_date?: string | null
          min_installment?: number
          original_advance_id?: string | null
          original_amount: number
          payment_count?: number | null
          status?: string | null
          term_months: number
          total_paid?: number | null
          total_repayable: number
          updated_at?: string | null
          vendor_id: string
        }
        Update: {
          advance_id?: string
          advance_reference?: string | null
          approved_at?: string | null
          approved_by?: string | null
          balance_remaining?: number
          created_at?: string | null
          installment_payment_day?: number | null
          interest_rate?: number
          last_payment_amount?: number | null
          last_payment_date?: string | null
          min_installment?: number
          original_advance_id?: string | null
          original_amount?: number
          payment_count?: number | null
          status?: string | null
          term_months?: number
          total_paid?: number | null
          total_repayable?: number
          updated_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_token_advances_original_advance_id_fkey"
            columns: ["original_advance_id"]
            isOneToOne: false
            referencedRelation: "vendor_token_advances"
            referencedColumns: ["advance_id"]
          },
          {
            foreignKeyName: "vendor_token_advances_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["vendor_id"]
          },
        ]
      }
      vendor_topup_credits: {
        Row: {
          amount_credited: number
          amount_paid: number
          amount_requested: number
          created_at: string | null
          discount_applied: number | null
          id: string
          payment_reference: string | null
          status: string | null
          topup_type: string
          updated_at: string | null
          vendor_id: string
        }
        Insert: {
          amount_credited: number
          amount_paid: number
          amount_requested: number
          created_at?: string | null
          discount_applied?: number | null
          id?: string
          payment_reference?: string | null
          status?: string | null
          topup_type?: string
          updated_at?: string | null
          vendor_id: string
        }
        Update: {
          amount_credited?: number
          amount_paid?: number
          amount_requested?: number
          created_at?: string | null
          discount_applied?: number | null
          id?: string
          payment_reference?: string | null
          status?: string | null
          topup_type?: string
          updated_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_topup_credits_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["vendor_id"]
          },
        ]
      }
      vendor_transactions: {
        Row: {
          advance_id: string | null
          amount: number
          generated_code: string | null
          id: string
          merchant_id: string | null
          merchant_name: string | null
          notes: string | null
          processed_at: string | null
          status: string | null
          transaction_type: string
          updated_at: string | null
          vendor_id: string
        }
        Insert: {
          advance_id?: string | null
          amount: number
          generated_code?: string | null
          id?: string
          merchant_id?: string | null
          merchant_name?: string | null
          notes?: string | null
          processed_at?: string | null
          status?: string | null
          transaction_type: string
          updated_at?: string | null
          vendor_id: string
        }
        Update: {
          advance_id?: string | null
          amount?: number
          generated_code?: string | null
          id?: string
          merchant_id?: string | null
          merchant_name?: string | null
          notes?: string | null
          processed_at?: string | null
          status?: string | null
          transaction_type?: string
          updated_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_transactions_advance_id_fkey"
            columns: ["advance_id"]
            isOneToOne: false
            referencedRelation: "vendor_token_advances"
            referencedColumns: ["advance_id"]
          },
          {
            foreignKeyName: "vendor_transactions_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["vendor_id"]
          },
        ]
      }
      vendor_withdrawal_requests: {
        Row: {
          advance_repayment: number | null
          amount_payout: number
          amount_requested: number
          created_at: string | null
          id: string
          paid_out_at: string | null
          payout_reference: string | null
          status: string | null
          updated_at: string | null
          vendor_id: string
          vendor_transaction_id: string | null
        }
        Insert: {
          advance_repayment?: number | null
          amount_payout: number
          amount_requested: number
          created_at?: string | null
          id?: string
          paid_out_at?: string | null
          payout_reference?: string | null
          status?: string | null
          updated_at?: string | null
          vendor_id: string
          vendor_transaction_id?: string | null
        }
        Update: {
          advance_repayment?: number | null
          amount_payout?: number
          amount_requested?: number
          created_at?: string | null
          id?: string
          paid_out_at?: string | null
          payout_reference?: string | null
          status?: string | null
          updated_at?: string | null
          vendor_id?: string
          vendor_transaction_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_withdrawal_requests_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["vendor_id"]
          },
          {
            foreignKeyName: "vendor_withdrawal_requests_vendor_transaction_id_fkey"
            columns: ["vendor_transaction_id"]
            isOneToOne: false
            referencedRelation: "vendor_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          auth_user_id: string | null
          business_name: string | null
          commission_rate: number
          created_at: string | null
          credit_application_status: string | null
          email: string
          email_verified: boolean
          fee_balance: number
          first_name: string | null
          full_name: string
          id_back_path: string | null
          id_front_path: string | null
          id_number: string | null
          id_number_hash: string | null
          is_active: boolean | null
          kyc_status: string | null
          mobile_number: string | null
          mobile_verified: boolean
          password_changed: boolean | null
          password_hash: string | null
          pin_hash: string
          pin_set: boolean
          registration_confirmed: boolean
          registration_status: string
          selfie_path: string | null
          subscription_status: string | null
          surname: string | null
          temp_password: string | null
          temp_password_changed: boolean
          temp_password_expires_at: string | null
          token_balance: number
          updated_at: string | null
          vendor_code: string
          vendor_id: string
          vendor_type: string
        }
        Insert: {
          auth_user_id?: string | null
          business_name?: string | null
          commission_rate?: number
          created_at?: string | null
          credit_application_status?: string | null
          email: string
          email_verified?: boolean
          fee_balance?: number
          first_name?: string | null
          full_name: string
          id_back_path?: string | null
          id_front_path?: string | null
          id_number?: string | null
          id_number_hash?: string | null
          is_active?: boolean | null
          kyc_status?: string | null
          mobile_number?: string | null
          mobile_verified?: boolean
          password_changed?: boolean | null
          password_hash?: string | null
          pin_hash?: string
          pin_set?: boolean
          registration_confirmed?: boolean
          registration_status?: string
          selfie_path?: string | null
          subscription_status?: string | null
          surname?: string | null
          temp_password?: string | null
          temp_password_changed?: boolean
          temp_password_expires_at?: string | null
          token_balance?: number
          updated_at?: string | null
          vendor_code: string
          vendor_id?: string
          vendor_type?: string
        }
        Update: {
          auth_user_id?: string | null
          business_name?: string | null
          commission_rate?: number
          created_at?: string | null
          credit_application_status?: string | null
          email?: string
          email_verified?: boolean
          fee_balance?: number
          first_name?: string | null
          full_name?: string
          id_back_path?: string | null
          id_front_path?: string | null
          id_number?: string | null
          id_number_hash?: string | null
          is_active?: boolean | null
          kyc_status?: string | null
          mobile_number?: string | null
          mobile_verified?: boolean
          password_changed?: boolean | null
          password_hash?: string | null
          pin_hash?: string
          pin_set?: boolean
          registration_confirmed?: boolean
          registration_status?: string
          selfie_path?: string | null
          subscription_status?: string | null
          surname?: string | null
          temp_password?: string | null
          temp_password_changed?: boolean
          temp_password_expires_at?: string | null
          token_balance?: number
          updated_at?: string | null
          vendor_code?: string
          vendor_id?: string
          vendor_type?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          error_message: string | null
          headers: Json | null
          id: string
          payload: Json
          provider_id: string | null
          provider_name: string
          received_at: string | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          error_message?: string | null
          headers?: Json | null
          id?: string
          payload: Json
          provider_id?: string | null
          provider_name: string
          received_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          error_message?: string | null
          headers?: Json | null
          id?: string
          payload?: Json
          provider_id?: string | null
          provider_name?: string
          received_at?: string | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "payment_providers"
            referencedColumns: ["payment_provider_id"]
          },
        ]
      }
    }
    Views: {
      admin_dashboard_stats: {
        Row: {
          pending_withdrawals: number | null
          successful_transactions: number | null
          total_transaction_value: number | null
          total_transactions: number | null
          total_vendors: number | null
        }
        Relationships: []
      }
      bulk_uploads_progress: {
        Row: {
          bulk_upload_id: string | null
          failed_records: number | null
          filename: string | null
          merchant_id: string | null
          processed_records: number | null
          status: string | null
          total_records: number | null
          upload_date: string | null
        }
        Insert: {
          bulk_upload_id?: string | null
          failed_records?: number | null
          filename?: string | null
          merchant_id?: string | null
          processed_records?: number | null
          status?: string | null
          total_records?: number | null
          upload_date?: string | null
        }
        Update: {
          bulk_upload_id?: string | null
          failed_records?: number | null
          filename?: string | null
          merchant_id?: string | null
          processed_records?: number | null
          status?: string | null
          total_records?: number | null
          upload_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bulk_uploads_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchant_billing_status"
            referencedColumns: ["merchant_id"]
          },
          {
            foreignKeyName: "bulk_uploads_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["merchant_id"]
          },
        ]
      }
      merchant_billing_status: {
        Row: {
          billing_locked: boolean | null
          business_name: string | null
          current_month_fee_due: number | null
          locked_at: string | null
          merchant_id: string | null
          outstanding_due_date: string | null
          outstanding_fee_amount: number | null
          outstanding_generated_code: string | null
          outstanding_invoice_id: string | null
          outstanding_invoice_month: string | null
          outstanding_invoice_number: string | null
          outstanding_payment_link: string | null
          outstanding_status: string | null
          vendor_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      activate_my_staff_membership: { Args: never; Returns: boolean }
      get_my_merchant_security_context: {
        Args: { p_merchant_identifier?: string | null }
        Returns: {
          merchant_id: string
          actor_role: string
          membership_status: string
          network_restrictions_enabled: boolean
          current_ip: string | null
          network_allowed: boolean
          mfa_enrolled: boolean
          current_aal: string
          access_allowed: boolean
        }[]
      }
      claim_account_session: {
        Args: { p_session_id: string; p_tab_id: string }
        Returns: boolean
      }
      release_account_session: {
        Args: { p_session_id: string; p_tab_id: string }
        Returns: boolean
      }
      add_sms_credits: {
        Args: { p_count: number; p_merchant_id: string }
        Returns: undefined
      }
      apply_kyc_snapshot_to_merchant_payout: {
        Args: { p_merchant_id: string }
        Returns: undefined
      }
      backfill_active_advances: { Args: never; Returns: undefined }
      backfill_approved_advances: { Args: never; Returns: undefined }
      create_transaction_api: {
        Args: {
          p_amount: number
          p_invoice_id: string
          p_merchant_id: string
          p_type: string
          p_user_email: string
          p_user_mobile: string
        }
        Returns: {
          amount: number
          amount_paid: number | null
          business_name: string | null
          created_at: string | null
          date_generated: string | null
          date_paid: string | null
          facilitator_id: string | null
          facilitator_merchant_code: string | null
          finalized: boolean | null
          generated_code: string
          invoice_id: string | null
          merchant_client_id: string | null
          merchant_id: string
          payment_method: string | null
          payment_provider_id: string | null
          payment_provider_signature: string | null
          status: string | null
          tnx_fee: number | null
          tnx_fee_applies_to: string | null
          tnx_fee_plan_key: string | null
          tnx_fee_plan_type: string | null
          tnx_fee_rate: number | null
          tnx_fee_snapshot_at: string | null
          tnx_fee_source: string | null
          transaction_id: string
          type: string
          updated_at: string | null
          user_email: string | null
          user_mobile: string | null
        }
        SetofOptions: {
          from: "*"
          to: "transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_platform_fee_rate: {
        Args: { p_fee_key: string }
        Returns: number
      }
      deduct_sms_credits: { Args: { p_count: number }; Returns: boolean }
      delete_old_webhook_logs: { Args: never; Returns: undefined }
      expire_old_transactions: { Args: never; Returns: undefined }
      expire_past_due_subscriptions: { Args: never; Returns: number }
      generate_monthly_merchant_fee_invoices: {
        Args: { p_invoice_month?: string }
        Returns: {
          out_amount: number
          out_generated_code: string
          out_invoice_number: string
          out_merchant_id: string
          out_payment_link: string
        }[]
      }
      generate_pay_code: { Args: never; Returns: string }
      generate_temp_password: { Args: never; Returns: string }
      generate_transaction_id: { Args: never; Returns: string }
      generate_transaction_id_with_type: {
        Args: { transaction_type?: string }
        Returns: string
      }
      get_current_advance_balance: {
        Args: { vendor_uuid: string }
        Returns: number
      }
      get_merchant_public_info: {
        Args: { p_merchant_id: string }
        Returns: {
          business_name: string
          merchant_id: string
        }[]
      }
      get_or_create_merchant_client: {
        Args: { p_email: string; p_merchant_id: string; p_mobile: string }
        Returns: string
      }
      get_provider_basic_info: {
        Args: never
        Returns: {
          contact_email: string
          contact_number: string
          created_at: string
          name: string
          payment_provider_id: string
          status: string
        }[]
      }
      get_provider_signature_key: {
        Args: { provider_name: string }
        Returns: string
      }
      get_total_token_balance: {
        Args: { vendor_uuid: string }
        Returns: number
      }
      get_vendor_auth_info: {
        Args: { p_vendor_code: string }
        Returns: {
          email: string
          role: string
          vendor_id: string
        }[]
      }
      increment_balance: {
        Args: { amount: number; vendor_uuid: string }
        Returns: undefined
      }
      is_current_user_admin: { Args: never; Returns: boolean }
      lookup_pending_transaction: {
        Args: { p_email?: string; p_merchant_id: string; p_mobile?: string }
        Returns: {
          amount: number
          business_name: string
          date_generated: string
          generated_code: string
          invoice_id: string
          status: string
          transaction_id: string
          user_email: string
          user_mobile: string
        }[]
      }
      mark_overdue_merchant_fee_invoices: { Args: never; Returns: number }
      paysme_sync_merchant_kyc_status: {
        Args: { p_merchant_id: string }
        Returns: undefined
      }
      paysme_sync_merchant_subscription_status: {
        Args: { p_merchant_id: string }
        Returns: undefined
      }
      process_bulk_upload: {
        Args: { p_bulk_upload_id: string }
        Returns: undefined
      }
      process_due_bulk_scheduled_sms: { Args: never; Returns: undefined }
      refresh_kyc_document_rollup: {
        Args: { p_submission_id: string }
        Returns: undefined
      }
      send_merchant_fee_invoice_notifications: {
        Args: { p_dry_run?: boolean; p_merchant_id?: string }
        Returns: {
          amount: number
          email: string
          generated_code: string
          invoice_id: string
          invoice_number: string
          merchant_id: string
          mobile_number: string
          notification_action: string
          payment_link: string
        }[]
      }
      transaction_plan_key: { Args: { p_plan_type: string }; Returns: string }
      validate_payment_code: {
        Args: { pay_code: string }
        Returns: {
          amount: number
          business_name: string
          can_retry: boolean
          date_generated: string
          generated_code: string
          invoice_id: string
          status: string
          transaction_id: string
          user_email: string
          user_mobile: string
        }[]
      }
      validate_vendor_credentials: {
        Args: { p_api_key: string; p_provider_name: string }
        Returns: boolean
      }
      verify_scheduled_sms_cron_secret: {
        Args: { p_secret: string }
        Returns: boolean
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
  public: {
    Enums: {},
  },
} as const
