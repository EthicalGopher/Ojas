-- =============================================================================
-- Migration: Add Push-ups to public.exercises table
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
  type
)
VALUES (
  '7',
  'Push-ups',
  'strength',
  '🤸',
  'AI Real-time Push-up Depth, Elbow Flexion & Plank Alignment Rep Tracker',
  '#FFD6E0',
  true,
  7,
  20,
  'Chest / Triceps / Shoulders / Core',
  15,
  'Intermediate',
  '#FFD6E0',
  'https://locsjrjekkyjbeapgreu.supabase.co/storage/v1/object/public/Images/Excercise/a-guy-doing-pushups.svg',
  'Common exercises'
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
  updated_at = NOW();
