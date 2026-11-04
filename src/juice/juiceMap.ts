import type { HapticKind, JuiceEvent, JuiceGroup, MusicTrack } from './juiceLogic';

export interface JuiceSpec {
  sfx: number;
  volume: number;
  haptic?: HapticKind;
  group: JuiceGroup;
}

// Design 3.4 table. File names must stay in AUDIO_FILES (src/legal/audioCredits.ts); juice-test checks it.
export const JUICE_MAP: Record<JuiceEvent, JuiceSpec> = {
  tap: { sfx: require('../../assets/audio/sfx/tap.mp3'), volume: 0.5, haptic: 'selection', group: 'ui' },
  toggle: { sfx: require('../../assets/audio/sfx/toggle.mp3'), volume: 0.5, haptic: 'selection', group: 'ui' },
  ready: { sfx: require('../../assets/audio/sfx/ready.mp3'), volume: 0.8, group: 'match' },
  fight: { sfx: require('../../assets/audio/sfx/fight.mp3'), volume: 1.0, group: 'match' },
  rep: { sfx: require('../../assets/audio/sfx/rep.mp3'), volume: 0.9, haptic: 'light', group: 'match' },
  hold_mark: { sfx: require('../../assets/audio/sfx/hold_mark.mp3'), volume: 0.9, group: 'match' },
  rival_rep: { sfx: require('../../assets/audio/sfx/rival_rep.mp3'), volume: 0.45, group: 'match' },
  combo: { sfx: require('../../assets/audio/sfx/combo.mp3'), volume: 1.0, group: 'match' },
  lead_take: { sfx: require('../../assets/audio/sfx/lead_take.mp3'), volume: 1.0, group: 'match' },
  lead_lost: { sfx: require('../../assets/audio/sfx/lead_lost.mp3'), volume: 0.8, group: 'match' },
  tick: { sfx: require('../../assets/audio/sfx/tick.mp3'), volume: 0.7, group: 'match' },
  win: { sfx: require('../../assets/audio/sfx/win.mp3'), volume: 1.0, haptic: 'success', group: 'match' },
  lose: { sfx: require('../../assets/audio/sfx/lose.mp3'), volume: 0.9, haptic: 'warning', group: 'match' },
  draw: { sfx: require('../../assets/audio/sfx/draw.mp3'), volume: 0.9, group: 'match' },
  rank_up: { sfx: require('../../assets/audio/sfx/rank_up.mp3'), volume: 1.0, haptic: 'success', group: 'match' },
  level_up: { sfx: require('../../assets/audio/sfx/level_up.mp3'), volume: 1.0, haptic: 'success', group: 'ui' },
  quest_done: { sfx: require('../../assets/audio/sfx/quest_done.mp3'), volume: 0.9, haptic: 'success', group: 'ui' },
};

export const MUSIC_FILES: Record<MusicTrack, number> = {
  menu: require('../../assets/audio/music/menu_loop.mp3'),
  match: require('../../assets/audio/music/match_loop.mp3'),
};
