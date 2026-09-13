-- ============================================================
-- سمسار السودان — مخطط قاعدة البيانات الكامل (Supabase / Postgres)
-- ينفَّذ هذا الملف كاملاً مرة واحدة في SQL Editor على مشروع Supabase
-- ============================================================

-- تفعيل توليد UUID تلقائياً
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1) جدول المستخدمين (بائع/مشتري بنفس الحساب — بالهاتف فقط، بدون كلمة سر)
-- ------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null unique,        -- بصيغة +249XXXXXXXXX
  full_name text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2) جدول الإعلانات (سيارات وعقارات معاً بجدول واحد لتبسيط الاستعلامات)
-- ------------------------------------------------------------
create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_phone text not null,               -- رقم هاتف البائع (+249...)
  seller_name text,

  category text not null check (category in ('car', 'property')),
  deal_type text not null check (deal_type in ('sale', 'rent')), -- بيع / إيجار

  title text not null,
  description text,
  price numeric not null,                   -- السعر المطلوب (أو الإيجار الشهري لو deal_type=rent)
  location text,                            -- المنطقة/المدينة

  -- حقول خاصة بالسيارات (تُترك فارغة لو category=property)
  car_make text,                            -- الماركة (تويوتا، هيونداي...)
  car_model text,                           -- الموديل
  car_year int,
  car_mileage_km int,                       -- الممشى بالكيلومتر
  car_condition text,                       -- جديدة / مستعملة
  car_transmission text,                    -- أوتوماتيك / عادي

  -- حقول خاصة بالعقارات (تُترك فارغة لو category=car)
  property_type text,                       -- شقة / منزل / أرض / محل...
  property_rooms int,
  property_bathrooms int,
  property_area_sqm numeric,
  property_floor int,

  status text not null default 'available' check (status in ('available', 'reserved', 'sold', 'rented')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listings_category_idx on public.listings (category);
create index if not exists listings_deal_type_idx on public.listings (deal_type);
create index if not exists listings_status_idx on public.listings (status);
create index if not exists listings_created_at_idx on public.listings (created_at desc);

-- ------------------------------------------------------------
-- 3) جدول صور/فيديوهات كل إعلان (متعدد لكل إعلان)
-- ------------------------------------------------------------
create table if not exists public.listing_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  media_type text not null check (media_type in ('image', 'video')),
  url text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists listing_media_listing_idx on public.listing_media (listing_id);

-- ------------------------------------------------------------
-- 4) جدول المحادثات (محادثة واحدة لكل زوج مشتري+بائع لكل إعلان)
-- ------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_phone text not null,
  seller_phone text not null,

  -- حالة المفاصلة الحالية على هذه المحادثة
  current_offer_price numeric,              -- آخر سعر مطروح على الطاولة
  current_offer_by text check (current_offer_by in ('buyer', 'seller')), -- مين قدّم آخر عرض
  offer_status text check (offer_status in ('pending', 'accepted')),     -- pending = بانتظار رد الطرف التاني

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (listing_id, buyer_phone)
);

create index if not exists conversations_listing_idx on public.conversations (listing_id);
create index if not exists conversations_buyer_idx on public.conversations (buyer_phone);
create index if not exists conversations_seller_idx on public.conversations (seller_phone);

-- ------------------------------------------------------------
-- 5) جدول الرسائل داخل كل محادثة (نص / عرض سعر / رسالة صوتية)
-- ------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_phone text not null,

  message_type text not null default 'text' check (message_type in ('text', 'offer', 'voice', 'system')),
  body text,                                -- نص الرسالة (لو message_type = text أو system)
  offer_price numeric,                      -- السعر المقترح (لو message_type = offer)
  voice_url text,                           -- رابط الملف الصوتي (لو message_type = voice)
  voice_duration_sec int,                   -- مدة التسجيل بالثواني (لعرضها في الواجهة)

  created_at timestamptz not null default now()
);

create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);

-- ------------------------------------------------------------
-- تفعيل التحديثات الفورية (Realtime) على الجداول المطلوبة
-- ------------------------------------------------------------
alter publication supabase_realtime add table public.listings;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;

-- ------------------------------------------------------------
-- سياسات الوصول (RLS) — نفتحها بشكل مبسّط بما إن التطبيق بلا كلمة سر
-- (تسجيل الدخول بالهاتف فقط، بدون Supabase Auth، فنعتمد على anon key)
-- ------------------------------------------------------------
alter table public.users enable row level security;
alter table public.listings enable row level security;
alter table public.listing_media enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "public read/write users" on public.users;
create policy "public read/write users" on public.users for all using (true) with check (true);

drop policy if exists "public read/write listings" on public.listings;
create policy "public read/write listings" on public.listings for all using (true) with check (true);

drop policy if exists "public read/write listing_media" on public.listing_media;
create policy "public read/write listing_media" on public.listing_media for all using (true) with check (true);

drop policy if exists "public read/write conversations" on public.conversations;
create policy "public read/write conversations" on public.conversations for all using (true) with check (true);

drop policy if exists "public read/write messages" on public.messages;
create policy "public read/write messages" on public.messages for all using (true) with check (true);

-- ------------------------------------------------------------
-- تخزين الملفات (Storage) — دلو واحد لكل الوسائط (صور/فيديو/صوت)
-- ينفَّذ هذا الجزء يدوياً من واجهة Supabase Storage لو فشل هنا:
-- Storage > Create bucket باسم "media" واختر Public bucket = true
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists "public read media" on storage.objects;
create policy "public read media" on storage.objects for select using (bucket_id = 'media');

drop policy if exists "public upload media" on storage.objects;
create policy "public upload media" on storage.objects for insert with check (bucket_id = 'media');
