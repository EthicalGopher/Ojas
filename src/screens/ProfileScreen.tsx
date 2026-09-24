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
} from 'react-native';
import {
  Activity,
  ArrowLeft,
  AtSign,
  Award,
  Bell,
  Camera as CameraIcon,
  Check,
  Clock,
  Dumbbell,
  Edit3,
  Flame,
  HeartPulse,
  Info,
  Lock,
  LogOut,
  Phone,
  Save,
  Search,
  Send,
  ShieldCheck,
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
} from 'lucide-react-native';
import { ProgressRing } from '../components/ui/ProgressRing';
import { useGameStats } from '../hooks/useGameStats';
import { cardThemes, colors, radius } from '../theme';

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

  const ACHIEVEMENTS: { key: string; title: string; hint: string; Icon: IconType; unlocked: boolean }[] = [
    { key: 'first', title: 'First Rep', hint: 'Finish a workout', Icon: Dumbbell, unlocked: streak.best >= 1 || level.totalXp > 0 },
    { key: 'streak3', title: 'On Fire', hint: '3-day streak', Icon: Flame, unlocked: streak.best >= 3 },
    { key: 'streak7', title: 'Unstoppable', hint: '7-day streak', Icon: Zap, unlocked: streak.best >= 7 },
    { key: 'social', title: 'Squad Up', hint: 'Add a friend', Icon: Users, unlocked: friends.length >= 1 },
    { key: 'level5', title: 'Rising Star', hint: 'Reach level 5', Icon: Star, unlocked: level.level >= 5 },
    { key: 'kcal', title: 'Furnace', hint: 'Burn 1,000 kcal', Icon: Trophy, unlocked: totalCalories >= 1000 },
  ];
  const unlockedCount = ACHIEVEMENTS.filter((a) => a.unlocked).length;

  const PROFILE_TABS: { key: ProfileTab; label: string; Icon: IconType; badge?: number }[] = [
    { key: 'profile', label: 'Profile', Icon: User },
    { key: 'friends', label: `Friends`, Icon: Users },
    { key: 'requests', label: 'Requests', Icon: Bell, badge: totalRequests },
    { key: 'add_friend', label: 'Add', Icon: UserPlus },
  ];

  // Called as a function (not as <Component />) so inputs keep focus while typing.
  const renderDetailField = ({
    Icon,
    label,
    value,
    onChangeText,
    placeholder,
    multiline,
    keyboardType,
    autoCapitalize,
    right,
  }: {
    Icon: IconType;
    label: string;
    value: string;
    onChangeText: (t: string) => void;
    placeholder: string;
    multiline?: boolean;
    keyboardType?: 'phone-pad' | 'default';
    autoCapitalize?: 'none' | 'sentences';
    right?: React.ReactNode;
  }) => (
    <View key={label} style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <Icon size={15} color={colors.accent} />
      </View>
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
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />

      {/* HEADER */}
      <View style={styles.topHeader}>
        <TouchableOpacity style={styles.iconButton} activeOpacity={0.8} onPress={onBack}>
          <ArrowLeft size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
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
      </View>

      <ScrollView
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.accent} colors={[colors.accent]} />
        }
      >
        {/* HERO */}
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <TouchableOpacity activeOpacity={0.85} onPress={handlePickAndUploadPhoto} disabled={isUploadingPhoto}>
              <ProgressRing size={96} strokeWidth={4} progress={level.progress}>
                <Avatar
                  username={username || currentUser?.email || 'athlete'}
                  size={82}
                  config={avatarConfig}
                  avatarUrl={avatarUrl}
                />
              </ProgressRing>
              <View style={styles.cameraBadge}>
                {isUploadingPhoto ? (
                  <ActivityIndicator size="small" color={colors.onAccent} />
                ) : (
                  <CameraIcon size={13} color={colors.onAccent} />
                )}
              </View>
              <View style={styles.levelBadgeRow} pointerEvents="none">
                <View style={styles.levelBadge}>
                  <Text style={styles.levelBadgeText}>LV {level.level}</Text>
                </View>
              </View>
            </TouchableOpacity>

            <View style={styles.heroInfo}>
              <Text style={styles.heroName} numberOfLines={1}>{fullName || username || 'Ojas Athlete'}</Text>
              <Text style={styles.heroUsername} numberOfLines={1}>@{username || 'athlete'}</Text>
              <View style={styles.titleChip}>
                <ShieldCheck size={12} color={colors.accent} />
                <Text style={styles.titleChipText}>{level.title}</Text>
              </View>
            </View>
          </View>

          {!!bio && !isEditing && <Text style={styles.heroBio}>{bio}</Text>}

          <View style={styles.xpLabelRow}>
            <Text style={styles.xpLabel}>
              {level.xpIntoLevel} / {level.xpForNextLevel} XP
            </Text>
            <Text style={styles.xpNext}>Level {level.level + 1} next</Text>
          </View>
          <View style={styles.xpTrack}>
            <View style={[styles.xpFill, { width: `${Math.max(3, level.progress * 100)}%` }]} />
          </View>

          <View style={styles.statGrid}>
            {[
              { label: 'TOTAL XP', value: level.totalXp.toLocaleString(), Icon: Star },
              { label: 'STREAK', value: `${streak.current}d`, Icon: Flame },
              { label: 'BEST', value: `${streak.best}d`, Icon: Trophy },
              { label: 'KCAL', value: totalCalories.toLocaleString(), Icon: Activity },
            ].map(({ label, value, Icon }) => (
              <View key={label} style={styles.statTile}>
                <Icon size={14} color={colors.accent} />
                <Text style={styles.statValue}>{value}</Text>
                <Text style={styles.statLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* TABS */}
        <View style={styles.subTabBar}>
          {PROFILE_TABS.map(({ key, label, Icon, badge }) => {
            const active = activeTab === key;
            return (
              <TouchableOpacity
                key={key}
                style={[styles.subTabItem, active && styles.subTabItemActive]}
                activeOpacity={0.85}
                onPress={() => setActiveTab(key)}
              >
                <Icon size={14} color={active ? colors.onAccent : colors.textMuted} />
                <Text style={[styles.subTabText, active && styles.subTabTextActive]} numberOfLines={1}>
                  {label}
                </Text>
                {!!badge && badge > 0 && (
                  <View style={styles.badgeCountPill}>
                    <Text style={styles.badgeCountText}>{badge}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {activeTab === 'profile' ? (
          <>
            {/* ACHIEVEMENTS */}
            <View style={[styles.sectionCard, { backgroundColor: cardThemes.lavender.bg }]}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleRow}>
                  <Award size={15} color={colors.accent} />
                  <Text style={styles.sectionHeader}>ACHIEVEMENTS</Text>
                </View>
                <Text style={styles.sectionMeta}>{unlockedCount}/{ACHIEVEMENTS.length} unlocked</Text>
              </View>
              <View style={styles.achievementGrid}>
                {ACHIEVEMENTS.map(({ key, title, hint, Icon, unlocked }) => (
                  <View key={key} style={[styles.achievement, unlocked && styles.achievementUnlocked]}>
                    <View style={[styles.achievementIcon, unlocked && { backgroundColor: colors.accent }]}>
                      {unlocked ? <Icon size={18} color={colors.onAccent} /> : <Lock size={15} color={colors.textDim} />}
                    </View>
                    <Text style={[styles.achievementTitle, !unlocked && { color: cardThemes.lavender.sub }]} numberOfLines={1}>
                      {title}
                    </Text>
                    <Text style={styles.achievementHint} numberOfLines={1}>{hint}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* DETAILS */}
            <View style={[styles.sectionCard, { backgroundColor: cardThemes.sand.bg }]}>
              <View style={styles.sectionTitleRow}>
                <User size={15} color={colors.accent} />
                <Text style={styles.sectionHeader}>PERSONAL DETAILS</Text>
              </View>

              {renderDetailField({
                Icon: AtSign,
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
              {renderDetailField({ Icon: User, label: 'Full name', value: fullName, onChangeText: setFullName, placeholder: 'e.g. Alex Johnson' })}
              {renderDetailField({ Icon: Phone, label: 'Phone', value: phoneNumber, onChangeText: setPhoneNumber, placeholder: 'e.g. +91 98765 43210', keyboardType: 'phone-pad' })}
              {renderDetailField({ Icon: Target, label: 'Fitness focus', value: fitnessGoal, onChangeText: setFitnessGoal, placeholder: 'e.g. Strength, Calisthenics' })}
              {isEditing &&
                renderDetailField({
                  Icon: Info,
                  label: 'Bio',
                  value: bio,
                  onChangeText: setBio,
                  placeholder: 'Tell other athletes about your fitness journey...',
                  multiline: true,
                })}
            </View>

            {/* HEALTH */}
            <View style={[styles.sectionCard, { backgroundColor: cardThemes.mint.bg }]}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleRow}>
                  <HeartPulse size={15} color={colors.accent} />
                  <Text style={styles.sectionHeader}>HEALTH & POSTURE</Text>
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
            <View style={[styles.sectionCard, { backgroundColor: cardThemes.pink.bg }]}>
              <View style={styles.sectionTitleRow}>
                <UserPlus size={15} color={colors.accent} />
                <Text style={styles.sectionHeader}>ADD A FRIEND</Text>
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
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
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
  scrollContainer: { paddingHorizontal: 18, paddingBottom: 150 },

  // Hero
  heroCard: { padding: 22, borderRadius: radius.xl, backgroundColor: cardThemes.navy.bg },
  heroTopRow: { flexDirection: 'row', alignItems: 'center' },
  cameraBadge: { position: 'absolute', right: -2, top: 2, width: 30, height: 30, borderRadius: 15, backgroundColor: colors.accent, borderWidth: 2, borderColor: cardThemes.navy.bg, alignItems: 'center', justifyContent: 'center' },
  levelBadgeRow: { position: 'absolute', left: 0, right: 0, bottom: -6, alignItems: 'center' },
  levelBadge: { paddingHorizontal: 8, height: 20, borderRadius: 10, backgroundColor: colors.accent, borderWidth: 2, borderColor: cardThemes.navy.bg, justifyContent: 'center' },
  levelBadgeText: { color: colors.onAccent, fontSize: 10, fontWeight: '900' },
  heroInfo: { flex: 1, marginLeft: 16 },
  heroName: { color: colors.text, fontSize: 21, fontWeight: '900' },
  heroUsername: { color: cardThemes.navy.sub, fontSize: 13, fontWeight: '600', marginTop: 3 },
  titleChip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: cardThemes.navy.chip },
  titleChipText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 0.4 },
  heroBio: { color: cardThemes.navy.sub, fontSize: 13, lineHeight: 19, marginTop: 16 },
  xpLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20, marginBottom: 8 },
  xpLabel: { color: colors.text, fontSize: 12, fontWeight: '800' },
  xpNext: { color: cardThemes.navy.sub, fontSize: 11, fontWeight: '700' },
  xpTrack: { height: 9, borderRadius: 5, backgroundColor: 'rgba(0, 0, 0, 0.25)', overflow: 'hidden' },
  xpFill: { height: '100%', borderRadius: 4, backgroundColor: colors.accent },
  statGrid: { flexDirection: 'row', gap: 10, marginTop: 18 },
  statTile: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.md, backgroundColor: 'rgba(0, 0, 0, 0.2)' },
  statValue: { color: colors.text, fontSize: 15, fontWeight: '900', marginTop: 4 },
  statLabel: { color: cardThemes.navy.sub, fontSize: 8.5, fontWeight: '900', letterSpacing: 0.6, marginTop: 2 },

  // Tabs
  subTabBar: { flexDirection: 'row', marginVertical: 20, padding: 5, borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  subTabItem: { flex: 1, height: 38, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  subTabItemActive: { backgroundColor: colors.accent },
  subTabText: { color: colors.textMuted, fontSize: 11.5, fontWeight: '900' },
  subTabTextActive: { color: colors.onAccent },
  badgeCountPill: {
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
  sectionCard: { padding: 20, borderRadius: radius.xl, marginBottom: 18 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sectionHeader: { color: '#11141A', fontSize: 12.5, fontWeight: '900', letterSpacing: 0.8 },
  sectionMeta: { color: '#374151', fontSize: 11, fontWeight: '800' },

  // Achievements
  achievementGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  achievement: { width: '30%', flexGrow: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderRadius: radius.lg, backgroundColor: 'rgba(17, 20, 26, 0.08)' },
  achievementUnlocked: { backgroundColor: '#FFFFFF' },
  achievementIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(17, 20, 26, 0.1)', alignItems: 'center', justifyContent: 'center' },
  achievementTitle: { color: '#11141A', fontSize: 11.5, fontWeight: '900', marginTop: 8 },
  achievementHint: { color: '#374151', fontSize: 9.5, fontWeight: '700', marginTop: 2 },

  // Details
  detailRow: { flexDirection: 'row', gap: 14, marginTop: 16 },
  detailIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: 'rgba(17, 20, 26, 0.08)', alignItems: 'center', justifyContent: 'center' },
  detailLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailLabel: { color: '#374151', fontSize: 10.5, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  detailValue: { color: '#11141A', fontSize: 15, fontWeight: '700', marginTop: 3 },
  input: { marginTop: 6, backgroundColor: '#FFFFFF', borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(17, 20, 26, 0.12)', color: '#11141A', fontSize: 14, paddingHorizontal: 12, paddingVertical: 10 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  randomizeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  randomizeBtnText: { color: colors.accent, fontSize: 11, fontWeight: '800' },

  // Health
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  linkBtnText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  healthSectionDesc: { color: '#374151', fontSize: 12.5, lineHeight: 18, marginTop: 10 },
  conditionChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  conditionChip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: '#FFFFFF' },
  conditionChipText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  healthItem: { marginTop: 12, padding: 14, borderRadius: radius.lg, backgroundColor: 'rgba(255, 255, 255, 0.6)', borderWidth: 1, borderColor: 'transparent' },
  healthItemSelected: { borderColor: 'rgba(226, 88, 34, 0.5)' },
  healthItemTop: { flexDirection: 'row', alignItems: 'center' },
  healthTitle: { color: '#11141A', fontSize: 14, fontWeight: '900' },
  healthSubtitle: { color: '#374151', fontSize: 11, fontWeight: '700', marginTop: 1 },
  healthQuestion: { color: '#374151', fontSize: 12, lineHeight: 17, marginTop: 8 },
  healthToggleRow: { flexDirection: 'row', gap: 6 },
  healthToggleBtn: { width: 38, height: 34, borderRadius: 11, backgroundColor: 'rgba(17, 20, 26, 0.08)', alignItems: 'center', justifyContent: 'center' },
  healthYesActive: { backgroundColor: colors.accent },
  healthNoActive: { backgroundColor: '#334155' },
  healthRecBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  healthRecBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#FFFFFF' },
  healthRecBadgeText: { color: '#11141A', fontSize: 11, fontWeight: '700' },

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
  searchInputWrapper: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, height: 48, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: '#FFFFFF' },
  searchInput: { flex: 1, color: '#11141A', fontSize: 14 },
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
});
