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
import { Users, MessageSquare, CheckCircle, XCircle } from "lucide-react";
interface Referral {
  id: string;
  referrer_id: string;
  referred_id: string;
  transaction_id: string;
  vendor_name: string;
  date_generated: string;
  kyc_status: boolean;
  setup_status: boolean;
  codes_generated: number;
  invoices_paid: number;
  amount_paid: number;
  status: string;
}
interface ReferralStats {
  totalSMSClaimed: number;
  totalReferrals: number;
  completedReferrals: number;
  pendingReferrals: number;
}
const Referrals = () => {
  const {
    merchant
  } = useAuth();
  const {
    toast
  } = useToast();
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [filteredReferrals, setFilteredReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [stats, setStats] = useState<ReferralStats | null>(null);
  useEffect(() => {
    fetchReferrals();
  }, [merchant]);
  useEffect(() => {
    applyFilters();
  }, [referrals, searchQuery, statusFilter, dateFrom, dateTo]);
  const fetchReferrals = async () => {
    if (!merchant) return;
    try {
      const {
        data,
        error
      } = await supabase.from('referrals').select('*').or(`referrer_id.eq.${merchant.merchant_id},referred_id.eq.${merchant.merchant_id}`).order('date_generated', {
        ascending: false
      });
      if (error) throw error;
      setReferrals(data || []);
    } catch (error) {
      console.error('Error fetching referrals:', error);
      toast({
        title: "Error",
        description: "Failed to load referrals",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };
  const applyFilters = () => {
    let filtered = [...referrals];

    // Date range filter
    if (dateFrom && dateTo) {
      filtered = filtered.filter(r => {
        const date = new Date(r.date_generated);
        return date >= new Date(dateFrom) && date <= new Date(dateTo);
      });
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter(r => r.status === statusFilter);
    }

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(r => r.transaction_id.toLowerCase().includes(query) || r.vendor_name?.toLowerCase().includes(query));
    }
    setFilteredReferrals(filtered);
    calculateStats(filtered);
  };
  const calculateStats = (data: Referral[]) => {
    const completedReferrals = data.filter(r => r.kyc_status && r.setup_status && r.codes_generated >= 3 && r.invoices_paid >= 3);
    const totalSMSClaimed = completedReferrals.length * 200; // 200 SMS per completed referral

    setStats({
      totalSMSClaimed,
      totalReferrals: data.length,
      completedReferrals: completedReferrals.length,
      pendingReferrals: data.length - completedReferrals.length
    });
  };
  const isReferralCompleted = (referral: Referral) => {
    return referral.kyc_status && referral.setup_status && referral.codes_generated >= 3 && referral.invoices_paid >= 3;
  };
  const getReferralCompletionSteps = (referral: Referral) => [{
    label: "KYC Complete",
    completed: referral.kyc_status
  }, {
    label: "Setup Complete",
    completed: referral.setup_status
  }, {
    label: "3+ Codes Generated",
    completed: referral.codes_generated >= 3
  }, {
    label: "3+ Invoices Paid",
    completed: referral.invoices_paid >= 3
  }];
  return <ProtectedRoute>
      <div className="min-h-screen bg-paysme-gradient-start">
        <div className="p-8 bg-gray-100">
          {/* Stats Cards */}
          {stats && <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <Card className="bg-gradient-to-r from-green-400 to-green-600 text-white">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-4">
                    <MessageSquare className="w-8 h-8" />
                    <div>
                      <h3 className="text-sm font-medium mb-2">Total Referral SMS Claimed</h3>
                      <p className="text-3xl font-bold">{stats.totalSMSClaimed}</p>
                      <p className="text-sm opacity-90">200 SMS per completed referral</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-r from-purple-400 to-purple-600 text-white">
                <CardContent className="p-6">
                  <div className="flex items-center space-x-4">
                    <Users className="w-8 h-8" />
                    <div>
                      <h3 className="text-sm font-medium mb-2">Total Referrals</h3>
                      <p className="text-3xl font-bold">{stats.totalReferrals}</p>
                      <div className="flex space-x-4 text-sm opacity-90">
                        <span>✓ {stats.completedReferrals} Completed</span>
                        <span>⏳ {stats.pendingReferrals} Pending</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>}

          {/* Referral Requirements */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Referral Requirements</CardTitle>
              <CardDescription>
                Your referrals must meet ALL these criteria to qualify for 200 free SMS credits
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="flex items-center space-x-2 p-3 bg-green-50 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-medium">KYC Complete</span>
                </div>
                <div className="flex items-center space-x-2 p-3 bg-green-50 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-medium">Setup Complete</span>
                </div>
                <div className="flex items-center space-x-2 p-3 bg-green-50 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-medium">3+ Codes Generated</span>
                </div>
                <div className="flex items-center space-x-2 p-3 bg-green-50 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-medium">3+ Invoices Paid</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Filters */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Filters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Input placeholder="Search by transaction ID or vendor" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Statuses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>

                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} placeholder="From date" />

                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} placeholder="To date" />
              </div>
            </CardContent>
          </Card>

          {/* Referrals List */}
          <Card>
            <CardHeader>
              <CardTitle>TRACK TRANSACTIONS</CardTitle>
              <CardDescription>
                Showing {filteredReferrals.length} of {referrals.length} referrals
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Table Header */}
              <div className="grid grid-cols-8 gap-4 p-4 bg-gray-600 text-white font-medium text-sm rounded-t-lg">
                <div>Transaction ID</div>
                <div>Vendor Name</div>
                <div>Date Generated</div>
                <div>KYC</div>
                <div>Setup</div>
                <div>3 codes Generated</div>
                <div>3 invoice Paid</div>
                <div>Amount Paid</div>
              </div>

              {/* Table Body */}
              <div className="space-y-0">
                {filteredReferrals.map(referral => {
                const steps = getReferralCompletionSteps(referral);
                const completed = isReferralCompleted(referral);
                return <div key={referral.id} className={`grid grid-cols-8 gap-4 p-4 border-b hover:bg-gray-50 text-sm ${completed ? 'bg-green-50' : 'bg-white'}`}>
                      <div className="font-medium">{referral.transaction_id}</div>
                      <div>{referral.vendor_name || 'PP Fashions'}</div>
                      <div>{new Date(referral.date_generated).toLocaleDateString()}</div>
                      
                      {/* Status indicators */}
                      <div className="text-center">
                        {referral.kyc_status ? <CheckCircle className="w-5 h-5 text-green-500 mx-auto" /> : <XCircle className="w-5 h-5 text-red-500 mx-auto" />}
                      </div>
                      
                      <div className="text-center">
                        {referral.setup_status ? <CheckCircle className="w-5 h-5 text-green-500 mx-auto" /> : <XCircle className="w-5 h-5 text-red-500 mx-auto" />}
                      </div>
                      
                      <div className="text-center">
                        {referral.codes_generated >= 3 ? <CheckCircle className="w-5 h-5 text-green-500 mx-auto" /> : <XCircle className="w-5 h-5 text-red-500 mx-auto" />}
                      </div>
                      
                      <div className="text-center">
                        {referral.invoices_paid >= 3 ? <CheckCircle className="w-5 h-5 text-green-500 mx-auto" /> : <XCircle className="w-5 h-5 text-red-500 mx-auto" />}
                      </div>
                      
                      <div className="text-right">
                        {completed && <Badge className="bg-green-500 text-white">
                            Claim
                          </Badge>}
                      </div>
                    </div>;
              })}

                {filteredReferrals.length === 0 && <div className="text-center py-8 text-gray-500 col-span-8">
                    <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>No referrals found</p>
                    <p className="text-sm">Start referring merchants to earn SMS credits</p>
                  </div>}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </ProtectedRoute>;
};
export default Referrals;
