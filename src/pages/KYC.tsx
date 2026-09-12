import { useCallback, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Check, X, AlertCircle, CheckCircle2, Clock3, LoaderCircle } from "lucide-react";
import DocumentUpload, { type DocumentFile, type DocumentTypeOption } from "@/components/DocumentUpload";
import { BusinessIndustrySelect } from "@/components/BusinessIndustrySelect";
import type { Database } from "@/integrations/supabase/types";

const KYC_BUCKET = "vendor-kyc-documents";
const BANK_DOCUMENT_TYPES: DocumentTypeOption[] = [
  { value: "banking_confirmation", label: "Banking Confirmation" },
  { value: "bank_statement", label: "Bank Statement" }
];

const sanitizeFileName = (fileName: string) =>
  fileName.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(0, 140);

interface KycSubmission {
  id: string;
  user_id: string;
  business_type: string | null;
  business_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
  mobile_number: string | null;
  date_of_birth: string | null;
  id_number: string | null;
  region: string | null;
  town: string | null;
  address: string | null;
  income_source: string | null;
  annual_income: string | null;
  industry: string | null;
  bank_name: string | null;
  bank_doc_status: string | null;
  branch: string | null;
  branch_code: string | null;
  account_number: string | null;
  account_holder_name: string | null;
  account_type: string | null;
  kyc_status: string;
  banking_verified: boolean | null;
  documents_uploaded: boolean | null;
  finalized: boolean | null;
}

type KycStatus = "incomplete" | "pending" | "processing" | "sent_back" | "declined" | "approved";
type BankDocStatus = "unsubmitted" | "pending" | "sent_back" | "verified";
type KycActivityRow = Database["public"]["Tables"]["merchant_kyc_activity_log"]["Row"];

const normalizeKycStatus = (status?: string | null): KycStatus => {
  const normalized = status?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "send_back" || normalized === "returned" || normalized === "returned_for_changes") return "sent_back";
  if (normalized === "decline" || normalized === "rejected" || normalized === "denied") return "declined";
  return normalized === "pending" || normalized === "processing" || normalized === "sent_back" || normalized === "declined" || normalized === "approved"
    ? normalized
    : "incomplete";
};

const normalizeBankDocStatus = (status?: string | null, bankingVerified?: boolean | null): BankDocStatus => {
  if (bankingVerified) return "verified";
  const normalized = status?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return normalized === "pending" || normalized === "sent_back" || normalized === "verified"
    ? normalized
    : "unsubmitted";
};

const activityMessage = (activity: KycActivityRow | null) => {
  if (!activity) return "";
  const details = activity.details && typeof activity.details === "object" && !Array.isArray(activity.details)
    ? activity.details as Record<string, unknown>
    : null;
  const detailMessage = details && typeof details.message === "string" ? details.message : "";

  return activity.note || activity.notes || activity.message || activity.reason || detailMessage;
};

const KYC = () => {
  const { toast } = useToast();
  const { merchant, refreshMerchant } = useAuth();
  const [loading, setLoading] = useState(false);
  const [kycSubmission, setKycSubmission] = useState<KycSubmission | null>(null);
  const [documents, setDocuments] = useState<DocumentFile[]>([]);
  const [bankDocuments, setBankDocuments] = useState<DocumentFile[]>([]);
  const [documentResetKey, setDocumentResetKey] = useState(0);
  const [bankDocumentResetKey, setBankDocumentResetKey] = useState(0);
  const [latestKycActivity, setLatestKycActivity] = useState<KycActivityRow | null>(null);
  const [formData, setFormData] = useState({
    business_type: "",
    first_name: "",
    last_name: "",
    business_name: "",
    mobile_number: "",
    email: "",
    date_of_birth: "",
    id_number: "",
    region: "",
    town: "",
    address: "",
    income_source: "",
    annual_income: "",
    industry: "",
    bank_name: "",
    branch: "",
    branch_code: "",
    account_number: "",
    account_holder_name: "",
    account_type: "personal"
  });
  const [profileStatus, setProfileStatus] = useState({
    email: false,
    mobile: false,
    bank_verified: false,
    documents_uploaded: false,
    kyc_complete: false
  });
  const currentKycStatus = normalizeKycStatus(kycSubmission?.kyc_status);
  const currentBankDocStatus = normalizeBankDocStatus(
    kycSubmission?.bank_doc_status,
    kycSubmission?.banking_verified
  );
  const bankDocumentsOnly = currentBankDocStatus === "sent_back";
  const canEditKyc = (
    currentKycStatus === "incomplete" || currentKycStatus === "sent_back"
  ) && !bankDocumentsOnly;
  const canUploadBankDocuments = bankDocumentsOnly || (
    canEditKyc && currentBankDocStatus === "unsubmitted"
  );
  const fetchLatestKycActivity = useCallback(async (submissionId: string, status: KycStatus) => {
    if (!merchant?.merchant_id || (status !== "sent_back" && status !== "declined")) {
      setLatestKycActivity(null);
      return;
    }

    const action = status === "sent_back" ? "send_back" : "decline";
    const { data, error } = await supabase
      .from("merchant_kyc_activity_log")
      .select("*")
      .eq("merchant_id", merchant.merchant_id)
      .eq("kyc_submission_id", submissionId)
      .eq("action", action)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Unable to load the latest KYC review message:", error);
      setLatestKycActivity(null);
      return;
    }

    setLatestKycActivity(data);
  }, [merchant?.merchant_id]);

  const fetchKycSubmission = useCallback(async () => {
    if (!merchant) return;
    
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const kycOwnerId = authData.user?.id || merchant.merchant_id;

      const { data, error } = await supabase
        .from('kyc_submissions')
        .select('*')
        .eq('user_id', kycOwnerId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setKycSubmission(data);
        await fetchLatestKycActivity(data.id, normalizeKycStatus(data.kyc_status));
        setFormData({
          business_type: data.business_type || "",
          first_name: data.first_name || "",
          last_name: data.last_name || "",
          business_name: data.business_name || merchant.business_name || "",
          mobile_number: data.mobile_number || merchant.mobile_number || "",
          email: data.email || merchant.email || "",
          date_of_birth: data.date_of_birth || "",
          id_number: data.id_number || "",
          region: data.region || "",
          town: data.town || "",
          address: data.address || "",
          income_source: data.income_source || "",
          annual_income: data.annual_income || "",
          industry: data.industry || "",
          bank_name: data.bank_name || "",
          branch: data.branch || "",
          branch_code: data.branch_code || "",
          account_number: data.account_number || "",
          account_holder_name: data.account_holder_name || "",
          account_type: data.account_type || "personal"
        });
        setProfileStatus({
          email: !!data.email,
          mobile: !!data.mobile_number,
          bank_verified: data.banking_verified || false,
          documents_uploaded: data.documents_uploaded || false,
          kyc_complete: data.kyc_status === 'approved'
        });
      } else {
        setLatestKycActivity(null);
        // Initialize with merchant data
        setFormData(prev => ({
          ...prev,
          business_name: merchant.business_name || "",
          mobile_number: merchant.mobile_number || "",
          email: merchant.email || ""
        }));
        setProfileStatus({
          email: !!merchant.email,
          mobile: !!merchant.mobile_number,
          bank_verified: false,
          documents_uploaded: false,
          kyc_complete: false
        });
      }
    } catch (error: unknown) {
      const errorCode = typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
      if (errorCode !== 'PGRST116') { // Not found error is expected for new users
        console.error('Error fetching KYC submission:', error);
      }
    }
  }, [merchant, fetchLatestKycActivity]);
  const handleInputChange = (field: string, value: string) => {
    if (!canEditKyc) return;
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSaveSection = async (section: 'personal' | 'business' | 'bank') => {
    if (!merchant) return;
    if (!canEditKyc) {
      toast({
        title: "KYC Locked",
        description: "Your KYC cannot be edited while it is under review.",
        variant: "destructive"
      });
      return;
    }
    setLoading(true);
    
    try {
      const kycData = {
        user_id: merchant.merchant_id,
        ...formData,
        email: merchant.email, // Ensure email comes from merchant (immutable)
        mobile_number: merchant.mobile_number || formData.mobile_number
      };

      let submissionId = kycSubmission?.id as string | undefined;

      if (submissionId) {
        // Update existing submission
        const { error } = await supabase
          .from('kyc_submissions')
          .update(kycData)
          .eq('id', submissionId);
        if (error) throw error;
      } else {
        // Create new submission
        const { data, error } = await supabase
          .from('kyc_submissions')
          .insert([kycData])
          .select()
          .single();
        if (error) throw error;
        setKycSubmission(data);
        submissionId = data.id;
      }

      if (section === 'bank' && submissionId && bankDocuments.length > 0) {
        await uploadKycDocuments(submissionId, bankDocuments);
        setBankDocuments([]);
        setBankDocumentResetKey(key => key + 1);
      }

      await fetchKycSubmission();
      toast({
        title: "Information Saved",
        description: section === 'bank' && bankDocuments.length > 0
          ? "Your bank details and supporting document were saved successfully."
          : `Your ${section} information has been saved successfully.`
      });
    } catch (error) {
      console.error('Save error:', error);
      toast({
        title: "Save Failed",
        description: "Failed to save information. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const uploadKycDocuments = async (submissionId: string, files: DocumentFile[]) => {
    if (files.length === 0) return 0;

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw authError;
    if (!authData.user) throw new Error("Your session has expired. Please sign in again.");

    const uploadedPaths: string[] = [];
    const insertedDocumentIds: string[] = [];
    const replacedDocumentIds = new Set<string>();
    const replacedDocumentPaths = new Set<string>();

    try {
      for (const doc of files) {
        if (!doc.type) {
          throw new Error("Please select a document type for each uploaded file.");
        }
        if (doc.type === "other" && !doc.customName?.trim()) {
          throw new Error("Please enter a name for each document marked Other.");
        }

        const documentName = doc.type === "other" ? doc.customName!.trim() : doc.name;
        if (currentKycStatus === "sent_back" || currentBankDocStatus === "sent_back") {
          let replacementQuery = supabase
            .from("kyc_documents")
            .select("id, document_url")
            .eq("kyc_submission_id", submissionId)
            .eq("document_type", doc.type);

          if (doc.type === "other") {
            replacementQuery = replacementQuery.eq("document_name", documentName);
          }

          const { data: replacementRows, error: replacementError } = await replacementQuery;
          if (replacementError) throw replacementError;
          replacementRows?.forEach(row => {
            replacedDocumentIds.add(row.id);
            replacedDocumentPaths.add(row.document_url);
          });
        }

        const safeName = sanitizeFileName(doc.file.name);
        const objectPath = `${authData.user.id}/${submissionId}/${Date.now()}-${doc.id}-${safeName}`;
        const uploadOptions: { cacheControl: string; upsert: boolean; contentType?: string } = {
          cacheControl: "3600",
          upsert: false
        };

        if (doc.file.type) {
          uploadOptions.contentType = doc.file.type;
        }

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(KYC_BUCKET)
          .upload(objectPath, doc.file, uploadOptions);

        if (uploadError) throw uploadError;
        uploadedPaths.push(uploadData.path);

        const { data: documentRecord, error: documentError } = await supabase
          .from("kyc_documents")
          .insert({
            kyc_submission_id: submissionId,
            user_id: authData.user.id,
            document_type: doc.type,
            document_name: documentName,
            document_url: uploadData.path,
            document_size: doc.file.size
          })
          .select("id")
          .single();

        if (documentError) throw documentError;
        insertedDocumentIds.push(documentRecord.id);
      }

      const { count, error: verificationError } = await supabase
        .from("kyc_documents")
        .select("id", { count: "exact", head: true })
        .eq("kyc_submission_id", submissionId);

      if (verificationError) throw verificationError;
      if (!count) throw new Error("The uploaded documents could not be verified in KYC records.");

      if (replacedDocumentIds.size > 0) {
        const { error: replacementDeleteError } = await supabase
          .from("kyc_documents")
          .delete()
          .in("id", [...replacedDocumentIds]);
        if (replacementDeleteError) throw replacementDeleteError;
      }

      if (replacedDocumentPaths.size > 0) {
        const { error: replacementStorageError } = await supabase.storage
          .from(KYC_BUCKET)
          .remove([...replacedDocumentPaths]);
        if (replacementStorageError) {
          console.error("Old KYC document objects could not be removed:", replacementStorageError);
        }
      }

      return files.length;
    } catch (error) {
      if (insertedDocumentIds.length > 0) {
        await supabase.from("kyc_documents").delete().in("id", insertedDocumentIds);
      }
      if (uploadedPaths.length > 0) {
        await supabase.storage.from(KYC_BUCKET).remove(uploadedPaths);
      }
      throw error;
    }
  };

  const handleBankDocumentReplacement = async () => {
    if (!bankDocumentsOnly || !kycSubmission) return;
    if (bankDocuments.length === 0) {
      toast({
        title: "Bank Document Required",
        description: "Choose a banking confirmation or bank statement before uploading.",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      await uploadKycDocuments(kycSubmission.id, bankDocuments);
      setBankDocuments([]);
      setBankDocumentResetKey(key => key + 1);
      await fetchKycSubmission();
      toast({
        title: "Bank Document Uploaded",
        description: "Your replacement bank document was uploaded for admin review."
      });
    } catch (error) {
      console.error("Bank document replacement failed:", error);
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "The replacement bank document could not be uploaded.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (merchant) {
      fetchKycSubmission();
    }
  }, [merchant, fetchKycSubmission]);

  useEffect(() => {
    if (!merchant?.merchant_id) return;

    const channel = supabase
      .channel(`merchant-kyc-status-${merchant.merchant_id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "kyc_submissions",
          filter: `user_id=eq.${merchant.merchant_id}`
        },
        () => fetchKycSubmission()
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "merchant_kyc_activity_log",
          filter: `merchant_id=eq.${merchant.merchant_id}`
        },
        () => fetchKycSubmission()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [merchant?.merchant_id, fetchKycSubmission]);

  const handleFinalizeKyc = async () => {
    if (!canEditKyc) {
      toast({
        title: currentKycStatus === "declined" ? "KYC Declined" : "KYC Locked",
        description: currentKycStatus === "declined"
          ? "This KYC application cannot be resubmitted. Contact PaySME support for assistance."
          : "Your KYC is already under admin review.",
        variant: "destructive"
      });
      return;
    }
    if (!kycSubmission) {
      toast({
        title: "Save First",
        description: "Please save your information before finalizing.",
        variant: "destructive"
      });
      return;
    }

    const allDocuments = [...documents, ...bankDocuments];

    if (!profileStatus.documents_uploaded && allDocuments.length === 0) {
      toast({
        title: "Documents Required",
        description: "Please upload the required KYC documents before finalizing.",
        variant: "destructive"
      });
      return;
    }

    if (allDocuments.some(doc => !doc.type)) {
      toast({
        title: "Document Type Required",
        description: "Please select a document type for every uploaded file.",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      await uploadKycDocuments(kycSubmission.id, allDocuments);

      const { count: savedDocumentCount, error: savedDocumentsError } = await supabase
        .from("kyc_documents")
        .select("id", { count: "exact", head: true })
        .eq("kyc_submission_id", kycSubmission.id);

      if (savedDocumentsError) throw savedDocumentsError;
      if (!savedDocumentCount) throw new Error("Upload at least one KYC document before finalizing.");

      const { error } = await supabase
        .from('kyc_submissions')
        .update({
          finalized: true,
          documents_uploaded: true,
          kyc_status: 'pending',
          banking_verified: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', kycSubmission.id);

      if (error) throw error;

      await fetchKycSubmission();
      setDocuments([]);
      setBankDocuments([]);
      setDocumentResetKey(key => key + 1);
      setBankDocumentResetKey(key => key + 1);
      toast({
        title: "KYC Finalized",
        description: "Your KYC documents were uploaded and your submission is under review."
      });
    } catch (error) {
      console.error('Finalize error:', error);
      toast({
        title: "Finalization Failed",
        description: error instanceof Error ? error.message : "Failed to finalize KYC. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const incomeSourceOptions = [
    "Salary", "Pension", "Investments", "Gifts", "Inheritance", "Product/Service Sales", "Other"
  ];
  const kycApproved = currentKycStatus === "approved";
  const statusDisplay = {
    incomplete: {
      label: "Incomplete",
      description: "Complete your details and upload the required documents.",
      className: "border-red-400/40 bg-red-500/15 text-red-100",
      icon: AlertCircle
    },
    pending: {
      label: "Pending",
      description: "Your KYC has been submitted and is waiting for review.",
      className: "border-amber-400/40 bg-amber-500/15 text-amber-100",
      icon: Clock3
    },
    processing: {
      label: "Processing",
      description: "PaySME is currently reviewing your KYC submission.",
      className: "border-blue-400/40 bg-blue-500/15 text-blue-100",
      icon: LoaderCircle
    },
    sent_back: {
      label: "Sent Back",
      description: "Review the admin message, update your KYC, and resubmit it.",
      className: "border-amber-400/40 bg-amber-500/15 text-amber-100",
      icon: AlertCircle
    },
    declined: {
      label: "Declined",
      description: "Your KYC application was declined. Review the admin message below.",
      className: "border-red-400/40 bg-red-500/15 text-red-100",
      icon: X
    },
    approved: {
      label: "Approved",
      description: "Your KYC verification is complete.",
      className: "border-green-400/40 bg-green-500/15 text-green-100",
      icon: CheckCircle2
    }
  }[currentKycStatus];
  const StatusIcon = statusDisplay.icon;
  const StatusIndicator = ({ completed, label }: { completed: boolean; label: string }) => (
    <div className="flex items-center space-x-2">
      {completed || kycApproved ? (
        <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
          <Check className="w-2 h-2 text-white" />
        </div>
      ) : currentKycStatus === 'pending' || currentKycStatus === 'sent_back' ? (
        <div className="w-4 h-4 rounded-full bg-orange-500 flex items-center justify-center">
          <X className="w-2 h-2 text-white" />
        </div>
      ) : currentKycStatus === 'processing' ? (
        <div className="w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center">
          <LoaderCircle className="w-2.5 h-2.5 animate-spin text-white" />
        </div>
      ) : (
        <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
          <X className="w-2 h-2 text-white" />
        </div>
      )}
      <span className="text-sm text-white/90">{label}</span>
    </div>
  );

  const isBankingFieldDisabled = () => {
    return !canEditKyc || currentBankDocStatus !== "unsubmitted";
  };

  const shouldShowBusinessAccount = () => {
    return formData.business_type && formData.business_type !== 'sole_proprietor';
  };
  const latestReviewMessage = activityMessage(latestKycActivity);
  return <ProtectedRoute>
      <div className="min-h-screen bg-paysme-gradient-start">
        <div className="p-8 px-12 bg-gray-100">
          {(currentKycStatus === "sent_back" || currentKycStatus === "declined") && (
            <section
              className={`mb-6 rounded-md border p-5 ${
                currentKycStatus === "sent_back"
                  ? "border-amber-400/50 bg-amber-500/10 text-amber-50"
                  : "border-red-400/50 bg-red-500/10 text-red-50"
              }`}
              aria-live="polite"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <h2 className="font-semibold">
                    {currentKycStatus === "sent_back" ? "KYC returned for changes" : "KYC application declined"}
                  </h2>
                  <p className="mt-1 text-sm text-white/80">
                    {latestReviewMessage || (
                      currentKycStatus === "sent_back"
                        ? "PaySME returned your KYC for updates. Review your information and documents before resubmitting."
                        : "Contact PaySME support if you need more information about this decision."
                    )}
                  </p>
                  {currentKycStatus === "sent_back" && (
                    <p className="mt-2 text-xs font-medium uppercase tracking-[0.12em] text-amber-200">
                      Editing and document replacement are enabled
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}
          {/* Status Overview */}
          <Card className="mb-8 border border-[#f6c431] bg-[#19231c] shadow-[0_0_24px_rgba(246,196,49,0.16)]">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="text-white">Profile Completion Status</CardTitle>
                <CardDescription className="mt-1 text-white/65">{statusDisplay.description}</CardDescription>
              </div>
              <div
                className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold ${statusDisplay.className}`}
                aria-live="polite"
              >
                <StatusIcon className={`h-4 w-4 ${currentKycStatus === "processing" ? "animate-spin" : ""}`} />
                KYC Status: {statusDisplay.label}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-6">
                <StatusIndicator completed={profileStatus.email} label="Email Address" />
                <StatusIndicator completed={profileStatus.mobile} label="Mobile Number" />
                <StatusIndicator completed={profileStatus.bank_verified} label="Bank Details Verified" />
                <StatusIndicator completed={profileStatus.documents_uploaded} label="Documents Uploaded" />
                <StatusIndicator completed={profileStatus.kyc_complete} label="KYC Complete" />
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-12">
            {/* Personal Information */}
            <Card>
              <CardHeader className="bg-gray-700">
                <CardTitle className="text-white">Personal Information</CardTitle>
              </CardHeader>
              <CardContent
                className={`space-y-4 pt-6 ${!canEditKyc ? "pointer-events-none opacity-70" : ""}`}
                aria-disabled={!canEditKyc}
              >
                <div>
                  <Label>Business Type</Label>
                  <Select value={formData.business_type} onValueChange={value => handleInputChange('business_type', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Business Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ngo">NGO</SelectItem>
                      <SelectItem value="sole_proprietor">Sole Proprietor</SelectItem>
                      <SelectItem value="cc">Close Corporation</SelectItem>
                      <SelectItem value="pty">PTY Ltd</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Email Address</Label>
                  <Input 
                    type="email" 
                    value={formData.email} 
                    className="bg-gray-100" 
                    disabled 
                  />
                  <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>First Name</Label>
                    <Input 
                      value={formData.first_name} 
                      onChange={e => handleInputChange('first_name', e.target.value)}
                      placeholder="First Name" 
                    />
                  </div>
                  <div>
                    <Label>Last Name</Label>
                    <Input 
                      value={formData.last_name} 
                      onChange={e => handleInputChange('last_name', e.target.value)}
                      placeholder="Last Name" 
                    />
                  </div>
                </div>
                
                {formData.business_type && formData.business_type !== 'sole_proprietor' && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                    <p className="text-sm text-yellow-800">
                      ⚠️ Name must match your CC/BIPA registration documents
                    </p>
                  </div>
                )}

                <div>
                  <Label>Business Name</Label>
                  <Input 
                    value={formData.business_name} 
                    onChange={e => handleInputChange('business_name', e.target.value)}
                    placeholder="Business Name" 
                  />
                </div>

                <div>
                  <Label>Date of Birth</Label>
                  <Input 
                    type="date" 
                    value={formData.date_of_birth} 
                    onChange={e => handleInputChange('date_of_birth', e.target.value)} 
                  />
                </div>

                <div>
                  <Label>ID Number or CC Reg Number</Label>
                  <Input 
                    value={formData.id_number} 
                    onChange={e => handleInputChange('id_number', e.target.value)} 
                    placeholder="Enter your ID or CC Reg number" 
                  />
                </div>

                <div>
                  <Label>Mobile Number</Label>
                  <Input 
                    value={formData.mobile_number} 
                    className="bg-gray-100"
                    disabled
                  />
                  <p className="text-xs text-gray-500 mt-1">Mobile number cannot be changed</p>
                </div>

                <Button 
                  onClick={() => handleSaveSection('personal')} 
                  disabled={loading || !canEditKyc}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {loading ? "Saving..." : "Save Personal Info"}
                </Button>
              </CardContent>
            </Card>

            {/* Business & FICA Details */}
            <Card>
              <CardHeader className="bg-gray-700">
                <CardTitle className="text-white">Business Address &amp; FICA Details</CardTitle>
              </CardHeader>
              <CardContent
                className={`space-y-4 pt-6 ${!canEditKyc ? "pointer-events-none opacity-70" : ""}`}
                aria-disabled={!canEditKyc}
              >
                <div>
                  <Label>Region</Label>
                  <Select value={formData.region} onValueChange={value => handleInputChange('region', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Region" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="khomas">Khomas</SelectItem>
                      <SelectItem value="erongo">Erongo</SelectItem>
                      <SelectItem value="otjozondjupa">Otjozondjupa</SelectItem>
                      <SelectItem value="hardap">Hardap</SelectItem>
                      <SelectItem value="karas">Karas</SelectItem>
                      <SelectItem value="kavango_east">Kavango East</SelectItem>
                      <SelectItem value="kavango_west">Kavango West</SelectItem>
                      <SelectItem value="kunene">Kunene</SelectItem>
                      <SelectItem value="ohangwena">Ohangwena</SelectItem>
                      <SelectItem value="omaheke">Omaheke</SelectItem>
                      <SelectItem value="omusati">Omusati</SelectItem>
                      <SelectItem value="oshana">Oshana</SelectItem>
                      <SelectItem value="oshikoto">Oshikoto</SelectItem>
                      <SelectItem value="otjozondjupa">Otjozondjupa</SelectItem>
                      <SelectItem value="zambezi">Zambezi</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Town / City</Label>
                  <Input 
                    value={formData.town} 
                    onChange={e => handleInputChange('town', e.target.value)} 
                    placeholder="Town of Residence / Registered Town" 
                  />
                </div>

                <div>
                  <Label>Address</Label>
                  <Input 
                    value={formData.address} 
                    onChange={e => handleInputChange('address', e.target.value)} 
                    placeholder="Registered address" 
                  />
                </div>

                <div>
                  <Label>Source of Income</Label>
                  <Select value={formData.income_source} onValueChange={value => handleInputChange('income_source', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Source of Income" />
                    </SelectTrigger>
                    <SelectContent>
                      {incomeSourceOptions.map(option => (
                        <SelectItem key={option.toLowerCase()} value={option.toLowerCase()}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Total Annual Income</Label>
                  <Select value={formData.annual_income} onValueChange={value => handleInputChange('annual_income', value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Annual Income Range" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0-50000">N$0 - N$50,000</SelectItem>
                      <SelectItem value="50000-100000">N$50,000 - N$100,000</SelectItem>
                      <SelectItem value="100000-250000">N$100,000 - N$250,000</SelectItem>
                      <SelectItem value="250000-500000">N$250,000 - N$500,000</SelectItem>
                      <SelectItem value="500000+">N$500,000+</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Industry</Label>
                  <BusinessIndustrySelect
                    value={formData.industry}
                    onChange={value => handleInputChange('industry', value)}
                  />
                </div>

                <DocumentUpload 
                  onDocumentsChange={setDocuments}
                  maxFiles={3}
                  maxSizePerFile={4}
                  resetKey={documentResetKey}
                  description="Upload up to 3 documents (max 4MB each). Required: certified ID/Passport, BIPA registration if applicable, and proof of address."
                  disabled={!canEditKyc}
                />

                <Button 
                  onClick={handleFinalizeKyc} 
                  disabled={loading || !canEditKyc || !kycSubmission || (!profileStatus.documents_uploaded && documents.length === 0 && bankDocuments.length === 0)}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  {loading ? "Processing..." : currentKycStatus === "sent_back" ? "Resubmit KYC" : "Finalize KYC"}
                </Button>

                <Button 
                  onClick={() => handleSaveSection('business')} 
                  disabled={loading || !canEditKyc}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {loading ? "Saving..." : "Save Business Info"}
                </Button>
              </CardContent>
            </Card>

            {/* Bank Details */}
            <Card>
              <CardHeader className="bg-gray-700">
                <CardTitle className="text-white">Bank Details</CardTitle>
                <CardDescription className="text-gray-200">
                  Choose payment via Mobile or Bank Account. Bank Account option is available only once supporting docs are uploaded and verified by Admin.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 pt-6">
                <div>
                  <Label>Account Type</Label>
                  <Select 
                    value={formData.account_type} 
                    onValueChange={value => handleInputChange('account_type', value)}
                    disabled={isBankingFieldDisabled()}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Account Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="personal">Personal Account</SelectItem>
                      <SelectItem value="business">Business Account</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Select Bank</Label>
                  <Select 
                    value={formData.bank_name} 
                    onValueChange={value => handleInputChange('bank_name', value)}
                    disabled={isBankingFieldDisabled()}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select Bank" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fnb">FNB Namibia</SelectItem>
                      <SelectItem value="standard">Standard Bank</SelectItem>
                      <SelectItem value="nedbank">Nedbank</SelectItem>
                      <SelectItem value="bank_windhoek">Bank Windhoek</SelectItem>
                      <SelectItem value="letshego">LETSHEGO BANK</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Branch</Label>
                  <Input 
                    value={formData.branch} 
                    onChange={e => handleInputChange('branch', e.target.value)} 
                    placeholder="Branch" 
                    disabled={isBankingFieldDisabled()}
                  />
                </div>

                <div>
                  <Label>Branch Code</Label>
                  <Input 
                    value={formData.branch_code} 
                    onChange={e => handleInputChange('branch_code', e.target.value)} 
                    placeholder="Branch Code" 
                    disabled={isBankingFieldDisabled()}
                  />
                </div>

                <div>
                  <Label>Account Number</Label>
                  <Input 
                    value={formData.account_number} 
                    onChange={e => handleInputChange('account_number', e.target.value)} 
                    placeholder="Account Number" 
                    disabled={isBankingFieldDisabled()}
                  />
                </div>

                {formData.business_type === 'sole_proprietor' ? (
                  <div className="bg-yellow-100 p-3 rounded">
                    <Label className="font-semibold">Sole Proprietor - Account Holder Name</Label>
                    <Input 
                      value={formData.account_holder_name} 
                      onChange={e => handleInputChange('account_holder_name', e.target.value)}
                      placeholder="Account Holder Name (must match ID)" 
                      className="mt-2"
                      disabled={isBankingFieldDisabled()}
                    />
                    <p className="text-xs text-gray-600 mt-1">Must match your ID document</p>
                  </div>
                ) : shouldShowBusinessAccount() ? (
                  <div className="bg-blue-100 p-3 rounded">
                    <Label className="font-semibold">Business Account - Account Holder Name</Label>
                    <Input 
                      value={formData.account_holder_name} 
                      onChange={e => handleInputChange('account_holder_name', e.target.value)}
                      placeholder="Business Name (as registered)" 
                      className="mt-2"
                      disabled={isBankingFieldDisabled()}
                    />
                    <p className="text-xs text-gray-600 mt-1">Must match your business registration</p>
                  </div>
                ) : null}

                <div className="bg-gray-50 p-3 rounded">
                  <DocumentUpload 
                    onDocumentsChange={setBankDocuments}
                    maxFiles={1}
                    maxSizePerFile={4}
                    documentTypes={BANK_DOCUMENT_TYPES}
                    resetKey={bankDocumentResetKey}
                    description="Upload one banking confirmation or bank statement (max 4MB)."
                    disabled={!canUploadBankDocuments}
                  />
                </div>

                {currentBankDocStatus === "verified" && (
                  <div className="bg-green-50 border border-green-200 rounded p-3">
                    <p className="text-sm text-green-800">✅ Banking details verified and locked</p>
                  </div>
                )}

                {currentBankDocStatus === "pending" && (
                  <div className="rounded border border-blue-200 bg-blue-50 p-3">
                    <p className="text-sm text-blue-800">Banking documents are under admin review.</p>
                  </div>
                )}

                {bankDocumentsOnly && (
                  <div className="rounded border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm text-amber-800">Upload a replacement banking confirmation or bank statement.</p>
                  </div>
                )}

                <Button 
                  onClick={bankDocumentsOnly ? handleBankDocumentReplacement : () => handleSaveSection('bank')}
                  disabled={bankDocumentsOnly
                    ? loading || bankDocuments.length === 0
                    : loading || !canEditKyc || isBankingFieldDisabled()}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  {loading
                    ? "Saving..."
                    : bankDocumentsOnly
                      ? "Upload Replacement Bank Document"
                      : currentBankDocStatus === "verified"
                        ? "Banking Details Verified"
                        : currentBankDocStatus === "pending"
                          ? "Banking Documents Under Review"
                          : "Save Banking Details"}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ProtectedRoute>;
};
export default KYC;
