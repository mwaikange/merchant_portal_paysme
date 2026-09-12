import { useState, useEffect, useMemo } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Download, Loader2, Mail, ChevronLeft, ChevronRight } from "lucide-react";
import { formatNad } from "@/lib/formatters";
interface Transaction {
  transaction_id: string;
  generated_code: string;
  amount: number;
  status: string;
  user_email: string;
  user_mobile: string;
  date_generated: string;
  date_paid: string | null;
  type: string;
  finalized: boolean;
  amount_paid: number | null;
  tnx_fee: number | null;
  tnx_fee_applies_to: string | null;
  payment_method: string | null;
  facilitator_id: string | null;
  invoice_id: string | null;
  merchant_client_id: string | null;
  qr_payment_link_id?: string | null;
  qr_unit_amount?: number | null;
  qr_quantity?: number | null;
  basket_id?: string | null;
}
interface QrBasketItem {
  basket_id: string;
  qr_payment_link_id: string | null;
  product_reference_snapshot: string;
  unit_price_snapshot: number;
  quantity: number;
  line_total_snapshot: number;
  sort_order: number;
}
interface PeriodStats {
  revenueGenerated: number;
  paysmeVendorReceivable: number;
  paysmeVendorFees: number;
  totalDue: number;
  totalFees: number;
  totalPaid: number;
  totalInvoiced: number;
  newClients: number;
  recurringClients: number;
  codesGenerated: number;
}
interface PayoutRecord {
  payout_id: string;
  merchant_id: string;
  source_transaction_id: string | null;
  transaction_ids: string[] | null;
  period_start: string;
  period_end: string;
  gross_amount: number;
  fee_amount: number;
  net_amount: number;
  amount_paid: number;
  transaction_count: number;
  status: string;
  payment_method: string | null;
  payout_reference: string | null;
  scheduled_at: string | null;
  paid_at: string | null;
  created_at: string;
}

const normalizePayoutLookup = (value: string | null | undefined) => String(value || "").trim().toLowerCase();

const TrackTransactions = () => {
  const {
    merchant
  } = useAuth();
  const {
    toast
  } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [basketItemsByBasketId, setBasketItemsByBasketId] = useState<Record<string, QrBasketItem[]>>({});
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentTypeFilter, setPaymentTypeFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all_months");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [stats, setStats] = useState<PeriodStats | null>(null);
  const [emailingReport, setEmailingReport] = useState(false);
  const [payoutSearchQuery, setPayoutSearchQuery] = useState("");
  const [payoutPageSize, setPayoutPageSize] = useState(20);
  const [payoutPage, setPayoutPage] = useState(1);
  useEffect(() => {
    fetchTransactions();
  }, [merchant]);
  useEffect(() => {
    applyFilters();
  }, [transactions, payouts, searchQuery, statusFilter, paymentTypeFilter, periodFilter, dateFrom, dateTo]);
  useEffect(() => {
    setPayoutPage(1);
  }, [payoutSearchQuery, payoutPageSize, periodFilter, dateFrom, dateTo]);
  const fetchTransactions = async () => {
    if (!merchant) return;
    try {
      const {
        data,
        error
      } = await supabase.from('transactions').select('*').eq('merchant_id', merchant.merchant_id).order('date_generated', {
        ascending: false
      });
      if (error) throw error;
      const transactionRows = (data || []) as Transaction[];
      setTransactions(transactionRows);

      const basketIds = [...new Set(
        transactionRows.map((transaction) => transaction.basket_id).filter((id): id is string => Boolean(id)),
      )];
      if (basketIds.length) {
        // The generated client types predate the QR basket migration.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const basketItemsResult = await (supabase as any)
          .from('merchant_qr_basket_items')
          .select('basket_id, qr_payment_link_id, product_reference_snapshot, unit_price_snapshot, quantity, line_total_snapshot, sort_order')
          .in('basket_id', basketIds)
          .order('sort_order', { ascending: true });
        if (basketItemsResult.error) throw basketItemsResult.error;
        const groupedItems = ((basketItemsResult.data || []) as QrBasketItem[]).reduce<Record<string, QrBasketItem[]>>(
          (groups, item) => {
            (groups[item.basket_id] ||= []).push(item);
            return groups;
          },
          {},
        );
        setBasketItemsByBasketId(groupedItems);
      } else {
        setBasketItemsByBasketId({});
      }

      const { data: payoutData, error: payoutError } = await supabase
        .from('merchant_payouts')
        .select('*')
        .eq('merchant_id', merchant.merchant_id)
        .order('created_at', { ascending: false });

      if (payoutError) {
        const tableMissing = payoutError.code === '42P01' || payoutError.code === 'PGRST205';
        if (!tableMissing) throw payoutError;
      }
      setPayouts((payoutData || []) as PayoutRecord[]);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      toast({
        title: "Error",
        description: "Failed to load transactions",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  const isDateInSelectedPeriod = (value: string | null) => {
    if (!value) return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;

    const now = new Date();
    if (periodFilter === "current_month" && (
      date.getMonth() !== now.getMonth() || date.getFullYear() !== now.getFullYear()
    )) return false;

    if (periodFilter === "previous_month") {
      const previousMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      const previousYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
      if (date.getMonth() !== previousMonth || date.getFullYear() !== previousYear) return false;
    }

    if (dateFrom) {
      const start = new Date(`${dateFrom}T00:00:00`);
      if (date < start) return false;
    }
    if (dateTo) {
      const end = new Date(`${dateTo}T23:59:59.999`);
      if (date > end) return false;
    }

    return true;
  };
  const payoutDate = (payout: PayoutRecord) => payout.paid_at || payout.scheduled_at || payout.created_at;
  const transactionsById = useMemo(() => new Map(
    transactions.map(transaction => [normalizePayoutLookup(transaction.transaction_id), transaction])
  ), [transactions]);
  const payoutLookups = useMemo(() => {
    const payoutByTransaction = new Map<string, PayoutRecord>();
    const payoutByPaycode = new Map<string, PayoutRecord>();

    payouts.forEach(payout => {
      const transactionIds = new Set([
        payout.source_transaction_id,
        ...(payout.transaction_ids || []),
      ].filter((transactionId): transactionId is string => Boolean(transactionId)));

      transactionIds.forEach(transactionId => {
        const transactionKey = normalizePayoutLookup(transactionId);
        if (!transactionKey) return;

        // Payouts are fetched newest first, so retain the latest matching record.
        if (!payoutByTransaction.has(transactionKey)) {
          payoutByTransaction.set(transactionKey, payout);
        }

        const transaction = transactionsById.get(transactionKey);
        const paycodeKey = normalizePayoutLookup(transaction?.generated_code);
        if (paycodeKey && !payoutByPaycode.has(paycodeKey)) {
          payoutByPaycode.set(paycodeKey, payout);
        }
      });
    });

    return { payoutByTransaction, payoutByPaycode };
  }, [payouts, transactionsById]);
  const getPayoutPaycode = (payout: PayoutRecord) => {
    const transactionId = payout.source_transaction_id || payout.transaction_ids?.[0];
    if (!transactionId) return "Unavailable";

    return transactionsById.get(normalizePayoutLookup(transactionId))?.generated_code || transactionId;
  };
  const normalizedPayoutSearch = payoutSearchQuery.trim().toLowerCase();
  const filteredPayouts = payouts.filter(payout => (
    isDateInSelectedPeriod(payoutDate(payout)) &&
    (!normalizedPayoutSearch || getPayoutPaycode(payout).toLowerCase().includes(normalizedPayoutSearch))
  ));
  const payoutPageCount = Math.max(1, Math.ceil(filteredPayouts.length / payoutPageSize));
  const currentPayoutPage = Math.min(payoutPage, payoutPageCount);
  const payoutStartIndex = (currentPayoutPage - 1) * payoutPageSize;
  const paginatedPayouts = filteredPayouts.slice(payoutStartIndex, payoutStartIndex + payoutPageSize);
  const applyFilters = () => {
    let filtered = [...transactions];

    // Date filter based on period
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    if (periodFilter === "current_month") {
      filtered = filtered.filter(t => {
        const date = new Date(t.date_generated);
        return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
      });
    } else if (periodFilter === "previous_month") {
      const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
      const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
      filtered = filtered.filter(t => {
        const date = new Date(t.date_generated);
        return date.getMonth() === prevMonth && date.getFullYear() === prevYear;
      });
    }

    // Custom date range
    if (dateFrom && dateTo) {
      filtered = filtered.filter(t => {
        const date = new Date(t.date_generated);
        return date >= new Date(dateFrom) && date <= new Date(dateTo);
      });
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(t => t.status === statusFilter);
    }

    if (paymentTypeFilter !== "all") {
      filtered = filtered.filter(t => getPaymentTypeKey(t) === paymentTypeFilter);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(t => t.transaction_id.toLowerCase().includes(query) || t.generated_code.toLowerCase().includes(query) || t.user_email?.toLowerCase().includes(query) || t.user_mobile?.toLowerCase().includes(query) || t.invoice_id?.toLowerCase().includes(query));
    }
    setFilteredTransactions(filtered);
    calculateStats(filtered);
  };
  const calculateStats = (data: Transaction[]) => {
    const paidTransactions = data.filter(t => t.status === 'paid');
    const revenueGenerated = paidTransactions.reduce((sum, t) => sum + Number(t.amount_paid ?? t.amount ?? 0), 0);
    const totalInvoiced = data.reduce((sum, t) => sum + Number(t.amount), 0);
    const totalFees = paidTransactions.reduce((sum, t) => sum + Number(t.tnx_fee ?? 0), 0);
    const paysmeVendorTransactions = paidTransactions.filter(t => getPaymentTypeKey(t) === 'paysme_vendor');
    const paysmeVendorReceivable = paysmeVendorTransactions.reduce((sum, t) => sum + Number(t.amount_paid ?? t.amount ?? 0), 0);
    const paysmeVendorFees = paysmeVendorTransactions.reduce((sum, t) => sum + Number(t.tnx_fee ?? 0), 0);
    const totalPaid = payouts
      .filter(payout => payout.status === 'paid' && isDateInSelectedPeriod(payoutDate(payout)))
      .reduce((sum, payout) => sum + Number(payout.amount_paid || 0), 0);
    const totalDue = Math.max(0, paysmeVendorReceivable - paysmeVendorFees - totalPaid);

    // Count clients by linked merchant_client_id. Mobile number is the identity behind that link.
    const clientIdCounts = new Map<string, number>();
    transactions.forEach(t => {
      if (t.merchant_client_id) {
        const count = clientIdCounts.get(t.merchant_client_id) || 0;
        clientIdCounts.set(t.merchant_client_id, count + 1);
      }
    });
    const visibleClientIds = new Set(data.map(t => t.merchant_client_id).filter(Boolean));
    let newClients = 0;
    let recurringClients = 0;
    visibleClientIds.forEach(clientId => {
      if ((clientIdCounts.get(clientId) || 0) > 1) {
        recurringClients += 1;
      } else {
        newClients += 1;
      }
    });

    setStats({
      revenueGenerated,
      paysmeVendorReceivable,
      paysmeVendorFees,
      totalDue,
      totalFees,
      totalPaid,
      totalInvoiced,
      newClients,
      recurringClients,
      codesGenerated: data.length
    });
  };
  const formatCurrency = formatNad;
  const formatPayoutDate = (value: string | null) => value
    ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "Not paid";
  const payoutStatusClass = (status: string) => {
    if (status === "paid") return "border-green-500/40 bg-green-500/15 text-green-700";
    if (status === "processing") return "border-blue-500/40 bg-blue-500/15 text-blue-700";
    if (status === "failed" || status === "cancelled") return "border-red-500/40 bg-red-500/15 text-red-700";
    return "border-amber-500/40 bg-amber-500/15 text-amber-700";
  };
  const hasCompletedPayment = (transaction: Transaction) => (
    transaction.status === "paid" ||
    Boolean(transaction.date_paid) ||
    Number(transaction.amount_paid ?? 0) > 0
  );

  const getPaymentTypeKey = (transaction: Transaction) => {
    if (!hasCompletedPayment(transaction)) return "not_paid";

    const rawType = (transaction.tnx_fee_applies_to || transaction.payment_method || "").toLowerCase();

    if (rawType.includes("card") || rawType.includes("adumo")) return "card";
    if (rawType.includes("waya")) return "wayame";
    if (rawType.includes("maris") || rawType.includes("mtc")) return "mtc_maris";
    if (rawType.includes("paypulse")) return "paypulse";
    if (rawType.includes("paytoday")) return "paytoday";
    if (rawType.includes("kazang")) return "kazang";
    if (rawType.includes("paysme") || rawType.includes("vendor") || rawType.includes("code")) return "paysme_vendor";
    return "unknown";
  };
  const getPaymentTypeLabel = (transaction: Transaction) => {
    switch (getPaymentTypeKey(transaction)) {
      case "not_paid":
        return "Payment pending";
      case "paysme_vendor":
        return "PaySME Vendors";
      case "card":
        return "Card";
      case "wayame":
        return "WayaMe";
      case "mtc_maris":
        return "MTC Maris";
      case "paypulse":
        return "PayPulse";
      case "paytoday":
        return "PayToday";
      case "kazang":
        return "Kazang";
      default:
        return transaction.tnx_fee_applies_to || transaction.payment_method || "Payment type pending";
    }
  };
  const getFeeLabel = (transaction: Transaction) => {
    if (!hasCompletedPayment(transaction)) return "Fee: Pending";

    const feeAmount = Number(transaction.tnx_fee ?? 0);
    if (!feeAmount) return "Fee: N$0.00";
    return `Fee: ${formatCurrency(feeAmount)}`;
  };
  const getPaymentStatusLabel = (transaction: Transaction) => hasCompletedPayment(transaction) ? "Paid" : "Pending";
  const getPayoutStatusLabel = (transaction: Transaction) => {
    const payout = payoutLookups.payoutByTransaction.get(normalizePayoutLookup(transaction.transaction_id))
      || payoutLookups.payoutByPaycode.get(normalizePayoutLookup(transaction.generated_code));
    if (payout) {
      return payout.status
        .split("_")
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
    }

    return hasCompletedPayment(transaction) && getPaymentTypeKey(transaction) === "paysme_vendor"
      ? "Not queued"
      : "N/A";
  };
  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'paid':
        return 'status-paid';
      case 'pending':
        return 'status-pending';
      case 'expired':
        return 'status-expired';
      case 'failed':
        return 'status-failed';
      default:
        return 'outline';
    }
  };

  const getUserTypeBadgeVariant = (merchantClientId: string | null) => {
    if (!merchantClientId) return 'user-new';
    
    // Count how many times this client ID appears in all transactions
    const clientTransactionCount = transactions.filter(t => t.merchant_client_id === merchantClientId).length;
    return clientTransactionCount > 1 ? 'user-recurring' : 'user-new';
  };

  const getUserTypeLabel = (merchantClientId: string | null) => {
    if (!merchantClientId) return 'New Client';
    
    const clientTransactionCount = transactions.filter(t => t.merchant_client_id === merchantClientId).length;
    return clientTransactionCount > 1 ? 'Recurring Client' : 'New Client';
  };
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid':
        return 'bg-green-500';
      case 'pending':
        return 'bg-yellow-500';
      case 'expired':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getFilterLabel = (value: string, labels: Record<string, string>) => labels[value] || value;

  const reportFilters = () => ({
    search: searchQuery || "All",
    status: getFilterLabel(statusFilter, {
      all: "All Statuses",
      paid: "Paid",
      pending: "Pending",
      failed: "Failed",
      expired: "Expired",
    }),
    payment_type: getFilterLabel(paymentTypeFilter, {
      all: "All Payment Types",
      paysme_vendor: "PaySME Vendors",
      card: "Card",
      wayame: "WayaMe",
      mtc_maris: "MTC Maris",
      paypulse: "PayPulse",
      paytoday: "PayToday",
      kazang: "Kazang",
      not_paid: "Not Paid Yet",
      unknown: "Other",
    }),
    period: getFilterLabel(periodFilter, {
      all_months: "All Months",
      current_month: "Current Month",
      previous_month: "Previous Month",
    }),
    date_from: dateFrom || "Not set",
    date_to: dateTo || "Not set",
  });

  const formatReportDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const reportPeriodLabel = () => {
    if (dateFrom && dateTo) return `${formatReportDate(dateFrom)} - ${formatReportDate(dateTo)}`;
    if (dateFrom) return `From ${formatReportDate(dateFrom)}`;
    if (dateTo) return `Through ${formatReportDate(dateTo)}`;
    return getFilterLabel(periodFilter, {
      all_months: "All available transactions",
      current_month: "Current month",
      previous_month: "Previous month",
    });
  };

  const getReportRows = () => filteredTransactions.map(transaction => ({
    transaction_id: transaction.transaction_id,
    generated_code: transaction.generated_code,
    invoice_id: transaction.invoice_id || "",
    status: transaction.status,
    payout_status: getPayoutStatusLabel(transaction),
    type: transaction.type,
    payment_type: getPaymentTypeLabel(transaction),
    amount: Number(transaction.amount || 0),
    amount_paid: Number(transaction.amount_paid || 0),
    fee: hasCompletedPayment(transaction) ? Number(transaction.tnx_fee || 0) : null,
    client_type: getUserTypeLabel(transaction.merchant_client_id),
    email: transaction.user_email || "",
    mobile: transaction.user_mobile || "",
    quantity: transaction.qr_payment_link_id ? Number(transaction.qr_quantity || 1) : null,
    unit_amount: transaction.qr_unit_amount == null ? null : Number(transaction.qr_unit_amount),
    generated_date: transaction.date_generated,
    paid_date: transaction.date_paid || "",
  }));

  const escapeCsvValue = (value: unknown) => {
    const text = String(value ?? "");
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  const downloadCsvReport = () => {
    const rows = getReportRows();
    if (!rows.length) {
      toast({
        title: "No report data",
        description: "Adjust your filters before exporting a CSV.",
      });
      return;
    }

    const headers = [
      "Generated Code",
      "Transaction ID",
      "Invoice ID",
      "Paycode Status",
      "Payout Status",
      "Type",
      "Payment Type",
      "Amount",
      "Amount Paid",
      "Fee",
      "PaySME Vendor Sale",
      "PaySME Vendor Fee",
      "Client Type",
      "Email",
      "Mobile",
      "Quantity",
      "Unit Price",
      "Generated Date",
      "Paid Date",
      "Total Paid to Date",
    ];
    const csvRows = rows.map((row, index) => [
      row.generated_code,
      row.transaction_id,
      row.invoice_id,
      row.status,
      row.payout_status,
      row.type,
      row.payment_type,
      row.amount,
      row.amount_paid,
      row.fee ?? "",
      row.payment_type === "PaySME Vendors" && row.status.toLowerCase() === "paid" ? row.amount_paid || row.amount : "",
      row.payment_type === "PaySME Vendors" && row.status.toLowerCase() === "paid" ? row.fee ?? 0 : "",
      row.client_type,
      row.email,
      row.mobile,
      row.quantity,
      row.unit_amount ?? "",
      row.generated_date,
      row.paid_date,
      index === 0 ? stats?.totalPaid ?? 0 : "",
    ].map(escapeCsvValue).join(","));
    const csv = [headers.map(escapeCsvValue).join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `paysme-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const sendReportEmail = async () => {
    if (!merchant || !stats) return;
    if (!filteredTransactions.length) {
      toast({
        title: "No report data",
        description: "Adjust your filters before emailing a report.",
      });
      return;
    }

    setEmailingReport(true);
    try {
      const rows = getReportRows();

      const { error } = await supabase.functions.invoke("send-email", {
        body: {
          type: "transaction_report",
          merchant_id: merchant.merchant_id,
          filters: reportFilters(),
          stats,
          period_label: reportPeriodLabel(),
          rows,
        },
      });

      if (error) throw error;

      toast({
        title: "Report emailed",
        description: `PDF and Excel report sent to ${merchant.email}.`,
      });
    } catch (error: unknown) {
      console.error("Error emailing transaction report:", error);
      const message = error instanceof Error ? error.message : "Could not send the report email.";
      toast({
        title: "Report email failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setEmailingReport(false);
    }
  };

  const renderTransactionRow = (transaction: Transaction) => {
    const basketItems = transaction.basket_id ? basketItemsByBasketId[transaction.basket_id] || [] : [];
    const isQrProduct = Boolean(transaction.qr_payment_link_id) || basketItems.length > 0;
    return <div key={transaction.transaction_id} className="flex items-center justify-between p-4 border rounded-lg bg-gradient-to-r from-[hsl(var(--transaction-item-from))] to-[hsl(var(--transaction-item-to))] hover:from-[hsl(var(--transaction-item-hover-from))] hover:to-[hsl(var(--transaction-item-hover-to))] text-white">
      <div className="flex-1">
        <div className="flex items-center space-x-4">
          <div>
            <p className="font-semibold">{transaction.generated_code}</p>
            <p className="text-sm text-white/70">{transaction.transaction_id}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={getStatusBadgeVariant(transaction.status)}>
              {transaction.status.toUpperCase()}
            </Badge>
            <Badge className={hasCompletedPayment(transaction)
              ? "border border-green-300/40 bg-green-500/20 text-green-100 hover:bg-green-500/20"
              : "border border-amber-300/40 bg-amber-500/20 text-amber-100 hover:bg-amber-500/20"}>
              Payment: {getPaymentStatusLabel(transaction)}
            </Badge>
            <Badge variant={getUserTypeBadgeVariant(transaction.merchant_client_id)}>
              {getUserTypeLabel(transaction.merchant_client_id)}
            </Badge>
            <Badge className="border border-white/20 bg-white/10 text-white hover:bg-white/10">
              {getPaymentTypeLabel(transaction)}
            </Badge>
            {isQrProduct && (
              <Badge className="border border-yellow-300/50 bg-yellow-400/20 text-yellow-100 hover:bg-yellow-400/20">
                QR PRODUCT
              </Badge>
            )}
          </div>
        </div>
        <div className="mt-2 text-sm text-white/80">
          <p>{transaction.user_email} | {transaction.user_mobile}</p>
          {transaction.qr_payment_link_id && (
            <p>
              QR product: {transaction.qr_quantity || 1} × {formatCurrency(Number(transaction.qr_unit_amount ?? transaction.amount))}
            </p>
          )}
          {basketItems.length > 0 && (
            <div>
              <p className="font-semibold text-yellow-100">QR basket products:</p>
              {basketItems.map((item) => (
                <p key={`${item.basket_id}-${item.qr_payment_link_id || item.sort_order}`}>
                  {item.product_reference_snapshot}: {item.quantity} × {formatCurrency(Number(item.unit_price_snapshot))}
                </p>
              ))}
            </div>
          )}
          <p>Generated: {new Date(transaction.date_generated).toLocaleDateString()}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="font-bold text-lg">{formatCurrency(Number(transaction.amount))}</p>
        {transaction.date_paid && <p className="text-sm text-green-200">
            Paid: {new Date(transaction.date_paid).toLocaleDateString()}
          </p>}
        <p className="mt-1 text-sm font-semibold text-yellow-200">{getFeeLabel(transaction)}</p>
      </div>
    </div>;
  };
  return <ProtectedRoute>
      <div className="min-h-screen bg-paysme-gradient-start">
        <div className="p-8 bg-gray-100">
          {/* Filters */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <div className="min-w-0 lg:col-span-2">
                  <label className="text-sm font-medium mb-2 block">Search</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input placeholder="Search by ID, code, email, mobile" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-10" />
                  </div>
                </div>

                <div className="min-w-0 lg:col-span-2">
                  <label className="text-sm font-medium mb-2 block">Status</label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-0 lg:col-span-2">
                  <label className="text-sm font-medium mb-2 block">Payment Type</label>
                  <Select value={paymentTypeFilter} onValueChange={setPaymentTypeFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Payment Types</SelectItem>
                      <SelectItem value="paysme_vendor">PaySME Vendors</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="wayame">WayaMe</SelectItem>
                      <SelectItem value="mtc_maris">MTC Maris</SelectItem>
                      <SelectItem value="paypulse">PayPulse</SelectItem>
                      <SelectItem value="paytoday">PayToday</SelectItem>
                      <SelectItem value="kazang">Kazang</SelectItem>
                      <SelectItem value="not_paid">Not Paid Yet</SelectItem>
                      <SelectItem value="unknown">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-0 lg:col-span-2">
                  <label className="text-sm font-medium mb-2 block">Period</label>
                  <Select value={periodFilter} onValueChange={setPeriodFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="current_month">Current Month</SelectItem>
                      <SelectItem value="previous_month">Previous Month</SelectItem>
                      <SelectItem value="all_months">All Months</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-0 lg:col-span-4">
                  <label className="text-sm font-medium mb-2 block">Custom Date Range</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-full min-w-0" />
                    <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-full min-w-0" />
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3 border-t border-yellow-500/20 pt-4">
                <Button
                  className="flex items-center justify-center gap-2 bg-yellow-400 text-black hover:bg-yellow-300"
                  onClick={sendReportEmail}
                  disabled={emailingReport || loading || !filteredTransactions.length}
                >
                  {emailingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  <span>Email PDF + Excel Report</span>
                </Button>
                <Button
                  variant="outline"
                  className="flex items-center justify-center gap-2 border-yellow-500/60 text-yellow-100 hover:bg-yellow-500/10"
                  onClick={downloadCsvReport}
                  disabled={loading || !filteredTransactions.length}
                >
                  <Download className="w-4 h-4" />
                  <span>Export CSV</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Stats Cards */}
          {stats && <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <Card className="bg-gradient-to-r from-green-400 to-green-600 text-white">
                <CardContent className="p-6">
                  <h3 className="text-sm font-medium mb-2">Revenue Generated</h3>
                  <p className="text-2xl font-bold">{formatCurrency(stats.revenueGenerated)}</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-r from-amber-400 to-amber-600 text-white">
                <CardContent className="p-6">
                  <h3 className="text-sm font-medium mb-2">Total Fees</h3>
                  <p className="text-2xl font-bold">{formatCurrency(stats.totalFees)}</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-r from-gray-700/30 via-gray-700/70 to-gray-700 text-white">
                <CardContent className="p-6">
                  <h3 className="text-sm font-medium mb-2">Total Amount Invoiced</h3>
                  <p className="text-2xl font-bold">{formatCurrency(stats.totalInvoiced)}</p>
                </CardContent>
              </Card>
            </div>}

          {/* PaySME Vendor Payout Stats */}
          {stats && <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
              <Card className="border-yellow-500/35 border-l-4" style={{ borderLeftColor: "#22c55e" }}>
                <CardContent className="p-6">
                  <h3 className="text-sm font-medium mb-2">Total PaySME Vendor Sales</h3>
                  <p className="text-2xl font-bold">{formatCurrency(stats.paysmeVendorReceivable)}</p>
                </CardContent>
              </Card>

              <Card className="border-yellow-500/35 border-l-4" style={{ borderLeftColor: "#22c55e" }}>
                <CardContent className="p-6">
                  <h3 className="text-sm font-medium mb-2">Total PaySME Vendor Fees</h3>
                  <p className="text-2xl font-bold">{formatCurrency(stats.paysmeVendorFees)}</p>
                </CardContent>
              </Card>

              <Card className="border-yellow-500/35 border-l-4" style={{ borderLeftColor: "#22c55e" }}>
                <CardContent className="p-6">
                  <h3 className="text-sm font-medium mb-2">Total Due to You (Less Fees)</h3>
                  <p className="text-2xl font-bold">{formatCurrency(stats.totalDue)}</p>
                </CardContent>
              </Card>

              <Card className="border-yellow-500/35 border-l-4" style={{ borderLeftColor: "#22c55e" }}>
                <CardContent className="p-6">
                  <h3 className="text-sm font-medium mb-2">Total Paid to Date</h3>
                  <p className="text-2xl font-bold">{formatCurrency(stats.totalPaid)}</p>
                </CardContent>
              </Card>
            </div>}

          {/* Secondary Stats */}
          {stats && <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <Card>
                <CardContent className="p-6 text-center">
                  <h3 className="text-sm font-medium mb-2">New Clients</h3>
                  <p className="text-3xl font-bold text-blue-600">{stats.newClients}</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6 text-center">
                  <h3 className="text-sm font-medium mb-2">Recurring Clients</h3>
                  <p className="text-3xl font-bold text-purple-600">{stats.recurringClients}</p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6 text-center">
                  <h3 className="text-sm font-medium mb-2">Codes Generated</h3>
                  <p className="text-3xl font-bold text-teal-600">{stats.codesGenerated}</p>
                </CardContent>
              </Card>
            </div>}

          {/* Tabs for different transaction types */}
          <Tabs defaultValue="api" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="api">API Generated</TabsTrigger>
              <TabsTrigger value="bulk">Bulk Generated</TabsTrigger>
              <TabsTrigger value="payouts">Payouts</TabsTrigger>
            </TabsList>

            <TabsContent value="api" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>API Generated Transactions</CardTitle>
                  <CardDescription>Transactions created through API calls</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {filteredTransactions.filter(t => t.type === 'api').map(renderTransactionRow)}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="bulk" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Bulk Generated Transactions</CardTitle>
                  <CardDescription>Transactions created through bulk upload</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {filteredTransactions.filter(t => t.type === 'bulk').map(renderTransactionRow)}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="payouts" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Payout Transactions</CardTitle>
                  <CardDescription>PaySME Vendor payments processed by PaySME</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div className="w-full sm:max-w-sm">
                      <label htmlFor="payout-code-search" className="mb-2 block text-sm font-medium">
                        Search paycode
                      </label>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          id="payout-code-search"
                          value={payoutSearchQuery}
                          onChange={event => setPayoutSearchQuery(event.target.value)}
                          placeholder="Enter a paycode"
                          className="pl-9"
                        />
                      </div>
                    </div>
                    <div className="w-full sm:w-32">
                      <label className="mb-2 block text-sm font-medium">Rows</label>
                      <Select
                        value={String(payoutPageSize)}
                        onValueChange={value => setPayoutPageSize(Number(value))}
                      >
                        <SelectTrigger aria-label="Payout rows per page">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="20">20</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {filteredPayouts.length ? <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Paycode</TableHead>
                            <TableHead>Period</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Gross</TableHead>
                            <TableHead className="text-right">PaySME Fee</TableHead>
                            <TableHead className="text-right">Net</TableHead>
                            <TableHead className="text-right">Paid</TableHead>
                            <TableHead>Reference</TableHead>
                            <TableHead>Paid Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedPayouts.map(payout => <TableRow key={payout.payout_id}>
                              <TableCell className="whitespace-nowrap font-mono font-semibold">
                                {getPayoutPaycode(payout)}
                              </TableCell>
                              <TableCell className="whitespace-nowrap font-medium">
                                {formatPayoutDate(payout.period_start)} - {formatPayoutDate(payout.period_end)}
                                <span className="block text-xs font-normal text-muted-foreground">
                                  {payout.transaction_count} transaction{payout.transaction_count === 1 ? "" : "s"}
                                </span>
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={payoutStatusClass(payout.status)}>
                                  {payout.status.toUpperCase()}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">{formatCurrency(Number(payout.gross_amount))}</TableCell>
                              <TableCell className="text-right">{formatCurrency(Number(payout.fee_amount))}</TableCell>
                              <TableCell className="text-right font-semibold">{formatCurrency(Number(payout.net_amount))}</TableCell>
                              <TableCell className="text-right font-semibold">{formatCurrency(Number(payout.amount_paid))}</TableCell>
                              <TableCell>{payout.payout_reference || "Pending"}</TableCell>
                              <TableCell className="whitespace-nowrap">{formatPayoutDate(payout.paid_at)}</TableCell>
                            </TableRow>)}
                        </TableBody>
                      </Table>
                    </div> : <div className="text-center py-8 text-gray-500">
                      <p>{normalizedPayoutSearch ? "No payout matches that paycode" : "No payout records available"}</p>
                      <p className="text-sm">
                        {normalizedPayoutSearch ? "Check the paycode and try again" : "Payouts will appear here once processed by admin"}
                      </p>
                    </div>}
                  {filteredPayouts.length > 0 && <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-muted-foreground">
                        Showing {payoutStartIndex + 1}-{Math.min(payoutStartIndex + payoutPageSize, filteredPayouts.length)} of {filteredPayouts.length}
                      </p>
                      <div className="flex items-center justify-between gap-2 sm:justify-end">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setPayoutPage(page => Math.max(1, page - 1))}
                          disabled={currentPayoutPage === 1}
                        >
                          <ChevronLeft className="mr-1 h-4 w-4" />
                          Previous
                        </Button>
                        <span className="min-w-20 text-center text-sm font-medium">
                          Page {currentPayoutPage} of {payoutPageCount}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setPayoutPage(page => Math.min(payoutPageCount, page + 1))}
                          disabled={currentPayoutPage === payoutPageCount}
                        >
                          Next
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      </div>
                    </div>}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </ProtectedRoute>;
};
export default TrackTransactions;
