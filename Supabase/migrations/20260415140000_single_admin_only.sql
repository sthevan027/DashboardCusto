-- Um único usuário pode ser admin: índice único parcial (expressão constante).
create unique index if not exists idx_app_profiles_single_admin
  on public.app_profiles ((1))
  where (role = 'admin');
