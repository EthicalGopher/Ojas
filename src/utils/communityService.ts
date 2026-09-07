import { supabase } from './supabase';
import { AvatarConfig } from '../components/Avatar';
import { decode } from 'base64-arraybuffer';

export interface CommunityMember {
  id: string;
  community_id: string;
  user_id: string;
  role: 'leader' | 'admin' | 'member';
  status: 'active' | 'pending_approval' | 'invited' | 'joined' | 'pending';
  invited_by?: string | null;
  joined_at: string;
  updated_at: string;
  profile?: {
    id: string;
    username: string;
    full_name?: string;
    avatar_config?: AvatarConfig;
    avatar_url?: string | null;
    bio?: string;
  };
}

export interface Community {
  id: string;
  name: string;
  slug?: string;
  description?: string | null;
  logo_url?: string | null;
  category: 'School' | 'University' | 'Gym' | 'Sports Club' | 'Organization' | 'General';
  created_by: string;
  member_count: number;
  created_at: string;
  updated_at: string;
  user_status?: 'leader' | 'admin' | 'member' | 'pending' | 'invited' | null;
  leader_profile?: {
    id: string;
    username: string;
    avatar_url?: string | null;
    avatar_config?: AvatarConfig;
  };
}

export interface UserCommunityStatus {
  hasCommunity: boolean;
  community: Community | null;
  membership: CommunityMember | null;
  pendingRequest: {
    community: Community;
    membership: CommunityMember;
  } | null;
}

/**
 * Fetch list of communities with search and category filtering
 */
export async function fetchCommunities(
  searchQuery?: string,
  category?: string
): Promise<Community[]> {
  try {
    let query = supabase
      .from('communities')
      .select('*')
      .order('member_count', { ascending: false });

    if (searchQuery && searchQuery.trim()) {
      query = query.ilike('name', `%${searchQuery.trim()}%`);
    }

    if (category && category !== 'All') {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('Error fetching communities:', error);
      return [];
    }

    return (data as Community[]) || [];
  } catch (err) {
    console.warn('Exception in fetchCommunities:', err);
    return [];
  }
}

/**
 * Fetch a user's current community membership & pending request
 */
export async function fetchUserCommunityStatus(userId: string): Promise<UserCommunityStatus> {
  const result: UserCommunityStatus = {
    hasCommunity: false,
    community: null,
    membership: null,
    pendingRequest: null,
  };

  if (!userId) return result;

  try {
    // Check joined/active/pending memberships
    const { data: memberData, error: memberError } = await supabase
      .from('community_members')
      .select(`
        *,
        community:communities(*)
      `)
      .eq('user_id', userId)
      .in('status', ['active', 'joined', 'pending_approval', 'pending', 'invited'])
      .maybeSingle();

    if (memberError) {
      console.warn('Error fetching user community:', memberError);
      return result;
    }

    if (!memberData) {
      return result;
    }

    const community = memberData.community as Community;

    if (memberData.status === 'active' || memberData.status === 'joined') {
      result.hasCommunity = true;
      result.community = community;
      result.membership = memberData as CommunityMember;
    } else if (
      memberData.status === 'pending_approval' ||
      memberData.status === 'pending' ||
      memberData.status === 'invited'
    ) {
      result.pendingRequest = {
        community,
        membership: memberData as CommunityMember,
      };
    }

    return result;
  } catch (err) {
    console.warn('Exception in fetchUserCommunityStatus:', err);
    return result;
  }
}

/**
 * Fetch all members of a community with profile details
 */
export async function fetchCommunityMembers(communityId: string): Promise<CommunityMember[]> {
  if (!communityId) return [];

  try {
    const { data, error } = await supabase
      .from('community_members')
      .select(`
        *,
        profile:profiles(id, username, full_name, avatar_config, avatar_url, bio)
      `)
      .eq('community_id', communityId)
      .order('joined_at', { ascending: true });

    if (error) {
      console.warn('Error fetching community members:', error);
      return [];
    }

    return (data as CommunityMember[]) || [];
  } catch (err) {
    console.warn('Exception in fetchCommunityMembers:', err);
    return [];
  }
}

/**
 * Create a new Community and automatically assign user as Leader
 */
export async function createCommunity(
  userId: string,
  name: string,
  category: string = 'School',
  description?: string,
  logoUrl?: string
): Promise<{ success: boolean; data?: Community; error?: string }> {
  if (!userId) return { success: false, error: 'User is required.' };
  if (!name || !name.trim()) return { success: false, error: 'Community name is required.' };

  try {
    const { data, error } = await supabase.rpc('create_community_with_leader', {
      p_name: name.trim(),
      p_category: category,
      p_description: description?.trim() || null,
      p_logo_url: logoUrl || null,
      p_user_id: userId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data && data.success === false) {
      return { success: false, error: data.error };
    }

    return { success: true, data: data?.community };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to create community.' };
  }
}

/**
 * Propose / Request to join a community
 */
export async function requestToJoinCommunity(
  communityId: string,
  userId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  if (!communityId || !userId) return { success: false, error: 'Invalid arguments.' };

  try {
    const { data, error } = await supabase.rpc('request_to_join_community', {
      p_community_id: communityId,
      p_user_id: userId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data && data.success === false) {
      return { success: false, error: data.error };
    }

    return { success: true, message: data?.message || 'Join request submitted!' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to request join.' };
  }
}

/**
 * Leader invites a user to the community using their username
 */
export async function inviteUserByUsername(
  communityId: string,
  leaderId: string,
  targetUsername: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  if (!communityId || !leaderId || !targetUsername?.trim()) {
    return { success: false, error: 'Username is required.' };
  }

  try {
    const { data, error } = await supabase.rpc('invite_user_to_community_by_username', {
      p_community_id: communityId,
      p_leader_id: leaderId,
      p_target_username: targetUsername.trim(),
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data && data.success === false) {
      return { success: false, error: data.error };
    }

    return { success: true, message: data?.message || 'Invitation sent!' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to invite user.' };
  }
}

/**
 * Leader accepts or rejects a user join proposal
 */
export async function reviewJoinProposal(
  communityId: string,
  leaderId: string,
  targetUserId: string,
  decision: 'accept' | 'reject'
): Promise<{ success: boolean; message?: string; error?: string }> {
  if (!communityId || !leaderId || !targetUserId) {
    return { success: false, error: 'Invalid arguments.' };
  }

  try {
    const { data, error } = await supabase.rpc('review_community_join_proposal', {
      p_community_id: communityId,
      p_leader_id: leaderId,
      p_target_user_id: targetUserId,
      p_decision: decision,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data && data.success === false) {
      return { success: false, error: data.error };
    }

    return { success: true, message: data?.message || `Proposal ${decision}ed successfully.` };
  } catch (err: any) {
    return { success: false, error: err?.message || `Failed to ${decision} proposal.` };
  }
}

/**
 * Leave a community or leader kicks a member
 */
export async function removeMember(
  communityId: string,
  requesterId: string,
  targetUserId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  if (!communityId || !requesterId || !targetUserId) {
    return { success: false, error: 'Invalid arguments.' };
  }

  try {
    const { data, error } = await supabase.rpc('remove_community_member', {
      p_community_id: communityId,
      p_requester_id: requesterId,
      p_target_user_id: targetUserId,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    if (data && data.success === false) {
      return { success: false, error: data.error };
    }

    return { success: true, message: data?.message || 'Member removed successfully.' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to remove member.' };
  }
}

/**
 * Cancel a user's own pending request to join
 */
export async function cancelJoinRequest(
  communityId: string,
  userId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('community_members')
      .delete()
      .eq('community_id', communityId)
      .eq('user_id', userId)
      .in('status', ['pending_approval', 'pending', 'invited']);

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to cancel request.' };
  }
}

/**
 * Upload a community logo (base64 image) to Supabase Storage
 */
export async function uploadCommunityLogo(
  communityId: string,
  base64Data: string,
  fileExt: string = 'jpg'
): Promise<{ url?: string; error?: string }> {
  try {
    const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const arrayBuffer = decode(cleanBase64);
    const fileName = `Communities/${communityId}_${Date.now()}.${fileExt}`;
    const contentType = fileExt === 'png' ? 'image/png' : 'image/jpeg';

    const { error: uploadError } = await supabase.storage
      .from('Images')
      .upload(fileName, arrayBuffer, {
        contentType,
        upsert: true,
      });

    if (uploadError) {
      return { error: uploadError.message };
    }

    const { data } = supabase.storage.from('Images').getPublicUrl(fileName);
    return { url: data.publicUrl };
  } catch (e: any) {
    return { error: e.message || 'Failed to upload logo' };
  }
}
