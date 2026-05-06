-- Private storage bucket for meal photos. Public=false; we serve via
-- short-lived signed URLs from the /api/photo/[filename] route so the
-- bucket itself isn't enumerable. file_size_limit is defence-in-depth
-- on top of our server-side sharp resize (which targets ~700KB-1MB).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'photos',
  'photos',
  false,
  5242880, -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
