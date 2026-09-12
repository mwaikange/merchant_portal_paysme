import { useState, useEffect } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Upload, AlertTriangle, Copy, Check } from "lucide-react";
import { formatNad } from "@/lib/formatters";
import { generatePaySMECode, normalizeNamibianMobile } from "@/lib/validations";
import { useBulkSmsAccess } from "@/hooks/useBulkSmsAccess";

interface BulkSubscriber {
  id: string;
  user_email: string;
  user_mobile: string;
  amount: number;
  status: string;
  date_generated: string;
  recurring: boolean;
  recurring_period: string | null;
  generated_code: string;
  reference: string | null;
  scheduled_date: string | null;
  scheduled_send_at?: string | null;
  subscription_group_id?: string | null;
  subscription_base_code?: string | null;
  subscription_sequence?: number | null;
  subscription_total_cycles?: number | null;
  subscription_months?: number | null;
  sms_status?: string | null;
  bulk_upload_id: string | null;
  merchant_client_id: string | null;
}

interface ParsedCsvRow {
  mobile: string;
  email: string;
  reference: string;
  amount: number;
  date: string;
  subscription: boolean;
  period: string;
  months: number;
}

interface ScheduledBulkRow extends ParsedCsvRow {
  subscriptionGroupId: string | null;
  subscriptionBaseCode: string | null;
  sequence: number | null;
  totalCycles: number | null;
  scheduledSendAt: string;
  generatedCode?: string;
  smsCredits?: number;
}

interface BulkStats {
  revenueGenerated: number;
  newClients: number;
  recurringClients: number;
  codesGenerated: number;
}

const BulkSubscribers = () => {
  const SMS_CHARS_PER_CREDIT = 60;
  const { merchant } = useAuth();
  const { toast } = useToast();
  const {
    loading: bulkSmsAccessLoading,
    packageEligible: bulkPackageEligible,
    hasSmsCredentials,
    canUseBulkSms,
  } = useBulkSmsAccess();
  const [subscribers, setSubscribers] = useState<BulkSubscriber[]>([]);
  const [filteredSubscribers, setFilteredSubscribers] = useState<BulkSubscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all_months");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [stats, setStats] = useState<BulkStats | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringPeriod, setRecurringPeriod] = useState("monthly");
  const [uploading, setUploading] = useState(false);
  const [smsBalance, setSmsBalance] = useState(0);
  const [paidSmsPendingLoad, setPaidSmsPendingLoad] = useState(0);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [quickMobile, setQuickMobile] = useState("");
  const [quickEmail, setQuickEmail] = useState("");
  const [quickReference, setQuickReference] = useState("");
  const [quickAmount, setQuickAmount] = useState("");
  const [quickDate, setQuickDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [quickRecurring, setQuickRecurring] = useState(false);
  const [quickRecurringPeriod, setQuickRecurringPeriod] = useState("monthly");
  const [quickRecurringMonths, setQuickRecurringMonths] = useState("12");
  const [sendingQuick, setSendingQuick] = useState(false);
  const [csvPreviewRows, setCsvPreviewRows] = useState<ScheduledBulkRow[]>([]);
  const [showCsvPreview, setShowCsvPreview] = useState(false);
  const [csvValidation, setCsvValidation] = useState<{
    totalRows: number;
    validRows: number;
    invalidRows: number;
    hasValidFormat: boolean;
    sufficientSms: boolean;
    missingDates: number;
    requiredSms: number;
  } | null>(null);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationTimer, setNotificationTimer] = useState<NodeJS.Timeout | null>(null);
  const [resendingSubscriberId, setResendingSubscriberId] = useState<string | null>(null);
  const [cancellingSubscriberId, setCancellingSubscriberId] = useState<string | null>(null);

  useEffect(() => {
    fetchBulkSubscribers();
    fetchSMSBalance();
    fetchPaidSmsPendingLoad();
  }, [merchant, canUseBulkSms]);

  useEffect(() => {
    applyFilters();
  }, [subscribers, searchQuery, statusFilter, periodFilter, dateFrom, dateTo]);

  useEffect(() => {
    calculateStats(subscribers);
  }, [subscribers]);

  useEffect(() => {
    const interval = setInterval(() => fetchSMSBalance(), 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [merchant, canUseBulkSms]);

  const fetchSMSBalance = async () => {
    if (!merchant || !canUseBulkSms) {
      setSmsBalance(0);
      return;
    }
    try {
      const { data: balanceResponse, error: balanceError } = await supabase.functions.invoke('send-sms', {
        body: {
          action: 'get_balance',
          payload: {
            merchant_id: merchant.merchant_id,
            use_merchant_credentials: true,
          },
        },
      });

      if (balanceError) throw balanceError;

      const availableBalance = typeof balanceResponse?.available === "number"
        ? balanceResponse.available
        : Number(balanceResponse?.available || 0);
      setSmsBalance(Math.max(0, Math.floor(availableBalance)));
    } catch (error) {
      console.error('Error fetching SMSPortal balance:', error);
      setSmsBalance(0);
    }
  };

  const fetchPaidSmsPendingLoad = async () => {
    if (!merchant) return;

    try {
      const { data, error } = await supabase
        .from('sms_transactions')
        .select('tokens_purchased, paycode_status, admin_load_status')
        .eq('user_id', merchant.merchant_id)
        .eq('paycode_status', 'paid')
        .in('admin_load_status', ['pending_load', 'processing', 'failed']);

      if (error) throw error;

      const pendingTotal = (data || []).reduce((total, row) => {
        return total + Number(row.tokens_purchased || 0);
      }, 0);

      setPaidSmsPendingLoad(pendingTotal);
    } catch (error) {
      console.warn('Pending SMS load status is not available yet:', error);
      setPaidSmsPendingLoad(0);
    }
  };

  const validateCSV = async (file: File) => {
    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());

      if (lines.length < 2) {
        setCsvValidation({ totalRows: 0, validRows: 0, invalidRows: 0, hasValidFormat: false, sufficientSms: false, missingDates: 0, requiredSms: 0 });
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const requiredHeaders = ['mobile', 'email', 'reference', 'amount', 'date'];
      const hasValidFormat = requiredHeaders.every(h => headers.some(header => header.includes(h)));

      if (!hasValidFormat) {
        setCsvValidation({ totalRows: lines.length - 1, validRows: 0, invalidRows: lines.length - 1, hasValidFormat: false, sufficientSms: false, missingDates: 0, requiredSms: 0 });
        setShowNotification(true);
        startNotificationTimer();
        return;
      }

      const parsedRows = parseCsvRows(text);
      const scheduledRows = buildScheduledRows(parsedRows);
      const validRows = scheduledRows.length;
      const requiredSms = getPreviewSmsCredits(scheduledRows);
      const invalidRows = Math.max(0, lines.length - 1 - validRows);
      const missingDates = parsedRows.filter(row => !row.date).length;
      const sufficientSms = requiredSms <= smsBalance;
      setCsvValidation({ totalRows: lines.length - 1, validRows, invalidRows, hasValidFormat, sufficientSms, missingDates, requiredSms });
      setShowNotification(true);
      startNotificationTimer();
    } catch (error) {
      console.error('CSV validation error:', error);
    }
  };

  const startNotificationTimer = () => {
    if (notificationTimer) clearTimeout(notificationTimer);
    const timer = setTimeout(() => { setShowNotification(false); setCsvValidation(null); }, 60000);
    setNotificationTimer(timer);
  };

  const dismissNotification = () => {
    if (notificationTimer) clearTimeout(notificationTimer);
    setShowNotification(false);
    setCsvValidation(null);
  };

  useEffect(() => {
    if (uploadFile) { validateCSV(uploadFile); } else { setCsvValidation(null); setShowNotification(false); }
  }, [uploadFile, smsBalance]);

  useEffect(() => { return () => { if (notificationTimer) clearTimeout(notificationTimer); }; }, [notificationTimer]);

  const buildCodeLink = (generatedCode: string) => {
    if (!generatedCode) return "";
    return `https://www.paysme.site/c/${encodeURIComponent(generatedCode)}`;
  };

  const getPhoneSearchVariants = (value?: string | null) => {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return new Set<string>();

    const withoutCountry = digits.startsWith("264") ? digits.slice(3) : digits;
    const withoutLeadingZero = withoutCountry.startsWith("0") ? withoutCountry.slice(1) : withoutCountry;
    const local = withoutLeadingZero ? `0${withoutLeadingZero}` : "";
    const international = withoutLeadingZero ? `264${withoutLeadingZero}` : "";

    return new Set([digits, withoutCountry, withoutLeadingZero, local, international].filter(Boolean));
  };

  const getCodeParent = (value?: string | null) => {
    const code = String(value || "").trim().toLowerCase();
    return code.replace(/-\d{1,2}$/, "");
  };

  const parseScheduleTime = (value?: string | null) => {
    const rawValue = String(value || "").trim();
    if (!rawValue) return null;

    const numericDmy = rawValue.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (numericDmy) {
      const [, day, month, year, hour = "0", minute = "0", second = "0"] = numericDmy;
      const timestamp = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second)
      ).getTime();
      return Number.isFinite(timestamp) ? timestamp : null;
    }

    const timestamp = new Date(rawValue).getTime();
    return Number.isFinite(timestamp) ? timestamp : null;
  };

  const getSubscriberScheduleTime = (subscriber: BulkSubscriber) => {
    return parseScheduleTime(subscriber.scheduled_send_at || subscriber.scheduled_date || subscriber.date_generated);
  };

  const formatScheduleDate = (value?: string | null) => {
    const timestamp = parseScheduleTime(value);
    if (timestamp === null) return "";

    return new Date(timestamp).toLocaleDateString("en-GB");
  };

  const getSubscriberGroupRows = (subscriber: BulkSubscriber) => {
    const parentCode = getCodeParent(subscriber.generated_code || subscriber.subscription_base_code);
    const rowPhoneVariants = getPhoneSearchVariants(subscriber.user_mobile);
    const referenceBase = getCodeParent(subscriber.reference);

    return subscribers.filter((candidate) => {
        if (subscriber.subscription_group_id && candidate.subscription_group_id === subscriber.subscription_group_id) return true;

        const candidateParentCode = getCodeParent(candidate.generated_code || candidate.subscription_base_code);
        if (parentCode && candidateParentCode === parentCode) return true;

        const candidateReferenceBase = getCodeParent(candidate.reference);
        const sameReference = referenceBase && candidateReferenceBase === referenceBase;
        const candidatePhoneVariants = getPhoneSearchVariants(candidate.user_mobile);
        const sameMobile = [...rowPhoneVariants].some((variant) => candidatePhoneVariants.has(variant));

        return Boolean(sameReference && sameMobile);
    });
  };

  const addPeriodToDate = (date: Date, period?: string | null) => {
    const next = new Date(date);
    const normalized = String(period || "monthly").toLowerCase();

    if (normalized === "weekly") {
      next.setDate(next.getDate() + 7);
    } else if (normalized === "quarterly") {
      next.setMonth(next.getMonth() + 3);
    } else if (normalized === "semi-annual") {
      next.setMonth(next.getMonth() + 6);
    } else if (normalized === "yearly") {
      next.setFullYear(next.getFullYear() + 1);
    } else {
      next.setMonth(next.getMonth() + 1);
    }

    return next;
  };

  const getRunSummaryForSubscriber = (subscriber: BulkSubscriber) => {
    if (!subscriber.recurring) return { finalRun: "", nextRun: "" };

    const groupRows = getSubscriberGroupRows(subscriber);
    const scheduleTimes = groupRows
      .map(getSubscriberScheduleTime)
      .filter((timestamp): timestamp is number => typeof timestamp === "number")
      .sort((a, b) => a - b);

    if (!scheduleTimes.length) return { finalRun: "", nextRun: "" };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();
    const finalTime = scheduleTimes[scheduleTimes.length - 1];
    const nextFutureTime = scheduleTimes.find((timestamp) => timestamp > todayTime);
    const nextTime = nextFutureTime && nextFutureTime !== finalTime ? nextFutureTime : null;

    return {
      finalRun: new Date(finalTime).toLocaleDateString("en-GB"),
      nextRun: nextTime ? new Date(nextTime).toLocaleDateString("en-GB") : "",
    };
  };

  const fuzzyIncludes = (value: string | null | undefined, query: string) => {
    return String(value || "").toLowerCase().includes(query);
  };

  const buildBulkSmsContent = (sub: { generated_code: string; amount: number; reference?: string | null; recurring?: boolean | null; recurring_period?: string | null }) => {
    const subscriptionLabel = sub.recurring
      ? String(sub.recurring_period || "monthly").charAt(0).toUpperCase() + String(sub.recurring_period || "monthly").slice(1)
      : "Once-Off";
    const paymentLink = buildCodeLink(sub.generated_code);

    return [
      `PaySME Code: ${sub.generated_code}`,
      `Amount: ${formatNad(sub.amount)}`,
      `Merchant: ${merchant?.business_name || "PaySME"}`,
      sub.reference ? `Ref: ${sub.reference}` : "",
      `Subscription: ${subscriptionLabel}`,
      paymentLink ? `Payment link: ${paymentLink}` : "",
      "",
      "Use the link or present this code at any PaySME vendor to complete payment.",
    ].filter(Boolean).join("\n");
  };

  const countSmsCredits = (content: string) => {
    return Math.max(1, Math.ceil(content.length / SMS_CHARS_PER_CREDIT));
  };

  const getScheduledRowCode = (row: ScheduledBulkRow) => {
    if (!row.generatedCode) {
      row.generatedCode = generatePaySMECode();
    }
    return row.generatedCode;
  };

  const getScheduledRowSmsCredits = (row: ScheduledBulkRow) => {
    const content = buildBulkSmsContent({
      generated_code: getScheduledRowCode(row),
      amount: row.amount,
      reference: row.reference,
      recurring: row.subscription,
      recurring_period: row.period,
    });
    return countSmsCredits(content);
  };

  const getPreviewSmsCredits = (rows: ScheduledBulkRow[]) => {
    return rows.reduce((total, row) => total + (row.mobile ? (row.smsCredits || getScheduledRowSmsCredits(row)) : 0), 0);
  };

  const parseBoolean = (value?: string) => {
    const normalized = String(value || "").trim().toLowerCase();
    return ["yes", "y", "true", "1", "recurring", "subscription"].includes(normalized);
  };

  const normalizePeriod = (value?: string) => {
    const normalized = String(value || recurringPeriod || "monthly").trim().toLowerCase();
    if (["weekly", "week"].includes(normalized)) return "weekly";
    if (["quarterly", "quarter"].includes(normalized)) return "quarterly";
    if (["semi-annual", "semiannual", "bi-annual", "biannual", "6 months", "6m"].includes(normalized)) return "semi-annual";
    if (["yearly", "annual", "annually", "12 months", "12m"].includes(normalized)) return "yearly";
    return "monthly";
  };

  const defaultMonthsForPeriod = (period: string) => {
    switch (period) {
      case "weekly": return 12;
      case "quarterly": return 12;
      case "semi-annual": return 12;
      case "yearly": return 12;
      default: return 12;
    }
  };

  const cyclesForPeriod = (period: string, months: number) => {
    switch (period) {
      case "weekly": return Math.max(1, Math.ceil((months / 12) * 52));
      case "quarterly": return Math.max(1, Math.ceil(months / 3));
      case "semi-annual": return Math.max(1, Math.ceil(months / 6));
      case "yearly": return Math.max(1, Math.ceil(months / 12));
      default: return Math.max(1, months);
    }
  };

  const defaultQuickCyclesForPeriod = (period: string) => {
    switch (normalizePeriod(period)) {
      case "weekly": return 52;
      case "quarterly": return 4;
      case "semi-annual": return 2;
      case "yearly": return 1;
      default: return 12;
    }
  };

  const quickCycleCount = () => {
    const period = normalizePeriod(quickRecurringPeriod);
    if (period === "yearly") return 1;
    return Math.max(
      1,
      Math.round(Number(quickRecurringMonths) || defaultQuickCyclesForPeriod(quickRecurringPeriod))
    );
  };

  const quickScheduleSummary = (sendNow = false) => {
    if (sendNow || !quickRecurring) return "Send now once-off";

    const period = normalizePeriod(quickRecurringPeriod);
    const count = quickCycleCount();
    if (period === "yearly" && count === 1) return "Send Annually Once";

    const cadence = period === "weekly"
      ? "Weekly"
      : period === "quarterly"
        ? "Quarterly"
        : period === "semi-annual"
          ? "Semi-annually"
          : period === "yearly"
            ? "Annually"
            : "Monthly";
    const unit = period === "weekly"
      ? "week"
      : period === "quarterly"
        ? "quarter"
        : period === "semi-annual"
          ? "half-year cycle"
          : period === "yearly"
            ? "year"
            : "month";

    return `Send ${cadence} for ${count} ${unit}${count === 1 ? "" : "s"}`;
  };

  const addPeriod = (date: Date, period: string, sequenceOffset: number) => {
    const next = new Date(date);
    if (period === "weekly") {
      next.setDate(next.getDate() + sequenceOffset * 7);
      return next;
    }

    const monthStep = period === "quarterly" ? 3 : period === "semi-annual" ? 6 : period === "yearly" ? 12 : 1;
    const originalDay = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + sequenceOffset * monthStep);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(originalDay, lastDay));
    return next;
  };

  const enforceSmsCutoff = (date: Date) => {
    const adjusted = new Date(date);
    const afterCutoff = adjusted.getHours() > 18 || (adjusted.getHours() === 18 && adjusted.getMinutes() > 0);
    if (afterCutoff) {
      adjusted.setHours(18, 0, 0, 0);
    }
    return adjusted;
  };

  const isFutureScheduledSms = (scheduledAt?: string | null) => {
    if (!scheduledAt) return false;
    const scheduledTime = new Date(scheduledAt).getTime();
    if (Number.isNaN(scheduledTime)) return false;
    return scheduledTime > Date.now() + 60_000;
  };

  const smsSendWasAccepted = (result: any, expectedImmediateCount: number) => {
    if (result?.ok === false) return false;
    if (expectedImmediateCount <= 0) return true;
    return Number(result?.sent_count || 0) >= expectedImmediateCount;
  };

  const parseCsvDate = (value: string) => {
    const raw = String(value || "").trim();
    if (!raw) return null;

    const monthMap: Record<string, number> = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dec: 11,
    };
    const match = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
    if (!match) return null;

    const [, dayValue, monthValue, yearValue] = match;
    const day = Number(dayValue);
    const month = monthMap[monthValue.toLowerCase()];
    const year = Number(yearValue);
    if (!Number.isInteger(day) || month === undefined || !Number.isInteger(year)) return null;

    const parsed = new Date(year, month, day, 9, 0, 0, 0);
    if (
      Number.isNaN(parsed.getTime()) ||
      parsed.getFullYear() !== year ||
      parsed.getMonth() !== month ||
      parsed.getDate() !== day
    ) {
      return null;
    }

    return enforceSmsCutoff(parsed);
  };

  const generateSubscriptionBaseCode = () => {
    const segment = () => String(Math.floor(Math.random() * 10000)).padStart(4, "0");
    return `8000-${segment()}-${segment()}`;
  };

  const parseCsvRows = (text: string): ParsedCsvRow[] => {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const findIndex = (names: string[]) => headers.findIndex(h => names.some(name => h.includes(name)));
    const mobileIdx = findIndex(["mobile", "phone"]);
    const emailIdx = findIndex(["email"]);
    const refIdx = findIndex(["reference", "ref", "invoice"]);
    const amountIdx = findIndex(["amount"]);
    const dateIdx = findIndex(["date"]);
    const subscriptionIdx = findIndex(["subscription", "recurring"]);
    const monthsIdx = findIndex(["months", "duration"]);
    const periodIdx = findIndex(["period", "interval", "frequency"]);

    if ([mobileIdx, emailIdx, refIdx, amountIdx, dateIdx].some(idx => idx < 0)) return [];

    return lines.slice(1).map((line) => {
      const values = line.split(',');
      const period = isRecurring ? recurringPeriod : normalizePeriod(values[periodIdx]);
      const monthsValue = monthsIdx >= 0 ? Number(values[monthsIdx]?.trim()) : NaN;
      const rowSubscription = isRecurring || parseBoolean(values[subscriptionIdx]);
      return {
        mobile: normalizeNamibianMobile(values[mobileIdx]?.trim() || ""),
        email: values[emailIdx]?.trim() || "",
        reference: values[refIdx]?.trim() || "",
        amount: Number(values[amountIdx]?.trim()),
        date: values[dateIdx]?.trim() || "",
        subscription: rowSubscription,
        period,
        months: rowSubscription ? (Number.isFinite(monthsValue) && monthsValue > 0 ? Math.round(monthsValue) : defaultMonthsForPeriod(period)) : 0,
      };
    }).filter(row => row.mobile && row.reference && row.amount > 0 && row.date);
  };

  const buildScheduledRows = (rows: ParsedCsvRow[]) => {
    const scheduled: ScheduledBulkRow[] = [];
    rows.forEach(row => {
      const startDate = parseCsvDate(row.date);
      if (!startDate) return;

      if (!row.subscription) {
        const scheduledRow: ScheduledBulkRow = {
          ...row,
          subscriptionGroupId: null,
          subscriptionBaseCode: null,
          sequence: null,
          totalCycles: null,
          scheduledSendAt: enforceSmsCutoff(startDate).toISOString(),
          generatedCode: generatePaySMECode(),
        };
        scheduledRow.smsCredits = getScheduledRowSmsCredits(scheduledRow);
        scheduled.push(scheduledRow);
        return;
      }

      const totalCycles = cyclesForPeriod(row.period, row.months);
      const subscriptionGroupId = crypto.randomUUID();
      const subscriptionBaseCode = generateSubscriptionBaseCode();
      for (let sequence = 1; sequence <= totalCycles; sequence++) {
        const scheduledRow: ScheduledBulkRow = {
          ...row,
          reference: `${row.reference}-${String(sequence).padStart(2, "0")}`,
          subscriptionGroupId,
          subscriptionBaseCode,
          sequence,
          totalCycles,
          scheduledSendAt: enforceSmsCutoff(addPeriod(startDate, row.period, sequence - 1)).toISOString(),
          generatedCode: `${subscriptionBaseCode}-${String(sequence).padStart(2, "0")}`,
        };
        scheduledRow.smsCredits = getScheduledRowSmsCredits(scheduledRow);
        scheduled.push(scheduledRow);
      }
    });
    return scheduled;
  };

  const buildQuickScheduledRows = (params: {
    mobile: string;
    email: string;
    reference: string;
    amount: number;
    scheduledAt: Date;
    recurring: boolean;
    period: string;
    months: number;
    sendNow: boolean;
  }) => {
    const normalizedPeriod = normalizePeriod(params.period);
    const totalCycles = params.recurring ? Math.max(1, Math.round(params.months || 1)) : 1;
    const subscriptionGroupId = params.recurring ? crypto.randomUUID() : null;
    const subscriptionBaseCode = params.recurring ? generateSubscriptionBaseCode() : null;

    return Array.from({ length: totalCycles }, (_, index) => {
      const sequence = params.recurring ? index + 1 : null;
      const scheduleDate = params.recurring
        ? addPeriod(params.scheduledAt, normalizedPeriod, index)
        : params.scheduledAt;
      const scheduledSendAt = params.sendNow
        ? new Date().toISOString()
        : enforceSmsCutoff(scheduleDate).toISOString();
      const scheduledRow: ScheduledBulkRow = {
        mobile: params.mobile,
        email: params.email,
        reference: sequence ? `${params.reference}-${String(sequence).padStart(2, "0")}` : params.reference,
        amount: params.amount,
        date: "",
        subscription: params.recurring,
        period: normalizedPeriod,
        months: params.recurring ? params.months : 0,
        subscriptionGroupId,
        subscriptionBaseCode,
        sequence,
        totalCycles: params.recurring ? totalCycles : null,
        scheduledSendAt,
        generatedCode: subscriptionBaseCode && sequence
          ? `${subscriptionBaseCode}-${String(sequence).padStart(2, "0")}`
          : generatePaySMECode(),
      };
      scheduledRow.smsCredits = getScheduledRowSmsCredits(scheduledRow);
      return scheduledRow;
    });
  };

  const fetchBulkSubscribers = async () => {
    if (!merchant) return;
    try {
      const { data, error } = await supabase
        .from('bulk_subscribers')
        .select('*')
        .eq('merchant_id', merchant.merchant_id)
        .order('date_generated', { ascending: false });
      if (error) throw error;
      setSubscribers(data || []);
    } catch (error) {
      console.error('Error fetching bulk subscribers:', error);
      toast({ title: "Error", description: "Failed to load bulk subscribers", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const recurringGroupHasNextRun = (subscriber: BulkSubscriber) => {
    if (!subscriber.recurring || !subscriber.subscription_group_id) return false;

    const nowTime = Date.now();
    return subscribers.some(row => {
      if (row.subscription_group_id !== subscriber.subscription_group_id) return false;
      const scheduleTime = getSubscriberScheduleTime(row);
      return scheduleTime !== null && scheduleTime >= nowTime;
    });
  };

  const shouldShowSubscriberSchedule = (subscriber: BulkSubscriber) => {
    const scheduleTime = getSubscriberScheduleTime(subscriber);

    if (subscriber.recurring) {
      return recurringGroupHasNextRun(subscriber);
    }

    return scheduleTime !== null && scheduleTime >= Date.now();
  };

  const applyFilters = () => {
    let filtered = [...subscribers];
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    if (periodFilter === "current_month") {
      filtered = filtered.filter(s => {
        const date = new Date(s.date_generated);
        return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
      });
    } else if (periodFilter === "previous_month") {
      const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      filtered = filtered.filter(s => {
        const date = new Date(s.date_generated);
        return date.getMonth() === prevMonth && date.getFullYear() === prevYear;
      });
    }

    if (dateFrom && dateTo) {
      filtered = filtered.filter(s => {
        const date = new Date(s.date_generated);
        return date >= new Date(dateFrom) && date <= new Date(dateTo);
      });
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter(s => s.status === statusFilter);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const queryPhoneVariants = getPhoneSearchVariants(query);
      const queryCodeParent = getCodeParent(query);

      filtered = filtered.filter(s => {
        const rowPhoneVariants = getPhoneSearchVariants(s.user_mobile);
        const phoneMatches = [...queryPhoneVariants].some(queryVariant => rowPhoneVariants.has(queryVariant));
        const rowGeneratedCode = String(s.generated_code || "").toLowerCase();
        const rowSubscriptionBase = String(s.subscription_base_code || "").toLowerCase();
        const rowCodeParent = getCodeParent(rowGeneratedCode || rowSubscriptionBase);
        const codeMatches = Boolean(queryCodeParent) && (
          rowGeneratedCode.includes(query) ||
          rowSubscriptionBase.includes(queryCodeParent) ||
          rowCodeParent === queryCodeParent
        );

        return (
          fuzzyIncludes(s.user_email, query) ||
          fuzzyIncludes(s.user_mobile, query) ||
          fuzzyIncludes(s.generated_code, query) ||
          fuzzyIncludes(s.reference, query) ||
          phoneMatches ||
          codeMatches
        );
      });
    }

    filtered = filtered.filter(shouldShowSubscriberSchedule);

    filtered.sort((a, b) => {
      const aTime = getSubscriberScheduleTime(a) ?? Number.MAX_SAFE_INTEGER;
      const bTime = getSubscriberScheduleTime(b) ?? Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });

    setFilteredSubscribers(filtered);
  };

  const clearFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setPeriodFilter("all_months");
    setDateFrom("");
    setDateTo("");
  };

  const calculateStats = (data: BulkSubscriber[]) => {
    const revenueGenerated = data.filter(s => s.status === 'paid').reduce((sum, s) => sum + Number(s.amount), 0);

    const visibleClientIds = new Set(data.map(s => s.merchant_client_id).filter(Boolean));
    const allClientCounts = new Map<string, number>();
    data.forEach(s => {
      if (s.merchant_client_id) {
        allClientCounts.set(s.merchant_client_id, (allClientCounts.get(s.merchant_client_id) || 0) + 1);
      }
    });

    let newClients = 0;
    let recurringClients = 0;
    visibleClientIds.forEach(clientId => {
      if ((allClientCounts.get(clientId) || 0) > 1) {
        recurringClients += 1;
      } else {
        newClients += 1;
      }
    });

    setStats({ revenueGenerated, newClients, recurringClients, codesGenerated: data.length });
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const prepareFileUpload = async () => {
    if (!uploadFile || !merchant) {
      toast({ title: "Error", description: "Please select a CSV file", variant: "destructive" });
      return;
    }

    const text = await uploadFile.text();
    const parsedRows = parseCsvRows(text);
    if (parsedRows.length === 0) {
      toast({ title: "Invalid CSV Format", description: "Use mobile, email, reference, amount, date, plus optional subscription, months, period. Dates must use 12-Feb-2026 format.", variant: "destructive" });
      return;
    }

    const scheduledRows = buildScheduledRows(parsedRows);
    if (scheduledRows.length === 0) {
      toast({ title: "Invalid CSV Dates", description: "Every row needs a valid date in 12-Feb-2026 format.", variant: "destructive" });
      return;
    }

    const requiredSms = getPreviewSmsCredits(scheduledRows);
    if (requiredSms > smsBalance) {
      toast({ title: "Insufficient SMS Credits", description: `You need ${requiredSms} SMS credits for this full schedule but only have ${smsBalance}.`, variant: "destructive" });
      return;
    }

    setCsvPreviewRows(scheduledRows);
    setShowCsvPreview(true);
  };

  const handleFileUpload = async (scheduledRows: ScheduledBulkRow[] = csvPreviewRows) => {
    if (!uploadFile || !merchant) {
      toast({ title: "Error", description: "Please select a CSV file", variant: "destructive" });
      return;
    }
    if (scheduledRows.length === 0) {
      toast({ title: "Nothing to process", description: "Preview the CSV before processing.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const data = scheduledRows;
      const validMobileNumbers = data.filter(item => item.mobile && item.mobile.trim()).length;
      const requiredSms = getPreviewSmsCredits(data);

      if (requiredSms > smsBalance) {
        toast({ title: "Insufficient SMS Credits", description: `You need ${requiredSms} SMS credits but only have ${smsBalance}. Please top up.`, variant: "destructive" });
        setUploading(false);
        return;
      }

      // Step 1: Create bulk_uploads record
      const { data: bulkUpload, error: bulkUploadError } = await supabase
        .from('bulk_uploads')
        .insert({
          merchant_id: merchant.merchant_id,
          filename: uploadFile.name,
          total_records: data.length,
          status: 'processing',
          recurring: data.some(row => row.subscription),
          recurring_period: data.some(row => row.subscription) ? recurringPeriod : null,
        })
        .select()
        .single();

      if (bulkUploadError) throw bulkUploadError;
      const bulkUploadId = bulkUpload.id;

      // Step 2: Resolve merchant_client_ids (mobile number is the primary key for matching)
      const { data: existingClients } = await supabase
        .from('merchant_clients')
        .select('merchant_client_id, mobile_number, email')
        .eq('merchant_id', merchant.merchant_id);

      const clientMap = new Map<string, string>();
      (existingClients || []).forEach(c => {
        if (c.mobile_number) clientMap.set(normalizeNamibianMobile(c.mobile_number), c.merchant_client_id);
      });

      // Find new clients (by mobile number)
      const newClients = data.filter(item => item.mobile && !clientMap.has(item.mobile));
      // Deduplicate new clients by mobile
      const uniqueNewClients = Array.from(new Map(newClients.map(c => [c.mobile, c])).values());

      if (uniqueNewClients.length > 0) {
        const { data: insertedClients, error: clientError } = await supabase
          .from('merchant_clients')
          .insert(uniqueNewClients.map(c => ({
            merchant_id: merchant.merchant_id,
            mobile_number: c.mobile,
            email: c.email,
          })))
          .select('merchant_client_id, mobile_number');

        if (clientError) {
          console.error('Error creating merchant clients:', clientError);
        } else {
          (insertedClients || []).forEach(c => {
            if (c.mobile_number) clientMap.set(c.mobile_number, c.merchant_client_id);
          });
        }
      }

      // Step 3: Insert bulk subscribers with all fields
      const nowIso = new Date().toISOString();
      const bulkSubscribers = data.map(item => ({
        merchant_id: merchant.merchant_id,
        bulk_upload_id: bulkUploadId,
        user_email: item.email,
        user_mobile: item.mobile,
        amount: item.amount,
        reference: item.reference || null,
        scheduled_date: item.scheduledSendAt,
        scheduled_send_at: item.scheduledSendAt,
        generated_code: item.generatedCode || generatePaySMECode(),
        recurring: item.subscription,
        recurring_period: item.subscription ? item.period : null,
        subscription_group_id: item.subscriptionGroupId,
        subscription_base_code: item.subscriptionBaseCode,
        subscription_sequence: item.sequence,
        subscription_total_cycles: item.totalCycles,
        subscription_months: item.subscription ? item.months : null,
        sms_parts_reserved: item.smsCredits || getScheduledRowSmsCredits(item),
        sms_status: item.scheduledSendAt > nowIso ? "scheduled" : "pending",
        merchant_client_id: item.mobile ? (clientMap.get(item.mobile) || null) : null,
        status: 'pending',
        date_generated: new Date().toISOString(),
      }));

      const { error: insertError } = await supabase.from('bulk_subscribers').insert(bulkSubscribers);
      if (insertError) throw insertError;

      // Step 4: Fetch inserted records to get generated_codes
      const { data: insertedSubs } = await supabase
        .from('bulk_subscribers')
        .select('user_mobile, generated_code, amount, reference, scheduled_send_at, recurring, recurring_period')
        .eq('bulk_upload_id', bulkUploadId)
        .order('created_at', { ascending: false });

      // Step 5: Send SMS notifications
      if (insertedSubs && insertedSubs.length > 0) {
        const nowForSms = new Date().toISOString();
        const smsMessages = insertedSubs
          .filter(sub => sub.user_mobile && sub.user_mobile.trim())
          .map(sub => {
            return {
              content: buildBulkSmsContent(sub),
              destination: sub.user_mobile,
              scheduled_at: sub.scheduled_send_at,
            };
          });

        if (smsMessages.length > 0) {
          for (let i = 0; i < smsMessages.length; i += 500) {
            const batch = smsMessages.slice(i, i + 500);
            const expectedImmediateCount = batch.filter(message => !isFutureScheduledSms(message.scheduled_at)).length;
            const { data: smsResult, error: smsError } = await supabase.functions.invoke('send-sms', {
              body: {
                action: 'send_bulk',
                payload: {
                  merchant_id: merchant.merchant_id,
                  use_merchant_credentials: true,
                  messages: batch,
                },
              }
            });
            if (smsError || !smsSendWasAccepted(smsResult, expectedImmediateCount)) {
              await supabase
                .from('bulk_subscribers')
                .update({ sms_status: 'failed' })
                .eq('bulk_upload_id', bulkUploadId)
                .lte('scheduled_send_at', nowForSms);
              throw smsError || new Error(smsResult?.error || "Bulk SMS send failed");
            }
          }
          await supabase
            .from('bulk_subscribers')
            .update({ sms_status: 'sent' })
            .eq('bulk_upload_id', bulkUploadId)
            .lte('scheduled_send_at', nowForSms);
        }
      }

      // Step 6: Update bulk_uploads status
      await supabase
        .from('bulk_uploads')
        .update({
          status: 'completed',
          processed_records: data.length,
          failed_records: 0,
        })
        .eq('id', bulkUploadId);

      toast({ title: "Success", description: `Successfully uploaded ${data.length} PayCodes. ${validMobileNumbers} SMS requests processed using ${requiredSms} reserved SMS credits.` });
      setUploadFile(null);
      setCsvPreviewRows([]);
      setShowCsvPreview(false);
      fetchSMSBalance();
      fetchBulkSubscribers();
    } catch (error) {
      console.error('Upload error:', error);
      toast({ title: "Upload Failed", description: "Failed to process CSV file", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleQuickInvoice = async (sendNow = false) => {
    if (!merchant) return;

    const normalizedMobile = normalizeNamibianMobile(quickMobile.trim());
    const email = quickEmail.trim();
    const amount = Number(quickAmount);
    const reference = quickReference.trim() || `Quick-${Date.now()}`;
    const recurringCycles = quickCycleCount();
    const scheduleStart = sendNow ? new Date() : (quickDate ? new Date(quickDate) : new Date());
    if (!/^264(81|83|85)\d{7}$/.test(normalizedMobile) || !amount || amount <= 0) {
      toast({
        title: "Missing invoice details",
        description: "Enter a valid mobile number and amount before sending.",
        variant: "destructive",
      });
      return;
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({
        title: "Invalid email address",
        description: "Enter a complete email address such as client@example.com, or leave the optional field blank.",
        variant: "destructive",
      });
      return;
    }

    if (Number.isNaN(scheduleStart.getTime())) {
      toast({
        title: "Invalid schedule date",
        description: "Choose a valid date and time for the scheduled Request-to-Pay.",
        variant: "destructive",
      });
      return;
    }

    const scheduledRows = buildQuickScheduledRows({
      mobile: normalizedMobile,
      email,
      reference,
      amount,
      scheduledAt: scheduleStart,
      recurring: sendNow ? false : quickRecurring,
      period: quickRecurringPeriod,
      months: recurringCycles,
      sendNow,
    });
    const requiredSms = scheduledRows.reduce((total, row) => total + (row.smsCredits || 1), 0);

    if (smsBalance < requiredSms) {
      toast({
        title: "Insufficient SMS Credits",
        description: `You need ${requiredSms} SMS credits for this Request-to-Pay schedule.`,
        variant: "destructive",
      });
      return;
    }

    setSendingQuick(true);
    try {
      const { data: existingClient } = await supabase
        .from('merchant_clients')
        .select('merchant_client_id, mobile_number')
        .eq('merchant_id', merchant.merchant_id)
        .eq('mobile_number', normalizedMobile)
        .maybeSingle();

      let merchantClientId = existingClient?.merchant_client_id || null;
      if (merchantClientId && email) {
        await supabase
          .from('merchant_clients')
          .update({ email })
          .eq('merchant_client_id', merchantClientId)
          .eq('merchant_id', merchant.merchant_id);
      }

      if (!merchantClientId) {
        const { data: insertedClient, error: clientError } = await supabase
          .from('merchant_clients')
          .insert({
            merchant_id: merchant.merchant_id,
            mobile_number: normalizedMobile,
            email: email || null,
          })
          .select('merchant_client_id')
          .single();

        if (clientError) throw clientError;
        merchantClientId = insertedClient?.merchant_client_id || null;
      }

      const { data: bulkUpload, error: bulkUploadError } = await supabase
        .from('bulk_uploads')
        .insert({
          merchant_id: merchant.merchant_id,
          filename: 'quick-invoice',
          total_records: scheduledRows.length,
          processed_records: scheduledRows.length,
          failed_records: 0,
          status: 'completed',
          recurring: !sendNow && quickRecurring,
          recurring_period: !sendNow && quickRecurring ? quickRecurringPeriod : null,
        })
        .select('id')
        .single();

      if (bulkUploadError) throw bulkUploadError;

      const insertPayload = scheduledRows.map(row => ({
        merchant_id: merchant.merchant_id,
        bulk_upload_id: bulkUpload.id,
        user_email: email || null,
        user_mobile: normalizedMobile,
        amount,
        reference: row.reference,
        scheduled_date: row.scheduledSendAt,
        scheduled_send_at: row.scheduledSendAt,
        recurring: row.subscription,
        recurring_period: row.subscription ? row.period : null,
        subscription_group_id: row.subscriptionGroupId,
        subscription_base_code: row.subscriptionBaseCode,
        subscription_sequence: row.sequence,
        subscription_total_cycles: row.totalCycles,
        generated_code: row.generatedCode || generatePaySMECode(),
        merchant_client_id: merchantClientId,
        sms_status: isFutureScheduledSms(row.scheduledSendAt) ? 'scheduled' : 'pending',
        sms_parts_reserved: row.smsCredits || 1,
        status: 'pending',
        date_generated: new Date().toISOString(),
      }));

      const { data: quickSubs, error: insertError } = await supabase
        .from('bulk_subscribers')
        .insert(insertPayload)
        .select('id, user_mobile, generated_code, amount, reference, scheduled_send_at, recurring, recurring_period')
        .order('scheduled_send_at', { ascending: true });

      if (insertError) throw insertError;
      const insertedRows = quickSubs || [];
      const immediateRows = insertedRows.filter(row => !isFutureScheduledSms(row.scheduled_send_at));

      if (immediateRows.length > 0) {
        const { data: smsResult, error: smsError } = await supabase.functions.invoke('send-sms', {
          body: {
            action: 'send_bulk',
            payload: {
              merchant_id: merchant.merchant_id,
              use_merchant_credentials: true,
              messages: immediateRows.map(row => ({
                content: buildBulkSmsContent(row),
                destination: normalizedMobile,
                scheduled_at: row.scheduled_send_at,
              })),
            },
          },
        });

        if (smsError || !smsSendWasAccepted(smsResult, immediateRows.length)) {
          await supabase
            .from('bulk_subscribers')
            .update({ sms_status: 'failed' })
            .in('id', immediateRows.map(row => row.id));
          throw smsError || new Error(smsResult?.error || "Quick invoice SMS send failed");
        }
      }

      if (immediateRows.length) {
        await supabase
          .from('bulk_subscribers')
          .update({ sms_status: 'sent' })
          .in('id', immediateRows.map(row => row.id));
      }

      const firstCode = insertedRows[0]?.generated_code || "PaySME code";
      toast({
        title: sendNow ? "Request-to-Pay sent" : "Request-to-Pay scheduled",
        description: `${quickScheduleSummary(sendNow)}. ${scheduledRows.length} PayCode${scheduledRows.length === 1 ? "" : "s"} created for ${normalizedMobile}. First code: ${firstCode}.`,
      });
      setQuickMobile("");
      setQuickEmail("");
      setQuickReference("");
      setQuickAmount("");
      setQuickDate(new Date().toISOString().slice(0, 16));
      setQuickRecurring(false);
      fetchSMSBalance();
      fetchBulkSubscribers();
    } catch (error) {
      console.error('Quick invoice error:', error);
      toast({ title: "Request-to-Pay Failed", description: "Failed to generate and send the Request-to-Pay.", variant: "destructive" });
    } finally {
      setSendingQuick(false);
    }
  };

  const formatCurrency = formatNad;

  const resendSubscriberSms = async (subscriber: BulkSubscriber) => {
    if (!merchant) return;
    if (!subscriber.user_mobile || !subscriber.generated_code) {
      toast({ title: "Cannot resend SMS", description: "This row is missing a mobile number or PaySME code.", variant: "destructive" });
      return;
    }

    setResendingSubscriberId(subscriber.id);
    try {
      const { data: smsResult, error: smsError } = await supabase.functions.invoke('send-sms', {
        body: {
          action: 'send_bulk',
          payload: {
            merchant_id: merchant.merchant_id,
            use_merchant_credentials: true,
            messages: [{
              content: buildBulkSmsContent(subscriber),
              destination: subscriber.user_mobile,
            }],
          },
        },
      });

      if (smsError || !smsSendWasAccepted(smsResult, 1)) {
        await supabase
          .from('bulk_subscribers')
          .update({ sms_status: 'failed' })
          .eq('id', subscriber.id);
        throw smsError || new Error(smsResult?.error || "SMSPortal did not accept the resend.");
      }

      await supabase
        .from('bulk_subscribers')
        .update({ sms_status: 'sent' })
        .eq('id', subscriber.id);

      toast({ title: "SMS resent", description: `Payment code ${subscriber.generated_code} was sent to ${subscriber.user_mobile}.` });
      fetchSMSBalance();
      fetchBulkSubscribers();
    } catch (error) {
      console.error('Resend SMS error:', error);
      toast({ title: "SMS resend failed", description: "The SMS provider did not accept this message. Check the SMSPortal logs and credentials.", variant: "destructive" });
    } finally {
      setResendingSubscriberId(null);
    }
  };

  const cancelScheduledSubscriberSms = async (subscriber: BulkSubscriber) => {
    if (!merchant) return;
    if (subscriber.sms_status !== 'scheduled') {
      toast({
        title: "Cannot cancel schedule",
        description: "Only future scheduled SMS rows can be cancelled.",
        variant: "destructive",
      });
      return;
    }

    setCancellingSubscriberId(subscriber.id);
    try {
      const { error } = await supabase
        .from('bulk_subscribers')
        .update({ sms_status: 'cancelled' })
        .eq('id', subscriber.id)
        .eq('merchant_id', merchant.merchant_id)
        .eq('sms_status', 'scheduled');

      if (error) throw error;

      toast({
        title: "Schedule cancelled",
        description: "The reserved SMS credits were released back to the available balance.",
      });
      fetchSMSBalance();
      fetchBulkSubscribers();
    } catch (error) {
      console.error('Cancel scheduled SMS error:', error);
      toast({
        title: "Could not cancel schedule",
        description: "The scheduled SMS could not be cancelled. Please try again.",
        variant: "destructive",
      });
    } finally {
      setCancellingSubscriberId(null);
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'paid': return 'status-paid';
      case 'pending': return 'status-pending';
      case 'expired': return 'status-expired';
      case 'failed': return 'status-failed';
      default: return 'outline';
    }
  };

  const csvPreviewSmsCredits = getPreviewSmsCredits(csvPreviewRows);
  const csvPreviewRecurringRows = csvPreviewRows.filter(row => row.subscription).length;
  const csvPreviewOnceOffRows = csvPreviewRows.length - csvPreviewRecurringRows;
  const csvPreviewBalanceAfter = smsBalance - csvPreviewSmsCredits;
  const quickEmailInvalid = Boolean(quickEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(quickEmail.trim()));

  if (bulkSmsAccessLoading) {
    return <ProtectedRoute><div className="min-h-screen bg-paysme-gradient-start p-8 text-white">Checking bulk SMS access...</div></ProtectedRoute>;
  }

  if (!bulkPackageEligible || !hasSmsCredentials) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-paysme-gradient-start p-8 text-white">
          <Card className="mx-auto max-w-2xl border-yellow-500/40 bg-[#222922] text-white">
            <CardHeader>
              <CardTitle>{!bulkPackageEligible ? "Scale or higher package required" : "SMSPortal account setup required"}</CardTitle>
              <CardDescription className="text-gray-200">
                {!bulkPackageEligible
                  ? "Bulk invoicing and Request-to-Pay are available on Scale and higher packages."
                  : "Your package includes bulk messaging, but this merchant does not yet have its own SMS client ID and key. Contact PaySME to complete SMSPortal setup."}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-paysme-gradient-start">
        <div className="p-8 bg-gray-100">
          {/* CSV Validation Notification */}
          {showNotification && csvValidation && (() => {
            const hasErrors = !csvValidation.hasValidFormat || csvValidation.invalidRows > 0 || !csvValidation.sufficientSms;
            const isSuccess = csvValidation.hasValidFormat && csvValidation.invalidRows === 0 && csvValidation.sufficientSms && csvValidation.missingDates === 0;
            return (
              <Card className={`mb-6 ${isSuccess ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-orange-50'}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      {isSuccess ? (
                        <svg className="w-5 h-5 text-green-600 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5" />
                      )}
                      <div>
                        <p className={`text-sm font-medium ${isSuccess ? 'text-green-800' : 'text-orange-800'}`}>
                          {csvValidation.totalRows} rows uploaded from CSV
                        </p>
                        {csvValidation.invalidRows > 0 && (
                          <p className="text-xs text-orange-600">{csvValidation.invalidRows} invalid rows (missing mobile/email)</p>
                        )}
                        {csvValidation.missingDates > 0 && (
                          <p className="text-xs text-orange-600">{csvValidation.missingDates} rows missing required date field</p>
                        )}
                        {csvValidation.hasValidFormat && csvValidation.validRows > 0 && (
                          <p className="text-xs text-green-600">{csvValidation.validRows} PayCodes ready, requiring {csvValidation.requiredSms} SMS credits</p>
                        )}
                        {!csvValidation.hasValidFormat && (
                          <p className="text-xs text-red-600">Invalid CSV format — required columns: mobile, email, reference, amount, date</p>
                        )}
                        {csvValidation.hasValidFormat && !csvValidation.sufficientSms && (
                          <p className="text-xs text-red-600">Insufficient SMS credits — need {csvValidation.requiredSms}, have {smsBalance}</p>
                        )}
                      </div>
                    </div>
                    <button onClick={dismissNotification} className={`${isSuccess ? 'text-green-600 hover:text-green-800' : 'text-orange-600 hover:text-orange-800'} ml-2`}>×</button>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Upload Section */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Upload className="w-5 h-5" />
                <span>Upload CSV File</span>
              </CardTitle>
              <CardDescription>
                Upload a CSV file with columns: mobile, email, reference, amount, date. Dates must use 12-Feb-2026 format. Optional: subscription, months, period.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Input type="file" accept=".csv" onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="recurring" checked={isRecurring} onCheckedChange={checked => setIsRecurring(checked as boolean)} />
                  <label htmlFor="recurring" className="text-sm font-medium">Recurring Subscription</label>
                </div>
                {isRecurring && (
                  <Select value={recurringPeriod} onValueChange={setRecurringPeriod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly (1 month)</SelectItem>
                      <SelectItem value="quarterly">Quarterly (3 months)</SelectItem>
                      <SelectItem value="semi-annual">Semi-annual (6 months)</SelectItem>
                      <SelectItem value="yearly">Yearly (12 months)</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              <Button
                onClick={prepareFileUpload}
                disabled={!uploadFile || uploading || (csvValidation && (!csvValidation.hasValidFormat || !csvValidation.sufficientSms || csvValidation.validRows === 0))}
                className="w-full md:w-auto"
              >
                {uploading ? "Uploading..." : "Preview & Process"}
              </Button>

              <div className="text-xs text-gray-600">
                <p><strong>CSV Format:</strong> mobile, email, reference, amount, date, subscription, months, period</p>
                <p><strong>Example:</strong> 0812345678, john@example.com, Invoice-001, 100.00, 12-Feb-2026, yes, 7, monthly</p>
                <a href="/sample-bulk-upload.csv" download className="text-blue-600 underline">Download sample CSV</a>
              </div>
            </CardContent>
          </Card>

          <Dialog open={showCsvPreview} onOpenChange={setShowCsvPreview}>
            <DialogContent className="max-w-5xl bg-[#151b18] text-white border-2 border-[#f6c431] shadow-2xl shadow-[#f6c431]/20">
              <DialogHeader>
                <DialogTitle className="text-[#f6c431]">Confirm Bulk PayCode Schedule</DialogTitle>
                <DialogDescription className="text-gray-300">
                  Your {csvValidation?.totalRows || "CSV"} CSV rows will create {csvPreviewRows.length} PayCodes. Recurring rows expand into their full future schedule before SMS credits are reserved.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                <div className="rounded border border-[#f6c431]/25 bg-[#202720] p-3">
                  <p className="text-gray-300">PayCodes</p>
                  <p className="text-xl font-bold">{csvPreviewRows.length}</p>
                  <p className="mt-1 text-xs text-gray-400">{csvPreviewOnceOffRows} once-off, {csvPreviewRecurringRows} recurring</p>
                </div>
                <div className="rounded border border-[#f6c431]/25 bg-[#202720] p-3">
                  <p className="text-gray-300">SMS Credits Needed</p>
                  <p className="text-xl font-bold">{csvPreviewSmsCredits}</p>
                  <p className="mt-1 text-xs text-gray-400">1 credit per 60 characters</p>
                </div>
                <div className="rounded border border-[#f6c431]/25 bg-[#202720] p-3">
                  <p className="text-gray-300">CSV Rows</p>
                  <p className="text-xl font-bold">{csvValidation?.totalRows || "-"}</p>
                  <p className="mt-1 text-xs text-gray-400">Original uploaded records</p>
                </div>
                <div className="rounded border border-[#f6c431]/25 bg-[#202720] p-3">
                  <p className="text-gray-300">Balance After</p>
                  <p className={`text-xl font-bold ${csvPreviewBalanceAfter < 0 ? "text-red-300" : "text-[#f6c431]"}`}>{csvPreviewBalanceAfter}</p>
                  <p className="mt-1 text-xs text-gray-400">Current balance: {smsBalance}</p>
                </div>
              </div>
              <div className="max-h-80 overflow-auto rounded border border-[#f6c431]/40 bg-[#1b211d]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-[#151b18] text-[#f6c431]">
                    <tr>
                      <th className="p-2 text-left">Mobile</th>
                      <th className="p-2 text-left">Reference</th>
                      <th className="p-2 text-left">Amount</th>
                      <th className="p-2 text-left">Send Date</th>
                      <th className="p-2 text-left">SMS</th>
                      <th className="p-2 text-left">Code</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreviewRows.slice(0, 120).map((row, index) => (
                      <tr key={`${row.mobile}-${row.reference}-${index}`} className="border-t border-white/10">
                        <td className="p-2">{row.mobile}</td>
                        <td className="p-2">{row.reference}</td>
                        <td className="p-2">{formatCurrency(row.amount)}</td>
                        <td className="p-2">{new Date(row.scheduledSendAt).toLocaleString()}</td>
                        <td className="p-2">{row.smsCredits || getScheduledRowSmsCredits(row)}</td>
                        <td className="p-2 font-mono">{row.generatedCode || "Ready"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {csvPreviewRows.length > 120 && (
                  <p className="p-3 text-xs text-gray-300">Showing first 120 rows only.</p>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" className="border-[#f6c431]/60 bg-transparent text-white hover:bg-[#f6c431]/10 hover:text-white" onClick={() => setShowCsvPreview(false)}>Cancel</Button>
                <Button
                  className="bg-[#f6c431] text-black font-extrabold shadow-lg shadow-[#f6c431]/25 hover:bg-[#e5b321] disabled:border disabled:border-[#f6c431]/40 disabled:bg-[#3a3520] disabled:text-gray-400"
                  style={{
                    backgroundColor: uploading || csvPreviewBalanceAfter < 0 ? "#3a3520" : "#f6c431",
                    color: uploading || csvPreviewBalanceAfter < 0 ? "#9ca3af" : "#000000",
                    borderColor: uploading || csvPreviewBalanceAfter < 0 ? "rgba(246, 196, 49, 0.4)" : "#f6c431",
                  }}
                  disabled={uploading || csvPreviewBalanceAfter < 0}
                  onClick={() => handleFileUpload(csvPreviewRows)}
                >
                  {uploading ? "Processing..." : "Confirm & Deduct SMS Credits"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Request-to-Pay</CardTitle>
              <CardDescription>
                Generate one PaySME code and send the payment request to a single client by SMS.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <Input
                  placeholder="Mobile number"
                  value={quickMobile}
                  onChange={e => setQuickMobile(e.target.value)}
                />
                <Input
                  type="email"
                  placeholder="Email address (optional)"
                  value={quickEmail}
                  onChange={e => setQuickEmail(e.target.value)}
                  aria-invalid={quickEmailInvalid}
                  className={quickEmailInvalid ? "border-red-500 focus-visible:ring-red-500" : undefined}
                />
                <Input
                  placeholder="Reference"
                  value={quickReference}
                  onChange={e => setQuickReference(e.target.value)}
                />
                <Input
                  type="number"
                  min="10"
                  step="0.01"
                  placeholder="Amount"
                  value={quickAmount}
                  onChange={e => setQuickAmount(e.target.value)}
                />
                <Input
                  type="datetime-local"
                  value={quickDate}
                  onChange={e => setQuickDate(e.target.value)}
                />
              </div>
              {quickEmailInvalid && <p className="text-sm font-medium text-red-400">Enter a valid email address, for example client@example.com.</p>}
              <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <label className="flex items-center gap-2 text-sm font-medium text-white">
                    <Checkbox
                      checked={quickRecurring}
                      onCheckedChange={checked => {
                        const enabled = Boolean(checked);
                        setQuickRecurring(enabled);
                        if (enabled && (!quickRecurringMonths || Number(quickRecurringMonths) < 1)) {
                          setQuickRecurringMonths(String(defaultQuickCyclesForPeriod(quickRecurringPeriod)));
                        }
                      }}
                    />
                    Recurring Request
                  </label>
                  <Select
                    value={quickRecurringPeriod}
                    onValueChange={value => {
                      setQuickRecurringPeriod(value);
                      setQuickRecurringMonths(String(defaultQuickCyclesForPeriod(value)));
                    }}
                    disabled={!quickRecurring}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="quarterly">Quarterly</SelectItem>
                      <SelectItem value="semi-annual">Semi-annual</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={quickRecurringMonths}
                    onChange={e => setQuickRecurringMonths(e.target.value)}
                    disabled={!quickRecurring}
                    placeholder="Number of sends"
                  />
                  <p className="rounded-md border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-300">
                    {quickScheduleSummary()}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-2 md:flex-row">
                <Button
                  onClick={() => handleQuickInvoice(false)}
                  disabled={sendingQuick || !quickMobile.trim() || !quickAmount.trim() || quickEmailInvalid}
                  className="w-full md:w-auto"
                >
                  {sendingQuick ? "Sending..." : "Generate & Schedule Request-to-Pay"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleQuickInvoice(true)}
                  disabled={sendingQuick || !quickMobile.trim() || !quickAmount.trim() || quickEmailInvalid}
                  className="w-full md:w-auto"
                >
                  Send Now
                </Button>
              </div>
              <p className="text-xs text-gray-600">
                Generate & Schedule follows the selected recurrence and date. Send Now ignores recurrence and sends one once-off PayCode immediately. The SMS includes the generated code plus a hosted payment link.
              </p>
            </CardContent>
          </Card>

          {/* Stats Cards */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-6 mb-8">
              <Card className="bg-gradient-to-r from-yellow-500/90 to-yellow-600 text-black border border-yellow-300">
                <CardContent className="p-6">
                  <h3 className="text-sm font-bold mb-2">Paid SMS Pending Load</h3>
                  <p className="text-2xl font-extrabold">{paidSmsPendingLoad}</p>
                  <p className="mt-1 text-xs font-bold text-red-700">Awaiting admin load</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-r from-gray-400 to-gray-600 text-white">
                <CardContent className="p-6">
                  <h3 className="text-sm font-medium mb-2">SMS Token Balance</h3>
                  <p className="text-2xl font-bold">{smsBalance}</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-r from-green-400 to-green-600 text-white">
                <CardContent className="p-6">
                  <h3 className="text-sm font-medium mb-2">Bulk Invoice Value</h3>
                  <p className="text-2xl font-bold">{formatCurrency(stats.revenueGenerated)}</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-r from-blue-400 to-blue-600 text-white">
                <CardContent className="p-6">
                  <h3 className="text-sm font-medium mb-2">New Clients</h3>
                  <p className="text-2xl font-bold">{stats.newClients}</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-r from-purple-400 to-purple-600 text-white">
                <CardContent className="p-6">
                  <h3 className="text-sm font-medium mb-2">Recurring Clients</h3>
                  <p className="text-2xl font-bold">{stats.recurringClients}</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-r from-teal-400 to-teal-600 text-white">
                <CardContent className="p-6">
                  <h3 className="text-sm font-medium mb-2">Codes Generated</h3>
                  <p className="text-2xl font-bold">{stats.codesGenerated}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Filters */}
          <Card className="mb-6">
            <CardHeader><CardTitle>Filters</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Input placeholder="Search by email, mobile, code or reference" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={periodFilter} onValueChange={setPeriodFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="current_month">Current Month</SelectItem>
                    <SelectItem value="previous_month">Previous Month</SelectItem>
                    <SelectItem value="all_months">All Months</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={clearFilters}
                  className="border-yellow-500/60 bg-yellow-500/10 text-yellow-100 hover:bg-yellow-500 hover:text-black"
                >
                  Clear Filters
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Subscribers List */}
          <Card>
            <CardHeader>
              <CardTitle>Subscription Invoicing</CardTitle>
              <CardDescription>Showing {filteredSubscribers.length} of {subscribers.length} subscription invoices</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {filteredSubscribers.map(subscriber => {
                  const runSummary = getRunSummaryForSubscriber(subscriber);

                  return (
                  <div key={subscriber.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-white/5">
                    <div className="flex-1">
                      <div className="flex items-center space-x-4">
                        <div>
                          <p className="font-semibold">{subscriber.user_email}</p>
                          <p className="text-sm text-gray-600">{subscriber.user_mobile}</p>
                        </div>
                        <Badge variant={getStatusBadgeVariant(subscriber.status)}>{subscriber.status.toUpperCase()}</Badge>
                        {subscriber.recurring && (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700">
                            Recurring ({subscriber.recurring_period})
                          </Badge>
                        )}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-600">
                        <span>Generated: {new Date(subscriber.date_generated).toLocaleDateString()}</span>
                        {subscriber.reference && <span>Ref: {subscriber.reference}</span>}
                        {subscriber.scheduled_date && <span>Scheduled: {formatScheduleDate(subscriber.scheduled_date)}</span>}
                        {runSummary.finalRun && <span>Final run: {runSummary.finalRun}</span>}
                        {runSummary.nextRun && <span>Next run: {runSummary.nextRun}</span>}
                      </div>
                      {/* PaySME Code */}
                      {subscriber.generated_code && (
                        <div className="mt-2 flex items-center space-x-2">
                          <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded border">
                            {subscriber.generated_code}
                          </span>
                          <button
                            onClick={() => copyCode(subscriber.generated_code)}
                            className="text-gray-500 hover:text-gray-700"
                            title="Copy code"
                          >
                            {copiedCode === subscriber.generated_code ? (
                              <Check className="w-3.5 h-3.5 text-green-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-lg">{formatCurrency(Number(subscriber.amount))}</p>
                      {subscriber.status !== 'paid' && (
                        <div className="mt-2 flex flex-wrap justify-end gap-2">
                          {subscriber.sms_status !== 'scheduled' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-yellow-500/60 bg-yellow-500/10 text-yellow-100 hover:bg-yellow-500 hover:text-black"
                              disabled={resendingSubscriberId === subscriber.id}
                              onClick={() => resendSubscriberSms(subscriber)}
                            >
                              {resendingSubscriberId === subscriber.id ? "Sending..." : "Resend SMS"}
                            </Button>
                          )}
                          {subscriber.sms_status === 'scheduled' && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-400/60 bg-red-500/10 text-red-100 hover:bg-red-500 hover:text-white"
                              disabled={cancellingSubscriberId === subscriber.id}
                              onClick={() => cancelScheduledSubscriberSms(subscriber)}
                            >
                              {cancellingSubscriberId === subscriber.id ? "Cancelling..." : "Cancel Schedule"}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  );
                })}

                {filteredSubscribers.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    <p>No subscription invoices found</p>
                    <p className="text-sm">Upload a CSV file to get started</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  );
};

export default BulkSubscribers;
