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
  Flame,
  Play,
  Award,
  Calendar,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { Avatar } from '../components/Avatar';
import { supabase } from '../utils/supabase';
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
} from '../utils/communityService';
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
              onOpenMatchCamera(oppName, 'faceoff', match.exercise_id);
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
      <StatusBar barStyle="light-content" backgroundColor="#11141A" />

      {/* Top Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
          <ArrowLeft size={20} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerTitleBox}>
          <Text style={styles.headerTitle}>COMMUNITY HUB</Text>
          <Text style={styles.headerSubtitle}>Schools, Universities & Gyms</Text>
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
          <Plus size={18} color="#FFFFFF" />
          <Text style={styles.createHeaderBtnText}>Create</Text>
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
                <Text style={styles.backToTournsBtnText}>Back to All Communities</Text>
              </TouchableOpacity>

              {/* Community Hero Banner (Vibrant ExerciseDetail Style) */}
              <View style={styles.detailBannerCard}>
                <View style={styles.bannerTopRow}>
                  <View style={styles.ratingBadge}>
                    {getCategoryIcon(viewingCommunity.category)}
                    <Text style={[styles.ratingLabel, { marginLeft: 6 }]}>{viewingCommunity.category}</Text>
                    <View style={styles.ratingNumBox}>
                      <Text style={styles.ratingNumText}>{activeMembers.length} {activeMembers.length === 1 ? 'MEMBER' : 'MEMBERS'}</Text>
                    </View>
                  </View>

                  {isLeaderOfViewing ? (
                    <View style={styles.scoreRulesPill}>
                      <Text style={styles.scoreRulesText}>LEADER</Text>
                    </View>
                  ) : isViewingMyCommunity ? (
                    <View style={styles.scoreRulesPill}>
                      <Text style={styles.scoreRulesText}>JOINED</Text>
                    </View>
                  ) : (
                    <View style={styles.scoreRulesPill}>
                      <Text style={styles.scoreRulesText}>1 SQUAD PER ATHLETE</Text>
                    </View>
                  )}
                </View>

                {/* Banner Main Info */}
                <View style={styles.bannerStatsRow}>
                  {viewingCommunity.logo_url ? (
                    <Image source={{ uri: viewingCommunity.logo_url }} style={styles.heroBannerLogo} />
                  ) : (
                    <View style={styles.heroBannerLogoPlaceholder}>
                      {getCategoryIcon(viewingCommunity.category)}
                    </View>
                  )}

                  <View style={styles.userRankInfo}>
                    <View style={styles.rankTitleRow}>
                      <Text style={styles.rankTitle} numberOfLines={1}>{viewingCommunity.name}</Text>
                    </View>
                    <Text style={styles.playedWonStats} numberOfLines={2}>
                      {viewingCommunity.description || `Official ${viewingCommunity.category} community squad on OJAS Fitness.`}
                    </Text>
                  </View>
                </View>

                {/* Actions Toolbar */}
                <View style={styles.heroActionsRow}>
                  {isLeaderOfViewing && (
                    <TouchableOpacity
                      style={styles.heroActionBtnEdit}
                      onPress={handleOpenEditModal}
                      activeOpacity={0.8}
                    >
                      <Edit3 size={15} color="#FFFFFF" />
                      <Text style={styles.heroActionBtnEditText}>Edit</Text>
                    </TouchableOpacity>
                  )}

                  {isAdminOrLeaderOfViewing && (
                    <TouchableOpacity
                      style={styles.heroActionBtnPrimary}
                      onPress={() => setShowInviteModal(true)}
                      activeOpacity={0.8}
                    >
                      <UserPlus size={15} color="#FFFFFF" />
                      <Text style={styles.heroActionBtnPrimaryText}>Invite Athletes</Text>
                    </TouchableOpacity>
                  )}

                  {isViewingMyCommunity ? (
                    <TouchableOpacity
                      style={styles.heroActionBtnSecondary}
                      onPress={handleLeaveCommunity}
                      activeOpacity={0.8}
                    >
                      <LogOut size={15} color="#EF4444" />
                      <Text style={styles.heroActionBtnSecondaryText}>Leave</Text>
                    </TouchableOpacity>
                  ) : (
                    !userStatus.hasCommunity && (
                      <TouchableOpacity
                        style={styles.heroActionBtnPrimary}
                        onPress={() => handleJoinRequest(viewingCommunity)}
                        activeOpacity={0.8}
                      >
                        <UserPlus size={15} color="#FFFFFF" />
                        <Text style={styles.heroActionBtnPrimaryText}>Request to Join</Text>
                      </TouchableOpacity>
                    )
                  )}
                </View>
              </View>

              {/* Members List Section */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeaderTitle}>COMMUNITY MEMBERS ({activeMembers.length})</Text>
                {isLeaderOfViewing && (
                  <View style={styles.roleBadgeLeader}>
                    <Text style={styles.roleBadgeLeaderText}>You are Leader</Text>
                  </View>
                )}
              </View>

              {isLoadingViewingMembers ? (
                <View style={styles.innerLoading}>
                  <ActivityIndicator size="small" color="#E25822" />
                </View>
              ) : (
                <View style={styles.membersListCard}>
                  {activeMembers.map((member, idx) => {
                    const mUser = member.profile;
                    const isCurrent = member.user_id === resolvedUserId;
                    const isMemLeader = member.role === 'leader';
                    const isMemAdmin = member.role === 'admin';

                    return (
                      <View
                        key={member.id}
                        style={[styles.memberRow, idx === activeMembers.length - 1 && { borderBottomWidth: 0 }]}
                      >
                        <Avatar
                          config={mUser?.avatar_config}
                          avatarUrl={mUser?.avatar_url}
                          size={44}
                        />
                        <View style={styles.memberInfo}>
                          <View style={styles.memberNameRow}>
                            <Text style={styles.memberName}>
                              {mUser?.full_name || mUser?.username || 'Athlete'}
                            </Text>
                            {isCurrent && <Text style={styles.youPill}>(You)</Text>}
                          </View>
                          <Text style={styles.memberUsername}>@{mUser?.username || 'user'}</Text>
                        </View>

                        {/* Member Role or Leader Kick Action */}
                        <View style={styles.memberActionBox}>
                          {isMemLeader ? (
                            <View style={styles.rolePillLeader}>
                              <Text style={styles.rolePillLeaderText}>Leader</Text>
                            </View>
                          ) : isMemAdmin ? (
                            <View style={styles.rolePillAdmin}>
                              <Text style={styles.rolePillAdminText}>Admin</Text>
                            </View>
                          ) : (
                            <View style={styles.rolePillMember}>
                              <Text style={styles.rolePillMemberText}>Member</Text>
                            </View>
                          )}

                          {/* Kick Member Button for Leader (cannot kick self) */}
                          {isLeaderOfViewing && !isCurrent && (
                            <TouchableOpacity
                              style={styles.kickBtn}
                              onPress={() => handleKickMember(member)}
                              activeOpacity={0.7}
                            >
                              <UserX size={15} color="#EF4444" />
                            </TouchableOpacity>
                          )}
                        </View>
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
              {/* SECTION 1: EXPLORE ALL COMMUNITIES */}
              <View style={styles.exploreSection}>
                <Text style={[styles.sectionHeaderTitle, { marginBottom: 12 }]}>EXPLORE COMMUNITIES</Text>
                {/* Search Bar */}
                <View style={styles.searchBarWrapper}>
                  <Search size={18} color="#8E95A0" style={styles.searchIcon} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search school, college, gym, club..."
                    placeholderTextColor="#8E95A0"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    returnKeyType="search"
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                      <X size={16} color="#8E95A0" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Categories Horizontal Scroll */}
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

                {/* Communities Cards List */}
                {exploreCommunities.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Building2 size={40} color="#8E95A0" />
                    <Text style={styles.emptyTitle}>No Communities Found</Text>
                    <Text style={styles.emptySubtitle}>Be the first to create one for your school or gym.</Text>
                    <TouchableOpacity
                      style={styles.emptyCreateBtn}
                      onPress={() => setShowCreateModal(true)}
                    >
                      <Plus size={16} color="#FFFFFF" />
                      <Text style={styles.emptyCreateBtnText}>Create Community</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.communityGrid}>
                    {exploreCommunities.map((comm) => {
                      const isMyCurrent = userStatus.community?.id === comm.id;
                      const isPending = userStatus.pendingRequest?.community?.id === comm.id;

                      return (
                        <TouchableOpacity
                          key={comm.id}
                          style={styles.communityCard}
                          onPress={() => handleOpenCommunity(comm)}
                          activeOpacity={0.85}
                        >
                          {/* Card Content styled like Exercise queueItemCard */}
                          <View style={styles.cardHeader}>
                            {comm.logo_url ? (
                              <Image source={{ uri: comm.logo_url }} style={styles.cardLogo} />
                            ) : (
                              <View style={styles.cardLogoPlaceholder}>
                                {getCategoryIcon(comm.category)}
                              </View>
                            )}
                            <View style={styles.cardHeaderInfo}>
                              <View style={styles.cardTitleRow}>
                                <Text style={styles.cardTitle} numberOfLines={1}>{comm.name}</Text>
                                <View style={styles.queueBadgePill}>
                                  <Text style={styles.queueBadgePillText}>{comm.category.toUpperCase()}</Text>
                                </View>
                              </View>
                              <Text style={styles.cardDescText} numberOfLines={1}>
                                {comm.description || `${comm.member_count} ${comm.member_count === 1 ? 'member' : 'members'} enrolled`}
                              </Text>
                              <Text style={styles.cardMemberSubText}>
                                {comm.member_count} {comm.member_count === 1 ? 'Athlete' : 'Athletes'}
                              </Text>
                            </View>

                            <TouchableOpacity
                              style={[
                                styles.cardActionBtn,
                                isMyCurrent && styles.cardActionBtnCurrent,
                                isPending && styles.cardActionBtnPending,
                              ]}
                              onPress={() => {
                                if (isPending) {
                                  handleCancelJoinRequest(comm.id);
                                } else {
                                  handleOpenCommunity(comm);
                                }
                              }}
                              activeOpacity={0.8}
                            >
                              <Text style={[styles.cardActionBtnText, isPending && styles.cardActionBtnTextPending]}>
                                {isPending ? 'PENDING' : isMyCurrent ? 'VIEW' : 'OPEN'}
                              </Text>
                              {!isPending && <ChevronRight size={13} color="#FFFFFF" />}
                            </TouchableOpacity>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              {/* SECTION 2: INTER-COMMUNITY TOURNAMENTS (VISIBLE TO COMMUNITY LEADERS & ADMINS) */}
              {(isAdmin || (userStatus.hasCommunity && userStatus.membership?.role === 'leader')) && (
                <View style={styles.battlesSection}>
                  {/* Tournament Section Header */}
                  <View style={styles.tournamentSectionTitleRow}>
                    <View style={styles.tournamentTitleLeft}>
                      <Text style={styles.sectionHeaderTitle}>COMMUNITY TOURNAMENTS</Text>
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
                              <Trophy size={32} color="#8E95A0" style={{ marginBottom: 8 }} />
                              <Text style={styles.exerciseScreenEmptyTitle}>No Tournaments Available</Text>
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
                              {tournaments.map((tourn, index) => {
                                const isDone = tourn.status === 'completed';
                                const isLive = tourn.status === 'in_progress';
                                const defaultPalettes = ['#C8B6FF', '#FFD6E0', '#E25822', '#354394'];
                                const cardBg = defaultPalettes[index % defaultPalettes.length];
                                const isDarkCard = cardBg === '#354394' || cardBg === '#E25822';
                                const textColor = isDarkCard ? '#FFFFFF' : '#11141A';
                                const subTextColor = isDarkCard ? '#E2E8F0' : '#4B5563';

                                return (
                                  <TouchableOpacity
                                    key={tourn.id}
                                    style={[styles.workoutPlanCard, { backgroundColor: cardBg }]}
                                    onPress={() => handleOpenTournament(tourn)}
                                    activeOpacity={0.9}
                                  >
                                    {/* Top Row: Exercise Title & Status Badge */}
                                    <View style={styles.cardTopRow}>
                                      <View style={{ flex: 1, marginRight: 10 }}>
                                        <Text style={[styles.cardWorkoutTitle, { color: textColor }]} numberOfLines={1}>
                                          {tourn.title}
                                        </Text>
                                        <Text style={[styles.tournExerciseSubText, { color: subTextColor }]}>
                                          {tourn.exercise_name.toUpperCase()} BATTLE
                                        </Text>
                                      </View>
                                      <View style={styles.durationBadge}>
                                        <Text style={styles.durationBadgeNumber}>
                                          {isLive ? 'LIVE' : isDone ? 'DONE' : 'OPEN'}
                                        </Text>
                                        <Text style={styles.durationBadgeUnit}>
                                          {tourn.registered_count || 0}/{tourn.max_communities} SQUADS
                                        </Text>
                                      </View>
                                    </View>

                                    {/* Center Body: Category / Prize Tags */}
                                    <View style={styles.cardBodyRow}>
                                      <View style={styles.cardTagsWrapper}>
                                        <View style={[styles.muscleTagPill, isDarkCard && { backgroundColor: 'rgba(255, 255, 255, 0.15)' }]}>
                                          <View style={[styles.darkDot, isDarkCard && { backgroundColor: '#FFFFFF' }]} />
                                          <Text style={[styles.muscleTagPillText, { color: textColor }]} numberOfLines={1}>
                                            Single Elimination • {tourn.total_rounds || 3} Rounds
                                          </Text>
                                        </View>

                                        <View style={[styles.activePlayersPill, isDarkCard && { backgroundColor: 'rgba(255, 255, 255, 0.2)' }]}>
                                          <Award size={12} color={textColor} style={{ marginRight: 4 }} />
                                          <Text style={[styles.activePlayersText, { color: textColor }]} numberOfLines={1}>
                                            {tourn.prize_pool || 'Glory & Tier XP'}
                                          </Text>
                                        </View>
                                      </View>
                                    </View>

                                    {/* Bottom Row: CTA & Play Circle */}
                                    <View style={[styles.cardBottomRow, isDarkCard && { borderTopColor: 'rgba(255, 255, 255, 0.12)' }]}>
                                      <View style={styles.aiTagPill}>
                                        <Text style={[styles.aiTagText, { color: subTextColor }]} numberOfLines={1}>
                                          {isDone ? 'View Results & Champion' : 'Enter Community & View Brackets'}
                                        </Text>
                                      </View>

                                      <View style={[styles.playArrowCircle, isDarkCard && { backgroundColor: '#FFFFFF' }]}>
                                        <Play size={12} color={isDarkCard ? '#11141A' : '#FFFFFF'} fill={isDarkCard ? '#11141A' : '#FFFFFF'} />
                                      </View>
                                    </View>
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#11141A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: '#161B22',
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#262A32',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleBox: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  headerSubtitle: {
    color: '#8E95A0',
    fontSize: 11,
    fontWeight: '600',
  },
  createHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E25822',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    gap: 4,
  },
  createHeaderBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#161B22',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
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
    color: '#8E95A0',
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
    color: '#FFFFFF',
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
    color: '#8E95A0',
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
    color: '#FBBF24',
    fontSize: 13,
    fontWeight: '800',
  },
  pendingBannerDesc: {
    color: '#CBD5E1',
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
  detailBannerCard: {
    backgroundColor: '#354394',
    borderRadius: 22,
    padding: 16,
    marginBottom: 20,
  },
  bannerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(26, 28, 35, 0.45)',
    borderRadius: 12,
    paddingVertical: 5,
    paddingHorizontal: 9,
  },
  ratingLabel: { color: '#E2E8F0', fontSize: 12, fontWeight: '700' },
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
  bannerStatsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
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
  rankTitle: { color: '#FFFFFF', fontSize: 19, fontWeight: '900' },
  playedWonStats: { color: '#E2E8F0', fontSize: 12, marginTop: 4, lineHeight: 17 },
  heroActionsRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 8,
  },
  heroActionBtnEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(26, 28, 35, 0.6)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  heroActionBtnEditText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  heroActionBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E25822',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 6,
  },
  heroActionBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  heroActionBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
  },
  heroActionBtnSecondaryText: {
    color: '#EF4444',
    fontSize: 12,
    fontWeight: '800',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeaderTitle: {
    color: '#8E95A0',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  sectionHeaderSub: {
    color: '#8E95A0',
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
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: '800',
  },
  membersListCard: {
    backgroundColor: '#262A32',
    borderRadius: 20,
    overflow: 'hidden',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  memberInfo: {
    flex: 1,
    marginLeft: 12,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memberName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  youPill: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: '700',
  },
  memberUsername: {
    color: '#8E95A0',
    fontSize: 12,
    marginTop: 1,
  },
  memberBio: {
    color: '#9CA3AF',
    fontSize: 11,
    marginTop: 2,
  },
  memberActionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
    color: '#FBBF24',
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
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  rolePillMemberText: {
    color: '#8E95A0',
    fontSize: 10,
    fontWeight: '700',
  },
  kickBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  proposalsSection: {},
  proposalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
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
  exploreSection: {},
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#262A32',
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 48,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
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
    backgroundColor: '#262A32',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  categoryPillActive: {
    backgroundColor: '#E25822',
    borderColor: '#E25822',
  },
  categoryPillText: {
    color: '#8E95A0',
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
    color: '#CBD5E1',
    fontSize: 11,
    flex: 1,
    lineHeight: 16,
  },
  communityGrid: {
    gap: 12,
  },
  communityCard: {
    backgroundColor: '#262A32',
    borderRadius: 20,
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardLogo: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#323742',
  },
  cardLogoPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#323742',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderInfo: {
    flex: 1,
    marginLeft: 12,
    marginRight: 10,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
    maxWidth: '70%',
  },
  queueBadgePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
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
    color: '#9CA3AF',
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  cardMemberSubText: {
    color: '#8E95A0',
    fontSize: 10,
    fontWeight: '700',
    marginTop: 3,
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
  cardActionBtnTextPending: {
    color: '#FBBF24',
  },
  emptyCard: {
    backgroundColor: '#262A32',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    marginTop: 20,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 14,
  },
  emptySubtitle: {
    color: '#8E95A0',
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
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  modalCardSmall: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#1E2430',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    color: '#FFFFFF',
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
    backgroundColor: '#161B22',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
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
    backgroundColor: '#161B22',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  catOptionPillActive: {
    backgroundColor: '#E25822',
    borderColor: '#E25822',
  },
  catOptionText: {
    color: '#8E95A0',
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
    color: '#8E95A0',
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
  },
  usernameInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161B22',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  atSign: {
    color: '#E25822',
    fontSize: 16,
    fontWeight: '900',
    marginRight: 6,
  },
  usernameInput: {
    flex: 1,
    color: '#FFFFFF',
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
    marginTop: 28,
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
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: '800',
  },
  exerciseScreenEmptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
    backgroundColor: '#262A32',
    borderRadius: 24,
  },
  exerciseScreenEmptyTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    marginTop: 4,
  },
  exerciseScreenEmptySubtitle: {
    color: '#8E95A0',
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
    color: '#CBD5E1',
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
    backgroundColor: '#262A32',
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
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: '900',
  },
  tournDetailTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '900',
    marginTop: 2,
  },
  tournDetailDesc: {
    color: '#9CA3AF',
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
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  tournMetaStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tournMetaStatText: {
    color: '#8E95A0',
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
    color: '#FBBF24',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  championBannerTitle: {
    color: '#FFFFFF',
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
    color: '#8E95A0',
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
    backgroundColor: '#262A32',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
  },
  emptyEntriesText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  emptyEntriesSub: {
    color: '#8E95A0',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
  },
  entriesGrid: {
    gap: 10,
  },
  entryCard: {
    backgroundColor: '#262A32',
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
    backgroundColor: '#323742',
  },
  entryLogoPlaceholder: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#323742',
    alignItems: 'center',
    justifyContent: 'center',
  },
  entryInfo: {
    flex: 1,
    marginLeft: 10,
  },
  entryName: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  entryLeader: {
    color: '#8E95A0',
    fontSize: 10,
    marginTop: 1,
  },
  seedBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  seedBadgeText: {
    color: '#8E95A0',
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
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  entryAthletesLabel: {
    color: '#8E95A0',
    fontSize: 10,
    fontWeight: '700',
  },
  entryAthletePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161B22',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  entryAthleteName: {
    color: '#CBD5E1',
    fontSize: 10,
    fontWeight: '700',
  },
  matchesList: {
    gap: 12,
  },
  matchCard: {
    backgroundColor: '#262A32',
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
    backgroundColor: '#161B22',
    borderRadius: 10,
    padding: 2,
  },
  fighterCommunityName: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  fighterAthleteName: {
    color: '#8E95A0',
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
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
  },
  vsExerciseText: {
    color: '#8E95A0',
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
    color: '#4B5563',
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
    borderColor: 'rgba(255, 255, 255, 0.06)',
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
    color: '#8E95A0',
    fontSize: 11,
    fontWeight: '700',
  },
  exercisePillTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  nominateDesc: {
    color: '#8E95A0',
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
    borderColor: 'rgba(255, 255, 255, 0.06)',
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
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  athleteSelectUsername: {
    color: '#8E95A0',
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
});
