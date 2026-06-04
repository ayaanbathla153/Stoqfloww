-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('supplier', 'retailer', 'staff');
CREATE TYPE public.order_status AS ENUM ('pending', 'approved', 'modified', 'rejected', 'invoiced');
CREATE TYPE public.invoice_status AS ENUM ('pending_delivery', 'delivered', 'disputed');
CREATE TYPE public.ledger_entry_type AS ENUM ('invoice', 'payment');
CREATE TYPE public.inventory_change_type AS ENUM ('in', 'out');
CREATE TYPE public.complaint_status AS ENUM ('open', 'resolved');

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  linked_supplier_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  shop_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES (separate table - prevents privilege escalation) ============
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.get_linked_supplier(_user_id UUID)
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT linked_supplier_id FROM public.profiles WHERE id = _user_id
$$;

-- ============ PRODUCTS ============
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  unit TEXT NOT NULL DEFAULT 'pcs',
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  supplier_stock NUMERIC(12,2) NOT NULL DEFAULT 0,
  low_stock_threshold NUMERIC(12,2) NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- ============ RETAILER INVENTORY ============
CREATE TABLE public.retailer_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  stock_quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(retailer_id, product_id)
);
ALTER TABLE public.retailer_inventory ENABLE ROW LEVEL SECURITY;

-- ============ ORDERS ============
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  status order_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  requested_qty NUMERIC(12,2) NOT NULL,
  approved_qty NUMERIC(12,2)
);
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- ============ INVOICES ============
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  retailer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status invoice_status NOT NULL DEFAULT 'pending_delivery',
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ
);
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  final_qty NUMERIC(12,2) NOT NULL,
  price NUMERIC(12,2) NOT NULL
);
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

-- ============ INVENTORY LOGS ============
CREATE TABLE public.inventory_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  change_type inventory_change_type NOT NULL,
  quantity NUMERIC(12,2) NOT NULL,
  linked_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  retailer_id UUID REFERENCES auth.users(id),
  supplier_id UUID NOT NULL REFERENCES auth.users(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.inventory_logs ENABLE ROW LEVEL SECURITY;

-- ============ PAYMENTS LEDGER ============
CREATE TABLE public.payments_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type ledger_entry_type NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  balance_after NUMERIC(12,2) NOT NULL,
  reference_invoice_id UUID REFERENCES public.invoices(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payments_ledger ENABLE ROW LEVEL SECURITY;

-- ============ COMPLAINTS ============
CREATE TABLE public.complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.invoices(id),
  description TEXT NOT NULL,
  media_url TEXT,
  status complaint_status NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

-- ============ TRIGGER: auto-create profile on signup ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role app_role;
  _supplier_id UUID;
BEGIN
  _role := COALESCE((NEW.raw_user_meta_data->>'role')::app_role, 'retailer');
  _supplier_id := NULLIF(NEW.raw_user_meta_data->>'linked_supplier_id', '')::UUID;

  INSERT INTO public.profiles (id, name, phone, linked_supplier_id, shop_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', 'User'),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    _supplier_id,
    NEW.raw_user_meta_data->>'shop_name'
  );

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ RLS POLICIES ============

-- profiles
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Suppliers view linked retailers" ON public.profiles FOR SELECT TO authenticated USING (linked_supplier_id = auth.uid());
CREATE POLICY "Retailers view their supplier" ON public.profiles FOR SELECT TO authenticated USING (id = public.get_linked_supplier(auth.uid()));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());

-- user_roles
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

-- products
CREATE POLICY "Suppliers manage own products" ON public.products FOR ALL TO authenticated
  USING (supplier_id = auth.uid()) WITH CHECK (supplier_id = auth.uid());
CREATE POLICY "Retailers view their supplier products" ON public.products FOR SELECT TO authenticated
  USING (supplier_id = public.get_linked_supplier(auth.uid()));

-- retailer_inventory
CREATE POLICY "Retailer views own inventory" ON public.retailer_inventory FOR SELECT TO authenticated USING (retailer_id = auth.uid());
CREATE POLICY "Supplier views retailer inventory" ON public.retailer_inventory FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = retailer_id AND p.linked_supplier_id = auth.uid()));
CREATE POLICY "Supplier manages retailer inventory" ON public.retailer_inventory FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = retailer_id AND p.linked_supplier_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = retailer_id AND p.linked_supplier_id = auth.uid()));

-- orders
CREATE POLICY "Retailer views own orders" ON public.orders FOR SELECT TO authenticated USING (retailer_id = auth.uid());
CREATE POLICY "Supplier views their orders" ON public.orders FOR SELECT TO authenticated USING (supplier_id = auth.uid());
CREATE POLICY "Retailer creates own orders" ON public.orders FOR INSERT TO authenticated WITH CHECK (retailer_id = auth.uid() AND created_by = auth.uid());
CREATE POLICY "Supplier creates orders for retailers" ON public.orders FOR INSERT TO authenticated WITH CHECK (supplier_id = auth.uid() AND created_by = auth.uid());
CREATE POLICY "Supplier updates orders" ON public.orders FOR UPDATE TO authenticated USING (supplier_id = auth.uid());
CREATE POLICY "Supplier deletes orders" ON public.orders FOR DELETE TO authenticated USING (supplier_id = auth.uid());

-- order_items
CREATE POLICY "View order items via parent order" ON public.order_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.retailer_id = auth.uid() OR o.supplier_id = auth.uid()))
);
CREATE POLICY "Insert order items via parent order" ON public.order_items FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND (o.retailer_id = auth.uid() OR o.supplier_id = auth.uid()))
);
CREATE POLICY "Supplier updates order items" ON public.order_items FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.supplier_id = auth.uid())
);
CREATE POLICY "Supplier deletes order items" ON public.order_items FOR DELETE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.orders o WHERE o.id = order_id AND o.supplier_id = auth.uid())
);

-- invoices
CREATE POLICY "Retailer views own invoices" ON public.invoices FOR SELECT TO authenticated USING (retailer_id = auth.uid());
CREATE POLICY "Supplier manages invoices" ON public.invoices FOR ALL TO authenticated
  USING (supplier_id = auth.uid()) WITH CHECK (supplier_id = auth.uid());
CREATE POLICY "Retailer updates invoice delivery status" ON public.invoices FOR UPDATE TO authenticated USING (retailer_id = auth.uid());

-- invoice_items
CREATE POLICY "View invoice items via parent" ON public.invoice_items FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND (i.retailer_id = auth.uid() OR i.supplier_id = auth.uid()))
);
CREATE POLICY "Supplier manages invoice items" ON public.invoice_items FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND i.supplier_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.invoices i WHERE i.id = invoice_id AND i.supplier_id = auth.uid())
);

-- inventory_logs
CREATE POLICY "Supplier views inventory logs" ON public.inventory_logs FOR SELECT TO authenticated USING (supplier_id = auth.uid());
CREATE POLICY "Retailer views own logs" ON public.inventory_logs FOR SELECT TO authenticated USING (retailer_id = auth.uid());
CREATE POLICY "Supplier inserts inventory logs" ON public.inventory_logs FOR INSERT TO authenticated WITH CHECK (supplier_id = auth.uid());

-- payments_ledger
CREATE POLICY "Retailer views own ledger" ON public.payments_ledger FOR SELECT TO authenticated USING (retailer_id = auth.uid());
CREATE POLICY "Supplier views ledger" ON public.payments_ledger FOR SELECT TO authenticated USING (supplier_id = auth.uid());
CREATE POLICY "Supplier inserts ledger entries" ON public.payments_ledger FOR INSERT TO authenticated WITH CHECK (supplier_id = auth.uid());

-- complaints
CREATE POLICY "Retailer manages own complaints" ON public.complaints FOR ALL TO authenticated
  USING (retailer_id = auth.uid()) WITH CHECK (retailer_id = auth.uid());
CREATE POLICY "Supplier views and updates complaints" ON public.complaints FOR SELECT TO authenticated USING (supplier_id = auth.uid());
CREATE POLICY "Supplier updates complaints" ON public.complaints FOR UPDATE TO authenticated USING (supplier_id = auth.uid());

-- ============ STORAGE: invoice PDFs ============
INSERT INTO storage.buckets (id, name, public) VALUES ('invoices', 'invoices', true);

CREATE POLICY "Anyone can read invoice PDFs" ON storage.objects FOR SELECT USING (bucket_id = 'invoices');
CREATE POLICY "Authenticated can upload invoices" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'invoices');
CREATE POLICY "Authenticated can update invoices" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'invoices');