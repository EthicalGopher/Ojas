// Profile > History: the player's finished matches, newest first, with a short summary on top.
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Bot, Clock, Flag, History, Swords, Trophy } from 'lucide-react-native';
import { GText, Panel } from '../../components/game';
import { ExerciseIcon } from '../../components/ExerciseIcon';
import { useExerciseListStore } from '../../store/exerciseListStore';
import { useColors, type Palette } from '../../theme';
import { fetchMatchHistory, type MatchHistoryEntry, type MatchHistoryResult } from '../../utils/matchHistoryService';

const MODE_LABEL: Record<MatchHistoryEntry['mode'], string> = {
  quickjoin: '1v1 duel',
  ai_battle: 'AI duel',
  ffa: 'Battle Ground',
};
const MODE_ICON: Record<MatchHistoryEntry['mode'], React.ComponentType<{ size?: number; color?: string }>> = {
  quickjoin: Swords,
  ai_battle: Bot,
  ffa: Trophy,
};
const TIMED = ['9', '10']; // Tree Pose and Warrior II score the longest hold in seconds

function resultStyle(c: Palette, r: MatchHistoryResult, mode: MatchHistoryEntry['mode']) {
  if (r === 'win') return { letter: 'W', word: mode === 'ffa' ? 'Champion' : 'Victory', color: c.win, ink: c.winInk };
  if (r === 'draw') return { letter: mode === 'ffa' ? 'P' : 'D', word: mode === 'ffa' ? 'Podium' : 'Draw', color: c.sky, ink: c.sky };
  return { letter: 'L', word: 'Defeat', color: c.loss, ink: c.lossInk };
}

/** "Just now", "12m ago", "3h ago", "Yesterday", or "14 Nov". */
function when(iso?: string): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  if (hours < 48) return 'Yesterday';
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function duration(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;
}

export const MatchHistoryList: React.FC<{ userId: string | null | undefined; refreshKey?: number }> = ({ userId, refreshKey = 0 }) => {
  const c = useColors();
  const exercises = useExerciseListStore((s) => s.exercises);
  const [entries, setEntries] = useState<MatchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const res = await fetchMatchHistory(userId, 50);
    setEntries(res.entries);
    setError(res.error ?? null);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={c.accent} />
      </View>
    );
  }

  if (error || entries.length === 0) {
    return (
      <Panel tone="raised" radius={20} padding={22} style={styles.empty}>
        <History size={30} color={c.textMuted} />
        <GText variant="title">{error ? 'History is not available yet' : 'No matches yet'}</GText>
        <GText variant="body" tone="muted" style={{ textAlign: 'center' }}>
          {error
            ? 'Pull down to try again. Your matches are still counted toward your rank.'
            : 'Play a duel, an AI duel or Battle Ground from the lobby. Every match you finish shows up here.'}
        </GText>
      </Panel>
    );
  }

  const wins = entries.filter((e) => e.result === 'win').length;
  const draws = entries.filter((e) => e.result === 'draw').length;
  const losses = entries.length - wins - draws;
  const winRate = Math.round((wins / entries.length) * 100);
  const points = entries.reduce((sum, e) => sum + (e.points_delta || 0), 0);

  return (
    <View style={{ gap: 10 }}>
      {/* summary of the matches listed */}
      <View style={styles.summary}>
        {[
          { label: 'Played', value: String(entries.length), color: c.text },
          { label: 'Wins', value: String(wins), color: c.winInk },
          { label: 'Draws', value: String(draws), color: c.sky },
          { label: 'Losses', value: String(losses), color: c.lossInk },
          { label: 'Win rate', value: `${winRate}%`, color: c.text },
          { label: 'Rank pts', value: `${points > 0 ? '+' : ''}${points}`, color: points >= 0 ? c.success : c.lossInk },
        ].map((s) => (
          <Panel key={s.label} tone="raised" radius={14} padding={8} style={styles.summaryCell}>
            <GText variant="number" size={20} style={{ color: s.color }} numberOfLines={1} adjustsFontSizeToFit>
              {s.value}
            </GText>
            <GText variant="caption" size={11} tone="muted" numberOfLines={1}>
              {s.label}
            </GText>
          </Panel>
        ))}
      </View>
      {entries.length >= 50 && (
        <GText variant="caption" tone="muted">
          Your last 50 matches
        </GText>
      )}

      {entries.map((e) => {
        const ex = exercises.find((x) => x.id === e.exercise_id);
        const r = resultStyle(c, e.result, e.mode);
        const ModeIcon = MODE_ICON[e.mode];
        const unit = TIMED.includes(e.exercise_id) ? 's' : '';
        const score = e.opponent_score === null ? `${e.self_score}${unit}` : `${e.self_score}${unit} – ${e.opponent_score}${unit}`;
        return (
          <Panel
            key={e.id ?? `${e.created_at}-${e.exercise_id}`}
            tone="raised"
            radius={16}
            padding={10}
            style={styles.row}
            accessible
            accessibilityLabel={`${r.word}, ${ex?.name ?? 'Workout'}, ${MODE_LABEL[e.mode]}${e.opponent ? ` against ${e.opponent}` : ''}, score ${score}, ${when(e.created_at)}`}
          >
            <View style={[styles.resultBadge, { backgroundColor: `${r.color}26`, borderColor: r.color }]}>
              <GText variant="display" size={20} style={{ color: r.ink }}>
                {r.letter}
              </GText>
            </View>
            <ExerciseIcon imageUrl={ex?.image_url} icon={ex?.icon} size={30} />
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <View style={styles.line}>
                <GText variant="bodyStrong" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {ex?.name ?? 'Workout'}
                </GText>
                <GText variant="caption" style={{ color: r.ink }}>
                  {r.word}
                </GText>
                {e.forfeit && (
                  <View style={[styles.tag, { borderColor: c.edge }]}>
                    <Flag size={10} color={c.textMuted} />
                    <GText variant="caption" size={10} tone="muted">
                      Forfeit
                    </GText>
                  </View>
                )}
              </View>
              <View style={styles.line}>
                <ModeIcon size={12} color={c.textMuted} />
                <GText variant="caption" tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                  {MODE_LABEL[e.mode]}
                  {e.opponent && e.mode !== 'ffa' ? ` · vs ${e.opponent}` : ''}
                </GText>
              </View>
            </View>
            <View style={styles.right}>
              <GText variant="number" size={18}>
                {score}
              </GText>
              <View style={styles.line}>
                <GText variant="caption" size={11} style={{ color: e.points_delta >= 0 ? c.success : c.lossInk }}>
                  {e.points_delta > 0 ? '+' : ''}
                  {e.points_delta} pts
                </GText>
                <GText variant="caption" size={11} tone="muted">
                  {e.calories} kcal
                </GText>
              </View>
              <View style={styles.line}>
                <Clock size={10} color={c.textMuted} />
                <GText variant="caption" size={11} tone="muted">
                  {duration(e.duration_seconds)} · {when(e.created_at)}
                </GText>
              </View>
            </View>
          </Panel>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  center: { paddingVertical: 32, alignItems: 'center' },
  empty: { alignItems: 'center', gap: 8 },
  summary: { flexDirection: 'row', gap: 8 },
  summaryCell: { flex: 1, alignItems: 'center', minWidth: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  resultBadge: { width: 38, height: 38, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  right: { alignItems: 'flex-end', gap: 1 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 5, borderRadius: 6, borderWidth: 1 },
});
