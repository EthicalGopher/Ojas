// Clan base: the screen you land on inside Clan. A menu on the left (My Clan, Members, Applications,
// Rankings) switches the content on the right, in the layout of a game guild hall:
//   My Clan       crest card | power, league and notice board | member list
//   Members       two-column member cards, sortable, with kick / leave
//   Applications  join settings (leader and officers) and the pending join requests
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Building2,
  Check,
  ChevronRight,
  Crown,
  Edit3,
  LogOut,
  Shield,
  Trophy,
  UserPlus,
  Users,
  UserX,
  X,
  Inbox,
  type LucideIcon,
} from 'lucide-react-native';
import { Avatar } from '../../../components/Avatar';
import { GText, Slant } from '../../../components/game';
import { SquadLeagueEmblem, squadLeagueFromPower, TIER_PALETTES, tierColor } from '../../../components/RankEmblem';
import { juice } from '../../../juice/juice';
import { softShadow, useColors, useResolvedScheme, type Palette } from '../../../theme';
import {
  ClanJoinPolicy,
  Community,
  CommunityMember,
  squadLevelFromPower,
  updateClanSettings,
} from '../../../utils/communityService';
import { computeTotalXp, levelFromXp } from '../../../utils/gamification';
import { GAME, GameProgress, GradientFill, SquadCrest } from '../../squad/components/SquadUI';

type Section = 'clan' | 'members' | 'applications';
type MemberSort = 'points' | 'level' | 'active';

export interface ClanBaseProps {
  clan: Community;
  /** Every membership row of the clan, active and pending. */
  members: CommunityMember[];
  loadingMembers: boolean;
  power: number;
  memberPoints: Record<string, number>;
  /** Place on the clan leaderboard, 0 when unknown. */
  rank: number;
  myUserId: string;
  /** Your role in this clan, or null when you are not a member of it. */
  myRole: 'leader' | 'admin' | 'member' | null;
  /** You are in some clan (this one or another). */
  inAnyClan: boolean;
  /** Your pending join request is for this clan. */
  requestedHere: boolean;
  onEdit: () => void;
  onInvite: () => void;
  onLeave: () => void;
  onJoin: () => void;
  onKick: (member: CommunityMember) => void;
  onReview: (userId: string, name: string, decision: 'accept' | 'reject') => void;
  onRankings: () => void;
  /** Reload after the join settings changed. */
  onChanged: () => void;
}

const POLICIES: { key: ClanJoinPolicy; label: string }[] = [
  { key: 'approval', label: 'Approve each' },
  { key: 'open', label: 'Open to all' },
  { key: 'closed', label: 'Closed' },
];
const LEVEL_STEPS = [1, 5, 10, 15, 20, 30];

const nameOf = (m: CommunityMember) => m.profile?.full_name || m.profile?.username || 'Athlete';
const levelOf = (m: CommunityMember) => levelFromXp(computeTotalXp((m.profile ?? null) as any)).level;
const roleLabel = (role: CommunityMember['role']) => (role === 'leader' ? 'Leader' : role === 'admin' ? 'Officer' : 'Member');
const isActive = (m: CommunityMember) => m.status === 'active' || m.status === 'joined';
const isPending = (m: CommunityMember) => m.status === 'pending_approval' || m.status === 'pending';

/** Days since the member's profile last changed (a match, a workout, a quest), or null. */
function daysIdle(m: CommunityMember): number | null {
  const t = m.profile?.updated_at ? Date.parse(m.profile.updated_at) : NaN;
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}
function activeText(days: number | null): string {
  if (days === null) return 'Activity unknown';
  if (days === 0) return 'Active today';
  if (days === 1) return 'Active yesterday';
  return `Last active ${days} days ago`;
}
const policyText = (p?: ClanJoinPolicy) => (p === 'open' ? 'Open to all' : p === 'closed' ? 'Closed' : 'Leader approves');

export const ClanBase: React.FC<ClanBaseProps> = (props) => {
  const { clan, members, myRole } = props;
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const short = height < 400;
  const canManage = myRole === 'leader' || myRole === 'admin';
  const [section, setSection] = useState<Section>('clan');

  const active = useMemo(() => members.filter(isActive), [members]);
  const pending = useMemo(() => members.filter(isPending), [members]);

  // a member who loses the officer role, or a visitor, never stays on Applications
  useEffect(() => {
    if (section === 'applications' && !canManage) setSection('clan');
  }, [section, canManage]);

  const navW = Math.round(Math.min(170, Math.max(124, width * 0.17)));
  const nav: { key: Section | 'rankings'; label: string; Icon: LucideIcon; badge?: number }[] = [
    { key: 'clan', label: myRole ? 'My Clan' : 'Clan Info', Icon: Shield },
    { key: 'members', label: 'Members', Icon: Users },
    ...(canManage ? [{ key: 'applications' as const, label: 'Requests', Icon: Inbox, badge: pending.length }] : []),
    { key: 'rankings', label: 'Rankings', Icon: Trophy },
  ];

  return (
    <View style={[styles.root, { paddingLeft: Math.max(insets.left, 10), paddingRight: Math.max(insets.right, 10), paddingBottom: 8 }]}>
      {/* left menu */}
      <View style={[styles.nav, { width: navW, borderRightColor: c.edge }]}>
        {nav.map(({ key, label, Icon, badge }) => {
          const on = key === section;
          return (
            <Pressable
              key={key}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => {
                juice.play('tap');
                if (key === 'rankings') props.onRankings();
                else setSection(key);
              }}
              style={({ pressed }) => [styles.navItem, { height: short ? 44 : 52 }, pressed && { opacity: 0.75 }]}
            >
              {on && <Slant fill={c.accentFrom} to={c.accentTo} />}
              <View>
                <Icon size={16} color={on ? '#FFFFFF' : c.textMuted} strokeWidth={2.6} />
                {!!badge && (
                  <View style={[styles.badge, { backgroundColor: c.loss }]}>
                    <GText variant="label" size={9} style={{ color: '#FFFFFF' }}>{badge}</GText>
                  </View>
                )}
              </View>
              <GText variant="label" size={12} numberOfLines={1} style={{ color: on ? '#FFFFFF' : c.textMuted, flexShrink: 1, letterSpacing: 0 }}>
                {label.toUpperCase()}
              </GText>
              {on && <View style={[styles.navTick, { backgroundColor: c.accentTo }]} />}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.body}>
        {props.loadingMembers && members.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={c.accent} />
          </View>
        ) : section === 'clan' ? (
          <ClanOverview {...props} active={active} pending={pending} c={c} width={width - navW - 40} short={short} openMembers={() => setSection('members')} />
        ) : section === 'members' ? (
          <MemberGrid {...props} active={active} c={c} width={width - navW - 40} short={short} />
        ) : (
          <Applications {...props} pending={pending} c={c} short={short} width={width - navW - 40} />
        )}
      </View>
    </View>
  );
};

// ---------- My Clan ----------

const ClanOverview: React.FC<
  ClanBaseProps & { active: CommunityMember[]; pending: CommunityMember[]; c: Palette; width: number; short: boolean; openMembers: () => void }
> = ({ clan, active, power, memberPoints, rank, myRole, inAnyClan, requestedHere, c, width, short, openMembers, ...p }) => {
  const dark = useResolvedScheme() === 'dark';
  const level = squadLevelFromPower(power);
  const league = squadLeagueFromPower(power);
  const nextLeague = league.nextPower;
  const leagueSpan = nextLeague ? nextLeague - league.minPower : 1;
  const leagueProgress = nextLeague ? (power - league.minPower) / leagueSpan : 1;
  const avgPts = active.length ? Math.round(active.reduce((s, m) => s + (memberPoints[m.user_id] ?? 0), 0) / active.length) : 0;
  const canManage = myRole === 'leader' || myRole === 'admin';
  const cardW = Math.round(Math.min(230, Math.max(128, width * 0.25)));
  const rosterW = Math.round(Math.min(220, Math.max(128, width * 0.24)));
  // the middle column gets what is left; on 640 dp phones it is about 230 dp, so it compacts
  const narrow = width - cardW - rosterW - 20 < 300;
  const crest = Math.round(Math.min(cardW * 0.58, short ? 84 : 110));
  const roster = [...active].sort((a, b) => (memberPoints[b.user_id] ?? 0) - (memberPoints[a.user_id] ?? 0));

  return (
    <View style={styles.overview}>
      {/* crest card */}
      <View style={[styles.crestCard, { width: cardW }]}>
        <GradientFill colors={[GAME.violet, GAME.indigo, GAME.night]} vertical />
        <SquadCrest logoUrl={clan.logo_url} power={power} size={crest} frameColor={tierColor(league.tier)} />
        <GText variant="display" size={short ? 17 : 20} numberOfLines={2} style={styles.crestName}>{clan.name}</GText>
        <View style={styles.crestMeta}>
          <Building2 size={12} color={GAME.textSoft} />
          <GText variant="caption" size={11} style={{ color: GAME.textSoft }} numberOfLines={1}>{clan.category}</GText>
        </View>
        <View style={{ flex: 1 }} />
        <View style={styles.levelPlate}>
          <Slant fill="#1D2F6B" to="#2B4AA8" stroke="rgba(160,190,255,0.55)" />
          <GText variant="display" size={short ? 14 : 16} style={{ color: '#FFFFFF' }}>Lv. {level.level} Clan</GText>
        </View>
        <View style={{ alignSelf: 'stretch', marginTop: 6 }}>
          <GameProgress progress={level.progress} height={6} />
        </View>
      </View>

      {/* power, league, notice */}
      <ScrollView style={styles.middle} contentContainerStyle={{ gap: short ? 8 : 10, paddingBottom: 4 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.statStrip, { backgroundColor: c.surface, borderColor: c.edge }]}>
          {[
            { label: narrow ? 'Power' : 'Clan Power', value: power.toLocaleString() },
            { label: 'Rank', value: rank > 0 ? `#${rank}` : '-' },
            { label: narrow ? 'Avg pts' : 'Avg Points', value: avgPts.toLocaleString() },
          ].map(({ label, value }, i) => (
            <View key={label} style={[styles.stat, i > 0 && { borderLeftWidth: 1, borderLeftColor: c.edge }]}>
              <GText variant="caption" size={11} tone="muted" numberOfLines={1}>{label}</GText>
              <GText variant="number" size={narrow ? 16 : short ? 18 : 21} adjustsFontSizeToFit style={{ color: c.winInk }} numberOfLines={1}>{value}</GText>
            </View>
          ))}
        </View>

        <View style={[styles.leaguePanel, { backgroundColor: c.surface, borderColor: c.edge }]}>
          <View style={[styles.leagueHead, { backgroundColor: c.surfaceHi }]}>
            <GText variant="label" size={12} style={{ color: c.text, letterSpacing: 1 }}>CURRENT LEAGUE</GText>
          </View>
          <View style={styles.leagueBody}>
            <SquadLeagueEmblem tier={league.tier} size={narrow ? 44 : short ? 56 : 70} />
            <View style={{ flex: 1, gap: 4 }}>
              <GText variant="display" size={narrow ? 16 : short ? 18 : 22} adjustsFontSizeToFit style={{ color: dark ? TIER_PALETTES[league.tier].light : TIER_PALETTES[league.tier].dark }} numberOfLines={1}>{league.name}</GText>
              <GameProgress progress={leagueProgress} height={7} />
              <GText variant="caption" size={11} tone="muted" numberOfLines={1}>
                {nextLeague ? `${(nextLeague - power).toLocaleString()} power to the next league` : 'Top league reached'}
              </GText>
              <GText variant="caption" size={11} tone="dim" numberOfLines={2}>
                {active.length} athletes · Joining: {policyText(clan.join_policy)}
                {clan.min_level && clan.min_level > 1 ? ` · Lv ${clan.min_level}+` : ''}
              </GText>
            </View>
          </View>
          <View style={styles.leagueActions}>
            {canManage ? (
              <ActionButton label={narrow ? 'Invite' : 'Send Invitation'} Icon={UserPlus} onPress={p.onInvite} c={c} />
            ) : !myRole && !inAnyClan ? (
              <ActionButton
                label={requestedHere ? 'Requested' : clan.join_policy === 'open' || narrow ? 'Join Clan' : 'Request to Join'}
                Icon={requestedHere ? Check : UserPlus}
                disabled={requestedHere || clan.join_policy === 'closed'}
                onPress={p.onJoin}
                c={c}
              />
            ) : null}
          </View>
        </View>

        <View style={[styles.notice, { backgroundColor: c.surfaceSunken, borderColor: c.edge }]}>
          <View style={styles.noticeHead}>
            <GText variant="label" size={11} tone="muted" style={{ letterSpacing: 1 }}>CLAN NOTICE</GText>
            {myRole === 'leader' && (
              <Pressable onPress={() => { juice.play('tap'); p.onEdit(); }} hitSlop={8} accessibilityLabel="Edit clan" style={styles.noticeEdit}>
                <Edit3 size={13} color={c.textMuted} />
                <GText variant="caption" size={11} tone="muted">Edit</GText>
              </Pressable>
            )}
          </View>
          <GText variant="body" size={13} tone={clan.description ? 'text' : 'dim'} numberOfLines={4}>
            {clan.description?.trim() || "The leader hasn't posted a notice yet."}
          </GText>
        </View>
      </ScrollView>

      {/* member list */}
      <View style={[styles.roster, { width: rosterW, backgroundColor: c.surface, borderColor: c.edge }]}>
        <Pressable onPress={() => { juice.play('tap'); openMembers(); }} style={styles.rosterHead}>
          <GText variant="label" size={12} tone="muted">{active.length} {active.length === 1 ? 'MEMBER' : 'MEMBERS'}</GText>
          <ChevronRight size={15} color={c.textMuted} />
        </Pressable>
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {roster.map((m) => (
            <View key={m.id} style={[styles.rosterRow, { borderBottomColor: c.edge }]}>
              <View style={[styles.rosterAvatar, { borderColor: m.role === 'leader' ? c.win : c.borderStrong }]}>
                <Avatar config={m.profile?.avatar_config} avatarUrl={m.profile?.avatar_url} size={short ? 30 : 36} username={m.profile?.username} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <GText variant="bodyStrong" size={13} numberOfLines={1} style={m.user_id === p.myUserId ? { color: c.youInk } : undefined}>{nameOf(m)}</GText>
                <View style={styles.rowMeta}>
                  {m.role === 'leader' ? <Crown size={11} color={c.win} /> : m.role === 'admin' ? <Shield size={11} color={c.rivalInk} /> : null}
                  <GText variant="caption" size={11} tone="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
                    {m.role === 'member' ? `Lv ${levelOf(m)}` : `${roleLabel(m.role)} · Lv ${levelOf(m)}`}
                  </GText>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
        {!!myRole && (
          <View style={[styles.rosterFoot, { borderTopColor: c.edge }]}>
            {(myRole === 'leader' || myRole === 'admin') && (
              <IconButton Icon={UserPlus} label="Invite a player" onPress={p.onInvite} c={c} />
            )}
            <IconButton Icon={Users} label="All members" onPress={openMembers} c={c} />
            <IconButton Icon={LogOut} label="Leave clan" onPress={p.onLeave} c={c} danger />
          </View>
        )}
      </View>
    </View>
  );
};

// ---------- Members ----------

const MemberGrid: React.FC<ClanBaseProps & { active: CommunityMember[]; c: Palette; width: number; short: boolean }> = ({
  active,
  memberPoints,
  myUserId,
  myRole,
  c,
  width,
  short,
  onKick,
  onLeave,
}) => {
  const [sort, setSort] = useState<MemberSort>('points');
  const rows = useMemo(() => {
    const withData = active.map((m) => ({ m, pts: memberPoints[m.user_id] ?? 0, lvl: levelOf(m), idle: daysIdle(m) }));
    return withData.sort((a, b) =>
      sort === 'level' ? b.lvl - a.lvl || b.pts - a.pts : sort === 'active' ? (a.idle ?? 9999) - (b.idle ?? 9999) || b.pts - a.pts : b.pts - a.pts || b.lvl - a.lvl,
    );
  }, [active, memberPoints, sort]);
  const twoCols = width >= 520;

  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.gridHead, { borderBottomColor: c.edge }]}>
        <GText variant="label" size={13} tone="muted">Clan size: <GText variant="label" size={13}>{active.length}</GText></GText>
        <View style={{ flex: 1 }} />
        {(['points', 'level', 'active'] as MemberSort[]).map((k, i) => (
          <React.Fragment key={k}>
            {i > 0 && <GText variant="label" size={13} tone="dim">/</GText>}
            <Pressable onPress={() => { juice.play('toggle'); setSort(k); }} hitSlop={6} accessibilityRole="button" accessibilityState={{ selected: sort === k }}>
              <GText variant="label" size={13} style={{ color: sort === k ? c.accentTo : c.textMuted }}>
                {k === 'points' ? 'Points' : k === 'level' ? 'Level' : 'Activity'}
              </GText>
            </Pressable>
          </React.Fragment>
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
        {rows.map(({ m, pts, lvl, idle }) => {
          const me = m.user_id === myUserId;
          const canKick = !me && m.role !== 'leader' && (myRole === 'leader' || (myRole === 'admin' && m.role === 'member'));
          return (
            <View
              key={m.id}
              style={[
                styles.memberCard,
                { width: twoCols ? '49%' : '100%', backgroundColor: c.surface, borderColor: me ? c.edgeAccent : c.edge },
                short && { paddingVertical: 8 },
              ]}
            >
              <View style={[styles.cardAvatar, { borderColor: m.role === 'leader' ? c.win : c.borderStrong }]}>
                <Avatar config={m.profile?.avatar_config} avatarUrl={m.profile?.avatar_url} size={short ? 42 : 50} username={m.profile?.username} />
                <View style={[styles.lvlTag, { backgroundColor: c.bg }]}>
                  <GText variant="label" size={10}>{lvl}</GText>
                </View>
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
                <View style={styles.rowMeta}>
                  {m.role === 'leader' ? <Crown size={13} color={c.win} /> : m.role === 'admin' ? <Shield size={13} color={c.rivalInk} /> : null}
                  <GText variant="bodyStrong" size={14} numberOfLines={1} style={{ flexShrink: 1 }}>{nameOf(m)}</GText>
                  {me && <GText variant="label" size={10} style={{ color: c.youInk }}>YOU</GText>}
                </View>
                <GText variant="caption" size={12} tone="muted" numberOfLines={1}>
                  {roleLabel(m.role)} · Lv {lvl} · <GText variant="caption" size={12} style={{ color: c.winInk }}>{pts.toLocaleString()} pts</GText>
                </GText>
                <GText variant="caption" size={11} numberOfLines={1} style={{ color: idle === 0 ? c.success : c.textDim }}>{activeText(idle)}</GText>
              </View>
              {me ? (
                <IconButton Icon={LogOut} label="Leave clan" onPress={onLeave} c={c} danger />
              ) : canKick ? (
                <IconButton Icon={UserX} label={`Remove ${nameOf(m)}`} onPress={() => onKick(m)} c={c} danger />
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
};

// ---------- Applications ----------

const Applications: React.FC<ClanBaseProps & { pending: CommunityMember[]; c: Palette; short: boolean; width: number }> = ({
  clan,
  pending,
  c,
  short,
  width,
  onReview,
  onChanged,
}) => {
  const narrow = width < 600;
  const ready = clan.join_policy !== undefined; // false until the clan settings migration is applied
  const [policy, setPolicy] = useState<ClanJoinPolicy>(clan.join_policy ?? 'approval');
  const [minLevel, setMinLevel] = useState<number>(clan.min_level ?? 1);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setPolicy(clan.join_policy ?? 'approval');
    setMinLevel(clan.min_level ?? 1);
  }, [clan.join_policy, clan.min_level]);

  const save = async (nextPolicy: ClanJoinPolicy, nextLevel: number) => {
    if (!ready || saving) return;
    const before = { policy, minLevel };
    setPolicy(nextPolicy);
    setMinLevel(nextLevel);
    setSaving(true);
    const res = await updateClanSettings(clan.id, nextPolicy, nextLevel);
    setSaving(false);
    if (!res.success) {
      setPolicy(before.policy);
      setMinLevel(before.minLevel);
      Alert.alert('Not saved', res.error || 'Could not save the clan settings.');
      return;
    }
    onChanged();
  };

  const rowLabel = (t: string) => (
    <GText variant="bodyStrong" size={narrow ? 13 : 14} tone="muted" style={[styles.settingLabel, narrow && { width: 96 }]} numberOfLines={2}>{t}</GText>
  );

  return (
    <ScrollView contentContainerStyle={{ gap: short ? 10 : 14, paddingBottom: 8 }} showsVerticalScrollIndicator={false}>
      <View style={[styles.appsTitle, { borderBottomColor: c.edge }]}>
        <GText variant="display" size={short ? 18 : 20} numberOfLines={1}>Join Requests</GText>
        {saving && <ActivityIndicator size="small" color={c.accent} />}
      </View>

      <View style={[styles.settingRow, !ready && { opacity: 0.45 }]}>
        {rowLabel('Join requests:')}
        <View style={[styles.settingOptions, narrow && { gap: 8 }]}>
          {POLICIES.map(({ key, label }) => (
            <Pressable
              key={key}
              disabled={!ready}
              onPress={() => { juice.play('toggle'); save(key, minLevel); }}
              accessibilityRole="radio"
              accessibilityState={{ checked: policy === key, disabled: !ready }}
              style={[styles.radio, narrow && { gap: 7, paddingRight: 4 }]}
            >
              <View style={[styles.diamond, { borderColor: policy === key ? c.accentTo : c.borderStrong }]}>
                {policy === key && <View style={[styles.diamondDot, { backgroundColor: c.accentTo }]} />}
              </View>
              <GText variant="bodyStrong" size={narrow ? 13 : 14} style={{ color: policy === key ? c.text : c.textDim }}>{label}</GText>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[styles.settingRow, !ready && { opacity: 0.45 }]}>
        {rowLabel("Player's level:")}
        <View style={[styles.settingOptions, narrow && { gap: 8 }]}>
          {LEVEL_STEPS.map((lv) => {
            const on = minLevel === lv;
            const size = narrow ? 42 : short ? 46 : 54;
            return (
              <Pressable
                key={lv}
                disabled={!ready}
                onPress={() => { juice.play('toggle'); save(policy, lv); }}
                accessibilityRole="radio"
                accessibilityState={{ checked: on, disabled: !ready }}
                accessibilityLabel={lv === 1 ? 'Any level' : `Level ${lv} or higher`}
                style={[
                  styles.levelChip,
                  { width: size, height: size, borderRadius: size / 2, backgroundColor: on ? c.surfaceHi : c.surface, borderColor: on ? c.accentTo : c.edge },
                  on && softShadow(c),
                ]}
              >
                <GText variant="label" size={lv === 1 ? 13 : 11} style={{ color: on ? c.text : c.textMuted }}>{lv === 1 ? 'Any' : `Lv ${lv}`}</GText>
              </Pressable>
            );
          })}
        </View>
      </View>
      {!ready && (
        <GText variant="caption" tone="dim" style={{ marginLeft: 4 }}>
          Join settings need the clan settings database update (migration 20261107120000).
        </GText>
      )}

      <View style={[styles.appsTitle, { borderBottomColor: c.edge, marginTop: 4 }]}>
        <GText variant="label" size={13} tone="muted" style={{ letterSpacing: 1 }}>REQUESTS ({pending.length})</GText>
      </View>
      {pending.length === 0 ? (
        <GText variant="body" size={13} tone="dim" style={{ marginLeft: 4 }}>No join requests right now.</GText>
      ) : (
        pending.map((m) => (
          <View key={m.id} style={[styles.requestRow, { backgroundColor: c.surface, borderColor: c.edge }]}>
            <Avatar config={m.profile?.avatar_config} avatarUrl={m.profile?.avatar_url} size={40} username={m.profile?.username} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <GText variant="bodyStrong" size={14} numberOfLines={1}>{nameOf(m)}</GText>
              <GText variant="caption" size={12} tone="muted" numberOfLines={1}>@{m.profile?.username || 'user'} · Lv {levelOf(m)}</GText>
            </View>
            <Pressable
              onPress={() => { juice.play('tap'); onReview(m.user_id, nameOf(m), 'accept'); }}
              accessibilityLabel={`Accept ${nameOf(m)}`}
              style={({ pressed }) => [styles.reviewBtn, { backgroundColor: c.success }, pressed && { opacity: 0.75 }]}
            >
              <Check size={17} color="#FFFFFF" strokeWidth={3} />
            </Pressable>
            <Pressable
              onPress={() => { juice.play('tap'); onReview(m.user_id, nameOf(m), 'reject'); }}
              accessibilityLabel={`Reject ${nameOf(m)}`}
              style={({ pressed }) => [styles.reviewBtn, { borderWidth: 1.5, borderColor: c.loss }, pressed && { opacity: 0.75 }]}
            >
              <X size={17} color={c.loss} strokeWidth={3} />
            </Pressable>
          </View>
        ))
      )}
    </ScrollView>
  );
};

// ---------- small parts ----------

const ActionButton: React.FC<{ label: string; Icon: LucideIcon; onPress: () => void; c: Palette; disabled?: boolean }> = ({ label, Icon, onPress, c, disabled }) => (
  <Pressable
    disabled={disabled}
    onPress={() => { juice.play('tap'); onPress(); }}
    accessibilityRole="button"
    style={({ pressed }) => [styles.actionBtn, disabled && { opacity: 0.5 }, pressed && { transform: [{ scale: 0.97 }] }]}
  >
    <Slant fill={c.accentFrom} to={c.accentTo} />
    <Icon size={15} color="#FFFFFF" strokeWidth={2.8} />
    <GText variant="label" size={13} style={{ color: '#FFFFFF', letterSpacing: 0.6 }}>{label.toUpperCase()}</GText>
  </Pressable>
);

const IconButton: React.FC<{ Icon: LucideIcon; label: string; onPress: () => void; c: Palette; danger?: boolean }> = ({ Icon, label, onPress, c, danger }) => (
  <Pressable
    onPress={() => { juice.play('tap'); onPress(); }}
    accessibilityRole="button"
    accessibilityLabel={label}
    hitSlop={6}
    style={({ pressed }) => [styles.iconBtn, { borderColor: danger ? c.loss : c.borderStrong, backgroundColor: c.raised }, pressed && { opacity: 0.7 }]}
  >
    <Icon size={16} color={danger ? c.loss : c.text} strokeWidth={2.4} />
  </Pressable>
);

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', paddingTop: 4, gap: 12 },
  nav: { borderRightWidth: 1, paddingRight: 8, paddingTop: 6, gap: 4 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 10 },
  navTick: { position: 'absolute', right: -9, top: '30%', bottom: '30%', width: 3, borderRadius: 2 },
  badge: { position: 'absolute', top: -9, left: -9, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, paddingTop: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  overview: { flex: 1, flexDirection: 'row', gap: 10 },
  crestCard: { borderRadius: 14, overflow: 'hidden', alignItems: 'center', paddingHorizontal: 12, paddingTop: 14, paddingBottom: 12, borderWidth: 1, borderColor: 'rgba(160,190,255,0.35)' },
  crestName: { color: '#FFFFFF', textAlign: 'center', marginTop: 6 },
  crestMeta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  levelPlate: { alignSelf: 'stretch', height: 34, alignItems: 'center', justifyContent: 'center' },

  middle: { flex: 1 },
  statStrip: { flexDirection: 'row', borderRadius: 12, borderWidth: 1, paddingVertical: 8 },
  stat: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  leaguePanel: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  leagueHead: { alignItems: 'center', paddingVertical: 5 },
  leagueBody: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingTop: 8 },
  leagueActions: { alignItems: 'center', paddingVertical: 8 },
  notice: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, gap: 4 },
  noticeHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  noticeEdit: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  roster: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  rosterHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 7 },
  rosterRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  rosterAvatar: { borderWidth: 2, borderRadius: 8, overflow: 'hidden' },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rosterFoot: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 7, borderTopWidth: 1 },

  gridHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8, marginBottom: 8, borderBottomWidth: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8, paddingBottom: 8 },
  memberCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 10 },
  cardAvatar: { borderWidth: 2, borderRadius: 10 },
  lvlTag: { position: 'absolute', right: -6, bottom: -6, minWidth: 20, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },

  appsTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 6, borderBottomWidth: 1 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingLabel: { width: 130, textAlign: 'right' },
  settingOptions: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14 },
  radio: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, paddingRight: 10 },
  diamond: { width: 20, height: 20, borderWidth: 2, transform: [{ rotate: '45deg' }], alignItems: 'center', justifyContent: 'center' },
  diamondDot: { width: 8, height: 8 },
  levelChip: { borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  requestRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  reviewBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  actionBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 36, paddingHorizontal: 24 },
  iconBtn: { width: 34, height: 34, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
});
