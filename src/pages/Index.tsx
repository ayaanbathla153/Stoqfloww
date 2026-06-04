import { useAuth } from "@/contexts/AuthContext";
import SupplierDashboard from "./supplier/SupplierDashboard";
import RetailerDashboard from "./retailer/RetailerDashboard";
import { Loader2 } from "lucide-react";

const Index = () => {
  const { role, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }
  if (role === "supplier") return <SupplierDashboard />;
  return <RetailerDashboard />;
};

export default Index;
