-- =============================================================================
-- Migration: Add Child's Pose (Balasana) to public.exercises
-- Description: Adds Child's Pose with cure_to posture therapy tags and image url
-- =============================================================================

INSERT INTO public.exercises (
  id,
  name,
  category,
  icon,
  description,
  bg_gradient,
  is_active,
  display_order,
  duration_mins,
  muscle_groups,
  reps_target,
  difficulty,
  bg_theme,
  image_url,
  type,
  cure_to
)
VALUES (
  '8',
  'Child''s Pose',
  'flexibility',
  '🧘',
  'AI Real-time Balasana Pose Tracker for Spine Decompression, Hip Flexion & Shoulder Stretch',
  '#A7F3D0',
  true,
  8,
  15,
  'Spine Decompressors / Glutes / Ankles / Shoulders',
  10,
  'Beginner',
  '#A7F3D0',
  'https://locsjrjekkyjbeapgreu.supabase.co/storage/v1/object/public/Images/Excercise/child_pose.png',
  'Yoga',
  ARRAY['lower_back_pain', 'rounded_shoulders', 'bow_legs', 'flat_feet', 'knock_knees']
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  icon = EXCLUDED.icon,
  description = EXCLUDED.description,
  bg_gradient = EXCLUDED.bg_gradient,
  is_active = EXCLUDED.is_active,
  display_order = EXCLUDED.display_order,
  duration_mins = EXCLUDED.duration_mins,
  muscle_groups = EXCLUDED.muscle_groups,
  reps_target = EXCLUDED.reps_target,
  difficulty = EXCLUDED.difficulty,
  bg_theme = EXCLUDED.bg_theme,
  image_url = EXCLUDED.image_url,
  type = EXCLUDED.type,
  cure_to = EXCLUDED.cure_to;
