# ⚡ Ojas — AI Workout & Fitness Battles

Ojas is a smart fitness app that uses your phone camera to track your body movements in real time. It counts your reps, checks your workout posture, and lets you battle friends or AI in fun workout games.

---

![App Banner](https://placehold.co/1000x450/11141a/e25822?text=Ojas+App+Banner)

---

## 🌟 What You Can Do

### 1. 🤖 AI Workout Coach (Camera Tracking)
- Uses your phone camera to watch your form in real time.
- Automatically counts your reps as you exercise.
- Tells you if you need to go lower, straighten your back, or fix your posture.
- Everything runs on your phone, so your camera video stays 100% private.

![AI Camera Tracking](https://placehold.co/800x450/11141a/ffffff?text=AI+Camera+Tracking+%26+Rep+Counter)

---

### 2. 🦾 Human vs AI Duels
- Play a 2-minute workout match against an AI bot.
- Choose from 4 difficulty levels: **Beginner**, **Intermediate**, **Advanced**, and **Pro**.
- Watch the AI bot move and burn calories with you in real time.

![Human vs AI Match](https://placehold.co/800x450/11141a/ffffff?text=Human+vs+AI+Match+Screen)

---

### 3. 🔍 AI Posture & Body Check
- A quick 3-second camera scan.
- Checks if your shoulders, knees, and back are straight.
- Gives you helpful suggestions and exercises to improve your posture.

![AI Posture Check](https://placehold.co/800x450/11141a/ffffff?text=AI+Posture+%26+Body+Scan+Result)

---

### 4. ⚔️ Live 1v1 Multiplayer Battles
- Challenge your friends or join a quick match against real people.
- Both players see each other's live rep score and video.
- 2-minute timer to see who finishes more good reps.

![1v1 Multiplayer Battle](https://placehold.co/800x450/11141a/ffffff?text=Live+1v1+Multiplayer+Battle)

---

### 5. 👥 Friends & Daily Challenges
- Add friends and send instant match invites.
- Complete daily workout targets and earn points.
- Track your streak, calories burned, and total workouts.

![Home Screen & Friends](https://placehold.co/800x450/11141a/ffffff?text=Home+Feed+%26+Friends+Hub)

---

## 🏋️ Supported Exercises

- **Squats**: Tracks knee bending and full depth.
- **Push-ups**: Checks chest drop and arm push.
- **Lunges**: Checks front and back leg angles.
- **Crunches**: Counts clean stomach crunches without neck strain.
- **Triangle Pose (Trikonasana)**: Checks body stretch and balance hold.
- **Cobra Pose**: Checks chest lift and back stretch.
- **Child's Pose**: Relaxing rest pose with hold timer.

![Exercise Catalog](https://placehold.co/800x450/11141a/ffffff?text=Workout+Exercise+List)

---

## 🚀 How to Run the App

### 1. Requirements
- Node.js (version 18 or higher)
- npm or yarn
- Android phone or Android Studio emulator

### 2. Install Packages
```bash
npm install
```

### 3. Create .env File
Create a `.env` file in the main folder:
```env
EXPO_PUBLIC_BACKEND_URL=https://app.codequestpro.in
CLOUDFLARE_TUNNEL_TOKEN=your_token_here
```

### 4. Start the App
```bash
npx expo start
```

### 5. Run on Android
```bash
npx expo run:android
```

---

## 🛠️ Built With

| Part | Tool / Library |
|---|---|
| **App Framework** | React Native & Expo |
| **Language** | TypeScript |
| **AI Body Tracking** | MediaPipe Pose (runs on your phone) |
| **Database & Auth** | Supabase |
| **Live Match Server** | WebSockets |
| **Icons & Design** | Lucide Icons & Custom SVG Artwork |

---

## 📄 License
This project is licensed under the MIT License.
