import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import AppShell from "@/layouts/AppShell";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import SupplierOrders from "./pages/supplier/SupplierOrders";
import Products from "./pages/supplier/Products";
import Retailers from "./pages/supplier/Retailers";
import RetailerStore from "./pages/supplier/RetailerStore";
import RetailerDetail from "./pages/supplier/RetailerDetail";
import VerifyStock from "./pages/supplier/VerifyStock";
import PlaceOrder from "./pages/retailer/PlaceOrder";
import Invoices from "./pages/Invoices";
import Inventory from "./pages/Inventory";
import Ledger from "./pages/Ledger";
import Profile from "./pages/Profile";
import Complaints from "./pages/Complaints";
import PublicInvoice from "./pages/PublicInvoice";
import Settings from "./pages/Settings";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/i/:code" element={<PublicInvoice />} />
            <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
              <Route path="/" element={<Index />} />
              <Route path="/orders" element={<ProtectedRoute allow={["supplier"]}><SupplierOrders /></ProtectedRoute>} />
              <Route path="/products" element={<ProtectedRoute allow={["supplier"]}><Products /></ProtectedRoute>} />
              <Route path="/retailers" element={<ProtectedRoute allow={["supplier"]}><Retailers /></ProtectedRoute>} />
              <Route path="/retailers/:retailerId/store" element={<ProtectedRoute allow={["supplier"]}><RetailerStore /></ProtectedRoute>} />
              <Route path="/retailers/:retailerId/verify" element={<ProtectedRoute allow={["supplier"]}><VerifyStock /></ProtectedRoute>} />
              <Route path="/retailers/:retailerId" element={<ProtectedRoute allow={["supplier"]}><RetailerDetail /></ProtectedRoute>} />
              <Route path="/place-order" element={<ProtectedRoute allow={["retailer"]}><PlaceOrder /></ProtectedRoute>} />
              <Route path="/invoices" element={<Invoices />} />
              <Route path="/inventory" element={<Inventory />} />
              <Route path="/ledger" element={<Ledger />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/complaints" element={<Complaints />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
