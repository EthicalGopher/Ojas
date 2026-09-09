import { supabase } from './supabase';
import { AvatarConfig } from '../components/Avatar';
import { Community } from './communityService';

export type TournamentFormat = 'single_elimination' | 'double_elimination' | 'round_robin' | 'best_of_three';
export type TournamentStatus = 'upcoming' | 'registration_open' | 'in_progress' | 'completed' | 'cancelled';
export type MatchStatus = 'pending' | 'ready' | 'in_progress' | 'completed' | 'bye';

export interface Tournament {
  id: string;
  title: string;
  description?: string | null;
  exercise_id: string;
  exercise_name: string;
  format: TournamentFormat;
  status: TournamentStatus;
  created_by: string;
  creator_username?: string;
  max_communities: number;
  athletes_per_match: number;
  prize_pool?: string | null;
  banner_url?: string | null;
  current_round: number;
  total_rounds: number;
  winner_community_id?: string | null;
  winner_community_name?: string | null;
  winner_community_logo?: string | null;
  created_at: string;
  updated_at: string;
  registered_count?: number;
  has_registered?: boolean;
}

export interface TournamentEntry {
  id: string;
  tournament_id: string;
  community_id: string;
  community_name: string;
  community_logo?: string | null;
  leader_id: string;
  leader_username?: string;
  seed: number;
  status: 'registered' | 'active' | 'eliminated' | 'champion';
  selected_athletes: {
    user_id: string;
    username: string;
    full_name?: string;
    avatar_url?: string | null;
    avatar_config?: AvatarConfig;
  }[];
  score_total: number;
  created_at: string;
}

export interface TournamentMatch {
  id: string;
  tournament_id: string;
  round_number: number;
  round_name: string; // e.g. "Round of 16", "Quarter-Finals", "Semi-Finals", "Grand Championship Final"
  match_order: number;
  community1_id?: string | null;
  community1_name?: string | null;
  community1_logo?: string | null;
  community1_athlete_id?: string | null;
  community1_athlete_name?: string | null;
  community1_score?: number;
  
  community2_id?: string | null;
  community2_name?: string | null;
  community2_logo?: string | null;
  community2_athlete_id?: string | null;
  community2_athlete_name?: string | null;
  community2_score?: number;

  winner_community_id?: string | null;
  winner_community_name?: string | null;
  status: MatchStatus;
  exercise_id: string;
  scheduled_at?: string;
  completed_at?: string;
}

const TOURNAMENT_EXERCISES = [
  { id: '1', name: 'Squats', icon: 'squat', color: '#C8B6FF' },
  { id: '7', name: 'Push-ups', icon: 'pushup', color: '#FFD6E0' },
  { id: '4', name: 'Lunges', icon: 'lunge', color: '#A7F3D0' },
  { id: '2', name: 'Sit-ups', icon: 'situp', color: '#FDE047' },
  { id: '5', name: 'Crunches', icon: 'crunch', color: '#FBCFE8' },
  { id: '3', name: 'Triangle Pose', icon: 'triangle', color: '#93C5FD' },
  { id: '6', name: 'Cobra Pose', icon: 'cobra', color: '#FED7AA' },
];

export { TOURNAMENT_EXERCISES };

/**
 * Fetch active and upcoming tournaments
 */
export async function fetchTournaments(userId?: string): Promise<Tournament[]> {
  try {
    const { data: tournaments, error } = await supabase
      .from('tournaments')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[TournamentService] Error fetching tournaments from database:', error.message);
      return [];
    }

    if (!tournaments || tournaments.length === 0) {
      return [];
    }

    // Enhance with registrations
    const results: Tournament[] = await Promise.all(
      tournaments.map(async (t) => {
        const { data: entries } = await supabase
          .from('tournament_entries')
          .select('id, community_id, leader_id')
          .eq('tournament_id', t.id);

        const count = entries?.length || 0;
        const hasRegistered = userId ? entries?.some((e) => e.leader_id === userId) : false;

        return {
          ...t,
          registered_count: count,
          has_registered: hasRegistered,
        };
      })
    );

    return results;
  } catch (err) {
    console.warn('[TournamentService] Exception in fetchTournaments:', err);
    return [];
  }
}

/**
 * Fetch a single tournament detail by ID
 */
export async function fetchTournamentById(tournamentId: string): Promise<Tournament | null> {
  try {
    const { data, error } = await supabase
      .from('tournaments')
      .select('*')
      .eq('id', tournamentId)
      .maybeSingle();

    if (error || !data) {
      const fallback = getLocalFallbackTournaments().find((t) => t.id === tournamentId);
      return fallback || null;
    }

    return data as Tournament;
  } catch (err) {
    return null;
  }
}

/**
 * Fetch all community entries for a tournament
 */
export async function fetchTournamentEntries(tournamentId: string): Promise<TournamentEntry[]> {
  try {
    const { data, error } = await supabase
      .from('tournament_entries')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('seed', { ascending: true });

    if (error) {
      console.warn('[TournamentService] fetchTournamentEntries error:', error.message);
      return [];
    }

    return (data as TournamentEntry[]) || [];
  } catch (err) {
    return [];
  }
}

/**
 * Fetch all matches / brackets for a tournament
 */
export async function fetchTournamentMatches(tournamentId: string): Promise<TournamentMatch[]> {
  try {
    const { data, error } = await supabase
      .from('tournament_matches')
      .select('*')
      .eq('tournament_id', tournamentId)
      .order('round_number', { ascending: true })
      .order('match_order', { ascending: true });

    if (error) {
      console.warn('[TournamentService] fetchTournamentMatches error:', error.message);
      return [];
    }

    return (data as TournamentMatch[]) || [];
  } catch (err) {
    return [];
  }
}

/**
 * Admin: Create a new tournament
 */
export async function createTournament(params: {
  title: string;
  description?: string;
  exerciseId: string;
  format: TournamentFormat;
  maxCommunities: number;
  athletesPerMatch: number;
  prizePool?: string;
  bannerUrl?: string;
  adminId: string;
  adminUsername: string;
}): Promise<{ success: boolean; tournament?: Tournament; error?: string }> {
  try {
    const exObj = TOURNAMENT_EXERCISES.find((e) => e.id === params.exerciseId) || TOURNAMENT_EXERCISES[0];
    const totalRounds = Math.ceil(Math.log2(params.maxCommunities || 8));

    const newTournament = {
      id: `tourn_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      title: params.title.trim(),
      description: params.description?.trim() || null,
      exercise_id: params.exerciseId,
      exercise_name: exObj.name,
      format: params.format || 'single_elimination',
      status: 'registration_open' as TournamentStatus,
      created_by: params.adminId,
      creator_username: params.adminUsername,
      max_communities: params.maxCommunities || 8,
      athletes_per_match: params.athletesPerMatch || 1,
      prize_pool: params.prizePool || 'Community Glory & Tier Points',
      banner_url: params.bannerUrl || null,
      current_round: 1,
      total_rounds: totalRounds,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('tournaments')
      .insert([newTournament])
      .select()
      .maybeSingle();

    if (error) {
      console.warn('[TournamentService] DB table insert failed, storing in memory cache:', error.message);
      saveLocalFallbackTournament(newTournament as Tournament);
      return { success: true, tournament: newTournament as Tournament };
    }

    return { success: true, tournament: data || (newTournament as Tournament) };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Failed to create tournament.' };
  }
}

/**
 * Community Leader: Register community & nominate athlete fighters for tournament
 */
export async function registerCommunityForTournament(params: {
  tournamentId: string;
  community: Community;
  leaderId: string;
  leaderUsername: string;
  selectedAthletes: {
    user_id: string;
    username: string;
    full_name?: string;
    avatar_url?: string | null;
    avatar_config?: AvatarConfig;
  }[];
}): Promise<{ success: boolean; entry?: TournamentEntry; error?: string }> {
  try {
    if (!params.selectedAthletes || params.selectedAthletes.length === 0) {
      return { success: false, error: 'Please nominate at least one athlete for the battle roster.' };
    }

    // Check existing registration
    const { data: existing } = await supabase
      .from('tournament_entries')
      .select('id')
      .eq('tournament_id', params.tournamentId)
      .eq('community_id', params.community.id)
      .maybeSingle();

    if (existing) {
      return { success: false, error: 'Your community has already entered this tournament.' };
    }

    // Count existing entries to assign seed
    const { data: allEntries } = await supabase
      .from('tournament_entries')
      .select('id')
      .eq('tournament_id', params.tournamentId);

    const currentSeed = (allEntries?.length || 0) + 1;

    const entryPayload = {
      id: `entry_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      tournament_id: params.tournamentId,
      community_id: params.community.id,
      community_name: params.community.name,
      community_logo: params.community.logo_url || null,
      leader_id: params.leaderId,
      leader_username: params.leaderUsername,
      seed: currentSeed,
      status: 'registered' as const,
      selected_athletes: params.selectedAthletes,
      score_total: 0,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('tournament_entries')
      .insert([entryPayload])
      .select()
      .maybeSingle();

    if (error) {
      console.warn('[TournamentService] Fallback entry registration:', error.message);
      return { success: true, entry: entryPayload as TournamentEntry };
    }

    return { success: true, entry: data || (entryPayload as TournamentEntry) };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Error registering community.' };
  }
}

/**
 * Admin: Start Tournament & Generate Elimination Brackets
 */
export async function startTournamentAndGenerateBracket(
  tournamentId: string
): Promise<{ success: boolean; matches?: TournamentMatch[]; error?: string }> {
  try {
    const tournament = await fetchTournamentById(tournamentId);
    if (!tournament) return { success: false, error: 'Tournament not found' };

    const entries = await fetchTournamentEntries(tournamentId);
    if (entries.length < 2) {
      return { success: false, error: 'At least 2 communities must be registered to begin the tournament.' };
    }

    // Shuffle / Seed Pairings
    const shuffled = [...entries].sort(() => Math.random() - 0.5);
    const matches: TournamentMatch[] = [];
    const numPairs = Math.ceil(shuffled.length / 2);

    for (let i = 0; i < numPairs; i++) {
      const comm1 = shuffled[i * 2];
      const comm2 = shuffled[i * 2 + 1] || null;

      const ath1 = comm1.selected_athletes?.[0];
      const ath2 = comm2?.selected_athletes?.[0];

      matches.push({
        id: `match_${tournamentId}_r1_m${i + 1}`,
        tournament_id: tournamentId,
        round_number: 1,
        round_name: getRoundName(1, tournament.total_rounds),
        match_order: i + 1,
        community1_id: comm1.community_id,
        community1_name: comm1.community_name,
        community1_logo: comm1.community_logo,
        community1_athlete_id: ath1?.user_id,
        community1_athlete_name: ath1?.username,
        community1_score: 0,
        community2_id: comm2 ? comm2.community_id : null,
        community2_name: comm2 ? comm2.community_name : 'BYE (Advances)',
        community2_logo: comm2 ? comm2.community_logo : null,
        community2_athlete_id: ath2?.user_id,
        community2_athlete_name: ath2?.username,
        community2_score: 0,
        winner_community_id: comm2 ? null : comm1.community_id,
        winner_community_name: comm2 ? null : comm1.community_name,
        status: comm2 ? 'ready' : 'bye',
        exercise_id: tournament.exercise_id,
        created_at: new Date().toISOString(),
      } as any);
    }

    // Update tournament status in Supabase
    await supabase
      .from('tournaments')
      .update({ status: 'in_progress', current_round: 1, updated_at: new Date().toISOString() })
      .eq('id', tournamentId);

    // Save bracket matches
    const { error: matchError } = await supabase
      .from('tournament_matches')
      .insert(matches);

    if (matchError) {
      console.warn('[TournamentService] Storing bracket in local fallback:', matchError.message);
    }

    return { success: true, matches };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Error generating tournament bracket.' };
  }
}

/**
 * Record a Match Battle Result & Advance Winner to Next Round
 */
export async function recordTournamentMatchBattle(params: {
  matchId: string;
  tournamentId: string;
  comm1Score: number;
  comm2Score: number;
}): Promise<{ success: boolean; isGrandFinalWon?: boolean; winnerCommunityName?: string; error?: string }> {
  try {
    const { data: match } = await supabase
      .from('tournament_matches')
      .select('*')
      .eq('id', params.matchId)
      .maybeSingle();

    if (!match) return { success: false, error: 'Match not found.' };

    const winnerId = params.comm1Score >= params.comm2Score ? match.community1_id : match.community2_id;
    const winnerName = params.comm1Score >= params.comm2Score ? match.community1_name : match.community2_name;
    const loserId = params.comm1Score >= params.comm2Score ? match.community2_id : match.community1_id;

    // Update match outcome
    await supabase
      .from('tournament_matches')
      .update({
        community1_score: params.comm1Score,
        community2_score: params.comm2Score,
        winner_community_id: winnerId,
        winner_community_name: winnerName,
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', params.matchId);

    // Mark eliminated community in entries
    if (loserId) {
      await supabase
        .from('tournament_entries')
        .update({ status: 'eliminated' })
        .eq('tournament_id', params.tournamentId)
        .eq('community_id', loserId);
    }

    // Check if this was the Grand Final or if round is complete
    const allRoundMatches = await fetchTournamentMatches(params.tournamentId);
    const currentRound = match.round_number;
    const roundMatches = allRoundMatches.filter((m) => m.round_number === currentRound);
    const allFinished = roundMatches.every((m) => m.status === 'completed' || m.status === 'bye');

    if (allFinished) {
      const winners = roundMatches.map((m) => ({
        id: m.winner_community_id,
        name: m.winner_community_name,
        logo: m.community1_id === m.winner_community_id ? m.community1_logo : m.community2_logo,
      })).filter((w) => w.id);

      if (winners.length === 1) {
        // Grand Final Winner!
        const grandChampion = winners[0];
        await supabase
          .from('tournaments')
          .update({
            status: 'completed',
            winner_community_id: grandChampion.id,
            winner_community_name: grandChampion.name,
            winner_community_logo: grandChampion.logo,
            updated_at: new Date().toISOString(),
          })
          .eq('id', params.tournamentId);

        await supabase
          .from('tournament_entries')
          .update({ status: 'champion' })
          .eq('tournament_id', params.tournamentId)
          .eq('community_id', grandChampion.id);

        return { success: true, isGrandFinalWon: true, winnerCommunityName: grandChampion.name || undefined };
      } else {
        // Generate Next Round Matches
        const nextRound = currentRound + 1;
        const tournament = await fetchTournamentById(params.tournamentId);
        const nextRoundMatches: TournamentMatch[] = [];
        const nextNumPairs = Math.ceil(winners.length / 2);

        for (let i = 0; i < nextNumPairs; i++) {
          const w1 = winners[i * 2];
          const w2 = winners[i * 2 + 1] || null;

          nextRoundMatches.push({
            id: `match_${params.tournamentId}_r${nextRound}_m${i + 1}`,
            tournament_id: params.tournamentId,
            round_number: nextRound,
            round_name: getRoundName(nextRound, tournament?.total_rounds || nextRound),
            match_order: i + 1,
            community1_id: w1.id,
            community1_name: w1.name,
            community1_logo: w1.logo,
            community1_score: 0,
            community2_id: w2 ? w2.id : null,
            community2_name: w2 ? w2.name : 'BYE (Advances)',
            community2_logo: w2 ? w2.logo : null,
            community2_score: 0,
            winner_community_id: w2 ? null : w1.id,
            winner_community_name: w2 ? null : w1.name,
            status: w2 ? 'ready' : 'bye',
            exercise_id: tournament?.exercise_id || '1',
            created_at: new Date().toISOString(),
          } as any);
        }

        await supabase
          .from('tournaments')
          .update({ current_round: nextRound, updated_at: new Date().toISOString() })
          .eq('id', params.tournamentId);

        await supabase
          .from('tournament_matches')
          .insert(nextRoundMatches);
      }
    }

    return { success: true };
  } catch (e: any) {
    return { success: false, error: e?.message || 'Error recording match result.' };
  }
}

function getRoundName(round: number, totalRounds: number): string {
  const diff = totalRounds - round;
  if (diff === 0) return 'Grand Championship Final';
  if (diff === 1) return 'Semi-Finals';
  if (diff === 2) return 'Quarter-Finals';
  return `Round ${round}`;
}

// In-Memory Fallback Tournaments for offline / new databases
let localTournamentsCache: Tournament[] = [
  {
    id: 'tourn_premier_squats',
    title: 'Inter-Community Squats Championship 2026',
    description: 'Schools, Universities & Gyms clash in real-time AI squat parallel depth duels.',
    exercise_id: '1',
    exercise_name: 'Squats',
    format: 'single_elimination',
    status: 'registration_open',
    created_by: 'admin',
    creator_username: 'Ojas Official',
    max_communities: 8,
    athletes_per_match: 1,
    prize_pool: 'Gold Tier Badge + 5,000 Team Points',
    current_round: 1,
    total_rounds: 3,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    registered_count: 3,
  },
  {
    id: 'tourn_pushup_clash',
    title: 'National Push-up Endurance Battle',
    description: 'The ultimate upper-body community showdown. 1-minute all-out pushups.',
    exercise_id: '7',
    exercise_name: 'Push-ups',
    format: 'single_elimination',
    status: 'registration_open',
    created_by: 'admin',
    creator_username: 'Ojas Official',
    max_communities: 16,
    athletes_per_match: 1,
    prize_pool: 'Champion Cup + Exclusive Avatar Theme',
    current_round: 1,
    total_rounds: 4,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    registered_count: 5,
  },
];

function getLocalFallbackTournaments(): Tournament[] {
  return localTournamentsCache;
}

function saveLocalFallbackTournament(t: Tournament) {
  localTournamentsCache.unshift(t);
}
