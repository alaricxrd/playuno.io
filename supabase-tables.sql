-- Play Uno Together - Supabase Table Setup
-- Run these commands in Supabase SQL Editor

-- 1. Rooms table
CREATE TABLE IF NOT EXISTS public.unoplay_rooms (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  host_session VARCHAR(50) NOT NULL,
  host_name VARCHAR(100),
  host_avatar VARCHAR(50),
  max_players INTEGER DEFAULT 4,
  visibility VARCHAR(20) DEFAULT 'private',
  password_hash VARCHAR(255),
  status VARCHAR(20) DEFAULT 'lobby',
  game_state JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Room members table
CREATE TABLE IF NOT EXISTS public.unoplay_room_members (
  id BIGSERIAL PRIMARY KEY,
  room_code VARCHAR(20) NOT NULL REFERENCES public.unoplay_rooms(code) ON DELETE CASCADE,
  session_id VARCHAR(50) NOT NULL,
  display_name VARCHAR(100),
  avatar VARCHAR(50),
  is_host BOOLEAN DEFAULT FALSE,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(room_code, session_id)
);

-- 3. Messages table
CREATE TABLE IF NOT EXISTS public.unoplay_messages (
  id BIGSERIAL PRIMARY KEY,
  room_code VARCHAR(20) NOT NULL REFERENCES public.unoplay_rooms(code) ON DELETE CASCADE,
  session_id VARCHAR(50),
  display_name VARCHAR(100),
  avatar VARCHAR(50),
  message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_rooms_code ON public.unoplay_rooms(code);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON public.unoplay_rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_last_active ON public.unoplay_rooms(last_active_at);
CREATE INDEX IF NOT EXISTS idx_members_room_code ON public.unoplay_room_members(room_code);
CREATE INDEX IF NOT EXISTS idx_members_session ON public.unoplay_room_members(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_room_code ON public.unoplay_messages(room_code);
CREATE INDEX IF NOT EXISTS idx_messages_created ON public.unoplay_messages(created_at);

-- 5. Enable Row Level Security (RLS) - Optional but recommended
ALTER TABLE public.unoplay_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unoplay_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unoplay_messages ENABLE ROW LEVEL SECURITY;

-- 6. Create policies to allow access (for now, allow all - you can restrict later)
CREATE POLICY "Allow all access to rooms" ON public.unoplay_rooms FOR ALL USING (true);
CREATE POLICY "Allow all access to members" ON public.unoplay_room_members FOR ALL USING (true);
CREATE POLICY "Allow all access to messages" ON public.unoplay_messages FOR ALL USING (true);

-- 7. Auto-cleanup old rooms (optional - runs daily)
-- Deletes rooms older than 24 hours that are not active
CREATE OR REPLACE FUNCTION cleanup_old_rooms()
RETURNS void AS $$
BEGIN
  DELETE FROM public.unoplay_rooms
  WHERE last_active_at < NOW() - INTERVAL '24 hours';
END;
$$ LANGUAGE plpgsql;

-- Note: To run cleanup automatically, you'll need to set up a cron job in Supabase
-- or use a scheduled function (Supabase Edge Functions with cron)
