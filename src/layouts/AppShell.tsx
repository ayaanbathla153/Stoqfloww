import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard, Package, Users, ClipboardList, FileText,
  Boxes, Wallet, ShoppingCart, LogOut, User as UserIcon, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const supplierNav = [
  { to: "/", label: "Home", icon: LayoutDashboard },
  { to: "/orders", label: "Orders", icon: ClipboardList },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/inventory", label: "Stock", icon: Boxes },
  { to: "/ledger", label: "Ledger", icon: Wallet },
  { to: "/complaints", label: "Issues", icon: AlertCircle },
];

const retailerNav = [
  { to: "/", label: "Home", icon: LayoutDashboard },
  { to: "/place-order", label: "Order", icon: ShoppingCart },
  { to: "/inventory", label: "Stock", icon: Boxes },
  { to: "/invoices", label: "Invoices", icon: FileText },
  { to: "/ledger", label: "Ledger", icon: Wallet },
  { to: "/complaints", label: "Issues", icon: AlertCircle },
];

export default function AppShell() {
  const { profile, role, roles, signOut, switchRole } = useAuth();
  const navigate = useNavigate();
  const items = role === "supplier" ? supplierNav : retailerNav;
  const canSwitch = roles.length > 1;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-4 h-14 max-w-6xl mx-auto w-full">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-primary flex items-center justify-center shadow-glow">
              <Package className="w-4 h-4 text-primary-foreground" />
            </div>
            <div>
              <div className="font-bold leading-tight text-sm">StockFlow</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{role}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canSwitch && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2 text-[11px] capitalize"
                onClick={() => switchRole(role === "supplier" ? "retailer" : "supplier")}
                title="Switch role"
              >
                ⇄ {role === "supplier" ? "retailer" : "supplier"}
              </Button>
            )}
            {role === "supplier" && (
              <Button size="sm" variant="ghost" onClick={() => navigate("/retailers")}>
                <Users className="w-4 h-4" />
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => navigate("/profile")}>
              <UserIcon className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" onClick={signOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 pb-20 max-w-6xl mx-auto w-full">
        <Outlet />
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-xl">
        <div className="grid grid-flow-col auto-cols-fr max-w-6xl mx-auto">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex flex-col items-center justify-center gap-1 py-2.5 transition-smooth",
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
