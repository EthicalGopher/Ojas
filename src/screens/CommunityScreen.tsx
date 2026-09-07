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
  Crown,
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
  Sparkles,
  Info,
  Clock,
  Camera,
  CheckCircle2,
  ChevronRight,
  Edit3,
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

interface CommunityScreenProps {
  currentUser: any;
  onBack: () => void;
}

const CATEGORIES = ['All', 'School', 'University', 'Gym', 'Sports Club', 'Organization', 'General'] as const;

export const CommunityScreen: React.FC<CommunityScreenProps> = ({ currentUser, onBack }) => {
  const [resolvedUserId, setResolvedUserId] = useState<string>(
    currentUser?.id || currentUser?.user?.id || ''
  );

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

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

  // Active View Tab: 'hub' | 'explore' | 'proposals'
  const [activeTab, setActiveTab] = useState<'hub' | 'explore' | 'proposals'>('hub');

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
      if (!resolvedUserId) {
        const { data } = await supabase.auth.getUser();
        if (data?.user?.id) {
          setResolvedUserId(data.user.id);
        }
      }
    }
    resolveAuthUser();
  }, [resolvedUserId]);

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
      const [status, comms] = await Promise.all([
        fetchUserCommunityStatus(uid),
        fetchCommunities(searchQuery, selectedCategory),
      ]);

      setUserStatus(status);
      setExploreCommunities(comms);

      // If user is a member of a community, prioritize showing their community in hub
      if (status.hasCommunity && status.community) {
        if (!viewingCommunity || viewingCommunity.id === status.community.id) {
          setViewingCommunity(status.community);
          const memberList = await fetchCommunityMembers(status.community.id);
          setViewingCommunityMembers(memberList);
          setActiveTab('hub');
        }
      } else {
        if (!viewingCommunity) {
          setActiveTab('explore');
        }
      }
    } catch (e) {
      console.warn('Error loading community data:', e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [resolvedUserId, searchQuery, selectedCategory, viewingCommunity?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
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

      {/* Tabs / Subnav */}
      <View style={styles.tabsContainer}>
        {viewingCommunity && (
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'hub' && styles.tabBtnActive]}
            onPress={() => setActiveTab('hub')}
          >
            <Text style={[styles.tabBtnText, activeTab === 'hub' && styles.tabBtnTextActive]}>
              {isViewingMyCommunity ? 'My Community' : 'Community Details'}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'explore' && styles.tabBtnActive]}
          onPress={() => setActiveTab('explore')}
        >
          <Text style={[styles.tabBtnText, activeTab === 'explore' && styles.tabBtnTextActive]}>
            Explore All
          </Text>
        </TouchableOpacity>

        {isLeaderOfViewing && (
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'proposals' && styles.tabBtnActive]}
            onPress={() => setActiveTab('proposals')}
          >
            <View style={styles.tabBadgeRow}>
              <Text style={[styles.tabBtnText, activeTab === 'proposals' && styles.tabBtnTextActive]}>
                Join Requests
              </Text>
              {pendingProposals.length > 0 && (
                <View style={styles.tabCounterBadge}>
                  <Text style={styles.tabCounterText}>{pendingProposals.length}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        )}
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

          {/* VIEW: COMMUNITY DETAIL / HUB */}
          {activeTab === 'hub' && viewingCommunity && (
            <View style={styles.myCommunitySection}>
              {/* Community Hero Card */}
              <View style={styles.communityHeroCard}>
                <View style={styles.heroLogoRow}>
                  {viewingCommunity.logo_url ? (
                    <Image source={{ uri: viewingCommunity.logo_url }} style={styles.heroLogo} />
                  ) : (
                    <View style={styles.heroLogoPlaceholder}>
                      {getCategoryIcon(viewingCommunity.category)}
                    </View>
                  )}
                  <View style={styles.heroMainInfo}>
                    <View style={styles.heroCategoryPill}>
                      {getCategoryIcon(viewingCommunity.category)}
                      <Text style={styles.heroCategoryText}>{viewingCommunity.category}</Text>
                    </View>
                    <Text style={styles.heroCommunityName}>{viewingCommunity.name}</Text>
                    <Text style={styles.heroMemberCount}>
                      {activeMembers.length} {activeMembers.length === 1 ? 'Athlete' : 'Athletes'} Joined
                    </Text>
                  </View>
                </View>

                {viewingCommunity.description ? (
                  <Text style={styles.heroDescription}>{viewingCommunity.description}</Text>
                ) : null}

                {/* Actions Toolbar */}
                <View style={styles.heroActionsRow}>
                  {isLeaderOfViewing && (
                    <TouchableOpacity
                      style={styles.heroActionBtnEdit}
                      onPress={handleOpenEditModal}
                      activeOpacity={0.8}
                    >
                      <Edit3 size={16} color="#E25822" />
                      <Text style={styles.heroActionBtnEditText}>Edit Details</Text>
                    </TouchableOpacity>
                  )}

                  {isAdminOrLeaderOfViewing && (
                    <TouchableOpacity
                      style={styles.heroActionBtnPrimary}
                      onPress={() => setShowInviteModal(true)}
                      activeOpacity={0.8}
                    >
                      <UserPlus size={16} color="#FFFFFF" />
                      <Text style={styles.heroActionBtnPrimaryText}>Invite</Text>
                    </TouchableOpacity>
                  )}

                  {isViewingMyCommunity ? (
                    <TouchableOpacity
                      style={styles.heroActionBtnSecondary}
                      onPress={handleLeaveCommunity}
                      activeOpacity={0.8}
                    >
                      <LogOut size={16} color="#EF4444" />
                      <Text style={styles.heroActionBtnSecondaryText}>Leave</Text>
                    </TouchableOpacity>
                  ) : (
                    !userStatus.hasCommunity && (
                      <TouchableOpacity
                        style={styles.heroActionBtnPrimary}
                        onPress={() => handleJoinRequest(viewingCommunity)}
                        activeOpacity={0.8}
                      >
                        <UserPlus size={16} color="#FFFFFF" />
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
                    <Crown size={12} color="#FBBF24" />
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
                              <Crown size={12} color="#FBBF24" />
                              <Text style={styles.rolePillLeaderText}>Leader</Text>
                            </View>
                          ) : isMemAdmin ? (
                            <View style={styles.rolePillAdmin}>
                              <Shield size={12} color="#60A5FA" />
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
            </View>
          )}

          {/* VIEW: JOIN REQUESTS (LEADER) */}
          {activeTab === 'proposals' && isLeaderOfViewing && (
            <View style={styles.proposalsSection}>
              <Text style={styles.sectionHeaderTitle}>PENDING JOIN PROPOSALS ({pendingProposals.length})</Text>
              <Text style={styles.sectionHeaderSub}>
                Review athletes requesting to join your community. Each athlete can only belong to one community.
              </Text>

              {pendingProposals.length === 0 ? (
                <View style={styles.emptyCard}>
                  <CheckCircle2 size={40} color="#34D399" />
                  <Text style={styles.emptyTitle}>All Caught Up</Text>
                  <Text style={styles.emptySubtitle}>No pending join proposals at the moment.</Text>
                </View>
              ) : (
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
              )}
            </View>
          )}

          {/* VIEW: EXPLORE ALL COMMUNITIES */}
          {activeTab === 'explore' && (
            <View style={styles.exploreSection}>
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

              {/* Notice Banner */}
              <View style={styles.ruleBanner}>
                <Info size={16} color="#E25822" />
                <Text style={styles.ruleBannerText}>
                  Rule: Each athlete can join <Text style={{ fontWeight: '800', color: '#FFF' }}>only one community</Text> at a time.
                </Text>
              </View>

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
                        <View style={styles.cardHeader}>
                          {comm.logo_url ? (
                            <Image source={{ uri: comm.logo_url }} style={styles.cardLogo} />
                          ) : (
                            <View style={styles.cardLogoPlaceholder}>
                              {getCategoryIcon(comm.category)}
                            </View>
                          )}
                          <View style={styles.cardHeaderInfo}>
                            <View style={styles.cardCategoryRow}>
                              <Text style={styles.cardCategoryText}>{comm.category}</Text>
                            </View>
                            <Text style={styles.cardTitle} numberOfLines={1}>{comm.name}</Text>
                            <Text style={styles.cardMemberCount}>{comm.member_count} {comm.member_count === 1 ? 'Member' : 'Members'}</Text>
                          </View>
                        </View>

                        {comm.description ? (
                          <Text style={styles.cardDesc} numberOfLines={2}>
                            {comm.description}
                          </Text>
                        ) : null}

                        {/* Card Footer Actions */}
                        <View style={styles.cardFooter}>
                          {isMyCurrent ? (
                            <TouchableOpacity
                              style={styles.openBtn}
                              onPress={() => handleOpenCommunity(comm)}
                            >
                              <Text style={styles.openBtnText}>Open</Text>
                              <ChevronRight size={14} color="#FFFFFF" />
                            </TouchableOpacity>
                          ) : isPending ? (
                            <TouchableOpacity
                              style={styles.pendingActionBtn}
                              onPress={() => handleCancelJoinRequest(comm.id)}
                            >
                              <Clock size={14} color="#F59E0B" />
                              <Text style={styles.pendingActionBtnText}>Pending (Withdraw)</Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity
                              style={styles.joinBtn}
                              onPress={() => handleJoinRequest(comm)}
                              activeOpacity={0.8}
                            >
                              <Text style={styles.joinBtnText}>Request to Join</Text>
                              <ChevronRight size={14} color="#FFFFFF" />
                            </TouchableOpacity>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
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
                <Sparkles size={14} color="#E25822" />
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
  communityHeroCard: {
    backgroundColor: '#1E2430',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 20,
  },
  heroLogoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroLogo: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: '#2A3242',
  },
  heroLogoPlaceholder: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: '#2A3242',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroMainInfo: {
    flex: 1,
    marginLeft: 16,
  },
  heroCategoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(226, 88, 34, 0.15)',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    marginBottom: 6,
  },
  heroCategoryText: {
    color: '#E25822',
    fontSize: 11,
    fontWeight: '800',
  },
  heroCommunityName: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '900',
  },
  heroMemberCount: {
    color: '#8E95A0',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
  },
  heroDescription: {
    color: '#CBD5E1',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 14,
  },
  heroActionsRow: {
    flexDirection: 'row',
    marginTop: 18,
    gap: 8,
  },
  heroActionBtnEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(226, 88, 34, 0.15)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(226, 88, 34, 0.3)',
  },
  heroActionBtnEditText: {
    color: '#E25822',
    fontSize: 13,
    fontWeight: '800',
  },
  heroActionBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E25822',
    borderRadius: 14,
    paddingVertical: 11,
    gap: 6,
  },
  heroActionBtnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  heroActionBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 6,
  },
  heroActionBtnSecondaryText: {
    color: '#EF4444',
    fontSize: 13,
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
    backgroundColor: '#1E2430',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
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
    backgroundColor: '#1E2430',
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
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
    marginTop: 12,
    maxHeight: 40,
  },
  categoryScrollContent: {
    gap: 8,
  },
  categoryPill: {
    backgroundColor: '#1E2430',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
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
    backgroundColor: 'rgba(226, 88, 34, 0.08)',
    borderRadius: 12,
    padding: 10,
    marginTop: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(226, 88, 34, 0.15)',
  },
  ruleBannerText: {
    color: '#CBD5E1',
    fontSize: 11,
    flex: 1,
  },
  communityGrid: {
    gap: 14,
  },
  communityCard: {
    backgroundColor: '#1E2430',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardLogo: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#2A3242',
  },
  cardLogoPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#2A3242',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeaderInfo: {
    flex: 1,
    marginLeft: 14,
  },
  cardCategoryRow: {
    flexDirection: 'row',
  },
  cardCategoryText: {
    color: '#E25822',
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  cardMemberCount: {
    color: '#8E95A0',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  cardDesc: {
    color: '#9CA3AF',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10,
  },
  cardFooter: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E25822',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 4,
  },
  openBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  joinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E25822',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 4,
  },
  joinBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  pendingActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  pendingActionBtnText: {
    color: '#FBBF24',
    fontSize: 11,
    fontWeight: '800',
  },
  emptyCard: {
    backgroundColor: '#1E2430',
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
});
