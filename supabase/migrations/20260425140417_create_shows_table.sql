/*
  # Create shows table for film app

  1. New Tables
    - `shows`
      - `id` (uuid, primary key) - Unique identifier for each show
      - `title` (text, not null) - Title of the show
      - `description` (text) - Description of the show
      - `poster_url` (text) - URL to the poster/thumbnail image
      - `video_url` (text, not null) - URL to the video file
      - `genre` (text) - Genre of the show
      - `duration` (text) - Duration of the show (e.g. "1h 30m")
      - `uploaded_by` (uuid, foreign key to auth.users) - The user who uploaded the show
      - `created_at` (timestamptz) - When the show was created

  2. Security
    - Enable RLS on `shows` table
    - SELECT policy: Anyone (authenticated) can read shows
    - INSERT policy: Only rileyallen294@gmail.com can insert shows
    - UPDATE policy: Only rileyallen294@gmail.com can update shows
    - DELETE policy: Only rileyallen294@gmail.com can delete shows

  3. Important Notes
    - The admin email (rileyallen294@gmail.com) is hardcoded in RLS policies
    - All authenticated users can browse and watch shows
    - Only the admin account can upload, edit, or delete shows
*/

CREATE TABLE IF NOT EXISTS shows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  poster_url text DEFAULT '',
  video_url text NOT NULL,
  genre text DEFAULT '',
  duration text DEFAULT '',
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE shows ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read shows
CREATE POLICY "Authenticated users can view shows"
  ON shows FOR SELECT
  TO authenticated
  USING (true);

-- Only the admin email can insert shows
CREATE POLICY "Admin can insert shows"
  ON shows FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.email = 'rileyallen294@gmail.com'
    )
  );

-- Only the admin email can update shows
CREATE POLICY "Admin can update shows"
  ON shows FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.email = 'rileyallen294@gmail.com'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.email = 'rileyallen294@gmail.com'
    )
  );

-- Only the admin email can delete shows
CREATE POLICY "Admin can delete shows"
  ON shows FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.email = 'rileyallen294@gmail.com'
    )
  );

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_shows_created_at ON shows(created_at DESC);
