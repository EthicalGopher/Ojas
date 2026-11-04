-- =============================================================================
-- Migration: retire the character roster and the faces
-- The shop keeps only Meera and Arjun, and each keeps its own face: the face items are switched off
-- too (a face still in someone's loadout is simply not shown). The nine roster characters from
-- 20261102140000_character_roster.sql are switched off (not deleted, so their history stays
-- readable). Nobody owned or played one when this was written; anyone who does is moved back to
-- Meera, and coins spent on one are refunded. Safe to run more than once.
-- =============================================================================

DO $$
DECLARE
  roster TEXT[] := ARRAY['char_kavya', 'char_zoya', 'char_ishani', 'char_aarohi',
                         'char_naina', 'char_tara', 'char_elena', 'char_sana', 'char_rani'];
BEGIN
  -- refund coin purchases (level rewards were free)
  UPDATE public.profiles p
  SET coins_spent = GREATEST(0, p.coins_spent - COALESCE((
        SELECT SUM(m.price_coins) FROM public.avatar_models m
        WHERE m.id = ANY(roster) AND m.id = ANY(p.owned_avatar_ids)), 0)),
      owned_avatar_ids = ARRAY(SELECT a FROM unnest(p.owned_avatar_ids) a WHERE NOT a = ANY(roster)),
      equipped_avatar_id = CASE WHEN p.equipped_avatar_id = ANY(roster) THEN 'starter_ojas_f' ELSE p.equipped_avatar_id END
  WHERE p.owned_avatar_ids && roster OR p.equipped_avatar_id = ANY(roster);

  UPDATE public.avatar_models SET is_active = FALSE WHERE id = ANY(roster) OR category = 'face';
END $$;
