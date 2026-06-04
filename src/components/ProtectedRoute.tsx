import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

export function ProtectedRoute({ children, allow }: { children: ReactNode; allow?: ("supplier" | "retailer" | "staff")[] }) {
  const { user, role, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (allow && (!role || !allow.includes(role))) return <Navigate to="/" replace />;
  return <>{children}</>;
}
