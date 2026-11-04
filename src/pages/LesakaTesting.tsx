import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LesakaUatPanel } from "@/components/LesakaUatPanel";
import { useAuth } from "@/contexts/AuthContext";
import { Link } from "react-router-dom";
export default function LesakaTesting(){
 const {merchant}=useAuth();
 return <ProtectedRoute><div className="space-y-4"><Link to="/portal/api-integration" className="text-sm text-yellow-300 underline">Back to API & integration</Link><h1 className="text-2xl font-bold">Lesaka staging tests{merchant?.business_name ? ` - ${merchant.business_name}` : ""}</h1><p className="text-sm text-white/70">Run automatic checks, test individual cases here, or use the payment modal and hosted checkout. All three methods record against this business's cycles.</p>{merchant&&<LesakaUatPanel merchantId={merchant.merchant_id} apiKey={merchant.api_key || undefined}/>}</div></ProtectedRoute>;
}
