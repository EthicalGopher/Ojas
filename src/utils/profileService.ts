import { supabase } from './supabase';
import { AvatarConfig, AvatarStyle } from '../components/Avatar';
import { generateRandomUsername } from './usernameGenerator';

export interface DailyCalorieLog {
  date: string; // YYYY-MM-DD
  calories: number;
  reps: number;
  matches: number;
}

export interface UserProfile {
  id: string;
  username: string;
  phone_number?: string;
  full_name?: string;
  avatar_config?: AvatarConfig;
  avatar_url?: string | null;
  bio?: string;
  fitness_goal?: string;
  admin?: boolean;
  is_admin?: boolean;
  daily_calories?: Record<string, DailyCalorieLog>; // e.g. { "2026-09-09": { date: "2026-09-09", calories: 45, reps: 120, matches: 4 } }
  total_calories?: number;
  has_knock_knees?: boolean;
  has_bow_legs?: boolean;
  has_flat_feet?: boolean;
  has_lower_back_pain?: boolean;
  has_rounded_shoulders?: boolean;
  health_conditions_completed?: boolean;
  health_conditions?: Record<string, boolean>;
  daily_challenges?: Record<string, { completedIds: string[]; progress: Record<string, { reps: number; holdSeconds: number }> }>;
  created_at?: string;
  updated_at?: string;
}

export const generateDefaultAvatar = (username: string, style: AvatarStyle = 'adventurer'): AvatarConfig => {
  return {
    seed: username.trim() || 'athlete',
    style,
  };
};

/**
 * Fetch a user's profile from the public.profiles table.
 * If the profile does not exist yet, creates and returns a default profile.
 */
export async function getOrCreateUserProfile(user: any): Promise<UserProfile> {
  if (!user?.id) {
    throw new Error('User ID is required');
  }

  const userMeta = user.user_metadata || {};
  
  // 1. Extract or generate username
  let defaultUsername = userMeta.username || userMeta.preferred_username || userMeta.user_name;
  if (!defaultUsername && userMeta.full_name) {
    defaultUsername = userMeta.full_name.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 20);
  }
  if (!defaultUsername && userMeta.name) {
    defaultUsername = userMeta.name.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 20);
  }
  if (!defaultUsername && user.email) {
    defaultUsername = user.email.split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 20);
  }
  if (!defaultUsername) {
    try {
      defaultUsername = await generateRandomUsername();
    } catch {
      defaultUsername = `athlete_${user.id.slice(0, 5)}`;
    }
  }

  // 2. Extract OAuth avatar URL (Google provides avatar_url or picture)
  const oauthAvatarUrl = userMeta.avatar_url || userMeta.picture || null;
  const fullName = userMeta.full_name || userMeta.name || '';
  const defaultAvatar = generateDefaultAvatar(defaultUsername);

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (!error && data) {
      // If row exists but is missing avatar_url and Google provides one, auto-update it
      if (!data.avatar_url && oauthAvatarUrl) {
        try {
          await supabase
            .from('profiles')
            .update({ avatar_url: oauthAvatarUrl, full_name: data.full_name || fullName })
            .eq('id', user.id);
          data.avatar_url = oauthAvatarUrl;
          if (!data.full_name && fullName) data.full_name = fullName;
        } catch (e) {
          console.warn('[profileService] auto-update avatar error:', e);
        }
      }

      return {
        ...data,
        admin: data.admin === true || data.is_admin === true || userMeta.admin === true || userMeta.is_admin === true,
        is_admin: data.admin === true || data.is_admin === true || userMeta.admin === true || userMeta.is_admin === true,
        daily_calories: data.daily_calories || userMeta.daily_calories || {},
        total_calories: data.total_calories !== undefined ? data.total_calories : (userMeta.total_calories || 0),
        has_knock_knees: data.has_knock_knees ?? userMeta.has_knock_knees ?? false,
        has_bow_legs: data.has_bow_legs ?? userMeta.has_bow_legs ?? false,
        has_flat_feet: data.has_flat_feet ?? userMeta.has_flat_feet ?? false,
        has_lower_back_pain: data.has_lower_back_pain ?? userMeta.has_lower_back_pain ?? false,
        has_rounded_shoulders: data.has_rounded_shoulders ?? userMeta.has_rounded_shoulders ?? false,
        health_conditions_completed: data.health_conditions_completed ?? userMeta.health_conditions_completed ?? false,
        health_conditions: data.health_conditions || userMeta.health_conditions || {},
        daily_challenges: data.daily_challenges || userMeta.daily_challenges || {},
        avatar_config: data.avatar_config && Object.keys(data.avatar_config).length > 0 ? data.avatar_config : defaultAvatar,
        avatar_url: data.avatar_url || oauthAvatarUrl || null,
      };
    }

    // Construct profile from Google / Auth metadata
    const initialProfile: UserProfile = {
      id: user.id,
      username: defaultUsername,
      phone_number: userMeta.phone_number || user.phone || '',
      full_name: fullName,
      avatar_config: userMeta.avatar_config || defaultAvatar,
      avatar_url: oauthAvatarUrl,
      bio: 'Ready to crush daily fitness milestones with Ojas! 🔥',
      fitness_goal: 'Strength & Stamina',
      admin: userMeta.admin === true || userMeta.is_admin === true,
      is_admin: userMeta.admin === true || userMeta.is_admin === true,
      daily_calories: userMeta.daily_calories || {},
      total_calories: userMeta.total_calories || 0,
      has_knock_knees: userMeta.has_knock_knees ?? false,
      has_bow_legs: userMeta.has_bow_legs ?? false,
      has_flat_feet: userMeta.has_flat_feet ?? false,
      has_lower_back_pain: userMeta.has_lower_back_pain ?? false,
      has_rounded_shoulders: userMeta.has_rounded_shoulders ?? false,
      health_conditions_completed: userMeta.health_conditions_completed ?? false,
      health_conditions: userMeta.health_conditions || {},
      daily_challenges: userMeta.daily_challenges || {},
    };

    // Try inserting into Supabase profiles table
    try {
      const { data: insertedData, error: insertError } = await supabase
        .from('profiles')
        .insert([initialProfile])
        .select()
        .single();

      if (!insertError && insertedData) {
        return insertedData;
      }
    } catch (e) {
      console.warn('Could not insert initial profile to Supabase table:', e);
    }

    return initialProfile;
  } catch (err) {
    console.error('Error fetching profile:', err);
    return {
      id: user.id,
      username: defaultUsername,
      phone_number: '',
      full_name: '',
      avatar_config: defaultAvatar,
      avatar_url: null,
      bio: 'Ready to crush daily fitness milestones with Ojas! 🔥',
      fitness_goal: 'Strength & Stamina',
    };
  }
}

/**
 * Uploads a profile picture to Supabase Storage (Bucket: "Images", Folder: "Profiles")
 * and updates public.profiles table with the public URL into avatar_url.
 */
export async function uploadUserProfilePhoto(userId: string, base64Image: string, fileExtension: string = 'jpg'): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    if (!userId || !base64Image) {
      return { success: false, error: 'User ID and image data are required' };
    }

    const fileName = `Profiles/${userId}_${Date.now()}.${fileExtension}`;
    const contentType = fileExtension === 'png' ? 'image/png' : 'image/jpeg';

    // Convert base64 to byte array buffer for Supabase storage upload
    const byteCharacters = atob(base64Image);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);

    // Primary bucket is 'Images', with fallback to case variants
    const candidateBuckets = ['Images', 'images', 'Image', 'avatars', 'public'];
    let lastError: any = null;
    let successfulBucket: string | null = null;

    for (const bucket of candidateBuckets) {
      try {
        const { error: uploadError } = await supabase.storage
          .from(bucket)
          .upload(fileName, byteArray, {
            contentType,
            upsert: true,
          });

        if (!uploadError) {
          successfulBucket = bucket;
          break;
        }

        lastError = uploadError;
        if (!uploadError.message?.toLowerCase().includes('not found') && !uploadError.message?.toLowerCase().includes('bucket')) {
          // If it's a permission or format error rather than missing bucket, don't keep cycling
          break;
        }
      } catch (err) {
        lastError = err;
      }
    }

    if (!successfulBucket) {
      console.error('[ProfileService] Supabase Storage upload error across buckets:', lastError);
      return {
        success: false,
        error: `Storage bucket error: ${lastError?.message || 'Bucket "Images" not found or permissions missing'}.`,
      };
    }

    // Get Public URL
    const { data: publicUrlData } = supabase.storage
      .from(successfulBucket)
      .getPublicUrl(fileName);

    const publicUrl = publicUrlData.publicUrl;

    // Update profiles table with new avatar_url
    const updateResult = await updateUserProfile(userId, {
      avatar_url: publicUrl,
    });

    if (!updateResult.success) {
      return { success: false, error: updateResult.error || 'Failed to link image URL to profile' };
    }

    return { success: true, url: publicUrl };
  } catch (e: any) {
    console.error('[ProfileService] uploadUserProfilePhoto exception:', e);
    return { success: false, error: e?.message || 'Error processing photo upload' };
  }
}

/**
 * Update an existing profile row in public.profiles.
 */
export async function updateUserProfile(
  userId: string,
  updates: Partial<UserProfile>
): Promise<{ success: boolean; data?: UserProfile; error?: string }> {
  try {
    const cleanUpdates: any = {
      ...updates,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('profiles')
      .update(cleanUpdates)
      .eq('id', userId)
      .select()
      .maybeSingle();

    if (error) {
      console.warn('[ProfileService] profiles table update warning:', error.message);
      // Fallback: sync to auth user_metadata
      await supabase.auth.updateUser({
        data: cleanUpdates,
      });
      return { success: true, data: { id: userId, ...cleanUpdates } as UserProfile };
    }

    // Also sync with auth metadata
    await supabase.auth.updateUser({
      data: cleanUpdates,
    });

    return { success: true, data: data || ({ id: userId, ...cleanUpdates } as UserProfile) };
  } catch (err: any) {
    console.error('Error updating profile:', err);
    return { success: false, error: err.message || 'Failed to update profile' };
  }
}

/**
 * Record burned calories by date in public.profiles table (daily_calories & total_calories).
 */
export async function recordCaloriesToProfile(
  userId: string,
  calories: number,
  reps: number = 0,
  dateStr?: string,
  isMatch: boolean = true
): Promise<{ success: boolean; dailyStats?: Record<string, DailyCalorieLog>; error?: string }> {
  if (!userId || userId === 'guest') return { success: false, error: 'Guest or invalid user' };

  try {
    const today = dateStr || new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    // Fetch current profile daily_calories
    const { data: profileData } = await supabase
      .from('profiles')
      .select('daily_calories, total_calories')
      .eq('id', userId)
      .maybeSingle();

    const currentDailyMap: Record<string, DailyCalorieLog> =
      (profileData?.daily_calories && typeof profileData.daily_calories === 'object')
        ? { ...profileData.daily_calories }
        : {};

    const existingToday = currentDailyMap[today] || {
      date: today,
      calories: 0,
      reps: 0,
      matches: 0,
    };

    const updatedToday: DailyCalorieLog = {
      date: today,
      calories: Math.round(((existingToday.calories || 0) + calories) * 10) / 10,
      reps: (existingToday.reps || 0) + reps,
      matches: isMatch ? (existingToday.matches || 0) + 1 : (existingToday.matches || 0),
    };

    currentDailyMap[today] = updatedToday;
    const newTotalCalories = Math.round(((profileData?.total_calories || 0) + calories) * 10) / 10;

    const updateRes = await updateUserProfile(userId, {
      daily_calories: currentDailyMap,
      total_calories: newTotalCalories,
    });

    if (!updateRes.success) {
      return { success: false, error: updateRes.error };
    }

    return { success: true, dailyStats: currentDailyMap };
  } catch (e: any) {
    console.warn('[ProfileService] Failed to record calories to profile:', e);
    return { success: false, error: e?.message || 'Error recording calories' };
  }
}

/**
 * Persist daily challenge completion and real-time exercise progress into public.profiles table.
 */
export async function recordDailyChallengeProgress(
  userId: string,
  exerciseId: string,
  reps: number,
  holdSeconds: number = 0,
  dateStr?: string
): Promise<{ success: boolean; error?: string }> {
  if (!userId || userId === 'guest') return { success: false, error: 'Guest or invalid user' };

  try {
    const today = dateStr || new Date().toISOString().split('T')[0];

    const { data: profileData } = await supabase
      .from('profiles')
      .select('daily_challenges')
      .eq('id', userId)
      .maybeSingle();

    const existingDailyChallenges: Record<string, any> =
      (profileData?.daily_challenges && typeof profileData.daily_challenges === 'object')
        ? { ...profileData.daily_challenges }
        : {};

    const todayEntry = existingDailyChallenges[today] || {
      completedIds: [],
      progress: {},
    };

    const exKey = String(exerciseId);
    const existingProgress = todayEntry.progress?.[exKey] || { reps: 0, holdSeconds: 0 };

    todayEntry.progress = {
      ...(todayEntry.progress || {}),
      [exKey]: {
        reps: Math.max(existingProgress.reps || 0, reps || 0),
        holdSeconds: Math.max(existingProgress.holdSeconds || 0, holdSeconds || 0),
      },
    };

    existingDailyChallenges[today] = todayEntry;

    await updateUserProfile(userId, {
      daily_challenges: existingDailyChallenges,
    });

    return { success: true };
  } catch (e: any) {
    console.warn('[ProfileService] Failed to record daily challenge progress:', e);
    return { success: false, error: e?.message || 'Error saving daily challenge' };
  }
}
