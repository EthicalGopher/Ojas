# ⚡ Ojas — Real-Time AI Fitness & Multiplayer Arena

Ojas is an AI-powered fitness and real-time multiplayer exercise duel mobile application built with **React Native (Expo SDK 57)**, **TypeScript**, **On-Device MediaPipe Pose Tracking**, **Supabase Realtime**, and **High-FPS GPU Canvas Video Streaming**.

---

## 🌟 Key Highlights & Current Features

- 🧠 **On-Device MediaPipe AI Form Analysis**: 33-point real-time 3D skeleton tracking and angle analysis directly on the device GPU (no cloud video upload latency, zero privacy concerns).
- ⚙️ **Multi-Model Device Adaptation**: Dynamic auto-detection of device specs (RAM/CPU) with selectable MediaPipe models (**Lite ~2.7MB**, **Full ~6.2MB**, **Heavy ~27MB**).
- 🏆 **Multiplayer Duel Modes**:
  - **1v1 Matchmaking (Faceoff & Quick Join)**: Real-time 2-minute duels with live score and video sync.
  - **10-Player Free For All (FFA) Arena**: High-energy group battles with real-time room status and countdown timers.
  - **Direct Friend Challenges**: Instant 0ms invite broadcast hub via Supabase Realtime channels.
- 📺 **Zero-Flicker GPU Canvas Video Streaming**: Custom HTML5 WebGL offscreen frame pipeline delivering continuous 25–30 FPS peer video streams without Android surface texture recreation flickering.
- 🎨 **Sleek Modern Design**: Modern Dark Slate (`#1A1C20`) aesthetic with vibrant Burnt Orange (`#E25822`) accents, clean typography, custom scalloped navigation dock, and smooth UI animations.
- 🛡️ **Biomechanical Exercise Engines**: Production-tested form evaluation for **Squats**, **Triangle Pose (Trikonasana)**, **Lunges**, **Crunches**, and **Sit-ups**.

---

## 🏗️ Architecture Overview

```
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                         Ojas Mobile App (React Native)                      │
 └──────┬──────────────────────┬────────────────────────┬──────────────────────┘
        │                      │                        │
        ▼                      ▼                        ▼
 ┌──────────────┐      ┌───────────────┐        ┌────────────────┐
 │ MediaPipe AI │      │   Supabase    │        │ WebSockets &   │
 │ WebGL Engine │      │ Realtime Hub  │        │ Matchmaking    │
 └──────┬───────┘      └───────┬───────┘        └────────┬───────┘
        │ (25-30 FPS)          │ (Live Broadcast & REST) │ (Match Rooms & Sync)
        ▼                      ▼                         ▼
 ┌──────────────┐      ┌───────────────┐        ┌────────────────┐
 │ Form Engines │      │ Friend Duels  │        │ 1v1 & FFA      │
 │ & Joint HUD  │      │ & Peer Frames │        │ Matchmaking    │
 └──────────────┘      └───────────────┘        └────────────────┘
```

---

## 🧠 Biomechanical Form Engines

### 1. 🏋️ Squats Engine
- **Angle Calculation**: Evaluates hip-to-knee-to-ankle vector trigonometry with rolling window smoothing (`SMOOTHING_WINDOW = 5`).
- **State Machine**:
  - `TOP` (Standing): Knee angle $\ge 155^\circ$
  - `DOWN` (Descending): Angle between $95^\circ$ and $155^\circ$
  - `BOTTOM` (Deep / Parallel): Knee angle $\le 95^\circ$
- **Validation**: Rep count is awarded only after completing a full cycle: `TOP` $\rightarrow$ `DOWN` $\rightarrow$ `BOTTOM` $\rightarrow$ `TOP`.

### 2. 📐 Triangle Pose (Trikonasana)
- **Rules**:
  - Front & rear knee extension $\ge 155^\circ$ (straight legs)
  - Top arm reach $\ge 135^\circ$ with extended elbow $\ge 150^\circ$
  - Lateral hip hinge with shoulder tilt $\ge 25^\circ$
  - Shoulder $Z$-depth divergence $\le 0.35$ to prevent forward collapse
- **Feedback**: Awards continuous points for maintaining perfect hold form in 3-second intervals.

### 3. 🦵 Lunges Engine
- **Rules**: Dynamically tracks lead vs. trailing leg, requiring front knee depth $\le 100^\circ$, back knee clearance $\le 115^\circ$, and vertical torso alignment ($\le 22^\circ$ deviation).

### 4. 🧘 Crunches & 💪 Sit-ups Engines
- **Rules**: Evaluates torso-to-floor inclination vectors:
  - **Crunches**: Flat base $\le 8^\circ$, apex shoulder elevation $\ge 22^\circ$, with an overlift guard ($> 42^\circ$) to isolate abdominal contraction.
  - **Sit-ups**: Full range from floor $\le 20^\circ$ to full seated upright apex $\ge 60^\circ$.

---

## ⚔️ Matchmaking & Live Duel Pipeline

1. **Persistent Hub Connection**: App joins the `custom_battles_hub` broadcast channel upon boot for immediate friend challenge delivery.
2. **Resource Synchronization**: Both peers confirm camera setup and model loading (`peer_ready`).
3. **20s Setup Countdown**: Allows athletes to position their phones and check their field of view.
4. **2-Minute Duel**: Real-time rep validation, HUD cues, and continuous score synchronization.
5. **Post-Match Settlement**: Secure server-validated results, XP awards, and ranking progression.

---

## 📁 Project Structure

```
sih_exercise/
├── android/                         # Android native project files & Gradle build configs
├── assets/
│   ├── adaptive-icon.png            # Android adaptive launcher icon
│   ├── icon.png                     # Standard app icon
│   ├── logo.svg                     # OJAS Radiance source logo
│   ├── splash.png                   # App splash screen asset
│   ├── Videoes/                     # Animations (loading_animation.gif, splash.gif)
│   └── models/                      # MediaPipe TFLite & WebAssembly assets
├── src/
│   ├── app/
│   │   └── AppShell.tsx             # Root container, orientation management & duel modal hub
│   ├── components/
│   │   ├── Avatar.tsx               # Customizable SVG/DiceBear athlete avatars
│   │   ├── Header.tsx               # Top header with profile greetings & status
│   │   ├── HomeScreen.tsx           # Home container, workout tabs & dev modals
│   │   └── TabBar.tsx               # Floating bottom navigation bar
│   ├── features/
│   │   ├── auth/                    # Supabase authentication modals & flows
│   │   ├── camera/
│   │   │   └── components/
│   │   │       └── CameraScreen.tsx # MediaPipe WebGL bundle & live pose tracking
│   │   └── match/
│   │       └── components/
│   │           └── MatchCameraScreen.tsx # 1v1 Split-screen arena & GPU canvas stream receiver
│   ├── screens/
│   │   ├── ExerciseDetailScreen.tsx # Exercise guides, rules, 1v1 queue cards & friend invites
│   │   ├── ExercisesScreen.tsx      # Workout category catalog & active queue athlete counters
│   │   ├── FFALoadingScreen.tsx     # 10-Player Free For All lobby waiting room
│   │   ├── GetStartedScreen.tsx     # Clean onboarding and authentication entry
│   │   ├── HomeFeedScreen.tsx       # Dynamic weekly calendar, featured routines & online athlete strip
│   │   ├── LoadingScreen.tsx        # Animated matchmaking screen with motivational quotes
│   │   └── ProfileScreen.tsx        # Athlete details, friend management & request hub
│   ├── store/
│   │   └── userStore.ts             # Zustand global state for active user & navigation
│   └── utils/
│       ├── customBattleService.ts   # Realtime 1v1 friend invite broadcast service
│       ├── deviceSpecs.ts           # Hardware auto-detection (RAM / model recommendations)
│       ├── exerciseService.ts       # Supabase exercise catalog with resilient REST fallback
│       ├── friendService.ts         # Social friends & friendship requests API
│       ├── matchmaking.ts           # WebSocket client for 1v1 and FFA match queues
│       ├── rankingService.ts        # ELO ratings, match results & leaderboard tiers
│       └── supabase.ts              # Supabase client configuration
├── app.json                         # Expo Application Configuration (slug: ojas)
├── eas.json                         # EAS Build configuration (preview APK & production)
├── package.json                     # Project scripts and dependencies
└── tsconfig.json                    # TypeScript compiler options
```

---

## ⚙️ Environment Setup & Installation

### 1. Prerequisites
- **Node.js**: v18 or higher
- **npm** or **yarn**
- **Android SDK & Command-Line Tools** (for local Android builds/emulators)
- **EAS CLI** (optional for cloud builds): `npm install -g eas-cli`

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Variables
Ensure a `.env` file exists in the root directory:
```env
EXPO_PUBLIC_BACKEND_URL=https://app.codequestpro.in
CLOUDFLARE_TUNNEL_TOKEN=your_tunnel_token
```

*(Supabase public configuration is automatically pre-configured in `src/utils/supabase.ts` with instant anonymous REST fallback).*

---

## 🚀 Running & Building the App

### Start Metro Bundler
```bash
npx expo start
```

### Run Locally on Android
```bash
npx expo run:android
```

### Build Preview APK via EAS
```bash
eas build --profile preview --platform android
```

---

## 🏆 Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | React Native 0.86.3 (Expo SDK 57) |
| **Language** | TypeScript |
| **AI / Computer Vision** | MediaPipe Pose (WebGL / WebAssembly 33-point tracking) |
| **Backend & Realtime** | Supabase (Postgres, Auth, Realtime Broadcast) |
| **Multiplayer / Matchmaking** | WebSocket Match Server (`app.codequestpro.in`) |
| **Video Streaming** | Offscreen HTML5 Canvas Frame Capture & GPU Buffer Rendering |
| **State Management** | Zustand |
| **Icons & Design** | Lucide React Native, Custom SVG Vector Artwork |

---

## 📄 License
This project is licensed under the MIT License.
