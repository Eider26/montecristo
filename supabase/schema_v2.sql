
-- FASTFOOD POS V2
-- Ejecuta este archivo completo en Supabase > SQL Editor.
create extension if not exists pgcrypto;

create sequence if not exists public.sales_ticket_seq start 1;

create table if not exists public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  price numeric(12,2) not null check(price >= 0),
  emoji text not null default '🍔',
  stock numeric(12,2) not null default 0 check(stock >= 0),
  min_stock numeric(12,2) not null default 0 check(min_stock >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  email text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  ticket text not null unique,
  created_by uuid references auth.users(id),
  customer_id uuid references public.customers(id),
  payment_method text not null,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  status text not null default 'completed' check(status in ('completed','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id),
  product_name text not null,
  quantity numeric(12,2) not null check(quantity > 0),
  unit_price numeric(12,2) not null check(unit_price >= 0),
  subtotal numeric(12,2) not null check(subtotal >= 0)
);

create table if not exists public.sale_audit (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  changed_by uuid references auth.users(id),
  action text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.open_sales (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  payment_method text not null default 'Efectivo',
  created_by uuid not null default auth.uid() references auth.users(id),
  customer_id uuid references public.customers(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.open_sale_items (
  id uuid primary key default gen_random_uuid(),
  open_sale_id uuid not null references public.open_sales(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null,
  quantity numeric(12,2) not null check(quantity > 0),
  unit_price numeric(12,2) not null check(unit_price >= 0),
  subtotal numeric(12,2) not null check(subtotal >= 0),
  unique(open_sale_id, product_id)
);

insert into public.payment_methods(name,sort_order) values
('Efectivo',1),('Tarjeta',2),('Transferencia',3)
on conflict(name) do nothing;

-- RLS: solo usuarios autenticados pueden acceder.
alter table public.payment_methods enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.sale_audit enable row level security;
alter table public.open_sales enable row level security;
alter table public.open_sale_items enable row level security;

revoke all on public.payment_methods, public.products, public.customers, public.sales, public.sale_items, public.sale_audit, public.open_sales, public.open_sale_items from anon;
grant select on public.payment_methods to authenticated;
grant select,insert,update on public.products to authenticated;
grant select,insert,update on public.customers to authenticated;
grant select,insert,update on public.sales to authenticated;
grant select,insert,update on public.sale_items to authenticated;
grant select,insert on public.sale_audit to authenticated;
grant select,insert,update,delete on public.open_sales to authenticated;
grant select,insert,update,delete on public.open_sale_items to authenticated;
grant usage,select on sequence public.sales_ticket_seq to authenticated;

drop policy if exists "authenticated payment methods" on public.payment_methods;
create policy "authenticated payment methods" on public.payment_methods for select to authenticated using(true);

drop policy if exists "authenticated products select" on public.products;
create policy "authenticated products select" on public.products for select to authenticated using(true);
drop policy if exists "authenticated products insert" on public.products;
create policy "authenticated products insert" on public.products for insert to authenticated with check(true);
drop policy if exists "authenticated products update" on public.products;
create policy "authenticated products update" on public.products for update to authenticated using(true) with check(true);

drop policy if exists "authenticated customers" on public.customers;
create policy "authenticated customers" on public.customers for all to authenticated using(true) with check(true);

drop policy if exists "authenticated sales select" on public.sales;
create policy "authenticated sales select" on public.sales for select to authenticated using(true);
drop policy if exists "authenticated sales insert" on public.sales;
create policy "authenticated sales insert" on public.sales for insert to authenticated with check(created_by = auth.uid());
drop policy if exists "authenticated sales update" on public.sales;
create policy "authenticated sales update" on public.sales for update to authenticated using(true) with check(true);

drop policy if exists "authenticated sale items" on public.sale_items;
create policy "authenticated sale items" on public.sale_items for all to authenticated using(true) with check(true);

drop policy if exists "authenticated audit" on public.sale_audit;
create policy "authenticated audit" on public.sale_audit for select to authenticated using(true);
drop policy if exists "authenticated audit insert" on public.sale_audit;
create policy "authenticated audit insert" on public.sale_audit for insert to authenticated with check(changed_by = auth.uid());

drop policy if exists "own open sales" on public.open_sales;
create policy "own open sales" on public.open_sales for all to authenticated using(created_by = auth.uid()) with check(created_by = auth.uid());

drop policy if exists "own open sale items" on public.open_sale_items;
create policy "own open sale items" on public.open_sale_items for all to authenticated
using(exists(select 1 from public.open_sales o where o.id=open_sale_id and o.created_by=auth.uid()))
with check(exists(select 1 from public.open_sales o where o.id=open_sale_id and o.created_by=auth.uid()));

-- Completa una venta de forma atómica, calcula precios desde DB y descuenta inventario.
create or replace function public.complete_sale(p_open_sale_id uuid)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  d public.open_sales%rowtype;
  i record;
  p public.products%rowtype;
  sale_id uuid;
  v_subtotal numeric(12,2) := 0;
  v_ticket text;
begin
  select * into d from public.open_sales where id=p_open_sale_id and created_by=auth.uid() for update;
  if not found then raise exception 'Venta abierta no encontrada'; end if;
  if not exists(select 1 from public.open_sale_items where open_sale_id=p_open_sale_id) then raise exception 'La venta está vacía'; end if;

  v_ticket := 'VTA-' || to_char(now() at time zone 'America/Bogota','YYYYMMDD') || '-' || lpad(nextval('public.sales_ticket_seq')::text,6,'0');
  insert into public.sales(ticket,created_by,payment_method,status) values(v_ticket,auth.uid(),d.payment_method,'completed') returning id into sale_id;

  for i in select * from public.open_sale_items where open_sale_id=p_open_sale_id loop
    select * into p from public.products where id=i.product_id and active=true for update;
    if not found then raise exception 'Producto no disponible: %',i.product_name; end if;
    if p.stock < i.quantity then raise exception 'Stock insuficiente para %',p.name; end if;
    update public.products set stock=stock-i.quantity,updated_at=now() where id=p.id;
    insert into public.sale_items(sale_id,product_id,product_name,quantity,unit_price,subtotal)
    values(sale_id,p.id,p.name,i.quantity,p.price,i.quantity*p.price);
    v_subtotal := v_subtotal + (i.quantity*p.price);
  end loop;

  update public.sales set subtotal=v_subtotal,total=v_subtotal,updated_at=now() where id=sale_id;
  delete from public.open_sales where id=p_open_sale_id;
  return v_ticket;
end $$;

grant execute on function public.complete_sale(uuid) to authenticated;

-- Permite corregir el método de pago y deja auditoría.
create or replace function public.change_sale_payment(p_sale_id uuid,p_payment_method text)
returns void
language plpgsql
security invoker
set search_path=public
as $$
declare old_method text;
begin
  if not exists(select 1 from public.payment_methods where name=p_payment_method and active=true) then raise exception 'Método de pago no válido'; end if;
  select payment_method into old_method from public.sales where id=p_sale_id for update;
  if old_method is null then raise exception 'Venta no encontrada'; end if;
  update public.sales set payment_method=p_payment_method,updated_at=now() where id=p_sale_id;
  insert into public.sale_audit(sale_id,changed_by,action,old_data,new_data)
  values(p_sale_id,auth.uid(),'change_payment',jsonb_build_object('payment_method',old_method),jsonb_build_object('payment_method',p_payment_method));
end $$;

grant execute on function public.change_sale_payment(uuid,text) to authenticated;
