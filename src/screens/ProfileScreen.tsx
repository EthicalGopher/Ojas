import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StatusBar,
  RefreshControl,
  Switch,
  Modal,
  useWindowDimensions,
} from 'react-native';
import {
  Activity,
  AtSign,
  Award,
  Bell,
  Camera as CameraIcon,
  Check,
  Clock,
  Dumbbell,
  Edit3,
  Flame,
  Info,
  Lock,
  LogOut,
  Phone,
  Save,
  Search,
  Send,
  Shuffle,
  Star,
  Swords,
  Target,
  Trash2,
  Trophy,
  User,
  UserPlus,
  Users,
  X,
  Zap,
  Sun,
  Moon,
  Smartphone,
  PersonStanding,
  ShoppingBag,
  GraduationCap,
  ChevronRight,
  Music,
  Volume2,
  Vibrate,
  FileText,
} from 'lucide-react-native';
import { ProgressRing } from '../components/ui/ProgressRing';
import { useGameStats } from '../hooks/useGameStats';
import { useCharacterCreator } from '../features/avatar/components/CharacterCreator';
import { HeroCard } from '../features/avatar/components/HeroCard';
import { GameButton, GameTopBar, GText, MeterBar, NamePlate, Panel, PillOption, ScreenBackground, SectionHeader } from '../components/game';
import { GradientFill as ArenaGradient } from '../components/game/Gradient';
import { useJuiceSettings } from '../juice/juiceSettingsStore';
import { VOLUME_STEPS } from '../juice/juiceLogic';
import { juice } from '../juice/juice';
import { LICENSES } from '../legal/licenses';
import { makeStyles, radius, softShadow, ThemeColors, ThemeMode, typeStyle, useColors, useThemeStore } from '../theme';

type IconType = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
import { Avatar } from '../components/Avatar';
import {
  UserProfile,
  getOrCreateUserProfile,
  updateUserProfile,
  uploadUserProfilePhoto,
  generateDefaultAvatar,
} from '../utils/profileService';
import {
  HEALTH_CONDITIONS,
  HealthConditionMeta,
  getRecommendedExercisesForCondition,
} from '../utils/exerciseRecommendations';
import { DEFAULT_EXERCISES } from '../utils/exerciseService';
import {
  fetchFriends,
  fetchIncomingRequests,
  fetchOutgoingRequests,
  sendFriendRequest,
  acceptFriendRequest,
  deleteFriendship,
  FriendshipItem,
} from '../utils/friendService';
import { generateRandomUsername } from '../utils/usernameGenerator';
import { supabase } from '../utils/supabase';
import { useUserStore } from '../store/userStore';
import { AvatarViewer3D } from '../features/avatar/components/AvatarViewer3D';
import { CoinDot, RARITY_COLORS } from '../features/avatar/components/AvatarShopScreen';
import { GradientFill } from '../features/squad/components/SquadUI';
import {
  AvatarModel,
  BUNDLED_AVATARS,
  fetchAvatarCatalog,
  findAvatar,
  getEquippedAvatarId,
  getLoadout,
  isAvatarOwned,
  loadoutItems,
} from '../utils/avatarShopService';
import { areRemindersEnabled, setRemindersEnabled } from '../utils/streakReminders';

import { ThemedStatusBar } from '../components/ThemedStatusBar';
import CalorieIcon from '../../assets/icons/calorie.svg';
import { RankEmblem, rankTierFromTitle, tierNameFromTitle } from '../components/RankEmblem';
import { AchievementBadge, MedalMark, MedalMetal } from '../components/AchievementBadge';
interface ProfileScreenProps {
  currentUser: any;
  onBack: () => void;
  onLogout: () => void;
}

export type ProfileTab = 'profile' | 'friends' | 'requests' | 'add_friend';

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  currentUser,
  onBack,
  onLogout,
}) => {
  const colors = useColors();
  const styles = useStyles();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<ProfileTab>('profile');
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState<boolean>(false);

  // Form Fields
  const [username, setUsername] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [bio, setBio] = useState<string>('');
  const [fitnessGoal, setFitnessGoal] = useState<string>('Strength & Stamina');
  const [avatarConfig, setAvatarConfig] = useState<any>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [healthConditions, setHealthConditions] = useState<Record<string, boolean>>({});
  const [isGeneratingUsername, setIsGeneratingUsername] = useState<boolean>(false);

  // Friends State
  const [friends, setFriends] = useState<FriendshipItem[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendshipItem[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendshipItem[]>([]);
  const [searchUsername, setSearchUsername] = useState<string>('');
  const [isSendingRequest, setIsSendingRequest] = useState<boolean>(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const { level, streak } = useGameStats();
  const themeMode = useThemeStore((s) => s.mode);
  const setThemeMode = useThemeStore((s) => s.setMode);
  const juiceSettings = useJuiceSettings();
  const [showCredits, setShowCredits] = useState(false);

  // 3D avatar
  const storeProfile = useUserStore((s) => s.profile);
  const [avatarCatalog, setAvatarCatalog] = useState<AvatarModel[]>(BUNDLED_AVATARS);
  const openShop = useUserStore((s) => s.openShop);
  const openTutorial = useUserStore((s) => s.openTutorial);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isShort = windowHeight < 400;
  const isNarrow = windowWidth < 700;
  const equippedAvatar = findAvatar(avatarCatalog, getEquippedAvatarId(storeProfile));
  const equippedItems = loadoutItems(avatarCatalog, getLoadout(storeProfile, equippedAvatar.id), equippedAvatar);
  const ownedAvatarCount = avatarCatalog.filter((m) => isAvatarOwned(storeProfile, m)).length;

  useEffect(() => {
    fetchAvatarCatalog().then(setAvatarCatalog);
  }, []);

  const [remindersOn, setRemindersOn] = useState<boolean>(true);
  useEffect(() => {
    areRemindersEnabled().then(setRemindersOn);
  }, []);
  const handleToggleReminders = async (on: boolean) => {
    setRemindersOn(on);
    const granted = await setRemindersEnabled(on, streak).catch(() => false);
    if (on && !granted) {
      setRemindersOn(false);
      Alert.alert('Notifications are off', 'Allow notifications for Ojas in your phone settings to get streak reminders.');
    }
  };

  const loadProfileData = useCallback(async () => {
    if (!currentUser) return;
    try {
      const data = await getOrCreateUserProfile(currentUser);
      setProfile(data);
      setUsername(data.username || '');
      setFullName(data.full_name || '');
      setPhoneNumber(data.phone_number || '');
      setBio(data.bio || '');
      setFitnessGoal(data.fitness_goal || 'Strength & Stamina');
      setAvatarConfig(data.avatar_config || generateDefaultAvatar(data.username || 'user'));
      setAvatarUrl(data.avatar_url || null);

      const conditionsMap: Record<string, boolean> = {};
      HEALTH_CONDITIONS.forEach((cond) => {
        conditionsMap[cond.key] = Boolean(
          (data as any)[cond.field] === true ||
          (data.health_conditions && data.health_conditions[cond.key] === true)
        );
      });
      setHealthConditions(conditionsMap);
    } catch (err) {
      console.error('Error loading profile:', err);
    }
  }, [currentUser]);

  const loadFriendsData = useCallback(async () => {
    if (!currentUser?.id) return;
    try {
      const [friendsList, incoming, outgoing] = await Promise.all([
        fetchFriends(currentUser.id),
        fetchIncomingRequests(currentUser.id),
        fetchOutgoingRequests(currentUser.id),
      ]);
      setFriends(friendsList);
      setIncomingRequests(incoming);
      setOutgoingRequests(outgoing);
    } catch (err) {
      console.warn('Error loading friends data:', err);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    async function init() {
      setIsLoading(true);
      await Promise.all([loadProfileData(), loadFriendsData()]);
      setIsLoading(false);
    }
    init();
  }, [loadProfileData, loadFriendsData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadProfileData(), loadFriendsData()]);
    } finally {
      setRefreshing(false);
    }
  };

  /**
   * Pick and upload photo from device gallery/camera to Supabase Storage Image/Profiles
   */
  const handlePickAndUploadPhoto = async () => {
    if (!currentUser?.id) return;

    try {
      let ImagePickerModule: any = null;

      try {
        ImagePickerModule = require('expo-image-picker');
      } catch (err) {
        console.warn('expo-image-picker native module is not linked in current build:', err);
      }

      if (!ImagePickerModule || !ImagePickerModule.launchImageLibraryAsync) {
        Alert.alert(
          'Rebuild Required',
          'A new native library (expo-image-picker) was added. Please rebuild your app binary (e.g. `npx expo run:android` or restart your development build).'
        );
        return;
      }

      const { status } = await ImagePickerModule.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Camera roll access is needed to upload a profile photo.');
        return;
      }

      // Automatically crop 1:1 and compress image at 0.6 quality for optimal fast uploads
      const result = await ImagePickerModule.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const selectedAsset = result.assets[0];
      const base64Data = selectedAsset.base64;

      if (!base64Data) {
        throw new Error('Could not process image data');
      }

      setIsUploadingPhoto(true);
      const uploadRes = await uploadUserProfilePhoto(currentUser.id, base64Data, 'jpg');
      if (uploadRes.success && uploadRes.url) {
        setAvatarUrl(uploadRes.url);
        setProfile((prev) => (prev ? { ...prev, avatar_url: uploadRes.url } : null));
        useUserStore.getState().refreshProfile();
        Alert.alert('Photo Updated', 'Your new profile picture has been saved successfully.');
      } else {
        Alert.alert('Upload Failed', uploadRes.error || 'Could not upload photo to storage.');
      }
    } catch (e: any) {
      console.error('Photo picker error:', e);
      Alert.alert('Error', e?.message || 'Failed to select and upload photo.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleGenerateRandomUsername = async () => {
    setIsGeneratingUsername(true);
    try {
      const generated = await generateRandomUsername();
      if (generated) {
        setUsername(generated);
        setAvatarConfig((prev: any) => ({
          ...(prev || {}),
          seed: generated,
        }));
      }
    } catch (e) {
      console.warn('Error generating random username:', e);
    } finally {
      setIsGeneratingUsername(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!currentUser?.id) return;
    if (!username.trim()) {
      Alert.alert('Invalid Username', 'Username cannot be empty.');
      return;
    }

    setIsSaving(true);
    try {
      const result = await updateUserProfile(currentUser.id, {
        username: username.trim(),
        full_name: fullName.trim(),
        phone_number: phoneNumber.trim(),
        bio: bio.trim(),
        fitness_goal: fitnessGoal,
        avatar_config: avatarConfig,
        avatar_url: avatarUrl,
        has_knock_knees: healthConditions['knock_knees'] || false,
        has_bow_legs: healthConditions['bow_legs'] || false,
        has_flat_feet: healthConditions['flat_feet'] || false,
        has_lower_back_pain: healthConditions['lower_back_pain'] || false,
        has_rounded_shoulders: healthConditions['rounded_shoulders'] || false,
        health_conditions_completed: true,
        health_conditions: healthConditions,
      });

      if (result.success) {
        setProfile((prev) => (prev ? { ...prev, ...result.data } : null));
        useUserStore.getState().refreshProfile();
        setIsEditing(false);
        Alert.alert('Success', 'Your profile has been updated!');
      } else {
        Alert.alert('Update Failed', result.error || 'Please try again.');
      }
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Could not save profile changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendFriendRequest = async () => {
    if (!searchUsername.trim()) {
      Alert.alert('Missing Username', 'Please type the username of the athlete you want to add.');
      return;
    }
    if (!currentUser?.id) return;

    setIsSendingRequest(true);
    try {
      const result = await sendFriendRequest(currentUser.id, searchUsername.trim());
      if (result.success) {
        Alert.alert('Request Sent', result.message || 'Friend request sent!');
        setSearchUsername('');
        await loadFriendsData();
      } else {
        Alert.alert('Request Failed', result.error || 'Could not send friend request.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Something went wrong.');
    } finally {
      setIsSendingRequest(false);
    }
  };

  const handleAcceptRequest = async (item: FriendshipItem) => {
    setActionLoadingId(item.friendship_id);
    try {
      const ok = await acceptFriendRequest(item.friendship_id);
      if (ok) {
        await loadFriendsData();
      } else {
        Alert.alert('Error', 'Failed to accept friend request.');
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeleteOrReject = async (item: FriendshipItem, isRemoveFriend: boolean = false) => {
    if (isRemoveFriend) {
      Alert.alert(
        'Remove Friend',
        `Are you sure you want to remove @${item.friend.username} from your friends?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: async () => {
              setActionLoadingId(item.friendship_id);
              try {
                await deleteFriendship(item.friendship_id);
                await loadFriendsData();
              } finally {
                setActionLoadingId(null);
              }
            },
          },
        ]
      );
      return;
    }

    setActionLoadingId(item.friendship_id);
    try {
      await deleteFriendship(item.friendship_id);
      await loadFriendsData();
    } finally {
      setActionLoadingId(null);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading athlete profile...</Text>
      </View>
    );
  }

  const totalRequests = incomingRequests.length;
  const totalCalories = Math.round(profile?.total_calories || 0);
  const activeConditions = HEALTH_CONDITIONS.filter((c) => healthConditions[c.key]);

  // Each medal tracks real progress toward its goal; locked ones show how close you are.
  const ACHIEVEMENTS: { key: string; title: string; metal: MedalMetal; mark: MedalMark; have: number; need: number; unit: string }[] = [
    { key: 'first', title: 'First Rep', metal: 'bronze', mark: { kind: 'text', value: '1' }, have: level.totalXp > 0 ? 1 : 0, need: 1, unit: 'workout' },
    { key: 'streak3', title: 'On Fire', metal: 'bronze', mark: { kind: 'flame', value: '3' }, have: streak.best, need: 3, unit: 'days' },
    { key: 'streak7', title: 'Unstoppable', metal: 'gold', mark: { kind: 'flame', value: '7' }, have: streak.best, need: 7, unit: 'days' },
    { key: 'social', title: 'Squad Up', metal: 'silver', mark: { kind: 'duo' }, have: friends.length, need: 1, unit: 'friend' },
    { key: 'level5', title: 'Rising Star', metal: 'silver', mark: { kind: 'star' }, have: level.level, need: 5, unit: 'level' },
    { key: 'kcal', title: 'Furnace', metal: 'gold', mark: { kind: 'text', value: '1K' }, have: Math.round(totalCalories), need: 1000, unit: 'kcal' },
  ];
  const unlockedCount = ACHIEVEMENTS.filter((a) => a.have >= a.need).length;

  const PROFILE_TABS: { key: ProfileTab; label: string; Icon: IconType; badge?: number }[] = [
    { key: 'profile', label: 'Profile', Icon: User },
    { key: 'friends', label: `Friends`, Icon: Users },
    { key: 'requests', label: 'Requests', Icon: Bell, badge: totalRequests },
    { key: 'add_friend', label: 'Add', Icon: UserPlus },
  ];

  // Called as a function (not as <Component />) so inputs keep focus while typing.
  const renderDetailField = ({
    first,
    label,
    value,
    onChangeText,
    placeholder,
    multiline,
    keyboardType,
    autoCapitalize,
    right,
  }: {
    /** First row of the list: no divider above it. */
    first?: boolean;
    label: string;
    value: string;
    onChangeText: (t: string) => void;
    placeholder: string;
    multiline?: boolean;
    keyboardType?: 'phone-pad' | 'default';
    autoCapitalize?: 'none' | 'sentences';
    right?: React.ReactNode;
  }) => (
    <View key={label} style={[styles.detailRow, first && styles.detailRowFirst]}>
      <View style={{ flex: 1 }}>
        <View style={styles.detailLabelRow}>
          <Text style={styles.detailLabel}>{label}</Text>
          {right}
        </View>
        {isEditing ? (
          <TextInput
            style={[styles.input, multiline && styles.textArea]}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.textDim}
            multiline={multiline}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
          />
        ) : (
          <Text style={[styles.detailValue, !value && { color: colors.textDim }]}>{value || 'Not set'}</Text>
        )}
      </View>
    </View>
  );

  const EmptyState = ({ Icon, title, text, action }: { Icon: IconType; title: string; text: string; action?: React.ReactNode }) => (
    <View style={styles.emptyCard}>
      <View style={styles.emptyIconCircle}>
        <Icon size={24} color={colors.accent} />
      </View>
      <Text style={styles.emptyCardTitle}>{title}</Text>
      <Text style={styles.emptyCardSubtitle}>{text}</Text>
      {action}
    </View>
  );

  return (
    <View style={styles.container}>
      <ScreenBackground style={StyleSheet.absoluteFill} />
      <ThemedStatusBar />
      <GameTopBar
        title="Profile"
        onBack={onBack}
        right={
          <TouchableOpacity
            style={[styles.editButton, isEditing && styles.editButtonActive]}
            activeOpacity={0.8}
            onPress={() => (isEditing ? handleSaveProfile() : setIsEditing(true))}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator size="small" color={colors.onAccent} />
            ) : (
              <>
                {isEditing ? <Save size={13} color={colors.onAccent} /> : <Edit3 size={13} color={colors.text} />}
                <Text style={[styles.editButtonText, isEditing && { color: colors.onAccent }]}>
                  {isEditing ? 'Save' : 'Edit'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        }
      />
      <View style={[styles.split, { flex: 1 }]}>

      {/* HERO STAGE (landscape game profile): character, level, rank, XP and shop actions */}
      <View style={styles.heroSide}>
        <Panel tone="raised" padding={0} radius={26} style={styles.heroStage}>
          <ArenaGradient from={colors.bgTop} to={colors.surfaceHi} direction="vertical" radius={26} />
          {isShort ? (
            // a short phone has no room for the 3D hero between the plate and the buttons: their card instead
            <View style={styles.heroShort}>
              <View style={styles.heroShortRow}>
                <HeroCard hero={equippedAvatar} width={isNarrow ? 72 : 84} onPress={() => useCharacterCreator.getState().show()} />
                <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
                  <View style={[styles.heroTop, { padding: 0, flexWrap: 'wrap', gap: 6 }]}>
            <TouchableOpacity activeOpacity={0.85} onPress={handlePickAndUploadPhoto} disabled={isUploadingPhoto} accessibilityLabel="Change profile photo">
              <ProgressRing size={54} strokeWidth={3} progress={level.progress} color={colors.accentFrom} trackColor={colors.surfaceSunken}>
                <Avatar username={username || currentUser?.email || 'athlete'} size={46} config={avatarConfig} avatarUrl={avatarUrl} />
              </ProgressRing>
              <View style={styles.cameraBadge}>
                {isUploadingPhoto ? <ActivityIndicator size="small" color={colors.onAccent} /> : <CameraIcon size={11} color={colors.onAccent} />}
              </View>
            </TouchableOpacity>
            <View style={styles.rankBadge}>
              <RankEmblem tier={rankTierFromTitle(level.title)} size={26} />
              <GText variant="label">{tierNameFromTitle(level.title)}</GText>
            </View>
                  </View>
                  <NamePlate name={fullName || username || 'Ojas Athlete'} tag={`@${username || 'athlete'} · Lv ${level.level} ${level.title}`} side="you" maxWidth={260} />
                </View>
              </View>
              <MeterBar value={level.progress} height={6} />
              <View style={[styles.heroActions, { marginTop: 0 }]}>
                <GameButton label={isNarrow ? 'Avatar' : 'Customize'} variant="secondary" size="md" icon={PersonStanding} onPress={() => useCharacterCreator.getState().show()} style={{ flex: 1, minWidth: 0 }} />
              <GameButton label={isNarrow ? 'Shop' : 'Style shop'} size="md" icon={ShoppingBag} onPress={() => openShop('all')} style={{ flex: 1, minWidth: 0 }} />
              </View>
            </View>
          ) : (
            <>
          <AvatarViewer3D model={equippedAvatar} items={equippedItems} style={styles.heroViewer} interactive={false} />
          <View style={styles.heroTop}>
            <TouchableOpacity activeOpacity={0.85} onPress={handlePickAndUploadPhoto} disabled={isUploadingPhoto} accessibilityLabel="Change profile photo">
              <ProgressRing size={54} strokeWidth={3} progress={level.progress} color={colors.accentFrom} trackColor={colors.surfaceSunken}>
                <Avatar username={username || currentUser?.email || 'athlete'} size={46} config={avatarConfig} avatarUrl={avatarUrl} />
              </ProgressRing>
              <View style={styles.cameraBadge}>
                {isUploadingPhoto ? <ActivityIndicator size="small" color={colors.onAccent} /> : <CameraIcon size={11} color={colors.onAccent} />}
              </View>
            </TouchableOpacity>
            <View style={styles.rankBadge}>
              <RankEmblem tier={rankTierFromTitle(level.title)} size={26} />
              <GText variant="label">{tierNameFromTitle(level.title)}</GText>
            </View>
          </View>
          <View style={styles.heroBottom}>
            <NamePlate name={fullName || username || 'Ojas Athlete'} tag={`@${username || 'athlete'} · Lv ${level.level} ${level.title}`} side="you" maxWidth={260} />
            <View style={styles.heroXpRow}>
              <GText variant="caption" tone="muted">{level.xpIntoLevel} / {level.xpForNextLevel} XP</GText>
              <GText variant="caption" tone="muted">Lv {level.level + 1} next</GText>
            </View>
            <MeterBar value={level.progress} height={8} />
            <View style={styles.heroActions}>
              <GameButton label={isNarrow ? 'Avatar' : 'Customize'} variant="secondary" size="md" icon={PersonStanding} onPress={() => useCharacterCreator.getState().show()} style={{ flex: 1, minWidth: 0 }} />
              <GameButton label={isNarrow ? 'Shop' : 'Style shop'} size="md" icon={ShoppingBag} onPress={() => openShop('all')} style={{ flex: 1, minWidth: 0 }} />
            </View>
          </View>
            </>
          )}
        </Panel>
      </View>

      <View style={{ flex: 1 }}>

      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} colors={[colors.accent]} />
        }
      >
        {/* STATS */}
        <View style={styles.statRow}>
          {[
            { label: 'Total XP', value: level.totalXp.toLocaleString(), tone: 'accent' as const },
            { label: 'Streak', value: `${streak.current}d`, tone: 'accent' as const },
            { label: 'Best streak', value: `${streak.best}d`, tone: 'text' as const },
            { label: 'Calories', value: totalCalories.toLocaleString(), tone: 'text' as const },
          ].map(({ label, value, tone }) => (
            <Panel key={label} tone="raised" radius={18} padding={12} style={styles.statPanel}>
              <GText variant="number" size={26} tone={tone} numberOfLines={1} adjustsFontSizeToFit>{value}</GText>
              <GText variant="caption" tone="muted">{label}</GText>
            </Panel>
          ))}
        </View>
        {!!bio && !isEditing && <GText variant="body" tone="muted" style={styles.bioText}>{bio}</GText>}

        {/* TABS */}
        <View style={styles.pillTabs}>
          {PROFILE_TABS.map(({ key, label, Icon, badge }) => (
            <View key={key}>
              <PillOption label={label} icon={Icon} selected={activeTab === key} underline onPress={() => setActiveTab(key)} />
              {!!badge && badge > 0 && (
                <View style={styles.badgeCountPill} pointerEvents="none">
                  <Text style={styles.badgeCountText}>{badge}</Text>
                </View>
              )}
            </View>
          ))}
        </View>

        {activeTab === 'profile' ? (
          <>
            {/* ACHIEVEMENTS */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleRow}>
                  <View style={styles.sectionAccent} />
                  <Text style={styles.sectionHeader}>Achievements</Text>
                </View>
                <Text style={styles.sectionMeta}>{unlockedCount}/{ACHIEVEMENTS.length} unlocked</Text>
              </View>
              <View style={styles.achievementGrid}>
                {ACHIEVEMENTS.map(({ key, title, metal, mark, have, need, unit }) => {
                  const unlocked = have >= need;
                  return (
                    <View key={key} style={[styles.achievement, unlocked && styles.achievementUnlocked]}>
                      <AchievementBadge metal={metal} mark={mark} unlocked={unlocked} size={58} />
                      <Text style={[styles.achievementTitle, !unlocked && { color: colors.textMuted }]} numberOfLines={1}>
                        {title}
                      </Text>
                      {unlocked ? (
                        <Text style={styles.achievementDone}>EARNED</Text>
                      ) : (
                        <>
                          <View style={styles.achievementTrack}>
                            <View style={[styles.achievementFill, { width: `${Math.max(4, (Math.min(have, need) / need) * 100)}%` }]} />
                          </View>
                          <Text style={styles.achievementHint} numberOfLines={1}>
                            {Math.min(have, need).toLocaleString()} / {need.toLocaleString()} {unit}
                          </Text>
                        </>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>

            {/* DETAILS */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.sectionAccent} />
                <Text style={styles.sectionHeader}>Personal details</Text>
              </View>

              {renderDetailField({
                first: true,
                label: 'Username',
                value: username,
                onChangeText: setUsername,
                placeholder: 'e.g. alex_fitness',
                autoCapitalize: 'none',
                right: isEditing ? (
                  <TouchableOpacity
                    style={styles.randomizeBtn}
                    activeOpacity={0.7}
                    onPress={handleGenerateRandomUsername}
                    disabled={isGeneratingUsername}
                  >
                    {isGeneratingUsername ? (
                      <ActivityIndicator size="small" color={colors.accent} />
                    ) : (
                      <>
                        <Shuffle size={11} color={colors.accent} />
                        <Text style={styles.randomizeBtnText}>Randomize</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : undefined,
              })}
              {renderDetailField({ label: 'Full name', value: fullName, onChangeText: setFullName, placeholder: 'e.g. Alex Johnson' })}
              {renderDetailField({ label: 'Phone', value: phoneNumber, onChangeText: setPhoneNumber, placeholder: 'e.g. +91 98765 43210', keyboardType: 'phone-pad' })}
              {renderDetailField({ label: 'Fitness focus', value: fitnessGoal, onChangeText: setFitnessGoal, placeholder: 'e.g. Strength, Calisthenics' })}
              {isEditing &&
                renderDetailField({
                  label: 'Bio',
                  value: bio,
                  onChangeText: setBio,
                  placeholder: 'Tell other athletes about your fitness journey...',
                  multiline: true,
                })}
            </View>

            {/* HEALTH */}
            <View style={styles.sectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleRow}>
                  <View style={styles.sectionAccent} />
                  <Text style={styles.sectionHeader}>Health & posture</Text>
                </View>
                {!isEditing && (
                  <TouchableOpacity style={styles.linkBtn} activeOpacity={0.7} onPress={() => setIsEditing(true)}>
                    <Edit3 size={12} color={colors.accent} />
                    <Text style={styles.linkBtnText}>Edit</Text>
                  </TouchableOpacity>
                )}
              </View>

              {!isEditing ? (
                activeConditions.length === 0 ? (
                  <Text style={styles.healthSectionDesc}>
                    No conditions selected. Tap Edit to tell the AI about any posture issues so it can tailor your quests.
                  </Text>
                ) : (
                  <View style={styles.conditionChips}>
                    {activeConditions.map((c) => (
                      <View key={c.key} style={styles.conditionChip}>
                        <Text style={styles.conditionChipText}>{c.title}</Text>
                      </View>
                    ))}
                  </View>
                )
              ) : (
                <>
                  <Text style={styles.healthSectionDesc}>
                    Tell the AI if you experience any of these to tailor routines and posture correction.
                  </Text>
                  {HEALTH_CONDITIONS.map((cond) => {
                    const isSelected = healthConditions[cond.key] === true;
                    return (
                      <View key={cond.key} style={[styles.healthItem, isSelected && styles.healthItemSelected]}>
                        <View style={styles.healthItemTop}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.healthTitle}>{cond.title}</Text>
                            <Text style={styles.healthSubtitle}>{cond.medicalTerm}</Text>
                          </View>
                          <View style={styles.healthToggleRow}>
                            <TouchableOpacity
                              style={[styles.healthToggleBtn, isSelected && styles.healthYesActive]}
                              activeOpacity={0.8}
                              onPress={() => setHealthConditions((prev) => ({ ...prev, [cond.key]: true }))}
                            >
                              <Check size={14} color={isSelected ? colors.onAccent : colors.textDim} strokeWidth={3} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.healthToggleBtn, !isSelected && styles.healthNoActive]}
                              activeOpacity={0.8}
                              onPress={() => setHealthConditions((prev) => ({ ...prev, [cond.key]: false }))}
                            >
                              <X size={14} color={!isSelected ? colors.text : colors.textDim} strokeWidth={2.5} />
                            </TouchableOpacity>
                          </View>
                        </View>
                        <Text style={styles.healthQuestion}>{cond.question}</Text>
                        {isSelected && (() => {
                          const matched = getRecommendedExercisesForCondition(cond.key, DEFAULT_EXERCISES);
                          const names = matched.length > 0 ? matched.map((e) => e.name) : cond.recommendedExerciseNames;
                          return (
                            <View style={styles.healthRecBadges}>
                              {names.map((rec) => (
                                <View key={rec} style={styles.healthRecBadge}>
                                  <Text style={styles.healthRecBadgeText}>{rec}</Text>
                                </View>
                              ))}
                            </View>
                          );
                        })()}
                      </View>
                    );
                  })}
                </>
              )}
            </View>

            {/* APPEARANCE */}
            {!isEditing && (
              <View style={styles.sectionCard}>
                <View style={styles.sectionTitleRow}>
                  <View style={styles.sectionAccent} />
                  <Text style={styles.sectionHeader}>Settings</Text>
                </View>
                <View style={styles.themeSwitch}>
                  {([
                    { key: 'system', label: 'System', Icon: Smartphone },
                    { key: 'light', label: 'Light', Icon: Sun },
                    { key: 'dark', label: 'Dark', Icon: Moon },
                  ] as { key: ThemeMode; label: string; Icon: IconType }[]).map(({ key, label, Icon }) => {
                    const active = themeMode === key;
                    return (
                      <TouchableOpacity
                        key={key}
                        style={[styles.themeOption, active && styles.themeOptionActive]}
                        activeOpacity={0.85}
                        onPress={() => setThemeMode(key)}
                      >
                        <Icon size={15} color={active ? colors.onAccent : colors.textMuted} />
                        <Text style={[styles.themeOptionText, active && styles.themeOptionTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={styles.reminderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reminderTitle}>Streak reminders</Text>
                    <Text style={styles.reminderSub}>A nudge at 7:00 PM and 9:30 PM when today's streak is still open.</Text>
                  </View>
                  <Switch
                    value={remindersOn}
                    onValueChange={handleToggleReminders}
                    trackColor={{ false: colors.surfaceHi, true: colors.accent }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                <TouchableOpacity style={styles.reminderRow} activeOpacity={0.8} onPress={openTutorial}>
                  <GraduationCap size={20} color={colors.accent} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.reminderTitle}>Replay tutorial</Text>
                    <Text style={styles.reminderSub}>A quick tour of everything in Ojas.</Text>
                  </View>
                  <ChevronRight size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
            )}

            {/* SOUND & FEEL (design 3.8) */}
            {!isEditing && (
              <Panel style={styles.soundPanel}>
                <SectionHeader title="Sound & feel" />
                {([
                  { key: 'music', label: 'Music', Icon: Music },
                  { key: 'sfx', label: 'Sound effects', Icon: Volume2 },
                  { key: 'haptics', label: 'Haptics', Icon: Vibrate },
                ] as const).map(({ key, label, Icon }) => (
                  <View key={key} style={styles.soundRow}>
                    <Icon size={20} color={colors.accent} />
                    <GText style={{ flex: 1 }}>{label}</GText>
                    <Switch
                      value={juiceSettings[key]}
                      onValueChange={(v) => {
                        juiceSettings.set({ [key]: v });
                        juice.play('toggle');
                      }}
                      trackColor={{ false: colors.surfaceHi, true: colors.accent }}
                      thumbColor="#FFFFFF"
                      accessibilityLabel={label}
                    />
                  </View>
                ))}
                <GText variant="label" tone="muted" style={styles.volumeLabel}>Music volume</GText>
                <View style={styles.volumeRow}>
                  {VOLUME_STEPS.map((step) => (
                    <PillOption
                      key={step}
                      label={`${Math.round(step * 100)}%`}
                      selected={juiceSettings.musicVolume === step}
                      disabled={!juiceSettings.music}
                      onPress={() => juiceSettings.set({ musicVolume: step })}
                    />
                  ))}
                </View>
                <TouchableOpacity style={styles.soundRow} activeOpacity={0.8} onPress={() => setShowCredits(true)}>
                  <FileText size={20} color={colors.accent} />
                  <GText style={{ flex: 1 }}>Font & sound credits</GText>
                  <ChevronRight size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </Panel>
            )}

            <Modal visible={showCredits} transparent animationType="fade" onRequestClose={() => setShowCredits(false)}>
              <View style={[styles.creditsOverlay, { backgroundColor: colors.scrim }]}>
                <Panel tone="raised" style={styles.creditsCard}>
                  <View style={styles.creditsHeader}>
                    <GText variant="title" style={{ flex: 1 }}>Font & sound credits</GText>
                    <TouchableOpacity onPress={() => setShowCredits(false)} accessibilityLabel="Close" hitSlop={10}>
                      <X size={20} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                  <ScrollView style={{ maxHeight: 460 }}>
                    {LICENSES.map((l) => (
                      <View key={l.title} style={{ marginBottom: 16 }}>
                        <GText variant="bodyStrong" style={{ marginBottom: 6 }}>{l.title}</GText>
                        <GText variant="caption" tone="muted">{l.body}</GText>
                      </View>
                    ))}
                  </ScrollView>
                </Panel>
              </View>
            </Modal>

            {isEditing ? (
              <TouchableOpacity style={styles.cancelEditBtn} activeOpacity={0.85} onPress={() => { setIsEditing(false); loadProfileData(); }}>
                <Text style={styles.cancelEditText}>Discard changes</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.logoutButton}
                activeOpacity={0.85}
                onPress={async () => {
                  try {
                    await supabase.auth.signOut();
                  } finally {
                    onLogout();
                  }
                }}
              >
                <LogOut size={16} color={colors.danger} />
                <Text style={styles.logoutButtonText}>Sign Out</Text>
              </TouchableOpacity>
            )}
          </>
        ) : activeTab === 'friends' ? (
          <View>
            <View style={styles.listHeaderRow}>
              <Text style={styles.listTitle}>MY FRIENDS ({friends.length})</Text>
              <TouchableOpacity style={styles.pillBtn} activeOpacity={0.8} onPress={() => setActiveTab('add_friend')}>
                <UserPlus size={12} color={colors.onAccent} />
                <Text style={styles.pillBtnText}>Add new</Text>
              </TouchableOpacity>
            </View>

            {friends.length === 0 ? (
              <EmptyState
                Icon={Users}
                title="No friends yet"
                text="Connect with athletes to compete in 1v1 duels and compare workout milestones."
                action={
                  <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.85} onPress={() => setActiveTab('add_friend')}>
                    <UserPlus size={15} color={colors.onAccent} />
                    <Text style={styles.primaryBtnText}>Find friends</Text>
                  </TouchableOpacity>
                }
              />
            ) : (
              friends.map((item) => (
                <View key={item.friendship_id} style={styles.friendRow}>
                  <Avatar username={item.friend.username} size={44} config={item.friend.avatar_config} avatarUrl={item.friend.avatar_url} />
                  <View style={styles.friendInfoBox}>
                    <Text style={styles.friendName} numberOfLines={1}>{item.friend.full_name || item.friend.username}</Text>
                    <Text style={styles.friendUsername}>@{item.friend.username}</Text>
                    {item.friend.fitness_goal ? (
                      <View style={styles.inlineRow}>
                        <Target size={11} color={colors.textDim} />
                        <Text style={styles.friendBio} numberOfLines={1}>{item.friend.fitness_goal}</Text>
                      </View>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    style={styles.iconActionBtn}
                    activeOpacity={0.7}
                    onPress={() => handleDeleteOrReject(item, true)}
                    disabled={actionLoadingId === item.friendship_id}
                  >
                    {actionLoadingId === item.friendship_id ? (
                      <ActivityIndicator size="small" color={colors.danger} />
                    ) : (
                      <Trash2 size={16} color={colors.textMuted} />
                    )}
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        ) : activeTab === 'requests' ? (
          <View>
            <Text style={styles.listTitle}>INCOMING ({incomingRequests.length})</Text>
            {incomingRequests.length === 0 ? (
              <Text style={styles.emptyLine}>No incoming friend requests.</Text>
            ) : (
              incomingRequests.map((item) => (
                <View key={item.friendship_id} style={styles.friendRow}>
                  <Avatar username={item.friend.username} size={44} config={item.friend.avatar_config} avatarUrl={item.friend.avatar_url} />
                  <View style={styles.friendInfoBox}>
                    <Text style={styles.friendName} numberOfLines={1}>{item.friend.full_name || item.friend.username}</Text>
                    <Text style={styles.friendUsername}>@{item.friend.username}</Text>
                  </View>
                  <View style={styles.requestActionRow}>
                    <TouchableOpacity
                      style={styles.acceptBtn}
                      activeOpacity={0.8}
                      onPress={() => handleAcceptRequest(item)}
                      disabled={actionLoadingId === item.friendship_id}
                    >
                      {actionLoadingId === item.friendship_id ? (
                        <ActivityIndicator size="small" color={colors.onAccent} />
                      ) : (
                        <Check size={16} color={colors.onAccent} />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.rejectBtn}
                      activeOpacity={0.8}
                      onPress={() => handleDeleteOrReject(item, false)}
                      disabled={actionLoadingId === item.friendship_id}
                    >
                      <X size={16} color={colors.danger} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}

            <Text style={[styles.listTitle, { marginTop: 22 }]}>SENT ({outgoingRequests.length})</Text>
            {outgoingRequests.length === 0 ? (
              <Text style={styles.emptyLine}>No pending sent requests.</Text>
            ) : (
              outgoingRequests.map((item) => (
                <View key={item.friendship_id} style={styles.friendRow}>
                  <Avatar username={item.friend.username} size={44} config={item.friend.avatar_config} avatarUrl={item.friend.avatar_url} />
                  <View style={styles.friendInfoBox}>
                    <Text style={styles.friendName} numberOfLines={1}>{item.friend.full_name || item.friend.username}</Text>
                    <Text style={styles.friendUsername}>@{item.friend.username}</Text>
                    <View style={styles.inlineRow}>
                      <Clock size={11} color={colors.gold} />
                      <Text style={styles.pendingTag}>Pending approval</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.cancelRequestBtn}
                    activeOpacity={0.7}
                    onPress={() => handleDeleteOrReject(item, false)}
                    disabled={actionLoadingId === item.friendship_id}
                  >
                    <Text style={styles.cancelRequestText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        ) : (
          <View>
            <View style={styles.sectionCard}>
              <View style={styles.sectionTitleRow}>
                <View style={styles.sectionAccent} />
                <Text style={styles.sectionHeader}>Add a friend</Text>
              </View>
              <Text style={styles.healthSectionDesc}>Enter the exact username of the athlete you want to connect with.</Text>

              <View style={styles.searchRow}>
                <View style={styles.searchInputWrapper}>
                  <Search size={16} color={colors.textDim} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Athlete username..."
                    placeholderTextColor={colors.textDim}
                    value={searchUsername}
                    onChangeText={setSearchUsername}
                    autoCapitalize="none"
                  />
                </View>
                <TouchableOpacity
                  style={styles.sendRequestBtn}
                  activeOpacity={0.85}
                  onPress={handleSendFriendRequest}
                  disabled={isSendingRequest}
                >
                  {isSendingRequest ? (
                    <ActivityIndicator size="small" color={colors.onAccent} />
                  ) : (
                    <Send size={16} color={colors.onAccent} />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.infoTipBox}>
              <Swords size={18} color={colors.accent} />
              <Text style={styles.infoTipText}>
                Once they accept, you can send instant 1v1 battle invites and compare workout milestones.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
      </View>
    </View>
      </View>
  );
};

const useStyles = makeStyles((colors: ThemeColors) =>
  StyleSheet.create({
  coinChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceHi },
  coinChipText: { color: colors.text, fontSize: 11.5, fontWeight: '900' },
  avatarStage: { height: 320, marginTop: 14, borderRadius: 22, overflow: 'hidden' },
  avatarGround: { position: 'absolute', left: '-25%', right: '-25%', bottom: -110, height: 200, borderRadius: 300, backgroundColor: '#9BE3C9' },
  avatarPlate: {
    position: 'absolute', left: 12, right: 12, bottom: 12, height: 46, paddingHorizontal: 14, borderRadius: 23,
    backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 7,
    elevation: 4, shadowColor: '#0B3B36', shadowOpacity: 0.2, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  avatarName: { flexShrink: 1, color: '#1C2B2A', fontSize: 16, fontWeight: '900' },
  avatarRarityDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 2 },
  avatarRarity: { flex: 1, color: '#5E7270', fontSize: 12, fontWeight: '800', textTransform: 'capitalize' },
  avatarOwned: { color: '#8AA09D', fontSize: 12, fontWeight: '700' },
  avatarActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  avatarSecondaryBtn: {
    flex: 1, height: 48, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: '#E4F3F1', borderBottomWidth: 4, borderBottomColor: '#C6E2DE',
  },
  avatarSecondaryText: { color: '#13877D', fontSize: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.3 },
  avatarPrimaryBtn: {
    flex: 1, height: 48, borderRadius: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: '#1FB5A8', borderBottomWidth: 4, borderBottomColor: '#13877D',
  },
  avatarPrimaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.3 },
  themeOptionTextActive: { color: colors.onAccent },
  themeOptionText: { color: colors.textMuted, fontSize: 13, fontWeight: '800' },
  themeOptionActive: { backgroundColor: colors.accent },
  themeOption: { flex: 1, height: 40, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  reminderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  reminderTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
  reminderSub: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 2 },
  themeSwitch: { flexDirection: 'row', gap: 8, marginTop: 14, padding: 4, borderRadius: radius.pill, backgroundColor: colors.surfaceSunken },
  container: { flex: 1, backgroundColor: colors.bg },
  split: { flexDirection: 'row' },
  heroSide: { width: '36%', padding: 12, paddingRight: 0 },
  heroStage: { flex: 1, overflow: 'hidden' },
  heroShort: { flex: 1, padding: 10, gap: 8, justifyContent: 'space-between' },
  heroShortRow: { flexDirection: 'row', gap: 10 },
  heroViewer: { position: 'absolute', top: 40, left: 0, right: 0, bottom: 150 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12 },
  rankBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 32, borderRadius: 16, backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.edge },
  heroBottom: { position: 'absolute', left: 12, right: 12, bottom: 12, gap: 6 },
  heroXpRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  heroActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  statRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statPanel: { flex: 1 },
  bioText: { marginBottom: 12 },
  pillTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  loadingContainer: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },

  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: '900' },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 72,
    justifyContent: 'center',
  },
  editButtonActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  editButtonText: { color: colors.text, fontSize: 13, fontWeight: '800' },

  scrollContent: { flex: 1 },
  scrollContainer: { paddingHorizontal: 18, paddingBottom: 40 },

  // Hero
  heroCard: { padding: 22, borderRadius: radius.xl, backgroundColor: colors.flame },
  heroTopRow: { flexDirection: 'row', alignItems: 'center' },
  cameraBadge: { position: 'absolute', right: -4, bottom: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: colors.accentFrom, borderWidth: 2, borderColor: colors.raised, alignItems: 'center', justifyContent: 'center' },
  levelBadgeRow: { position: 'absolute', left: 0, right: 0, bottom: -6, alignItems: 'center' },
  levelBadge: { paddingHorizontal: 8, height: 20, borderRadius: 10, backgroundColor: '#11141A', borderWidth: 2, borderColor: colors.flame, justifyContent: 'center' },
  levelBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '900' },
  heroInfo: { flex: 1, marginLeft: 16 },
  heroName: { color: '#FFFFFF', fontSize: 21, fontWeight: '900' },
  heroUsername: { color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600', marginTop: 3 },
  titleChip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: 'rgba(0, 0, 0, 0.18)' },
  titleChipText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 0.4 },
  heroBio: { color: 'rgba(255,255,255,0.85)', fontSize: 13, lineHeight: 19, marginTop: 16 },
  xpLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, marginBottom: 8 },
  xpLabel: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  xpNext: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '700' },
  xpTrack: { height: 9, borderRadius: 5, backgroundColor: 'rgba(0, 0, 0, 0.2)', overflow: 'hidden' },
  xpFill: { height: '100%', borderRadius: 5, backgroundColor: '#FFFFFF' },
  statGrid: { flexDirection: 'row', gap: 10, marginTop: 18 },
  statTile: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.md, backgroundColor: 'rgba(0, 0, 0, 0.18)' },
  statValue: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  statLabel: { color: 'rgba(255,255,255,0.85)', fontSize: 8.5, fontWeight: '900', letterSpacing: 0.6, marginTop: 2 },

  // Tabs
  subTabBar: { flexDirection: 'row', marginVertical: 20, padding: 5, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  subTabItem: { flex: 1, height: 38, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  subTabItemActive: { backgroundColor: colors.accent },
  subTabText: { color: colors.textMuted, fontSize: 11.5, fontWeight: '900' },
  subTabTextActive: { color: colors.onAccent },
  badgeCountPill: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCountText: { color: '#fff', fontSize: 9, fontWeight: '900' },

  // Sections
  sectionCard: { padding: 18, borderRadius: radius.panel, marginBottom: 14, backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.edge, ...softShadow(colors) },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sectionHeader: { ...typeStyle('title', 18), color: colors.text },
  sectionAccent: { width: 4, height: 18, borderRadius: 2, backgroundColor: colors.accentFrom },
  sectionMeta: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },

  // Achievements
  achievementGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  achievement: { width: '30%', flexGrow: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderRadius: radius.lg, backgroundColor: colors.surfaceHi, borderWidth: 1, borderColor: 'transparent' },
  achievementUnlocked: { backgroundColor: 'rgba(245, 169, 11, 0.08)', borderColor: 'rgba(245, 169, 11, 0.35)' },
  achievementTitle: { color: colors.text, fontSize: 12, fontWeight: '900', marginTop: 6 },
  achievementHint: { color: colors.textMuted, fontSize: 9.5, fontWeight: '800', marginTop: 4 },
  achievementDone: { color: colors.success, fontSize: 9.5, fontWeight: '900', letterSpacing: 1, marginTop: 4 },
  achievementTrack: { alignSelf: 'stretch', height: 4, borderRadius: 2, marginTop: 7, marginHorizontal: 6, backgroundColor: colors.surface, overflow: 'hidden' },
  achievementFill: { height: '100%', borderRadius: 2, backgroundColor: colors.accent },

  // Details
  detailRow: { flexDirection: 'row', paddingVertical: 13, borderTopWidth: 1, borderTopColor: colors.border },
  detailRowFirst: { borderTopWidth: 0, marginTop: 4 },
  detailLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { color: colors.textMuted, fontSize: 10.5, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  detailValue: { color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 3 },
  input: { marginTop: 6, backgroundColor: colors.surfaceSunken, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, color: colors.text, fontSize: 14, paddingHorizontal: 12, paddingVertical: 10 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  randomizeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  randomizeBtnText: { color: colors.accent, fontSize: 11, fontWeight: '800' },

  // Health
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkBtnText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  healthSectionDesc: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 10 },
  conditionChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  conditionChip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(226, 88, 34, 0.12)', borderWidth: 1, borderColor: 'rgba(226, 88, 34, 0.35)' },
  conditionChipText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  healthItem: { marginTop: 12, padding: 14, borderRadius: radius.lg, backgroundColor: colors.surfaceSunken, borderWidth: 1, borderColor: 'transparent' },
  healthItemSelected: { borderColor: 'rgba(226, 88, 34, 0.5)' },
  healthItemTop: { flexDirection: 'row', alignItems: 'center' },
  healthTitle: { color: colors.text, fontSize: 14, fontWeight: '900' },
  healthSubtitle: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 1 },
  healthQuestion: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 8 },
  healthToggleRow: { flexDirection: 'row', gap: 6 },
  healthToggleBtn: { width: 38, height: 34, borderRadius: 11, backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  healthYesActive: { backgroundColor: colors.accent },
  healthNoActive: { backgroundColor: '#334155' },
  healthRecBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  healthRecBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.surfaceHi },
  healthRecBadgeText: { color: colors.text, fontSize: 11, fontWeight: '700' },

  logoutButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, marginTop: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.4)', backgroundColor: 'rgba(239, 68, 68, 0.08)' },
  logoutButtonText: { color: colors.danger, fontSize: 14.5, fontWeight: '900' },
  cancelEditBtn: {
    height: 48,
    marginTop: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelEditText: { color: colors.text, fontSize: 14, fontWeight: '800' },

  // Friends & requests
  listHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  listTitle: { color: colors.textMuted, fontSize: 11.5, fontWeight: '900', letterSpacing: 0.8, marginBottom: 4 },
  pillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  pillBtnText: { color: colors.onAccent, fontSize: 12, fontWeight: '800' },
  friendRow: { flexDirection: 'row', alignItems: 'center', padding: 14, marginTop: 10, borderRadius: radius.lg, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  friendInfoBox: { flex: 1, marginLeft: 12 },
  friendName: { color: colors.text, fontSize: 14.5, fontWeight: '800' },
  friendUsername: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  friendBio: { color: colors.textDim, fontSize: 11.5, flexShrink: 1 },
  iconActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestActionRow: { flexDirection: 'row', gap: 8 },
  acceptBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingTag: { color: colors.gold, fontSize: 11, fontWeight: '700' },
  cancelRequestBtn: {
    paddingHorizontal: 12,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHi,
    justifyContent: 'center',
  },
  cancelRequestText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  emptyLine: { color: colors.textDim, fontSize: 12.5, marginTop: 6, marginBottom: 4 },
  emptyCard: {
    alignItems: 'center',
    padding: 24,
    marginTop: 8,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(226, 88, 34, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCardTitle: { color: colors.text, fontSize: 16, fontWeight: '900', marginTop: 12 },
  emptyCardSubtitle: { color: colors.textMuted, fontSize: 12.5, textAlign: 'center', lineHeight: 18, marginTop: 4 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 18,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  primaryBtnText: { color: colors.onAccent, fontSize: 14, fontWeight: '900' },

  // Add friend
  searchRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  searchInputWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.surfaceSunken, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, color: colors.text, fontSize: 14 },
  sendRequestBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTipBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(226, 88, 34, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(226, 88, 34, 0.25)',
  },
  infoTipText: { flex: 1, color: colors.textMuted, fontSize: 12.5, lineHeight: 18 },
  soundPanel: { marginBottom: 18 },
  soundRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 },
  volumeLabel: { marginTop: 8, marginBottom: 8 },
  volumeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  creditsOverlay: { flex: 1, justifyContent: 'center', paddingHorizontal: 16 },
  creditsCard: { width: '100%', maxWidth: 420, alignSelf: 'center', padding: 20 },
  creditsHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
})
);
