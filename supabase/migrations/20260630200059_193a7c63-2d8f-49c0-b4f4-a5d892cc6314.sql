CREATE TABLE public.dashboard_snapshot (
  id INT PRIMARY KEY DEFAULT 1,
  label TEXT,
  detail TEXT,
  sheet_url TEXT,
  projetos JSONB NOT NULL DEFAULT '[]'::jsonb,
  metas JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT dashboard_snapshot_singleton CHECK (id = 1)
);

GRANT SELECT, INSERT, UPDATE ON public.dashboard_snapshot TO anon;
GRANT SELECT, INSERT, UPDATE ON public.dashboard_snapshot TO authenticated;
GRANT ALL ON public.dashboard_snapshot TO service_role;

ALTER TABLE public.dashboard_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read snapshot"
  ON public.dashboard_snapshot FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert snapshot"
  ON public.dashboard_snapshot FOR INSERT
  WITH CHECK (id = 1);

CREATE POLICY "Anyone can update snapshot"
  ON public.dashboard_snapshot FOR UPDATE
  USING (id = 1)
  WITH CHECK (id = 1);