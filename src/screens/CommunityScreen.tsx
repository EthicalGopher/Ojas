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
  Image,
  Modal,
} from 'react-native';
import {
  Users,
  Search,
  Plus,
  Shield,
  UserPlus,
  UserX,
  Check,
  X,
  LogOut,
  Building2,
  GraduationCap,
  Dumbbell,
  Trophy,
  ArrowLeft,
  Info,
  Clock,
  Camera,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Edit3,
  Swords,
  Zap,
  Flame,
  Play,
  Award,
  Calendar,
  Crown,
  Medal,
} from 'lucide-react-native';
import { makeStyles, radius, ThemeColors, useColors } from '../theme';
import * as ImagePicker from 'expo-image-picker';
import { Avatar } from '../components/Avatar';
import { supabase } from '../utils/supabase';
import { ThemedStatusBar } from '../components/ThemedStatusBar';
import {
  Community,
  CommunityMember,
  UserCommunityStatus,
  fetchCommunities,
  fetchUserCommunityStatus,
  fetchCommunityMembers,
  createCommunity,
  requestToJoinCommunity,
  inviteUserByUsername,
  reviewJoinProposal,
  removeMember,
  cancelJoinRequest,
  uploadCommunityLogo,
  fetchSquadPowers,
  squadLevelFromPower,
  SquadPower,
} from '../utils/communityService';
import {
  GAME,
  GameProgress,
  GlowSpot,
  GradientFill,
  PODIUM_COLORS,
  PowerPill,
  SquadCrest,
  SquadPodium,
} from '../features/squad/components/SquadUI';
import { SquadLeagueEmblem, squadLeagueFromPower, TIER_PALETTES, tierColor } from '../components/RankEmblem';
import {
  Tournament,
  TournamentEntry,
  TournamentMatch,
  TournamentFormat,
  TOURNAMENT_EXERCISES,
  fetchTournaments,
  fetchTournamentById,
  fetchTournamentEntries,
  fetchTournamentMatches,
  createTournament,
  registerCommunityForTournament,
  startTournamentAndGenerateBracket,
  recordTournamentMatchBattle,
} from '../utils/tournamentService';

interface CommunityScreenProps {
  currentUser: any;
  onBack: () => void;
  onOpenMatchCamera?: (opponent: string, mode: 'faceoff' | 'quickjoin' | 'ffa', exerciseId?: string) => void;
}

const CATEGORIES = ['All', 'School', 'University', 'Gym', 'Sports Club', 'Organization', 'General'] as const;

export const CommunityScreen: React.FC<CommunityScreenProps> = ({ currentUser, onBack, onOpenMatchCamera }) => {
  const colors = useColors();
  const styles = useStyles();
  const [resolvedUserId, setResolvedUserId] = useState<string>(
    currentUser?.id || currentUser?.user?.id || ''
  );

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // User Profile & Admin Check
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);

  // User Status & Community State
  const [userStatus, setUserStatus] = useState<UserCommunityStatus>({
    hasCommunity: false,
    community: null,
    membership: null,
    pendingRequest: null,
  });

  // Selected Community to View in Detail
  const [viewingCommunity, setViewingCommunity] = useState<Community | null>(null);
  const [viewingCommunityMembers, setViewingCommunityMembers] = useState<CommunityMember[]>([]);
  const [isLoadingViewingMembers, setIsLoadingViewingMembers] = useState<boolean>(false);

  // Explore Tab State
  const [exploreCommunities, setExploreCommunities] = useState<Community[]>([]);
  const [squadPowers, setSquadPowers] = useState<Record<string, SquadPower>>({});
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');

  // Active View Tab: 'hub' | 'explore' | 'proposals' | 'battles'
  const [activeTab, setActiveTab] = useState<'hub' | 'explore' | 'proposals' | 'battles'>('hub');

  // Battles / Tournaments State
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [tournamentEntries, setTournamentEntries] = useState<TournamentEntry[]>([]);
  const [tournamentMatches, setTournamentMatches] = useState<TournamentMatch[]>([]);
  const [isLoadingTournamentData, setIsLoadingTournamentData] = useState<boolean>(false);
  const [showTournamentsSection, setShowTournamentsSection] = useState<boolean>(false);

  // Tournament Modals
  const [showCreateTournamentModal, setShowCreateTournamentModal] = useState<boolean>(false);
  const [showNominateModal, setShowNominateModal] = useState<boolean>(false);
  const [selectedAthleteIds, setSelectedAthleteIds] = useState<string[]>([]);
  const [isSubmittingTournament, setIsSubmittingTournament] = useState<boolean>(false);

  // Form State for Admin Creating Tournament
  const [tournTitle, setTournTitle] = useState<string>('');
  const [tournDesc, setTournDesc] = useState<string>('');
  const [tournExerciseId, setTournExerciseId] = useState<string>('1'); // Default: Squats
  const [tournFormat, setTournFormat] = useState<TournamentFormat>('single_elimination');
  const [tournMaxComms, setTournMaxComms] = useState<number>(8);
  const [tournAthletesPerMatch, setTournAthletesPerMatch] = useState<number>(1);
  const [tournPrize, setTournPrize] = useState<string>('Grand Trophy & Leaderboard Glory');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [showInviteModal, setShowInviteModal] = useState<boolean>(false);

  // Form states for Create Community
  const [newCommName, setNewCommName] = useState<string>('');
  const [newCommCategory, setNewCommCategory] = useState<string>('School');
  const [newCommDesc, setNewCommDesc] = useState<string>('');
  const [newCommLogo, setNewCommLogo] = useState<string | null>(null);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState<boolean>(false);

  // Form states for Edit Community
  const [editCommName, setEditCommName] = useState<string>('');
  const [editCommCategory, setEditCommCategory] = useState<string>('School');
  const [editCommDesc, setEditCommDesc] = useState<string>('');
  const [editCommLogo, setEditCommLogo] = useState<string | null>(null);
  const [isSubmittingEdit, setIsSubmittingEdit] = useState<boolean>(false);

  // Form states for Invite User
  const [inviteUsername, setInviteUsername] = useState<string>('');
  const [isSubmittingInvite, setIsSubmittingInvite] = useState<boolean>(false);

  // Ensure resolved user id is populated from auth if needed
  useEffect(() => {
    async function resolveAuthUser() {
      let uid = resolvedUserId;
      if (!uid) {
        const { data } = await supabase.auth.getUser();
        if (data?.user?.id) {
          uid = data.user.id;
          setResolvedUserId(uid);
        }
      }

      if (uid) {
        // Fetch user profile to verify admin role
        try {
          const { data: prof } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', uid)
            .maybeSingle();

          if (prof) {
            setUserProfile(prof);
            const adminFlag = !!(
              prof.admin ||
              prof.is_admin ||
              currentUser?.user_metadata?.admin ||
              currentUser?.user_metadata?.is_admin
            );
            setIsAdmin(adminFlag);
          } else {
            const adminFlag = !!(
              currentUser?.user_metadata?.admin ||
              currentUser?.user_metadata?.is_admin
            );
            setIsAdmin(adminFlag);
          }
        } catch (e) {
          console.warn('Error fetching profile admin status:', e);
        }
      }
    }
    resolveAuthUser();
  }, [resolvedUserId, currentUser]);

  // Load Data
  const loadData = useCallback(async () => {
    let uid = resolvedUserId;
    if (!uid) {
      const { data } = await supabase.auth.getUser();
      uid = data?.user?.id || '';
      if (uid) setResolvedUserId(uid);
    }

    if (!uid) {
      setIsLoading(false);
      return;
    }

    try {
      const [status, comms, tourns] = await Promise.all([
        fetchUserCommunityStatus(uid),
        fetchCommunities(searchQuery, selectedCategory),
        fetchTournaments(uid),
      ]);

      setUserStatus(status);
      setExploreCommunities(comms);
      setTournaments(tourns);

      const powerIds = comms.map((c) => c.id);
      if (status.community && !powerIds.includes(status.community.id)) powerIds.push(status.community.id);
      fetchSquadPowers(powerIds).then(setSquadPowers);

      // If user is currently viewing a community in detail, refresh its member data
      if (viewingCommunity) {
        const memberList = await fetchCommunityMembers(viewingCommunity.id);
        setViewingCommunityMembers(memberList);
      }

      // If viewing a specific tournament, refresh its entries & matches
      if (selectedTournament) {
        const [entries, matches, updatedTourn] = await Promise.all([
          fetchTournamentEntries(selectedTournament.id),
          fetchTournamentMatches(selectedTournament.id),
          fetchTournamentById(selectedTournament.id),
        ]);
        setTournamentEntries(entries);
        setTournamentMatches(matches);
        if (updatedTourn) setSelectedTournament(updatedTourn);
      }
    } catch (e) {
      console.warn('Error loading community data:', e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [resolvedUserId, searchQuery, selectedCategory, viewingCommunity?.id, selectedTournament?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Open Tournament Details & Load Matches/Bracket
  const handleOpenTournament = async (tournament: Tournament) => {
    setSelectedTournament(tournament);
    setIsLoadingTournamentData(true);
    try {
      const [entries, matches] = await Promise.all([
        fetchTournamentEntries(tournament.id),
        fetchTournamentMatches(tournament.id),
      ]);
      setTournamentEntries(entries);
      setTournamentMatches(matches);
    } catch (e) {
      console.warn('Error fetching tournament bracket details:', e);
    } finally {
      setIsLoadingTournamentData(false);
    }
  };

  // Admin: Handle Create Tournament
  const handleAdminCreateTournament = async () => {
    if (!tournTitle.trim()) {
      Alert.alert('Validation Error', 'Please enter a tournament title.');
      return;
    }

    if (!isAdmin) {
      Alert.alert('Access Denied', 'Only designated platform admins can create and host community tournaments.');
      return;
    }

    setIsSubmittingTournament(true);
    try {
      const adminName = userProfile?.username || currentUser?.user_metadata?.username || currentUser?.email?.split('@')[0] || 'Admin';
      const res = await createTournament({
        title: tournTitle.trim(),
        description: tournDesc.trim(),
        exerciseId: tournExerciseId,
        format: tournFormat,
        maxCommunities: tournMaxComms,
        athletesPerMatch: tournAthletesPerMatch,
        prizePool: tournPrize.trim(),
        adminId: resolvedUserId,
        adminUsername: adminName,
      });

      if (res.success) {
        Alert.alert('Tournament Created', `"${tournTitle}" is now live for community leaders to register!`);
        setShowCreateTournamentModal(false);
        setTournTitle('');
        setTournDesc('');
        loadData();
      } else {
        Alert.alert('Creation Failed', res.error || 'Unable to create tournament.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Something went wrong.');
    } finally {
      setIsSubmittingTournament(false);
    }
  };

  // Leader: Handle Nominate & Register Community
  const handleLeaderRegisterCommunity = async () => {
    if (!selectedTournament) return;
    if (!userStatus.hasCommunity || !userStatus.community) {
      Alert.alert('No Community', 'You must lead a community to register for tournaments.');
      return;
    }
    if (userStatus.membership?.role !== 'leader') {
      Alert.alert('Leader Action Only', 'Only the community leader can register and select athletes.');
      return;
    }
    if (selectedAthleteIds.length === 0) {
      Alert.alert('Select Athletes', 'Please select at least one athlete from your community to represent you.');
      return;
    }

    setIsSubmittingTournament(true);
    try {
      const chosenAthletes = activeMembers
        .filter((m) => selectedAthleteIds.includes(m.user_id))
        .map((m) => ({
          user_id: m.user_id,
          username: m.profile?.username || 'athlete',
          full_name: m.profile?.full_name,
          avatar_url: m.profile?.avatar_url,
          avatar_config: m.profile?.avatar_config,
        }));

      const leaderName = userProfile?.username || currentUser?.user_metadata?.username || 'Leader';
      const res = await registerCommunityForTournament({
        tournamentId: selectedTournament.id,
        community: userStatus.community,
        leaderId: resolvedUserId,
        leaderUsername: leaderName,
        selectedAthletes: chosenAthletes,
      });

      if (res.success) {
        Alert.alert('Community Registered', `${userStatus.community.name} is now locked in the tournament bracket!`);
        setShowNominateModal(false);
        setSelectedAthleteIds([]);
        loadData();
      } else {
        Alert.alert('Registration Failed', res.error || 'Could not register community.');
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Something went wrong.');
    } finally {
      setIsSubmittingTournament(false);
    }
  };

  // Admin: Start Tournament & Seed Brackets
  const handleAdminStartTournament = async () => {
    if (!selectedTournament) return;
    if (!isAdmin) {
      Alert.alert('Admin Only', 'Only admins can start the tournament.');
      return;
    }

    Alert.alert(
      'Start Community Tournament',
      `Are you ready to lock registrations and generate the elimination bracket for "${selectedTournament.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Generate Brackets & Begin',
          style: 'default',
          onPress: async () => {
            setIsLoadingTournamentData(true);
            const res = await startTournamentAndGenerateBracket(selectedTournament.id);
            if (res.success) {
              Alert.alert('Tournament Started', 'The elimination battles have begun!');
              loadData();
            } else {
              Alert.alert('Failed to Start', res.error || 'Could not start tournament.');
            }
            setIsLoadingTournamentData(false);
          },
        },
      ]
    );
  };

  // Launch Battle or Simulate Match
  const handlePlayTournamentMatch = async (match: TournamentMatch) => {
    if (match.status === 'completed' || match.status === 'bye') return;

    // Check if user is an athlete or leader in this match
    const isParticipant =
      match.community1_athlete_id === resolvedUserId ||
      match.community2_athlete_id === resolvedUserId ||
      match.community1_id === userStatus.community?.id ||
      match.community2_id === userStatus.community?.id ||
      isAdmin;

    if (!isParticipant) {
      Alert.alert('Spectating Match', 'You are viewing this match between rival communities.');
    }

    Alert.alert(
      `Community Match: ${match.round_name}`,
      `${match.community1_name || 'Community 1'} VS ${match.community2_name || 'Community 2'}\nExercise: ${selectedTournament?.exercise_name || 'Fitness'}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Launch Live Battle',
          onPress: () => {
            const oppName = match.community1_id === userStatus.community?.id
              ? (match.community2_athlete_name || match.community2_name || 'Rival Community')
              : (match.community1_athlete_name || match.community1_name || 'Rival Community');
            if (onOpenMatchCamera) {
              onOpenMatchCamera(oppName, 'quickjoin', match.exercise_id);
            } else {
              Alert.alert('Battle Ready', 'Match camera ready for live rep counting!');
            }
          },
        },
        {
          text: 'Simulate Quick Fight',
          onPress: async () => {
            // Generate realistic random rep scores between 15 and 45
            const score1 = Math.floor(Math.random() * 25) + 20;
            const score2 = Math.floor(Math.random() * 25) + 18;
            const res = await recordTournamentMatchBattle({
              matchId: match.id,
              tournamentId: match.tournament_id,
              comm1Score: score1,
              comm2Score: score2,
            });

            if (res.success) {
              if (res.isGrandFinalWon) {
                Alert.alert(
                  'TOURNAMENT CHAMPION CROWNED',
                  `${res.winnerCommunityName} has won the Grand Championship Final!`
                );
              } else {
                const winnerName = score1 >= score2 ? match.community1_name : match.community2_name;
                Alert.alert('Match Completed', `${winnerName} won (${Math.max(score1, score2)} vs ${Math.min(score1, score2)} reps) and advanced to the next round!`);
              }
              loadData();
            } else {
              Alert.alert('Error', res.error || 'Failed to record battle.');
            }
          },
        },
      ]
    );
  };

  // Open a specific community detail view
  const handleOpenCommunity = async (comm: Community) => {
    setViewingCommunity(comm);
    setActiveTab('hub');
    setIsLoadingViewingMembers(true);
    try {
      const memberList = await fetchCommunityMembers(comm.id);
      setViewingCommunityMembers(memberList);
    } catch (e) {
      console.warn('Failed to fetch community members', e);
    } finally {
      setIsLoadingViewingMembers(false);
    }
  };

  // Prepare Edit Modal
  const handleOpenEditModal = () => {
    if (!viewingCommunity) return;
    setEditCommName(viewingCommunity.name);
    setEditCommCategory(viewingCommunity.category);
    setEditCommDesc(viewingCommunity.description || '');
    setEditCommLogo(viewingCommunity.logo_url || null);
    setShowEditModal(true);
  };

  // Pick Logo for Create / Edit
  const handlePickLogo = async (forEdit: boolean = false) => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Denied', 'Gallery access is needed to upload a community logo.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        const logoStr = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : (asset.uri || null);
        if (forEdit) {
          setEditCommLogo(logoStr);
        } else {
          setNewCommLogo(logoStr);
        }
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to select image.');
    }
  };

  // Handle Create Community
  const handleCreateCommunity = async () => {
    if (!newCommName.trim()) {
      Alert.alert('Validation Error', 'Please enter a community name.');
      return;
    }

    if (userStatus.hasCommunity) {
      Alert.alert('Limit Reached', 'You are already a member of a community. You must leave it before creating a new one.');
      return;
    }

    setIsSubmittingCreate(true);
    try {
      let uploadedLogoUrl: string | undefined = undefined;
      const tempId = `comm_${Date.now()}`;

      if (newCommLogo && newCommLogo.startsWith('data:image')) {
        const uploadRes = await uploadCommunityLogo(tempId, newCommLogo);
        if (uploadRes.url) {
          uploadedLogoUrl = uploadRes.url;
        }
      }

      const res = await createCommunity(
        resolvedUserId,
        newCommName.trim(),
        newCommCategory,
        newCommDesc.trim(),
        uploadedLogoUrl
      );

      if (res.success) {
        Alert.alert('Success', `"${newCommName}" created successfully.`);
        setShowCreateModal(false);
        setNewCommName('');
        setNewCommDesc('');
        setNewCommLogo(null);
        setViewingCommunity(null);
        await loadData();
      } else {
        Alert.alert('Creation Failed', res.error || 'Unable to create community.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Something went wrong.');
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  // Handle Edit Community (Leader Action)
  const handleSaveCommunityDetails = async () => {
    if (!viewingCommunity) return;
    if (!editCommName.trim()) {
      Alert.alert('Validation Error', 'Community name cannot be empty.');
      return;
    }

    setIsSubmittingEdit(true);
    try {
      let finalLogoUrl = viewingCommunity.logo_url;

      if (editCommLogo && editCommLogo.startsWith('data:image')) {
        const uploadRes = await uploadCommunityLogo(viewingCommunity.id, editCommLogo);
        if (uploadRes.url) {
          finalLogoUrl = uploadRes.url;
        }
      } else if (editCommLogo === null) {
        finalLogoUrl = null;
      }

      const { data, error } = await supabase
        .from('communities')
        .update({
          name: editCommName.trim(),
          category: editCommCategory,
          description: editCommDesc.trim(),
          logo_url: finalLogoUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', viewingCommunity.id)
        .select()
        .single();

      if (error) {
        Alert.alert('Error', error.message || 'Failed to update community details.');
        return;
      }

      setViewingCommunity(data as Community);
      setShowEditModal(false);
      Alert.alert('Success', 'Community details updated successfully.');
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save changes.');
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  // Handle Request to Join
  const handleJoinRequest = async (community: Community) => {
    if (userStatus.hasCommunity) {
      Alert.alert('Already in Community', 'You are already a member of a community. You can only belong to one community at a time.');
      return;
    }

    Alert.alert(
      'Join Proposal',
      `Submit a request to join "${community.name}"? The leader will review your proposal.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Request',
          style: 'default',
          onPress: async () => {
            const res = await requestToJoinCommunity(community.id, resolvedUserId);
            if (res.success) {
              Alert.alert('Request Sent', res.message || 'Your join proposal has been sent to the leader.');
              loadData();
            } else {
              Alert.alert('Request Failed', res.error || 'Could not send join request.');
            }
          },
        },
      ]
    );
  };

  // Handle Cancel Join Request
  const handleCancelJoinRequest = async (communityId: string) => {
    Alert.alert('Cancel Request', 'Are you sure you want to withdraw your join proposal?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Withdraw',
        style: 'destructive',
        onPress: async () => {
          const res = await cancelJoinRequest(communityId, resolvedUserId);
          if (res.success) {
            Alert.alert('Withdrawn', 'Join request cancelled.');
            loadData();
          } else {
            Alert.alert('Error', res.error || 'Could not cancel request.');
          }
        },
      },
    ]);
  };

  // Handle Invite User
  const handleInviteUser = async () => {
    if (!inviteUsername.trim()) {
      Alert.alert('Validation Error', 'Please enter a username to invite.');
      return;
    }

    const targetCommId = viewingCommunity?.id || userStatus.community?.id;
    if (!targetCommId) return;

    setIsSubmittingInvite(true);
    try {
      const res = await inviteUserByUsername(targetCommId, resolvedUserId, inviteUsername.trim());
      if (res.success) {
        Alert.alert('Invited', res.message || `Invitation sent to @${inviteUsername.trim()}`);
        setInviteUsername('');
        setShowInviteModal(false);
        loadData();
      } else {
        Alert.alert('Invite Failed', res.error || 'Could not invite user.');
      }
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to send invite.');
    } finally {
      setIsSubmittingInvite(false);
    }
  };

  // Handle Review Proposal (Accept/Reject)
  const handleReviewProposal = async (targetUserId: string, targetName: string, decision: 'accept' | 'reject') => {
    const targetCommId = viewingCommunity?.id || userStatus.community?.id;
    if (!targetCommId) return;

    const actionText = decision === 'accept' ? 'Accept' : 'Reject';
    Alert.alert(
      `${actionText} Request`,
      `Are you sure you want to ${decision} the join request from ${targetName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: actionText,
          style: decision === 'reject' ? 'destructive' : 'default',
          onPress: async () => {
            const res = await reviewJoinProposal(targetCommId, resolvedUserId, targetUserId, decision);
            if (res.success) {
              Alert.alert('Updated', res.message || `Proposal ${decision}ed.`);
              loadData();
            } else {
              Alert.alert('Error', res.error || `Failed to ${decision} proposal.`);
            }
          },
        },
      ]
    );
  };

  // Handle Leave Community
  const handleLeaveCommunity = async () => {
    if (!userStatus.community) return;

    const isUserLeader = userStatus.membership?.role === 'leader';
    Alert.alert(
      'Leave Community',
      isUserLeader
        ? 'As the Leader, leaving will automatically transfer leadership to the next oldest member (or close the community if you are the last member). Are you sure?'
        : `Are you sure you want to leave "${userStatus.community.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          style: 'destructive',
          onPress: async () => {
            const res = await removeMember(userStatus.community!.id, resolvedUserId, resolvedUserId);
            if (res.success) {
              Alert.alert('Left Community', 'You have left the community.');
              setViewingCommunity(null);
              setActiveTab('explore');
              loadData();
            } else {
              Alert.alert('Error', res.error || 'Failed to leave community.');
            }
          },
        },
      ]
    );
  };

  // Handle Kick Member (Leader Action)
  const handleKickMember = async (member: CommunityMember) => {
    if (!viewingCommunity) return;

    const name = member.profile?.full_name || member.profile?.username || 'this member';
    Alert.alert(
      'Kick Member',
      `Are you sure you want to kick ${name} from the community?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Kick',
          style: 'destructive',
          onPress: async () => {
            const res = await removeMember(viewingCommunity.id, resolvedUserId, member.user_id);
            if (res.success) {
              Alert.alert('Member Removed', `${name} has been removed.`);
              loadData();
            } else {
              Alert.alert('Error', res.error || 'Failed to remove member.');
            }
          },
        },
      ]
    );
  };

  const CATEGORY_COLORS: Record<string, string> = {
    School: '#38BDF8',
    University: '#8B5CF6',
    Gym: '#E25822',
    'Sports Club': '#F59E0B',
    Organization: '#10B981',
    General: '#8E95A0',
  };
  const categoryColor = (category: string) => CATEGORY_COLORS[category] || CATEGORY_COLORS.General;

  // Squad Power = members' ranked points + 50 per member; falls back to size until powers load.
  const powerOf = (c: Community) => squadPowers[c.id]?.power ?? (c.member_count || 0) * 50;
  const rankedCommunities = [...exploreCommunities].sort(
    (a, b) => powerOf(b) - powerOf(a) || (b.member_count || 0) - (a.member_count || 0),
  );
  const powerMap = Object.fromEntries(rankedCommunities.map((c) => [c.id, powerOf(c)]));

  // Helper Icon for Category
  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'School':
      case 'University':
        return <GraduationCap size={16} color="#E25822" />;
      case 'Gym':
        return <Dumbbell size={16} color="#E25822" />;
      case 'Sports Club':
        return <Trophy size={16} color="#E25822" />;
      default:
        return <Building2 size={16} color="#E25822" />;
    }
  };

  // Determine current viewing community leader status
  const isViewingMyCommunity = viewingCommunity && userStatus.community?.id === viewingCommunity.id;
  const isLeaderOfViewing = isViewingMyCommunity && userStatus.membership?.role === 'leader';
  const isAdminOrLeaderOfViewing = isViewingMyCommunity && (userStatus.membership?.role === 'leader' || userStatus.membership?.role === 'admin');

  const pendingProposals = viewingCommunityMembers.filter(
    (m) => m.status === 'pending_approval' || m.status === 'pending'
  );
  const activeMembers = viewingCommunityMembers.filter(
    (m) => m.status === 'active' || m.status === 'joined'
  );

  return (
    <View style={styles.container}>
      <ThemedStatusBar />

      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
          <ArrowLeft size={20} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTitleBox}>
          <Text style={styles.headerTitle}>SQUADS</Text>
          <Text style={styles.headerSubtitle}>Build your crew. Climb the ladder.</Text>
        </View>
        <TouchableOpacity
          style={styles.createHeaderBtn}
          onPress={() => {
            if (userStatus.hasCommunity) {
              Alert.alert('Already in Community', 'You are already in a community. Leave your current community first before creating a new one.');
            } else {
              setShowCreateModal(true);
            }
          }}
          activeOpacity={0.8}
        >
          <Plus size={16} color="#FFFFFF" strokeWidth={3} />
          <Text style={styles.createHeaderBtnText}>NEW</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#E25822" />
          <Text style={styles.loadingText}>Loading communities...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentContainer}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#E25822" />}
          showsVerticalScrollIndicator={false}
        >
          {/* USER PENDING REQUEST BANNER */}
          {userStatus.pendingRequest && (
            <View style={styles.pendingBanner}>
              <View style={styles.pendingBannerIcon}>
                <Clock size={20} color="#F59E0B" />
              </View>
              <View style={styles.pendingBannerInfo}>
                <Text style={styles.pendingBannerTitle}>Pending Join Proposal</Text>
                <Text style={styles.pendingBannerDesc}>
                  You requested to join <Text style={{ color: '#FFF', fontWeight: '800' }}>{userStatus.pendingRequest.community.name}</Text>. Waiting for leader review.
                </Text>
              </View>
              <TouchableOpacity
                style={styles.withdrawBtn}
                onPress={() => handleCancelJoinRequest(userStatus.pendingRequest!.community.id)}
              >
                <Text style={styles.withdrawBtnText}>Withdraw</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* 1. DEDICATED COMMUNITY DETAIL VIEW (WHEN OPENED) */}
          {viewingCommunity ? (
            <View style={styles.myCommunitySection}>
              {/* Back to Explore Communities Navigation Button */}
              <TouchableOpacity
                style={[styles.backToTournsBtn, { marginBottom: 16 }]}
                onPress={() => setViewingCommunity(null)}
                activeOpacity={0.7}
              >
                <ArrowLeft size={16} color="#E25822" />
                <Text style={styles.backToTournsBtnText}>Back to Squads</Text>
              </TouchableOpacity>

              {/* Squad Base Banner */}
              {(() => {
                const vPower = squadPowers[viewingCommunity.id]?.power ?? activeMembers.length * 50;
                const vLvl = squadLevelFromPower(vPower);
                const vLeague = squadLeagueFromPower(vPower);
                const vRank = rankedCommunities.findIndex((c) => c.id === viewingCommunity.id) + 1;
                return (
                  <View style={styles.detailBannerCard}>
                    <GradientFill colors={[GAME.violet, GAME.indigo, GAME.night]} />
                    <GlowSpot color={GAME.ember} size={280} style={{ right: -90, top: -110 }} />
                    <View style={styles.bannerTopRow}>
                      <View style={styles.bannerCatChip}>
                        <Text style={styles.bannerCatText}>{viewingCommunity.category.toUpperCase()}</Text>
                      </View>
                      <View style={styles.leaderChip}>
                        <Text style={styles.leaderChipText}>
                          {isLeaderOfViewing ? 'LEADER' : isViewingMyCommunity ? 'JOINED' : '1 SQUAD PER ATHLETE'}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.bannerEmblemWrap}>
                      <SquadCrest logoUrl={viewingCommunity.logo_url} power={vPower} size={104} frameColor={tierColor(vLeague.tier)} />
                    </View>
                    <Text style={styles.bannerName} numberOfLines={2}>{viewingCommunity.name}</Text>
                    <Text style={[styles.bannerLeague, { color: TIER_PALETTES[vLeague.tier].light }]}>
                      {vLeague.name.toUpperCase()}
                      {vLeague.nextPower ? `  ·  ${(vLeague.nextPower - vPower).toLocaleString()} PWR TO NEXT LEAGUE` : ''}
                    </Text>
                    <Text style={styles.bannerDesc} numberOfLines={2}>
                      {viewingCommunity.description || `Official ${viewingCommunity.category} squad on OJAS Fitness.`}
                    </Text>

                    <View style={styles.bannerStatsRow}>
                      {[
                        { label: 'POWER', value: vPower.toLocaleString() },
                        { label: 'RANK', value: vRank > 0 ? `#${vRank}` : '-' },
                        { label: 'ATHLETES', value: String(activeMembers.length) },
                      ].map(({ label, value }) => (
                        <View key={label} style={styles.bannerStat}>
                          <Text style={styles.bannerStatValue}>{value}</Text>
                          <Text style={styles.bannerStatLabel}>{label}</Text>
                        </View>
                      ))}
                    </View>

                    <View style={styles.heroLevelRow}>
                      <Text style={styles.heroLevelLabel}>SQUAD LV {vLvl.level}</Text>
                      <Text style={styles.heroLevelNext}>
                        {vLvl.powerIntoLevel.toLocaleString()} / {vLvl.powerForNextLevel.toLocaleString()} PWR
                      </Text>
                    </View>
                    <GameProgress progress={vLvl.progress} />

                    {/* Actions Toolbar */}
                    <View style={styles.heroActionsRow}>
                      {isLeaderOfViewing && (
                        <TouchableOpacity style={styles.heroActionBtnEdit} onPress={handleOpenEditModal} activeOpacity={0.8}>
                          <Edit3 size={15} color="#FFFFFF" />
                          <Text style={styles.heroActionBtnEditText}>Edit</Text>
                        </TouchableOpacity>
                      )}

                      {isAdminOrLeaderOfViewing && (
                        <TouchableOpacity style={styles.heroActionBtnPrimary} onPress={() => setShowInviteModal(true)} activeOpacity={0.8}>
                          <UserPlus size={15} color={GAME.night} />
                          <Text style={styles.heroActionBtnPrimaryText}>RECRUIT</Text>
                        </TouchableOpacity>
                      )}

                      {isViewingMyCommunity ? (
                        <TouchableOpacity style={styles.heroActionBtnSecondary} onPress={handleLeaveCommunity} activeOpacity={0.8}>
                          <LogOut size={15} color="#FCA5A5" />
                          <Text style={styles.heroActionBtnSecondaryText}>Leave</Text>
                        </TouchableOpacity>
                      ) : (
                        !userStatus.hasCommunity && (
                          <TouchableOpacity
                            style={styles.heroActionBtnPrimary}
                            onPress={() => handleJoinRequest(viewingCommunity)}
                            activeOpacity={0.8}
                          >
                            <Text style={styles.heroActionBtnPrimaryText}>REQUEST TO JOIN</Text>
                          </TouchableOpacity>
                        )
                      )}
                    </View>
                  </View>
                );
              })()}

              {/* Roster */}
              <View style={styles.sectionTitleBar}>
                <View style={styles.rankingsHeader}>
                  <View style={styles.sectionAccent} />
                  <Text style={styles.rankingsTitle}>ROSTER</Text>
                </View>
                <Text style={styles.sectionCount}>{activeMembers.length} {activeMembers.length === 1 ? 'athlete' : 'athletes'}</Text>
              </View>

              {isLoadingViewingMembers ? (
                <View style={styles.innerLoading}>
                  <ActivityIndicator size="small" color={colors.accent} />
                </View>
              ) : (
                <View style={styles.membersListCard}>
                  {[...activeMembers]
                    .map((member) => ({ member, pts: squadPowers[viewingCommunity.id]?.memberPoints[member.user_id] ?? 0 }))
                    .sort((a, b) => b.pts - a.pts)
                    .map(({ member, pts }, idx, arr) => {
                      const mUser = member.profile;
                      const isCurrent = member.user_id === resolvedUserId;
                      const isMemLeader = member.role === 'leader';
                      const isMemAdmin = member.role === 'admin';
                      const medal = PODIUM_COLORS[idx];

                      return (
                        <View
                          key={member.id}
                          style={[styles.memberRow, isCurrent && styles.memberRowMe, idx === arr.length - 1 && { borderBottomWidth: 0 }]}
                        >
                          <Text style={[styles.memberRank, medal && { color: medal }]}>{idx + 1}</Text>
                          <View style={[styles.memberAvatarRing, { borderColor: medal || colors.borderStrong }]}>
                            <Avatar config={mUser?.avatar_config} avatarUrl={mUser?.avatar_url} size={40} />
                          </View>
                          <View style={styles.memberInfo}>
                            <View style={styles.memberNameRow}>
                              <Text style={styles.memberName} numberOfLines={1}>
                                {mUser?.full_name || mUser?.username || 'Athlete'}
                              </Text>
                              {isCurrent && <Text style={styles.youPill}>YOU</Text>}
                            </View>
                            <Text style={styles.memberUsername} numberOfLines={1}>
                              @{mUser?.username || 'user'} · {isMemLeader ? 'Leader' : isMemAdmin ? 'Officer' : 'Member'}
                            </Text>
                          </View>

                          <View style={styles.memberActionBox}>
                            <Text style={styles.memberPts}>{pts.toLocaleString()}</Text>
                            <Text style={styles.memberPtsLabel}>PTS</Text>
                          </View>

                          {isLeaderOfViewing && !isCurrent && (
                            <TouchableOpacity style={styles.kickBtn} onPress={() => handleKickMember(member)} activeOpacity={0.7}>
                              <UserX size={15} color="#EF4444" />
                            </TouchableOpacity>
                          )}
                        </View>
                      );
                    })}
                </View>
              )}

              {/* Join Requests (Shown when Leader opens their own community) */}
              {isLeaderOfViewing && pendingProposals.length > 0 && (
                <View style={[styles.proposalsSection, { marginTop: 24 }]}>
                  <Text style={styles.sectionHeaderTitle}>PENDING JOIN PROPOSALS ({pendingProposals.length})</Text>
                  <Text style={styles.sectionHeaderSub}>
                    Review athletes requesting to join your community. Each athlete can only belong to one community.
                  </Text>

                  <View style={styles.membersListCard}>
                    {pendingProposals.map((req, idx) => {
                      const reqUser = req.profile;
                      const displayName = reqUser?.full_name || reqUser?.username || 'Athlete';
                      return (
                        <View
                          key={req.id}
                          style={[styles.proposalRow, idx === pendingProposals.length - 1 && { borderBottomWidth: 0 }]}
                        >
                          <Avatar
                            config={reqUser?.avatar_config}
                            avatarUrl={reqUser?.avatar_url}
                            size={44}
                          />
                          <View style={styles.memberInfo}>
                            <Text style={styles.memberName}>{displayName}</Text>
                            <Text style={styles.memberUsername}>@{reqUser?.username || 'user'}</Text>
                            {reqUser?.bio ? <Text style={styles.memberBio} numberOfLines={1}>{reqUser.bio}</Text> : null}
                          </View>
                          <View style={styles.proposalActions}>
                            <TouchableOpacity
                              style={styles.acceptActionBtn}
                              onPress={() => handleReviewProposal(req.user_id, displayName, 'accept')}
                              activeOpacity={0.7}
                            >
                              <Check size={18} color="#FFFFFF" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.rejectActionBtn}
                              onPress={() => handleReviewProposal(req.user_id, displayName, 'reject')}
                              activeOpacity={0.7}
                            >
                              <X size={18} color="#EF4444" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>
          ) : (
            /* 2. DEFAULT VIEW: EXPLORE COMMUNITIES FIRST, THEN TOURNAMENTS BELOW */
            <>
              {/* YOUR SQUAD HERO */}
              {userStatus.community ? (
                (() => {
                  const mine = userStatus.community!;
                  const rank = rankedCommunities.findIndex((c) => c.id === mine.id) + 1;
                  const role = userStatus.membership?.role || 'member';
                  const power = squadPowers[mine.id]?.power ?? (mine.member_count || 1) * 50;
                  const lvl = squadLevelFromPower(power);
                  const league = squadLeagueFromPower(power);
                  return (
                    <TouchableOpacity style={styles.squadHero} activeOpacity={0.9} onPress={() => handleOpenCommunity(mine)}>
                      <GradientFill colors={[GAME.violet, GAME.indigo, GAME.night]} />
                      <GlowSpot color={GAME.ember} size={280} style={{ right: -90, top: -110 }} />
                      <View style={styles.squadHeroTop}>
                        <Text style={styles.squadHeroEyebrow}>YOUR SQUAD</Text>
                        <View style={styles.heroChipsRow}>
                          {rank > 0 && (
                            <View style={styles.rankChip}>
                              <Text style={styles.rankChipText}>RANK #{rank}</Text>
                            </View>
                          )}
                          {role === 'leader' && (
                            <View style={styles.leaderChip}>
                              <Text style={styles.leaderChipText}>LEADER</Text>
                            </View>
                          )}
                        </View>
                      </View>

                      <View style={styles.squadHeroBody}>
                        <SquadCrest logoUrl={mine.logo_url} power={power} size={86} frameColor={tierColor(league.tier)} />
                        <View style={{ flex: 1, marginLeft: 16 }}>
                          <Text style={styles.squadHeroName} numberOfLines={2}>{mine.name}</Text>
                          <Text style={[styles.heroLeagueText, { color: TIER_PALETTES[league.tier].light }]}>
                            {league.name.toUpperCase()}
                          </Text>
                          <View style={styles.heroMetaRow}>
                            <PowerPill power={power} dark />
                            <View style={styles.heroMembersPill}>
                              <Text style={styles.heroMembersText}>
                                {mine.member_count || 1} {(mine.member_count || 1) === 1 ? 'MEMBER' : 'MEMBERS'}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>

                      <View style={styles.heroLevelRow}>
                        <Text style={styles.heroLevelLabel}>SQUAD LV {lvl.level}</Text>
                        <Text style={styles.heroLevelNext}>
                          {lvl.powerIntoLevel.toLocaleString()} / {lvl.powerForNextLevel.toLocaleString()} PWR
                        </Text>
                      </View>
                      <GameProgress progress={lvl.progress} />

                      <View style={styles.heroCta}>
                        <Text style={styles.heroCtaText}>ENTER SQUAD BASE</Text>
                        <ChevronRight size={16} color={GAME.night} strokeWidth={3} />
                      </View>
                    </TouchableOpacity>
                  );
                })()
              ) : !userStatus.pendingRequest ? (
                <View style={styles.joinCallout}>
                  <GradientFill colors={[GAME.violet, GAME.indigo, GAME.night]} />
                  <SquadLeagueEmblem tier={1} size={64} />
                  <Text style={styles.joinCalloutTitle}>NO SQUAD YET</Text>
                  <Text style={styles.joinCalloutText}>
                    Team up with your school, college or gym. Every match you win powers up your squad.
                  </Text>
                  <TouchableOpacity style={styles.joinCalloutBtn} activeOpacity={0.85} onPress={() => setShowCreateModal(true)}>
                    <Plus size={15} color={GAME.night} strokeWidth={3} />
                    <Text style={styles.joinCalloutBtnText}>CREATE A SQUAD</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* SQUAD RANKINGS / EXPLORE */}
              <View style={styles.exploreSection}>
                <View style={styles.sectionTitleBar}>
                  <View style={styles.rankingsHeader}>
                    <View style={styles.sectionAccent} />
                    <Text style={styles.rankingsTitle}>SQUAD LEADERBOARD</Text>
                  </View>
                  <Text style={styles.sectionCount}>{rankedCommunities.length} {rankedCommunities.length === 1 ? 'squad' : 'squads'}</Text>
                </View>

                <View style={styles.searchBarWrapper}>
                  <Search size={18} color={colors.textMuted} style={styles.searchIcon} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Find a squad..."
                    placeholderTextColor={colors.textMuted}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    returnKeyType="search"
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                      <X size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.categoryScroll}
                  contentContainerStyle={styles.categoryScrollContent}
                >
                  {CATEGORIES.map((cat) => {
                    const isSelected = selectedCategory === cat;
                    return (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.categoryPill, isSelected && styles.categoryPillActive]}
                        onPress={() => setSelectedCategory(cat)}
                      >
                        <Text style={[styles.categoryPillText, isSelected && styles.categoryPillTextActive]}>
                          {cat}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {rankedCommunities.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Building2 size={40} color={colors.textMuted} />
                    <Text style={styles.emptyTitle}>No Squads Found</Text>
                    <Text style={styles.emptySubtitle}>Be the first to create one for your school or gym.</Text>
                    <TouchableOpacity
                      style={styles.emptyCreateBtn}
                      onPress={() => setShowCreateModal(true)}
                    >
                      <Plus size={16} color="#FFFFFF" />
                      <Text style={styles.emptyCreateBtnText}>Create Squad</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    {rankedCommunities.length >= 2 && (
                      <SquadPodium
                        squads={rankedCommunities.slice(0, 3)}
                        powers={powerMap}
                        myCommunityId={userStatus.community?.id}
                        onPress={handleOpenCommunity}
                      />
                    )}

                    {(rankedCommunities.length === 1 || rankedCommunities.length > 3) && (
                    <View style={styles.communityGrid}>
                      {rankedCommunities.map((comm, index) => {
                        if (rankedCommunities.length >= 2 && index < 3) return null;
                        const isMyCurrent = userStatus.community?.id === comm.id;
                        const isPending = userStatus.pendingRequest?.community?.id === comm.id;
                        const tint = categoryColor(comm.category);
                        const medal = PODIUM_COLORS[index];

                        return (
                          <TouchableOpacity
                            key={comm.id}
                            style={[styles.communityCard, isMyCurrent && styles.communityCardMine]}
                            onPress={() => handleOpenCommunity(comm)}
                            activeOpacity={0.85}
                          >
                            <View style={[styles.rankBadge, medal && { backgroundColor: `${medal}26` }]}>
                              <Text style={[styles.rankNumber, medal && { color: medal }]}>{index + 1}</Text>
                            </View>

                            <SquadCrest logoUrl={comm.logo_url} power={powerMap[comm.id]} size={50} frameColor={medal || tint} />

                            <View style={styles.cardHeaderInfo}>
                              <Text style={styles.cardTitle} numberOfLines={1}>{comm.name}</Text>
                              <View style={styles.cardMetaRow}>
                                <Text style={[styles.catChipText, { color: tierColor(squadLeagueFromPower(powerMap[comm.id]).tier) }]}>
                                  {squadLeagueFromPower(powerMap[comm.id]).name.toUpperCase()}
                                </Text>
                                <View style={styles.metaDot} />
                                <Text style={styles.cardMemberSubText}>
                                  {comm.member_count} {comm.member_count === 1 ? 'member' : 'members'}
                                </Text>
                              </View>
                            </View>

                            <View style={styles.rowRight}>
                              <PowerPill power={powerMap[comm.id]} compact />
                              {isMyCurrent ? (
                                <Text style={styles.yoursChipText}>YOURS</Text>
                              ) : isPending ? (
                                <TouchableOpacity onPress={() => handleCancelJoinRequest(comm.id)} hitSlop={8}>
                                  <Text style={styles.cardActionBtnTextPending}>PENDING</Text>
                                </TouchableOpacity>
                              ) : (
                                <ChevronRight size={16} color={colors.textMuted} />
                              )}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    )}
                  </>
                )}
              </View>

              {/* SECTION 2: INTER-COMMUNITY TOURNAMENTS (VISIBLE TO COMMUNITY LEADERS & ADMINS) */}
              {(isAdmin || (userStatus.hasCommunity && userStatus.membership?.role === 'leader')) && (
                <View style={styles.battlesSection}>
                  {/* Tournament Section Header */}
                  <View style={styles.tournamentSectionTitleRow}>
                    <View style={styles.tournamentTitleLeft}>
                      <View style={styles.sectionAccent} />
                      <Text style={styles.rankingsTitle}>ARENA</Text>
                      <View style={styles.tournLeaderOnlyBadge}>
                        <Text style={styles.tournLeaderOnlyBadgeText}>
                          {isAdmin ? 'Admin' : 'Leader Only'}
                        </Text>
                      </View>
                    </View>

                    {isAdmin && (
                      <TouchableOpacity
                        style={styles.adminHostBtn}
                        onPress={() => setShowCreateTournamentModal(true)}
                        activeOpacity={0.8}
                      >
                        <Plus size={14} color="#FFFFFF" />
                        <Text style={styles.adminHostBtnText}>Host</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* TOURNAMENT DETAIL / BRACKET VIEW */}
                  {selectedTournament ? (
                    <View style={styles.selectedTournContainer}>
                      {/* Back to Tournaments List */}
                      <TouchableOpacity
                        style={styles.backToTournsBtn}
                        onPress={() => setSelectedTournament(null)}
                        activeOpacity={0.7}
                      >
                        <ArrowLeft size={16} color="#E25822" />
                        <Text style={styles.backToTournsBtnText}>Back to all tournaments</Text>
                      </TouchableOpacity>

                          {/* Tournament Info Card */}
                          <View style={styles.tournCardDetail}>
                            <View style={styles.tournDetailTop}>
                              <View style={styles.exerciseBadge}>
                                <Text style={styles.exerciseBadgeText}>
                                  {selectedTournament.exercise_name.toUpperCase()} BATTLE
                                </Text>
                              </View>
                              <View
                                style={[
                                  styles.statusBadge,
                                  selectedTournament.status === 'in_progress' && styles.statusBadgeActive,
                                  selectedTournament.status === 'completed' && styles.statusBadgeDone,
                                ]}
                              >
                                <Text style={styles.statusBadgeText}>
                                  {selectedTournament.status === 'registration_open'
                                    ? 'REGISTRATION OPEN'
                                    : selectedTournament.status === 'in_progress'
                                    ? 'IN PROGRESS'
                                    : selectedTournament.status === 'completed'
                                    ? 'COMPLETED'
                                    : selectedTournament.status.toUpperCase()}
                                </Text>
                              </View>
                            </View>

                            <Text style={styles.tournDetailTitle}>{selectedTournament.title}</Text>
                            {selectedTournament.description ? (
                              <Text style={styles.tournDetailDesc}>{selectedTournament.description}</Text>
                            ) : null}

                            {/* Meta stats row */}
                            <View style={styles.tournMetaStatsRow}>
                              <View style={styles.tournMetaStat}>
                                <Users size={14} color="#8E95A0" />
                                <Text style={styles.tournMetaStatText}>
                                  {selectedTournament.registered_count || tournamentEntries.length} / {selectedTournament.max_communities} Communities
                                </Text>
                              </View>
                              <View style={styles.tournMetaStat}>
                                <Award size={14} color="#FBBF24" />
                                <Text style={styles.tournMetaStatText}>
                                  {selectedTournament.prize_pool || 'Glory & XP'}
                                </Text>
                              </View>
                              <View style={styles.tournMetaStat}>
                                <Trophy size={14} color="#E25822" />
                                <Text style={styles.tournMetaStatText}>
                                  Single Elimination ({selectedTournament.total_rounds} Rounds)
                                </Text>
                              </View>
                            </View>

                            {/* Winner announcement if completed */}
                            {selectedTournament.status === 'completed' && selectedTournament.winner_community_name && (
                              <View style={styles.championBanner}>
                                <Trophy size={28} color="#FBBF24" />
                                <View style={styles.championBannerInfo}>
                                  <Text style={styles.championBannerSubtitle}>TOURNAMENT CHAMPION</Text>
                                  <Text style={styles.championBannerTitle}>{selectedTournament.winner_community_name}</Text>
                                </View>
                              </View>
                            )}

                            {/* Action Bar for Leader / Admin */}
                            <View style={styles.tournActionBar}>
                              {/* Leader Register Button */}
                              {selectedTournament.status === 'registration_open' &&
                                userStatus.hasCommunity &&
                                userStatus.membership?.role === 'leader' && (
                                  <TouchableOpacity
                                    style={[
                                      styles.leaderNominateBtn,
                                      selectedTournament.has_registered && styles.leaderNominatedBtn,
                                    ]}
                                    onPress={() => {
                                      if (selectedTournament.has_registered) {
                                        Alert.alert('Registered', 'Your community is already registered for this tournament!');
                                      } else {
                                        setSelectedAthleteIds(
                                          activeMembers.slice(0, selectedTournament.athletes_per_match || 1).map((m) => m.user_id)
                                        );
                                        setShowNominateModal(true);
                                      }
                                    }}
                                    activeOpacity={0.8}
                                  >
                                    <Shield size={16} color="#FFFFFF" />
                                    <Text style={styles.leaderNominateBtnText}>
                                      {selectedTournament.has_registered
                                        ? 'Community Registered'
                                        : 'Enter Community & Select Athletes'}
                                    </Text>
                                  </TouchableOpacity>
                                )}

                              {/* Admin Start Tournament Button */}
                              {isAdmin && selectedTournament.status === 'registration_open' && (
                                <TouchableOpacity
                                  style={styles.adminStartBtn}
                                  onPress={handleAdminStartTournament}
                                  activeOpacity={0.8}
                                >
                                  <Play size={16} color="#FFFFFF" />
                                  <Text style={styles.adminStartBtnText}>Start Tournament & Seed Bracket</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          </View>

                          {/* REGISTERED COMMUNITIES & NOMINATED ATHLETES LIST */}
                          <View style={styles.bracketSectionHeader}>
                            <Text style={styles.bracketSectionTitle}>
                              REGISTERED COMMUNITIES ({tournamentEntries.length} / {selectedTournament.max_communities})
                            </Text>
                          </View>

                          {tournamentEntries.length === 0 ? (
                            <View style={styles.emptyEntriesBox}>
                              <Text style={styles.emptyEntriesText}>No communities have registered yet.</Text>
                              <Text style={styles.emptyEntriesSub}>
                                Community leaders can enter their squads using the button above.
                              </Text>
                            </View>
                          ) : (
                            <View style={styles.entriesGrid}>
                              {tournamentEntries.map((entry) => (
                                <View key={entry.id} style={styles.entryCard}>
                                  <View style={styles.entryCardHeader}>
                                    {entry.community_logo ? (
                                      <Image source={{ uri: entry.community_logo }} style={styles.entryLogo} />
                                    ) : (
                                      <View style={styles.entryLogoPlaceholder}>
                                        <Building2 size={16} color="#E25822" />
                                      </View>
                                    )}
                                    <View style={styles.entryInfo}>
                                      <Text style={styles.entryName} numberOfLines={1}>{entry.community_name}</Text>
                                      <Text style={styles.entryLeader}>Leader: @{entry.leader_username || 'leader'}</Text>
                                    </View>
                                    <View style={styles.seedBadge}>
                                      <Text style={styles.seedBadgeText}>Seed #{entry.seed}</Text>
                                    </View>
                                  </View>

                                  {entry.selected_athletes && entry.selected_athletes.length > 0 && (
                                    <View style={styles.entryAthletesRow}>
                                      <Text style={styles.entryAthletesLabel}>Athletes:</Text>
                                      {entry.selected_athletes.map((ath) => (
                                        <View key={ath.user_id} style={styles.entryAthletePill}>
                                          <Avatar
                                            config={ath.avatar_config}
                                            avatarUrl={ath.avatar_url}
                                            size={18}
                                          />
                                          <Text style={styles.entryAthleteName}>{ath.username}</Text>
                                        </View>
                                      ))}
                                    </View>
                                  )}
                                </View>
                              ))}
                            </View>
                          )}

                          {/* ELIMINATION BRACKET / MATCH SCHEDULE */}
                          <View style={[styles.bracketSectionHeader, { marginTop: 24 }]}>
                            <Text style={styles.bracketSectionTitle}>ELIMINATION MATCHES & BRACKET</Text>
                            {selectedTournament.status === 'in_progress' && (
                              <View style={styles.livePill}>
                                <Text style={styles.livePillText}>ROUND {selectedTournament.current_round} ACTIVE</Text>
                              </View>
                            )}
                          </View>

                          {isLoadingTournamentData ? (
                            <View style={styles.innerLoading}>
                              <ActivityIndicator size="small" color="#E25822" />
                              <Text style={styles.loadingText}>Loading matches...</Text>
                            </View>
                          ) : tournamentMatches.length === 0 ? (
                            <View style={styles.emptyEntriesBox}>
                              <Clock size={32} color="#8E95A0" style={{ alignSelf: 'center', marginBottom: 8 }} />
                              <Text style={styles.emptyEntriesText}>Bracket Not Generated Yet</Text>
                              <Text style={styles.emptyEntriesSub}>
                                Matches and elimination pairings will appear here once the admin starts the tournament.
                              </Text>
                            </View>
                          ) : (
                            <View style={styles.matchesList}>
                              {tournamentMatches.map((match) => {
                                const isMatchDone = match.status === 'completed';
                                const isBye = match.status === 'bye';
                                const isComm1Winner = isMatchDone && match.winner_community_id === match.community1_id;
                                const isComm2Winner = isMatchDone && match.winner_community_id === match.community2_id;

                                return (
                                  <View key={match.id} style={styles.matchCard}>
                                    {/* Match Header */}
                                    <View style={styles.matchCardTop}>
                                      <Text style={styles.matchRoundName}>{match.round_name}</Text>
                                      <View
                                        style={[
                                          styles.matchStatusPill,
                                          isMatchDone && styles.matchStatusPillDone,
                                          match.status === 'in_progress' && styles.matchStatusPillLive,
                                        ]}
                                      >
                                        <Text style={styles.matchStatusPillText}>
                                          {isMatchDone ? 'COMPLETED' : isBye ? 'AUTO-ADVANCE' : 'READY TO BATTLE'}
                                        </Text>
                                      </View>
                                    </View>

                                    {/* Match Fight Card (Side by Side / VS) */}
                                    <View style={styles.fightCardRow}>
                                      {/* Community 1 */}
                                      <View style={[styles.fighterBox, isComm1Winner && styles.fighterBoxWinner]}>
                                        <View style={styles.fighterLogoWrap}>
                                          {match.community1_logo ? (
                                            <Image source={{ uri: match.community1_logo }} style={styles.fighterLogo} />
                                          ) : (
                                            <View style={styles.fighterLogoPlaceholder}>
                                              <Building2 size={16} color="#E25822" />
                                            </View>
                                          )}
                                        </View>
                                        <Text style={styles.fighterCommunityName} numberOfLines={1}>
                                          {match.community1_name || 'TBD'}
                                        </Text>
                                        <Text style={styles.fighterAthleteName} numberOfLines={1}>
                                          @{match.community1_athlete_name || 'Athlete'}
                                        </Text>
                                        {isMatchDone && (
                                          <Text style={styles.fighterScoreText}>{match.community1_score || 0} Reps</Text>
                                        )}
                                      </View>

                                      {/* VS Center Pillar */}
                                      <View style={styles.vsPillar}>
                                        <View style={styles.vsCircle}>
                                          <Text style={styles.vsText}>VS</Text>
                                        </View>
                                        <Text style={styles.vsExerciseText}>
                                          {selectedTournament.exercise_name}
                                        </Text>
                                      </View>

                                      {/* Community 2 */}
                                      <View style={[styles.fighterBox, isComm2Winner && styles.fighterBoxWinner]}>
                                        <View style={styles.fighterLogoWrap}>
                                          {match.community2_logo ? (
                                            <Image source={{ uri: match.community2_logo }} style={styles.fighterLogo} />
                                          ) : (
                                            <View style={styles.fighterLogoPlaceholder}>
                                              <Building2 size={16} color="#E25822" />
                                            </View>
                                          )}
                                        </View>
                                        <Text style={styles.fighterCommunityName} numberOfLines={1}>
                                          {match.community2_name || 'TBD'}
                                        </Text>
                                        <Text style={styles.fighterAthleteName} numberOfLines={1}>
                                          {match.community2_athlete_name ? `@${match.community2_athlete_name}` : 'Athlete'}
                                        </Text>
                                        {isMatchDone && (
                                          <Text style={styles.fighterScoreText}>{match.community2_score || 0} Reps</Text>
                                        )}
                                      </View>
                                    </View>

                                    {/* Match Action Button */}
                                    {!isMatchDone && !isBye && (
                                      <TouchableOpacity
                                        style={styles.playMatchBtn}
                                        onPress={() => handlePlayTournamentMatch(match)}
                                        activeOpacity={0.8}
                                      >
                                        <Swords size={16} color="#FFFFFF" />
                                        <Text style={styles.playMatchBtnText}>
                                          Fight Match (Live Reps or Quick Fight)
                                        </Text>
                                      </TouchableOpacity>
                                    )}
                                  </View>
                                );
                              })}
                            </View>
                          )}
                        </View>
                      ) : (
                        /* TOURNAMENTS LIST VIEW */
                        <View style={styles.tournamentsList}>
                          {tournaments.length === 0 ? (
                            <View style={styles.exerciseScreenEmptyBox}>
                              <Text style={styles.exerciseScreenEmptyTitle}>ARENA OPENS SOON</Text>
                              <Text style={styles.exerciseScreenEmptySubtitle}>
                                {isAdmin
                                  ? 'Host an inter-community tournament using the host button above.'
                                  : 'Active tournaments will appear here when scheduled by platform admins.'}
                              </Text>
                              {isAdmin && (
                                <TouchableOpacity
                                  style={styles.adminHostEmptyBtn}
                                  onPress={() => setShowCreateTournamentModal(true)}
                                  activeOpacity={0.8}
                                >
                                  <Plus size={15} color="#FFFFFF" />
                                  <Text style={styles.adminHostEmptyBtnText}>Host Tournament</Text>
                                </TouchableOpacity>
                              )}
                            </View>
                          ) : (
                            <View style={styles.tournGrid}>
                              {tournaments.map((tourn) => {
                                const isDone = tourn.status === 'completed';
                                const isLive = tourn.status === 'in_progress';
                                const filled = (tourn.registered_count || 0) / Math.max(1, tourn.max_communities);
                                const accent = isLive ? '#F43F5E' : isDone ? GAME.silver : GAME.gold;

                                return (
                                  <TouchableOpacity
                                    key={tourn.id}
                                    style={styles.arenaCard}
                                    onPress={() => handleOpenTournament(tourn)}
                                    activeOpacity={0.9}
                                  >
                                    <GradientFill colors={isDone ? ['#334155', '#1E293B'] : ['#7C2D12', GAME.ember, '#9A3412']} />

                                    <View style={styles.arenaTop}>
                                      <View style={[styles.arenaStatus, { borderColor: accent }]}>
                                        {isLive && <View style={styles.liveDot} />}
                                        <Text style={[styles.arenaStatusText, { color: accent }]}>
                                          {isLive ? 'LIVE' : isDone ? 'FINISHED' : 'REGISTRATION OPEN'}
                                        </Text>
                                      </View>
                                      <Text style={styles.arenaExercise}>{tourn.exercise_name.toUpperCase()}</Text>
                                    </View>

                                    <Text style={styles.arenaTitle} numberOfLines={2}>{tourn.title}</Text>

                                    <View style={styles.arenaPrizeRow}>
                                      <Text style={styles.arenaPrizeLabel}>PRIZE</Text>
                                      <Text style={styles.arenaPrize} numberOfLines={1}>{tourn.prize_pool || 'Glory & Tier XP'}</Text>
                                    </View>

                                    <View style={styles.arenaSlotsRow}>
                                      <Text style={styles.arenaSlotsText}>
                                        {tourn.registered_count || 0}/{tourn.max_communities} SQUADS · {tourn.total_rounds || 3} ROUNDS
                                      </Text>
                                      <View style={styles.arenaGo}>
                                        <Text style={styles.arenaGoText}>{isDone ? 'RESULTS' : 'ENTER'}</Text>
                                        <Play size={11} color={GAME.night} fill={GAME.night} />
                                      </View>
                                    </View>
                                    <GameProgress progress={filled} height={7} />
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  )}
                </>
              )}
            </ScrollView>
      )}

      {/* CREATE COMMUNITY MODAL */}
      <Modal
        visible={showCreateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Community</Text>
              <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                <X size={22} color="#8E95A0" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Logo Picker */}
              <View style={styles.logoPickerSection}>
                <TouchableOpacity style={styles.logoPickerBox} onPress={() => handlePickLogo(false)} activeOpacity={0.8}>
                  {newCommLogo ? (
                    <Image source={{ uri: newCommLogo }} style={styles.pickedLogoImage} />
                  ) : (
                    <View style={styles.logoUploadPlaceholder}>
                      <Camera size={24} color="#E25822" />
                      <Text style={styles.logoUploadText}>Upload Logo</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Name */}
              <Text style={styles.inputLabel}>Community / School Name *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. St. Xavier's High School, Titan Fitness"
                placeholderTextColor="#6B7280"
                value={newCommName}
                onChangeText={setNewCommName}
              />

              {/* Category */}
              <Text style={styles.inputLabel}>Category *</Text>
              <View style={styles.categoryPickerRow}>
                {(['School', 'University', 'Gym', 'Sports Club', 'Organization'] as const).map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.catOptionPill, newCommCategory === cat && styles.catOptionPillActive]}
                    onPress={() => setNewCommCategory(cat)}
                  >
                    <Text style={[styles.catOptionText, newCommCategory === cat && styles.catOptionTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Description */}
              <Text style={styles.inputLabel}>Description (Optional)</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Describe your community, goals, training schedule..."
                placeholderTextColor="#6B7280"
                multiline
                numberOfLines={3}
                value={newCommDesc}
                onChangeText={setNewCommDesc}
              />

              <View style={styles.modalTip}>
                <Info size={14} color="#E25822" />
                <Text style={styles.modalTipText}>
                  You will automatically become the Leader of this community.
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.submitCreateBtn, isSubmittingCreate && { opacity: 0.6 }]}
              onPress={handleCreateCommunity}
              disabled={isSubmittingCreate}
              activeOpacity={0.8}
            >
              {isSubmittingCreate ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitCreateBtnText}>Create Community</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* EDIT COMMUNITY MODAL (LEADER) */}
      <Modal
        visible={showEditModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Community Details</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <X size={22} color="#8E95A0" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Logo Picker */}
              <View style={styles.logoPickerSection}>
                <TouchableOpacity style={styles.logoPickerBox} onPress={() => handlePickLogo(true)} activeOpacity={0.8}>
                  {editCommLogo ? (
                    <Image source={{ uri: editCommLogo }} style={styles.pickedLogoImage} />
                  ) : (
                    <View style={styles.logoUploadPlaceholder}>
                      <Camera size={24} color="#E25822" />
                      <Text style={styles.logoUploadText}>Change Logo</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Name */}
              <Text style={styles.inputLabel}>Community Name *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Community name"
                placeholderTextColor="#6B7280"
                value={editCommName}
                onChangeText={setEditCommName}
              />

              {/* Category */}
              <Text style={styles.inputLabel}>Category *</Text>
              <View style={styles.categoryPickerRow}>
                {(['School', 'University', 'Gym', 'Sports Club', 'Organization', 'General'] as const).map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.catOptionPill, editCommCategory === cat && styles.catOptionPillActive]}
                    onPress={() => setEditCommCategory(cat)}
                  >
                    <Text style={[styles.catOptionText, editCommCategory === cat && styles.catOptionTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Description */}
              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Describe your community, goals, training schedule..."
                placeholderTextColor="#6B7280"
                multiline
                numberOfLines={3}
                value={editCommDesc}
                onChangeText={setEditCommDesc}
              />
            </ScrollView>

            <TouchableOpacity
              style={[styles.submitCreateBtn, isSubmittingEdit && { opacity: 0.6 }]}
              onPress={handleSaveCommunityDetails}
              disabled={isSubmittingEdit}
              activeOpacity={0.8}
            >
              {isSubmittingEdit ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitCreateBtnText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* INVITE USER MODAL (LEADER) */}
      <Modal
        visible={showInviteModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowInviteModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCardSmall}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Invite Athlete</Text>
              <TouchableOpacity onPress={() => setShowInviteModal(false)}>
                <X size={20} color="#8E95A0" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inviteHelpText}>
              Enter the exact username of the athlete you want to add to {viewingCommunity?.name || userStatus.community?.name}:
            </Text>

            <View style={styles.usernameInputWrap}>
              <Text style={styles.atSign}>@</Text>
              <TextInput
                style={styles.usernameInput}
                placeholder="username"
                placeholderTextColor="#6B7280"
                autoCapitalize="none"
                value={inviteUsername}
                onChangeText={setInviteUsername}
              />
            </View>

            <TouchableOpacity
              style={[styles.submitInviteBtn, isSubmittingInvite && { opacity: 0.6 }]}
              onPress={handleInviteUser}
              disabled={isSubmittingInvite}
              activeOpacity={0.8}
            >
              {isSubmittingInvite ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitInviteBtnText}>Send Invitation</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* HOST TOURNAMENT MODAL (ADMIN ONLY) */}
      <Modal
        visible={showCreateTournamentModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCreateTournamentModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Trophy size={20} color="#FBBF24" />
                <Text style={styles.modalTitle}>Host Tournament (Admin)</Text>
              </View>
              <TouchableOpacity onPress={() => setShowCreateTournamentModal(false)}>
                <X size={22} color="#8E95A0" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Tournament Title */}
              <Text style={styles.inputLabel}>Tournament Title *</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. National Inter-School Push-up Championship"
                placeholderTextColor="#6B7280"
                value={tournTitle}
                onChangeText={setTournTitle}
              />

              {/* Tournament Exercise Selection */}
              <Text style={styles.inputLabel}>Choose Exercise *</Text>
              <View style={styles.exercisePillGrid}>
                {TOURNAMENT_EXERCISES.map((ex) => (
                  <TouchableOpacity
                    key={ex.id}
                    style={[
                      styles.exerciseSelectPill,
                      tournExerciseId === ex.id && styles.exerciseSelectPillActive,
                    ]}
                    onPress={() => setTournExerciseId(ex.id)}
                  >
                    <Text
                      style={[
                        styles.exercisePillText,
                        tournExerciseId === ex.id && styles.exercisePillTextActive,
                      ]}
                    >
                      {ex.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Description */}
              <Text style={styles.inputLabel}>Description & Rules (Optional)</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Details about rounds, schedule, qualifying scores..."
                placeholderTextColor="#6B7280"
                multiline
                numberOfLines={3}
                value={tournDesc}
                onChangeText={setTournDesc}
              />

              {/* Tournament Format */}
              <Text style={styles.inputLabel}>Tournament Format *</Text>
              <View style={styles.categoryPickerRow}>
                {[
                  { id: 'single_elimination', label: 'Single Elimination' },
                  { id: 'best_of_three', label: 'Best of 3' },
                  { id: 'round_robin', label: 'Round Robin' },
                ].map((fmt) => (
                  <TouchableOpacity
                    key={fmt.id}
                    style={[
                      styles.catOptionPill,
                      tournFormat === fmt.id && styles.catOptionPillActive,
                    ]}
                    onPress={() => setTournFormat(fmt.id as TournamentFormat)}
                  >
                    <Text
                      style={[
                        styles.catOptionText,
                        tournFormat === fmt.id && styles.catOptionTextActive,
                      ]}
                    >
                      {fmt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Max Communities */}
              <Text style={styles.inputLabel}>Maximum Communities</Text>
              <View style={styles.categoryPickerRow}>
                {[4, 8, 16, 32].map((num) => (
                  <TouchableOpacity
                    key={num}
                    style={[
                      styles.catOptionPill,
                      tournMaxComms === num && styles.catOptionPillActive,
                    ]}
                    onPress={() => setTournMaxComms(num)}
                  >
                    <Text
                      style={[
                        styles.catOptionText,
                        tournMaxComms === num && styles.catOptionTextActive,
                      ]}
                    >
                      {num} Communities
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Prize Pool */}
              <Text style={styles.inputLabel}>Prize / Glory Award</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Gold Trophy + 5,000 Tier XP"
                placeholderTextColor="#6B7280"
                value={tournPrize}
                onChangeText={setTournPrize}
              />

              <View style={styles.modalTip}>
                <Info size={14} color="#E25822" />
                <Text style={styles.modalTipText}>
                  As Admin, you can seed brackets and officiate matches after community registration closes.
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              style={[styles.submitCreateBtn, isSubmittingTournament && { opacity: 0.6 }]}
              onPress={handleAdminCreateTournament}
              disabled={isSubmittingTournament}
              activeOpacity={0.8}
            >
              {isSubmittingTournament ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitCreateBtnText}>Create Tournament</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* NOMINATE ATHLETES MODAL (LEADER ONLY) */}
      <Modal
        visible={showNominateModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowNominateModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Shield size={20} color="#E25822" />
                <Text style={styles.modalTitle}>Nominate Athletes</Text>
              </View>
              <TouchableOpacity onPress={() => setShowNominateModal(false)}>
                <X size={22} color="#8E95A0" />
              </TouchableOpacity>
            </View>

            <Text style={styles.nominateDesc}>
              Select the athletes from <Text style={{ color: '#FFF', fontWeight: '800' }}>{userStatus.community?.name}</Text> who will represent your community in {selectedTournament?.exercise_name}:
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 300, marginVertical: 12 }}>
              {activeMembers.map((member) => {
                const isSelected = selectedAthleteIds.includes(member.user_id);
                const athUser = member.profile;
                return (
                  <TouchableOpacity
                    key={member.id}
                    style={[styles.athleteSelectRow, isSelected && styles.athleteSelectRowSelected]}
                    onPress={() => {
                      if (isSelected) {
                        setSelectedAthleteIds(selectedAthleteIds.filter((id) => id !== member.user_id));
                      } else {
                        setSelectedAthleteIds([...selectedAthleteIds, member.user_id]);
                      }
                    }}
                    activeOpacity={0.8}
                  >
                    <Avatar
                      config={athUser?.avatar_config}
                      avatarUrl={athUser?.avatar_url}
                      size={40}
                    />
                    <View style={styles.athleteSelectInfo}>
                      <Text style={styles.athleteSelectName}>
                        {athUser?.full_name || athUser?.username || 'Athlete'}
                      </Text>
                      <Text style={styles.athleteSelectUsername}>@{athUser?.username || 'user'}</Text>
                    </View>
                    <View style={[styles.checkboxCircle, isSelected && styles.checkboxCircleSelected]}>
                      {isSelected && <Check size={14} color="#FFFFFF" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              style={[
                styles.submitCreateBtn,
                (isSubmittingTournament || selectedAthleteIds.length === 0) && { opacity: 0.6 },
              ]}
              onPress={handleLeaderRegisterCommunity}
              disabled={isSubmittingTournament || selectedAthleteIds.length === 0}
              activeOpacity={0.8}
            >
              {isSubmittingTournament ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitCreateBtnText}>
                  Lock In Squad & Register ({selectedAthleteIds.length} Selected)
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const useStyles = makeStyles((colors: ThemeColors) =>
  StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
  },
  tabBtn: {
    paddingVertical: 12,
    marginRight: 20,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: '#E25822',
  },
  tabBtnText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
  tabBtnTextActive: {
    color: '#E25822',
  },
  tabBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tabCounterBadge: {
    backgroundColor: '#EF4444',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  tabCounterText: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '900',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  innerLoading: {
    padding: 24,
    alignItems: 'center',
  },
  loadingText: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 12,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
  },
  pendingBannerIcon: {
    marginRight: 10,
  },
  pendingBannerInfo: {
    flex: 1,
  },
  pendingBannerTitle: {
    color: colors.gold,
    fontSize: 13,
    fontWeight: '800',
  },
  pendingBannerDesc: {
    color: colors.text,
    fontSize: 11,
    marginTop: 2,
  },
  withdrawBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 8,
  },
  withdrawBtnText: {
    color: '#EF4444',
    fontSize: 11,
    fontWeight: '800',
  },
  myCommunitySection: {},
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(26, 28, 35, 0.45)',
    borderRadius: 12,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  ratingLabel: { color: colors.text, fontSize: 12, fontWeight: '700' },
  ratingNumBox: {
    backgroundColor: 'rgba(26, 28, 35, 0.7)',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 6,
  },
  ratingNumText: { color: '#E8D5C4', fontSize: 10, fontWeight: '900' },
  scoreRulesPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(26, 28, 35, 0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  scoreRulesText: { color: '#E8D5C4', fontSize: 10, fontWeight: '800' },
  heroBannerLogo: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: 'rgba(26, 28, 35, 0.5)',
  },
  heroBannerLogoPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: 'rgba(26, 28, 35, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userRankInfo: { marginLeft: 14, flex: 1 },
  rankTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rankTitle: { color: colors.text, fontSize: 19, fontWeight: '900' },
  playedWonStats: { color: colors.text, fontSize: 12, marginTop: 4, lineHeight: 17 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeaderTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  sectionHeaderSub: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: 14,
    lineHeight: 18,
  },
  roleBadgeLeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  roleBadgeLeaderText: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: '800',
  },
  memberBio: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  rolePillLeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  rolePillLeaderText: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: '800',
  },
  rolePillAdmin: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(96, 165, 250, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  rolePillAdminText: {
    color: '#60A5FA',
    fontSize: 10,
    fontWeight: '800',
  },
  rolePillMember: {
    backgroundColor: colors.surfaceHi,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  rolePillMemberText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  proposalsSection: {},
  proposalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  proposalActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  acceptActionBtn: {
    backgroundColor: '#10B981',
    borderRadius: 12,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rejectActionBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 12,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 48,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  categoryScroll: {
    marginVertical: 16,
  },
  categoryScrollContent: {
    gap: 8,
    paddingRight: 16,
  },
  categoryPill: {
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryPillActive: {
    backgroundColor: '#E25822',
    borderColor: '#E25822',
  },
  categoryPillText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  categoryPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  ruleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(226, 88, 34, 0.1)',
    borderRadius: 14,
    padding: 12,
    marginTop: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(226, 88, 34, 0.2)',
  },
  ruleBannerText: {
    color: colors.text,
    fontSize: 11,
    flex: 1,
    lineHeight: 16,
  },
  rankMedal: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  catChip: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, marginRight: 4 },
  yoursChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(226, 88, 34, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(226, 88, 34, 0.5)',
  },
  squadHeroLogo: { width: 64, height: 64, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.2)' },
  squadHeroLogoFallback: { alignItems: 'center', justifyContent: 'center' },
  squadHeroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  squadHeroStat: { flex: 1, alignItems: 'center' },
  squadHeroStatValue: { color: colors.onAccent, fontSize: 17, fontWeight: '900' },
  squadHeroStatLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 9, fontWeight: '900', letterSpacing: 0.8, marginTop: 2 },
  squadHeroDivider: { width: 1, height: 26, backgroundColor: colors.surfaceHi },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardLogo: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.surfaceHi,
  },
  cardLogoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.surfaceHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  queueBadgePill: {
    backgroundColor: colors.surfaceHi,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  queueBadgePillText: {
    color: '#E8D5C4',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  cardDescText: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  cardActionBtn: {
    backgroundColor: '#E25822',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  cardActionBtnCurrent: {
    backgroundColor: '#354394',
  },
  cardActionBtnPending: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  cardActionBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    marginTop: 20,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    marginTop: 14,
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  emptyCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E25822',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 14,
    gap: 6,
    marginTop: 16,
  },
  emptyCreateBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(5, 8, 14, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    backgroundColor: '#1E2430',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  modalCardSmall: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#1E2430',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  logoPickerSection: {
    alignItems: 'center',
    marginBottom: 16,
  },
  logoPickerBox: {
    width: 80,
    height: 80,
    borderRadius: 22,
    backgroundColor: '#2A3242',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(226, 88, 34, 0.3)',
    borderStyle: 'dashed',
    overflow: 'hidden',
  },
  pickedLogoImage: {
    width: '100%',
    height: '100%',
  },
  logoUploadPlaceholder: {
    alignItems: 'center',
    gap: 4,
  },
  logoUploadText: {
    color: '#E25822',
    fontSize: 10,
    fontWeight: '800',
  },
  inputLabel: {
    color: '#E25822',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
    marginTop: 10,
  },
  textInput: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: colors.border,
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  categoryPickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  catOptionPill: {
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catOptionPillActive: {
    backgroundColor: '#E25822',
    borderColor: '#E25822',
  },
  catOptionText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  catOptionTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  modalTip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(226, 88, 34, 0.08)',
    padding: 10,
    borderRadius: 10,
    marginTop: 14,
  },
  modalTipText: {
    color: '#E25822',
    fontSize: 11,
    flex: 1,
  },
  submitCreateBtn: {
    backgroundColor: '#E25822',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  submitCreateBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  inviteHelpText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  usernameInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: colors.border,
  },
  atSign: {
    color: '#E25822',
    fontSize: 16,
    fontWeight: '900',
    marginRight: 6,
  },
  usernameInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  submitInviteBtn: {
    backgroundColor: '#E25822',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  submitInviteBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  // Tournament & Battles Styles
  battlesSection: {
    marginTop: 4,
  },
  tournamentSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  tournamentTitleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tournLeaderOnlyBadge: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tournLeaderOnlyBadgeText: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: '800',
  },
  exerciseScreenEmptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 20,
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(251,191,36,0.4)',
  },
  exerciseScreenEmptyTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginTop: 4,
  },
  exerciseScreenEmptySubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
    maxWidth: 280,
  },
  adminHostEmptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E25822',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    gap: 6,
    marginTop: 16,
  },
  adminHostEmptyBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  adminHostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E25822',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  adminHostBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  tournRuleBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(226, 88, 34, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(226, 88, 34, 0.2)',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  tournRuleText: {
    color: colors.text,
    fontSize: 11,
    lineHeight: 16,
    flex: 1,
    fontWeight: '600',
  },
  selectedTournContainer: {},
  backToTournsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  backToTournsBtnText: {
    color: '#E25822',
    fontSize: 13,
    fontWeight: '800',
  },
  tournCardDetail: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 18,
    marginBottom: 18,
  },
  tournDetailTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  exerciseBadge: {
    backgroundColor: 'rgba(226, 88, 34, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  exerciseBadgeText: {
    color: '#E25822',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  statusBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  statusBadgeDone: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  statusBadgeText: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: '900',
  },
  tournDetailTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  tournDetailDesc: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 6,
  },
  tournMetaStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tournMetaStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tournMetaStatText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  championBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(251, 191, 36, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
    borderRadius: 14,
    padding: 14,
    marginTop: 14,
    gap: 12,
  },
  championBannerInfo: {
    flex: 1,
  },
  championBannerSubtitle: {
    color: colors.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  championBannerTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '900',
    marginTop: 2,
  },
  tournActionBar: {
    marginTop: 16,
    gap: 10,
  },
  leaderNominateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E25822',
    borderRadius: 16,
    paddingVertical: 12,
    gap: 8,
  },
  leaderNominatedBtn: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderWidth: 1,
    borderColor: '#10B981',
  },
  leaderNominateBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  adminStartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#10B981',
    borderRadius: 16,
    paddingVertical: 12,
    gap: 8,
  },
  adminStartBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  bracketSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  bracketSectionTitle: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  livePill: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  livePillText: {
    color: '#EF4444',
    fontSize: 9,
    fontWeight: '900',
  },
  emptyEntriesBox: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  emptyEntriesText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  emptyEntriesSub: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
  },
  entriesGrid: {
    gap: 10,
  },
  entryCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 12,
  },
  entryCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  entryLogo: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.surfaceHi,
  },
  entryLogoPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.surfaceHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryInfo: {
    flex: 1,
    marginLeft: 10,
  },
  entryName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  entryLeader: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 1,
  },
  seedBadge: {
    backgroundColor: colors.surfaceHi,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  seedBadgeText: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
  },
  entryAthletesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  entryAthletesLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
  },
  entryAthletePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  entryAthleteName: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '700',
  },
  matchesList: {
    gap: 12,
  },
  matchCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 14,
  },
  matchCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  matchRoundName: {
    color: '#E25822',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  matchStatusPill: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  matchStatusPillLive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  matchStatusPillDone: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  matchStatusPillText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  fightCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  fighterBox: {
    flex: 1,
    backgroundColor: '#1E2430',
    borderRadius: 16,
    padding: 10,
    alignItems: 'center',
  },
  fighterBoxWinner: {
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    borderWidth: 1,
    borderColor: '#FBBF24',
  },
  fighterLogoWrap: {
    position: 'relative',
    marginBottom: 6,
  },
  fighterLogo: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#2A3242',
  },
  fighterLogoPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#2A3242',
    alignItems: 'center',
    justifyContent: 'center',
  },
  winnerCrownBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 2,
  },
  fighterCommunityName: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  fighterAthleteName: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
    textAlign: 'center',
  },
  fighterScoreText: {
    color: '#10B981',
    fontSize: 12,
    fontWeight: '900',
    marginTop: 4,
  },
  vsPillar: {
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  vsCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#E25822',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  vsText: {
    color: colors.text,
    fontSize: 9,
    fontWeight: '900',
  },
  vsExerciseText: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
  playMatchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E25822',
    borderRadius: 14,
    paddingVertical: 10,
    gap: 6,
    marginTop: 12,
  },
  playMatchBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  tournamentsList: {},
  tournGrid: {
    gap: 14,
  },
  workoutPlanCard: {
    borderRadius: 24,
    padding: 16,
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  cardWorkoutTitle: {
    fontSize: 17,
    fontWeight: '900',
  },
  tournExerciseSubText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    marginTop: 2,
  },
  durationBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBadgeNumber: {
    color: '#11141A',
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 14,
  },
  durationBadgeUnit: {
    color: colors.textDim,
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  cardBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTagsWrapper: {
    flex: 1,
    gap: 6,
  },
  muscleTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(17, 20, 26, 0.08)',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  darkDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#11141A',
    marginRight: 5,
  },
  muscleTagPillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  activePlayersPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  activePlayersText: {
    fontSize: 10,
    fontWeight: '800',
  },
  cardBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(17, 20, 26, 0.08)',
  },
  aiTagPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  aiTagText: {
    fontSize: 10,
    fontWeight: '700',
  },
  playArrowCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#11141A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exercisePillGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  exerciseSelectPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E2430',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  exerciseSelectPillActive: {
    backgroundColor: '#E25822',
    borderColor: '#E25822',
  },
  exercisePillIcon: {
    fontSize: 14,
  },
  exercisePillText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  exercisePillTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  nominateDesc: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  athleteSelectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E2430',
    borderRadius: 16,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  athleteSelectRowSelected: {
    borderColor: '#E25822',
    backgroundColor: 'rgba(226, 88, 34, 0.08)',
  },
  athleteSelectInfo: {
    flex: 1,
    marginLeft: 10,
  },
  athleteSelectName: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  athleteSelectUsername: {
    color: colors.textMuted,
    fontSize: 11,
  },
  checkboxCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#8E95A0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxCircleSelected: {
    backgroundColor: '#E25822',
    borderColor: '#E25822',
  },
  // ---------- Game-style Squad UI ----------
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, backgroundColor: colors.bg },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  headerTitleBox: { flex: 1, marginLeft: 12 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  headerTitle: { color: colors.text, fontSize: 20, fontWeight: '900', letterSpacing: 1.5 },
  headerSubtitle: { color: colors.textMuted, fontSize: 11.5, fontWeight: '700', marginTop: 1 },
  createHeaderBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 38, paddingHorizontal: 14, borderRadius: 12, backgroundColor: colors.accent, borderBottomWidth: 3, borderBottomColor: '#9A3412' },
  createHeaderBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900', letterSpacing: 1 },

  squadHero: { borderRadius: 26, padding: 18, overflow: 'hidden', marginBottom: 26, borderWidth: 1.5, borderColor: 'rgba(251,191,36,0.35)' },
  squadHeroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  squadHeroEyebrow: { color: GAME.textSoft, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  heroChipsRow: { flexDirection: 'row', gap: 6 },
  rankChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, height: 24, borderRadius: 12, backgroundColor: GAME.gold },
  rankChipText: { color: GAME.night, fontSize: 12, fontWeight: '900' },
  leaderChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, height: 24, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1, borderColor: 'rgba(251,191,36,0.45)' },
  leaderChipText: { color: GAME.gold, fontSize: 10.5, fontWeight: '900', letterSpacing: 0.8 },
  squadHeroBody: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  heroLevelHex: { position: 'absolute', bottom: -6, alignSelf: 'center' },
  squadHeroName: { color: GAME.text, fontSize: 21, fontWeight: '900', lineHeight: 25 },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  heroMembersPill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.3)' },
  heroMembersText: { color: GAME.text, fontSize: 12.5, fontWeight: '800' },
  heroLevelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, marginBottom: 7 },
  heroLevelLabel: { color: GAME.text, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  heroLevelNext: { color: GAME.textSoft, fontSize: 11, fontWeight: '800' },
  heroCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 44, marginTop: 16, borderRadius: 14, backgroundColor: GAME.gold, borderBottomWidth: 4, borderBottomColor: GAME.goldDeep },
  heroCtaText: { color: GAME.night, fontSize: 13.5, fontWeight: '900', letterSpacing: 1.2 },

  joinCallout: { borderRadius: 26, padding: 22, overflow: 'hidden', alignItems: 'center', marginBottom: 26, borderWidth: 1.5, borderColor: 'rgba(251,191,36,0.35)' },
  joinCalloutIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  joinCalloutTitle: { color: GAME.text, fontSize: 18, fontWeight: '900', letterSpacing: 1.5, marginTop: 12 },
  joinCalloutText: { color: GAME.textSoft, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 6 },
  joinCalloutBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 22, marginTop: 16, borderRadius: 14, backgroundColor: GAME.gold, borderBottomWidth: 4, borderBottomColor: GAME.goldDeep },
  joinCalloutBtnText: { color: GAME.night, fontSize: 13.5, fontWeight: '900', letterSpacing: 1 },

  exploreSection: { marginBottom: 26 },
  sectionTitleBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  rankingsHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rankingsTitle: { color: colors.text, fontSize: 15, fontWeight: '900', letterSpacing: 1.2 },
  sectionCount: { color: colors.textMuted, fontSize: 11.5, fontWeight: '800' },
  sectionAccent: { width: 4, height: 18, borderRadius: 2, backgroundColor: GAME.gold },
  heroLeagueText: { fontSize: 11, fontWeight: '900', letterSpacing: 1.4, marginTop: 4 },
  bannerLeague: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2, textAlign: 'center', marginTop: 6 },
  arenaPrizeLabel: { color: GAME.textSoft, fontSize: 10, fontWeight: '900', letterSpacing: 1 },

  communityGrid: { gap: 10, marginTop: 12 },
  communityCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 18, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  communityCardMine: { borderColor: GAME.gold, borderWidth: 1.5, backgroundColor: 'rgba(251,191,36,0.08)' },
  rankBadge: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.surfaceHi, alignItems: 'center', justifyContent: 'center' },
  rankNumber: { color: colors.textMuted, fontSize: 14, fontWeight: '900' },
  rowLevelHex: { position: 'absolute', bottom: -4, right: -4 },
  cardHeaderInfo: { flex: 1, minWidth: 0 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  catChipText: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: colors.textDim },
  cardMemberSubText: { color: colors.textMuted, fontSize: 11.5, fontWeight: '800' },
  rowRight: { alignItems: 'flex-end', gap: 6 },
  yoursChipText: { color: GAME.gold, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  cardActionBtnTextPending: { color: '#F59E0B', fontSize: 10, fontWeight: '900', letterSpacing: 1 },

  detailBannerCard: { borderRadius: 26, padding: 18, overflow: 'hidden', marginBottom: 24, borderWidth: 1.5, borderColor: 'rgba(251,191,36,0.35)' },
  bannerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bannerCatChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 26, borderRadius: 13, backgroundColor: 'rgba(0,0,0,0.3)' },
  bannerCatText: { color: GAME.text, fontSize: 10.5, fontWeight: '900', letterSpacing: 0.8 },
  bannerEmblemWrap: { alignSelf: 'center', marginTop: 14 },
  bannerLevelHex: { position: 'absolute', bottom: -8, alignSelf: 'center' },
  bannerName: { color: GAME.text, fontSize: 22, fontWeight: '900', textAlign: 'center', marginTop: 16 },
  bannerDesc: { color: GAME.textSoft, fontSize: 12.5, lineHeight: 18, textAlign: 'center', marginTop: 4 },
  bannerStatsRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  bannerStat: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 14, backgroundColor: 'rgba(0,0,0,0.3)' },
  bannerStatValue: { color: GAME.text, fontSize: 16, fontWeight: '900', marginTop: 4 },
  bannerStatLabel: { color: GAME.textSoft, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: 1 },
  heroActionsRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  heroActionBtnEdit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, paddingHorizontal: 14, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)' },
  heroActionBtnEditText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  heroActionBtnPrimary: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderRadius: 14, backgroundColor: GAME.gold, borderBottomWidth: 4, borderBottomColor: GAME.goldDeep },
  heroActionBtnPrimaryText: { color: GAME.night, fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  heroActionBtnSecondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, paddingHorizontal: 14, borderRadius: 14, backgroundColor: 'rgba(239,68,68,0.18)' },
  heroActionBtnSecondaryText: { color: '#FCA5A5', fontSize: 13, fontWeight: '800' },

  membersListCard: { borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  memberRowMe: { backgroundColor: 'rgba(251,191,36,0.08)' },
  memberRank: { width: 20, textAlign: 'center', color: colors.textMuted, fontSize: 14, fontWeight: '900' },
  memberAvatarRing: { borderWidth: 2, borderRadius: 24, padding: 1 },
  memberInfo: { flex: 1, minWidth: 0 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  memberName: { flexShrink: 1, color: colors.text, fontSize: 14.5, fontWeight: '800' },
  youPill: { color: GAME.goldDeep, fontSize: 9.5, fontWeight: '900', letterSpacing: 0.8, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 6, backgroundColor: 'rgba(251,191,36,0.18)', overflow: 'hidden' },
  memberUsername: { color: colors.textMuted, fontSize: 11.5, fontWeight: '600', marginTop: 2 },
  memberActionBox: { alignItems: 'flex-end' },
  memberPts: { color: colors.text, fontSize: 15, fontWeight: '900' },
  memberPtsLabel: { color: colors.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  kickBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: 'rgba(239,68,68,0.12)', alignItems: 'center', justifyContent: 'center' },

  arenaCard: { borderRadius: 22, padding: 16, overflow: 'hidden', marginBottom: 12 },
  arenaWatermark: { position: 'absolute', right: -18, top: -10 },
  arenaTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arenaStatus: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, height: 24, borderRadius: 12, borderWidth: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  arenaStatusText: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#F43F5E' },
  arenaExercise: { color: GAME.textSoft, fontSize: 10.5, fontWeight: '900', letterSpacing: 1.2 },
  arenaTitle: { color: GAME.text, fontSize: 19, fontWeight: '900', marginTop: 12 },
  arenaPrizeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  arenaPrize: { flex: 1, color: GAME.gold, fontSize: 12.5, fontWeight: '800' },
  arenaSlotsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 8 },
  arenaSlotsText: { color: GAME.textSoft, fontSize: 10.5, fontWeight: '900', letterSpacing: 0.8 },
  arenaGo: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, height: 28, borderRadius: 10, backgroundColor: GAME.gold },
  arenaGoText: { color: GAME.night, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
})
);
