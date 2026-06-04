-- 1. active_role column on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS active_role public.app_role;

-- Backfill: set active_role to the user's existing role
UPDATE public.profiles p
SET active_role = r.role
FROM public.user_roles r
WHERE r.user_id = p.id AND p.active_role IS NULL;

-- 2. Allow users to insert their own role rows (so they can add a second role)
DROP POLICY IF EXISTS "Users add own roles" ON public.user_roles;
CREATE POLICY "Users add own roles"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 3. Helper: get all roles for a user
CREATE OR REPLACE FUNCTION public.get_user_roles(_user_id uuid)
RETURNS SETOF public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_roles(uuid) TO authenticated;