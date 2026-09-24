import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  AlertTriangle,
  Calendar,
  Lightbulb,
  Megaphone,
  Newspaper,
  Pin,
  PinOff,
  Plus,
  Rocket,
  Send,
  ShieldCheck,
  Swords,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react-native';
import { Avatar } from '../components/Avatar';
import { makeStyles, radius, shadow, ThemeColors, useColors } from '../theme';
import { useNewsStore } from '../store/newsStore';
import { useUserStore } from '../store/userStore';
import {
  NEWS_CATEGORIES,
  NewsCategory,
  NewsDraft,
  NewsItem,
  createNews,
  deleteNews,
  getNewsCategoryMeta,
  updateNews,
} from '../utils/newsService';

const CATEGORY_ICONS: Record<NewsCategory, React.ComponentType<{ size?: number; color?: string }>> = {
  update: Rocket,
  event: Calendar,
  challenge: Swords,
  tip: Lightbulb,
  alert: AlertTriangle,
};

const TITLE_MAX = 120;
const BODY_MAX = 2000;

const timeAgo = (iso: string): string => {
  const secs = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const EMPTY_DRAFT: NewsDraft = { title: '', body: '', category: 'update', is_pinned: false };

export const NewsScreen: React.FC = () => {
  const colors = useColors();
  const styles = useStyles();
  const { items, loading, error, isAdmin, lastSeenAt, refresh, markAllSeen } = useNewsStore();
  const user = useUserStore((s) => s.user);
  const [filter, setFilter] = useState<NewsCategory | 'all'>('all');
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState<NewsDraft>(EMPTY_DRAFT);
  const [publishing, setPublishing] = useState(false);

  // Snapshot of what was unread when the screen opened, so NEW tags stay visible while reading.
  const [unreadSnapshot] = useState<number>(() => (lastSeenAt ? Date.parse(lastSeenAt) : 0));

  useEffect(() => {
    markAllSeen();
  }, [items, markAllSeen]);

  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter((n) => n.category === filter)),
    [items, filter]
  );

  const handlePublish = async () => {
    if (!user?.id) return;
    if (!draft.title.trim() || !draft.body.trim()) {
      Alert.alert('Missing details', 'Add a headline and a message before publishing.');
      return;
    }
    setPublishing(true);
    try {
      await createNews(user.id, draft);
      setDraft(EMPTY_DRAFT);
      setComposerOpen(false);
      refresh();
    } catch (e: any) {
      Alert.alert('Could not publish', e?.message || 'Please try again.');
    } finally {
      setPublishing(false);
    }
  };

  const handleTogglePin = async (item: NewsItem) => {
    try {
      await updateNews(item.id, { is_pinned: !item.is_pinned });
      refresh();
    } catch (e: any) {
      Alert.alert('Could not update', e?.message || 'Please try again.');
    }
  };

  const handleDelete = (item: NewsItem) => {
    Alert.alert('Delete this post?', `"${item.title}" will be removed for everyone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteNews(item.id);
            refresh();
          } catch (e: any) {
            Alert.alert('Could not delete', e?.message || 'Please try again.');
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: NewsItem }) => {
    const meta = getNewsCategoryMeta(item.category);
    const isNew = Date.parse(item.created_at) > unreadSnapshot;
    const CategoryIcon = CATEGORY_ICONS[item.category] ?? Rocket;

    return (
      <View style={styles.card}>
        <View style={[styles.accentBar, { backgroundColor: meta.color }]} />

        <View style={styles.cardTopRow}>
          <View style={[styles.categoryChip, { backgroundColor: `${meta.color}1F` }]}>
            <CategoryIcon size={11} color={meta.color} />
            <Text style={[styles.categoryChipText, { color: meta.color }]}>
              {meta.label.toUpperCase()}
            </Text>
          </View>
          {item.is_pinned && (
            <View style={styles.pinnedChip}>
              <Pin size={10} color={colors.textOnLight} />
              <Text style={styles.pinnedChipText}>PINNED</Text>
            </View>
          )}
          {isNew && (
            <View style={styles.newChip}>
              <Text style={styles.newChipText}>NEW</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          <Text style={styles.timeText}>{timeAgo(item.created_at)}</Text>
        </View>

        <Text style={styles.title}>{item.title}</Text>
        <Text style={styles.body}>{item.body}</Text>

        <View style={styles.cardFooter}>
          <Avatar
            username={item.author?.username || 'ojas'}
            size={22}
            config={item.author?.avatar_config}
            avatarUrl={item.author?.avatar_url}
          />
          <Text style={styles.authorText} numberOfLines={1}>
            {item.author?.username || 'Ojas Team'}
          </Text>
          <ShieldCheck size={12} color={colors.accent} />

          {isAdmin && (
            <View style={styles.adminActions}>
              <TouchableOpacity style={styles.iconBtn} onPress={() => handleTogglePin(item)} hitSlop={8}>
                {item.is_pinned ? (
                  <PinOff size={15} color={colors.textMuted} />
                ) : (
                  <Pin size={15} color={colors.textMuted} />
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={() => handleDelete(item)} hitSlop={8}>
                <Trash2 size={15} color={colors.danger} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    );
  };

  const header = (
    <View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        {[{ key: 'all' as const, label: 'All' }, ...NEWS_CATEGORIES].map((c) => {
          const active = filter === c.key;
          return (
            <TouchableOpacity
              key={c.key}
              style={[styles.filterChip, active && styles.filterChipActive]}
              activeOpacity={0.85}
              onPress={() => setFilter(c.key)}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>{c.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {isAdmin && (
        <TouchableOpacity style={styles.adminBanner} activeOpacity={0.9} onPress={() => setComposerOpen(true)}>
          <View style={styles.adminBannerIcon}>
            <Megaphone size={18} color={colors.onAccent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.adminBannerTitle}>Admin broadcast</Text>
            <Text style={styles.adminBannerSub}>Post an update every athlete will see instantly</Text>
          </View>
          <Plus size={18} color={colors.accent} />
        </TouchableOpacity>
      )}
    </View>
  );

  const empty = loading ? (
    <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />
  ) : (
    <View style={styles.emptyWrap}>
      <View style={styles.emptyIcon}>
        {error ? <WifiOff size={26} color={colors.textMuted} /> : <Newspaper size={26} color={colors.accent} />}
      </View>
      <Text style={styles.emptyTitle}>{error ? 'News is offline' : 'No news yet'}</Text>
      <Text style={styles.emptySub}>
        {error
          ? "We couldn't reach the news feed. Pull down to try again."
          : 'Announcements, events and new challenges from the Ojas team will land here.'}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={visible}
        keyExtractor={(n) => n.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={loading && items.length > 0} onRefresh={refresh} tintColor={colors.accent} />}
        showsVerticalScrollIndicator={false}
      />

      {isAdmin && (
        <TouchableOpacity style={styles.fab} activeOpacity={0.9} onPress={() => setComposerOpen(true)}>
          <Plus size={26} color={colors.onAccent} strokeWidth={3} />
        </TouchableOpacity>
      )}

      <Modal visible={composerOpen} transparent animationType="slide" onRequestClose={() => setComposerOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>New announcement</Text>
              <TouchableOpacity onPress={() => setComposerOpen(false)} hitSlop={10}>
                <X size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.label}>Category</Text>
              <View style={styles.categoryGrid}>
                {NEWS_CATEGORIES.map((c) => {
                  const active = draft.category === c.key;
                  const OptionIcon = CATEGORY_ICONS[c.key];
                  return (
                    <TouchableOpacity
                      key={c.key}
                      style={[styles.catOption, active && { borderColor: c.color, backgroundColor: `${c.color}1F` }]}
                      onPress={() => setDraft((d) => ({ ...d, category: c.key }))}
                    >
                      <OptionIcon size={14} color={active ? c.color : colors.textMuted} />
                      <Text style={[styles.catOptionText, active && { color: c.color }]}>{c.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.label}>Headline</Text>
              <TextInput
                style={styles.input}
                value={draft.title}
                onChangeText={(title) => setDraft((d) => ({ ...d, title }))}
                placeholder="Weekend Squat Showdown starts Friday!"
                placeholderTextColor={colors.textDim}
                maxLength={TITLE_MAX}
              />
              <Text style={styles.counter}>{draft.title.length}/{TITLE_MAX}</Text>

              <Text style={styles.label}>Message</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={draft.body}
                onChangeText={(body) => setDraft((d) => ({ ...d, body }))}
                placeholder="Tell athletes what's happening, what to do, and what they can win."
                placeholderTextColor={colors.textDim}
                maxLength={BODY_MAX}
                multiline
                textAlignVertical="top"
              />
              <Text style={styles.counter}>{draft.body.length}/{BODY_MAX}</Text>

              <View style={styles.pinRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pinTitle}>Pin to top</Text>
                  <Text style={styles.pinSub}>Pinned posts stay above newer ones</Text>
                </View>
                <Switch
                  value={draft.is_pinned}
                  onValueChange={(is_pinned) => setDraft((d) => ({ ...d, is_pinned }))}
                  trackColor={{ true: colors.accent, false: colors.surfaceHi }}
                  thumbColor={colors.text}
                />
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.publishBtn, publishing && { opacity: 0.6 }]}
              activeOpacity={0.9}
              disabled={publishing}
              onPress={handlePublish}
            >
              {publishing ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <>
                  <Send size={16} color={colors.onAccent} />
                  <Text style={styles.publishText}>PUBLISH TO ALL ATHLETES</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const useStyles = makeStyles((colors: ThemeColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  listContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 140 },
  filterRow: { gap: 8, paddingBottom: 14 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  filterText: { color: colors.textMuted, fontSize: 12.5, fontWeight: '800' },
  filterTextActive: { color: colors.onAccent },

  adminBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginBottom: 14,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(226, 88, 34, 0.07)',
    borderWidth: 1,
    borderColor: 'rgba(226, 88, 34, 0.3)',
    borderStyle: 'dashed',
  },
  adminBannerIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adminBannerTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  adminBannerSub: { color: colors.textMuted, fontSize: 11.5, marginTop: 2 },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: 16,
    paddingLeft: 20,
    marginBottom: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  accentBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  categoryChipText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  pinnedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.gold,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  pinnedChipText: { color: colors.textOnLight, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  newChip: { backgroundColor: colors.danger, paddingHorizontal: 7, paddingVertical: 4, borderRadius: radius.pill },
  newChipText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  timeText: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
  title: { color: colors.text, fontSize: 16, fontWeight: '900', lineHeight: 21 },
  body: { color: colors.textMuted, fontSize: 13.5, lineHeight: 20, marginTop: 6 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  authorText: { color: colors.textMuted, fontSize: 12, fontWeight: '800', flexShrink: 1 },
  adminActions: { flexDirection: 'row', marginLeft: 'auto', gap: 4 },
  iconBtn: { padding: 6, borderRadius: 10, backgroundColor: colors.surfaceHi },

  emptyWrap: { alignItems: 'center', paddingTop: 56, paddingHorizontal: 24 },
  emptyIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { color: colors.text, fontSize: 18, fontWeight: '900', marginTop: 12 },
  emptySub: { color: colors.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 19, marginTop: 6 },

  fab: {
    position: 'absolute',
    right: 20,
    bottom: 120,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    ...shadow(10),
  },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(3, 5, 10, 0.75)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: 20,
    paddingBottom: 28,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  sheetHandle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: colors.borderStrong, marginBottom: 14 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sheetTitle: { color: colors.text, fontSize: 20, fontWeight: '900' },
  label: { color: colors.textMuted, fontSize: 11, fontWeight: '900', letterSpacing: 0.8, marginTop: 14, marginBottom: 8, textTransform: 'uppercase' },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surfaceSunken,
  },
  catOptionText: { color: colors.textMuted, fontSize: 12.5, fontWeight: '800' },
  input: {
    backgroundColor: colors.surfaceSunken,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  textArea: { minHeight: 120 },
  counter: { color: colors.textDim, fontSize: 10.5, alignSelf: 'flex-end', marginTop: 4 },
  pinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSunken,
  },
  pinTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  pinSub: { color: colors.textMuted, fontSize: 11.5, marginTop: 2 },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: radius.pill,
    marginTop: 18,
    backgroundColor: colors.accent,
  },
  publishText: { color: colors.onAccent, fontSize: 14, fontWeight: '900', letterSpacing: 0.6 },
})
);
