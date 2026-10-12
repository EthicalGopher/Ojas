import { supabase } from './supabase';
import { AvatarConfig } from '../components/Avatar';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type BattleMode = 'faceoff' | 'quickjoin';

export interface BattleInvite {
  id: string;
  senderId: string;
  senderUsername: string;
  senderAvatar?: AvatarConfig;
  receiverId: string;
  receiverUsername: string;
  exerciseId: string;
  exerciseName: string;
  mode: BattleMode;
  createdAt: number;
  matchRoomId?: string;
}

type InviteCallback = (invite: BattleInvite) => void;
type ResponseCallback = (data: {
  inviteId: string;
  accepted: boolean;
  matchRoomId?: string;
  opponentUsername?: string;
  mode?: BattleMode;
  exerciseId?: string;
}) => void;

let battleHubChannel: RealtimeChannel | null = null;
let currentSubscribedUserId: string | null = null;
const inviteListeners: InviteCallback[] = [];
const responseListeners: ResponseCallback[] = [];

/**
 * Initializes and subscribes to the shared Realtime battle hub for the user.
 */
export function initBattleChannel(
  userId: string,
  onInvite?: InviteCallback,
  onResponse?: ResponseCallback
) {
  if (onInvite && !inviteListeners.includes(onInvite)) {
    inviteListeners.push(onInvite);
  }
  if (onResponse && !responseListeners.includes(onResponse)) {
    responseListeners.push(onResponse);
  }

  currentSubscribedUserId = userId;

  if (!battleHubChannel) {
    battleHubChannel = supabase.channel('custom_battles_hub', {
      config: {
        broadcast: { ack: true, self: false },
      },
    });

    battleHubChannel
      .on('broadcast', { event: 'custom_battle_invite' }, ({ payload }: { payload: BattleInvite }) => {
        if (
          payload &&
          currentSubscribedUserId &&
          payload.receiverId === currentSubscribedUserId
        ) {
          inviteListeners.forEach((cb) => {
            try {
              cb(payload);
            } catch (e) {
              console.warn('[BattleHub] error in invite callback:', e);
            }
          });
        }
      })
      .on('broadcast', { event: 'custom_battle_response' }, ({ payload }: any) => {
        if (
          payload &&
          currentSubscribedUserId &&
          (payload.senderId === currentSubscribedUserId || payload.receiverId === currentSubscribedUserId)
        ) {
          responseListeners.forEach((cb) => {
            try {
              cb(payload);
            } catch (e) {
              console.warn('[BattleHub] error in response callback:', e);
            }
          });
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[BattleHub] Subscribed to custom_battles_hub');
        }
      });
  }

  return () => {
    if (onInvite) {
      const idx = inviteListeners.indexOf(onInvite);
      if (idx !== -1) inviteListeners.splice(idx, 1);
    }
    if (onResponse) {
      const idx = responseListeners.indexOf(onResponse);
      if (idx !== -1) responseListeners.splice(idx, 1);
    }
  };
}

/**
 * Sends a custom 1v1 battle challenge to a specific friend.
 */
export async function sendCustomBattleInvite(
  sender: { id: string; username: string; avatar_config?: AvatarConfig },
  receiver: { id: string; username: string },
  exerciseId: string,
  exerciseName: string,
  mode: BattleMode = 'quickjoin'
): Promise<BattleInvite> {
  const randomHex = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
  const invite: BattleInvite = {
    id: `invite_${Date.now()}_${randomHex.substring(0, 8)}`,
    senderId: sender.id,
    senderUsername: sender.username,
    senderAvatar: sender.avatar_config,
    receiverId: receiver.id,
    receiverUsername: receiver.username,
    exerciseId,
    exerciseName,
    mode,
    createdAt: Date.now(),
    matchRoomId: `room_${randomHex}`,
  };

  // Ensure channel is ready
  if (!battleHubChannel) {
    initBattleChannel(sender.id);
  }

  if (battleHubChannel) {
    await battleHubChannel.send({
      type: 'broadcast',
      event: 'custom_battle_invite',
      payload: invite,
    });
  }

  return invite;
}

/**
 * Accepts an incoming custom battle challenge.
 */
export async function acceptCustomBattleInvite(
  invite: BattleInvite,
  currentUsername: string
) {
  const matchRoomId =
    invite.matchRoomId || `room_${Math.random().toString(36).substring(2, 12)}`;

  const payload = {
    inviteId: invite.id,
    accepted: true,
    matchRoomId,
    opponentUsername: currentUsername,
    mode: invite.mode,
    exerciseId: invite.exerciseId,
    senderId: invite.senderId,
    receiverId: invite.receiverId,
  };

  if (!battleHubChannel) {
    initBattleChannel(invite.receiverId);
  }

  if (battleHubChannel) {
    await battleHubChannel.send({
      type: 'broadcast',
      event: 'custom_battle_response',
      payload,
    });
  }

  return matchRoomId;
}

/**
 * Declines an incoming custom battle challenge.
 */
export async function declineCustomBattleInvite(invite: BattleInvite) {
  const payload = {
    inviteId: invite.id,
    accepted: false,
    senderId: invite.senderId,
    receiverId: invite.receiverId,
  };

  if (!battleHubChannel) {
    initBattleChannel(invite.receiverId);
  }

  if (battleHubChannel) {
    await battleHubChannel.send({
      type: 'broadcast',
      event: 'custom_battle_response',
      payload,
    });
  }
}
