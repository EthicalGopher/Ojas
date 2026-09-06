import os
import base64
import cv2
import numpy as np
import time
import json
import uuid
import asyncio
from dotenv import load_dotenv

# Load environment variables from root directory .env
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
load_dotenv(os.path.join(ROOT_DIR, ".env"))
load_dotenv(os.path.join(BASE_DIR, ".env"))
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

app = FastAPI(title="MediaPipe Real-Time Pose & Static Model Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_ngrok_header(request, call_next):
    response = await call_next(request)
    response.headers["ngrok-skip-browser-warning"] = "true"
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static") if os.path.exists(os.path.join(BASE_DIR, "static")) else os.path.abspath("static")

if os.path.exists(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Initialize MediaPipe PoseLandmarker
base_options = python.BaseOptions(model_asset_path=os.path.join(BASE_DIR, 'pose_landmarker_lite.task') if os.path.exists(os.path.join(BASE_DIR, 'pose_landmarker_lite.task')) else 'pose_landmarker_lite.task')
options = vision.PoseLandmarkerOptions(
    base_options=base_options,
    running_mode=vision.RunningMode.IMAGE,
    num_poses=1,
    min_pose_detection_confidence=0.3,
    min_pose_presence_confidence=0.3,
    min_tracking_confidence=0.3,
)
landmarker = vision.PoseLandmarker.create_from_options(options)

POSE_CONNECTIONS = [
    (0, 1), (1, 2), (2, 3), (3, 7), (0, 4), (4, 5), (5, 6), (6, 8), (9, 10),
    (11, 12), (11, 13), (13, 15), (15, 17), (15, 19), (15, 21), (17, 19),
    (12, 14), (14, 16), (16, 18), (16, 20), (16, 22), (18, 20),
    (11, 23), (12, 24), (23, 24), (23, 25), (24, 26), (25, 27), (26, 28),
    (27, 29), (28, 30), (29, 31), (30, 32), (27, 31), (28, 32)
]

from fastapi.responses import FileResponse

@app.get("/")
@app.get("//")
@app.get("/pose")
@app.get("//pose")
@app.get("/pose.html")
@app.get("//pose.html")
@app.get("/camera")
@app.get("//camera")
def get_pose_page():
    pose_file = os.path.join(STATIC_DIR, "pose.html")
    if os.path.exists(pose_file):
        return FileResponse(pose_file)
    return {"status": "ok", "message": "MediaPipe Pose Server Active"}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("⚡ Real-time client connected to pose WebSocket server")
    
    fps_counter = 0
    start_time = time.time()
    
    try:
        while True:
            data = await websocket.receive_text()
            if "," in data:
                data = data.split(",", 1)[1]
                
            img_bytes = base64.b64decode(data)
            np_arr = np.frombuffer(img_bytes, np.uint8)
            frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

            if frame is None:
                await websocket.send_json({"detected": False, "error": "Invalid frame"})
                continue

            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)

            result = landmarker.detect(mp_image)

            fps_counter += 1
            now = time.time()
            elapsed = now - start_time
            current_fps = round(fps_counter / elapsed, 1) if elapsed > 0 else 0.0

            landmarks_list = []
            if result.pose_landmarks and len(result.pose_landmarks) > 0:
                for lm in result.pose_landmarks[0]:
                    landmarks_list.append({
                        "x": float(lm.x),
                        "y": float(lm.y),
                        "z": float(lm.z),
                        "visibility": float(lm.visibility) if hasattr(lm, 'visibility') and lm.visibility is not None else 1.0
                    })

                print(f"🧍 Frame #{fps_counter} | Pose DETECTED ({len(landmarks_list)} joints) | {current_fps} FPS", end="\r")
                await websocket.send_json({
                    "detected": True,
                    "landmarks": landmarks_list,
                    "fps": current_fps,
                    "connections": POSE_CONNECTIONS,
                })
            else:
                print(f"🔍 Frame #{fps_counter} | No person detected | {current_fps} FPS", end="\r")
                await websocket.send_json({
                    "detected": False,
                    "landmarks": [],
                    "fps": current_fps,
                    "connections": POSE_CONNECTIONS,
                })

    except WebSocketDisconnect:
        print("\nClient disconnected")
    except Exception as e:
        print(f"\nError processing frame: {e}")

# ============= MATCHMAKING & CONNECTION SYSTEM =============

MATCH_DURATION = 120  # Authoritative 2-minute match duration in seconds

class ConnectionManager:
    def __init__(self):
        # user_id -> WebSocket
        self.active_connections: dict[str, WebSocket] = {}

    def register(self, user_id: str, ws: WebSocket):
        self.active_connections[user_id] = ws

    def unregister(self, user_id: str, ws: WebSocket | None = None):
        if ws is None:
            self.active_connections.pop(user_id, None)
        else:
            if self.active_connections.get(user_id) is ws:
                self.active_connections.pop(user_id, None)

    def get(self, user_id: str) -> WebSocket | None:
        return self.active_connections.get(user_id)


class MatchmakingManager:
    def __init__(self, connection_mgr: ConnectionManager):
        self.connection_mgr = connection_mgr
        # Global sequential match / room counter for incremental room IDs
        self.match_counter: int = 0
        # exercise_id -> list of user_ids waiting in queue (1v1)
        self.queues: dict[str, list[str]] = {}
        # Set of all user IDs currently in any matchmaking queue
        self.queued_users: set[str] = set()
        # match_id -> Authoritative Match State (supports 1v1 and FFA multi-player)
        self.matches: dict[str, dict] = {}
        # player_id (user_id) -> match_id mapping for active games
        self.player_matches: dict[str, str] = {}
        # FFA Lobbies: exercise_id -> dict of lobby state
        # { "match_id": str, "players": list[str], "scores": dict[str, int], "start_time": float, "task": Task | None }
        self.ffa_lobbies: dict[str, dict] = {}
        # unique_username -> count of active presence sockets (deduplicates multi-tabs/reconnects)
        self.online_users: dict[str, int] = {}
        # exercise_id -> count of players currently waiting
        self.exercise_counts: dict[str, int] = {}
        # Connected presence websockets for broadcasting live count updates
        self.presence_sockets: set[WebSocket] = set()

    def generate_match_room(self, exercise_id: str, mode: str = "1v1") -> tuple[str, str, int]:
        """Generates an incremental room number and room ID for transparent synchronization."""
        self.match_counter += 1
        room_num = self.match_counter
        clean_ex = str(exercise_id).strip()
        room_id = f"{clean_ex}_room_{room_num}"
        match_id = room_id
        return match_id, room_id, room_num

    def normalize_username(self, user_id: str) -> str:
        """Extracts clean unique username to deduplicate multiple connections from same user."""
        if not user_id:
            return "anonymous"
        clean = str(user_id).strip().lower()
        if clean.startswith("anon_") or clean.startswith("player_"):
            return clean
        return clean

    async def add_presence(self, user_id: str, ws: WebSocket | None = None):
        uname = self.normalize_username(user_id)
        self.online_users[uname] = self.online_users.get(uname, 0) + 1
        if ws:
            self.presence_sockets.add(ws)
        print(f"🟢 User '{uname}' connected to presence (active sessions: {self.online_users[uname]}, total unique online: {len(self.online_users)})")
        await self.broadcast_online_count()

    async def remove_presence(self, user_id: str, ws: WebSocket | None = None):
        uname = self.normalize_username(user_id)
        if uname in self.online_users:
            self.online_users[uname] -= 1
            if self.online_users[uname] <= 0:
                del self.online_users[uname]
        if ws:
            self.presence_sockets.discard(ws)
        print(f"🔴 User '{uname}' disconnected from presence (total unique online: {len(self.online_users)})")
        await self.broadcast_online_count()

    async def broadcast_online_count(self):
        """Broadcasts authoritative unique online user count to all active presence listeners."""
        counts = self.get_counts()
        payload = json.dumps({"type": "online", "total": counts["total_online"], "exercise_counts": counts["exercise_counts"]})
        dead_sockets = []
        for s in list(self.presence_sockets):
            try:
                await s.send_text(payload)
            except Exception:
                dead_sockets.append(s)
        for d in dead_sockets:
            self.presence_sockets.discard(d)

    def get_counts(self):
        # Unique online presence union (presence users + active game connection users deduplicated by username)
        active_match_users = {self.normalize_username(u) for u in self.connection_mgr.active_connections.keys()}
        unique_online = set(self.online_users.keys()).union(active_match_users)
        return {
            "total_online": len(unique_online),
            "exercise_counts": dict(self.exercise_counts),
        }

    async def join_ffa_lobby(self, user_id: str, exercise_id: str):
        """Adds player to a Free-for-All (FFA) lobby up to 10 players with a 30s countdown timer."""
        clean_raw = str(exercise_id or "1").strip().lower()
        if not clean_raw.endswith("_ffa"):
            clean_ex_key = f"{clean_raw}_ffa"
        else:
            clean_ex_key = clean_raw

        self.leave_queue(user_id)
        self.player_matches.pop(user_id, None)

        # 1. First check: Is there an existing active lobby in waiting state for this exercise?
        lobby = self.ffa_lobbies.get(clean_ex_key)
        if not lobby or lobby.get("status") != "waiting":
            # Search across any waiting lobbies for matching exercise prefix (e.g. '1' or 'squats')
            base_id = clean_ex_key.replace("_ffa", "")
            for key, existing in list(self.ffa_lobbies.items()):
                if existing.get("status") == "waiting" and (key == clean_ex_key or key.replace("_ffa", "") == base_id):
                    lobby = existing
                    clean_ex_key = key
                    break

        if lobby and lobby.get("status") == "waiting":
            # Join existing active lobby!
            # Clean up dead sockets from lobby first
            live_players = [p for p in lobby["players"] if self.connection_mgr.get(p) is not None and p != user_id]
            live_players.append(user_id)
            lobby["players"] = live_players
            lobby["scores"][user_id] = 0
            print(f"👥 '{user_id}' joined existing FFA Lobby #{lobby.get('room_id', lobby['match_id'])} (Room #{lobby.get('room_number', 1)}) for '{clean_ex_key}' ({len(lobby['players'])}/10 players, {lobby.get('countdown', 30)}s remaining)")

            # If 10 players reached, start immediately
            if len(lobby["players"]) >= 10:
                if lobby.get("task"):
                    lobby["task"].cancel()
                await self.start_ffa_match(clean_ex_key, lobby["match_id"])
                return
        else:
            # No existing waiting lobby found -> Create new lobby and start 30s countdown timer
            match_id, room_id, room_num = self.generate_match_room(clean_ex_key, mode="ffa")
            lobby = {
                "match_id": match_id,
                "room_id": room_id,
                "room_number": room_num,
                "exercise_id": clean_ex_key,
                "mode": "ffa",
                "players": [user_id],
                "scores": {user_id: 0},
                "status": "waiting",
                "countdown": 30,
                "created_at": time.time(),
            }
            self.ffa_lobbies[clean_ex_key] = lobby
            print(f"👑 Created new FFA Lobby #{room_id} (Room #{room_num}) for '{clean_ex_key}' initiated by '{user_id}' (30s timer started)")

            # Start 30s countdown background task
            async def ffa_countdown_task(ex_id: str, m_id: str):
                for remaining in range(30, 0, -1):
                    await asyncio.sleep(1)
                    curr_lobby = self.ffa_lobbies.get(ex_id)
                    if not curr_lobby or curr_lobby.get("match_id") != m_id or curr_lobby.get("status") != "waiting":
                        return
                    curr_lobby["countdown"] = remaining - 1
                    # Broadcast lobby status to all joined players
                    await self.broadcast_ffa_lobby_update(ex_id)

                # Start the FFA match after 30 seconds
                await self.start_ffa_match(ex_id, m_id)

            lobby["task"] = asyncio.create_task(ffa_countdown_task(clean_ex_key, match_id))

        # Broadcast update to everyone in this FFA lobby immediately
        await self.broadcast_ffa_lobby_update(clean_ex_key)

    async def broadcast_ffa_lobby_update(self, exercise_id: str):
        clean_ex_key = str(exercise_id).strip()
        lobby = self.ffa_lobbies.get(clean_ex_key)
        if not lobby:
            return
        payload = json.dumps({
            "type": "ffa_lobby_update",
            "match_id": lobby["match_id"],
            "room_id": lobby.get("room_id", lobby["match_id"]),
            "room_number": lobby.get("room_number", 1),
            "exercise_id": clean_ex_key,
            "players": lobby["players"],
            "player_count": len(lobby["players"]),
            "countdown": lobby.get("countdown", 30),
            "status": lobby.get("status", "waiting"),
        })
        for pid in list(lobby["players"]):
            p_ws = self.connection_mgr.get(pid)
            if p_ws:
                try:
                    await p_ws.send_text(payload)
                except Exception:
                    pass

    async def start_ffa_match(self, exercise_id: str, match_id: str):
        lobby = self.ffa_lobbies.get(exercise_id)
        if not lobby or lobby.get("match_id") != match_id:
            return

        now = time.time()
        # Filter live players only
        players = [p for p in lobby["players"] if self.connection_mgr.get(p) is not None]
        if not players:
            self.ffa_lobbies.pop(exercise_id, None)
            return

        room_id = lobby.get("room_id", match_id)
        room_number = lobby.get("room_number", 1)

        # Store in matches dictionary with authoritative timing
        match_obj = {
            "match_id": match_id,
            "room_id": room_id,
            "room_number": room_number,
            "exercise_id": exercise_id,
            "mode": "ffa",
            "players": players,
            "ready_players": set(),
            "scores": {p: 0 for p in players},
            "status": "waiting",  # Transitions to in_progress once ready or timer fires
            "created_at": now,
            "started_at": now,
            "ends_at": now + MATCH_DURATION + 30,  # 30s setup + 120s match
        }
        self.matches[match_id] = match_obj

        # Map each player to this match_id
        for p in players:
            self.player_matches[p] = match_id

        # Notify all players that FFA game lobby has matched
        start_payload = json.dumps({
            "type": "ffa_matched",
            "match_id": match_id,
            "room_id": room_id,
            "room_number": room_number,
            "exercise_id": exercise_id,
            "mode": "ffa",
            "players": players,
            "player_count": len(players),
        })

        for p in players:
            p_ws = self.connection_mgr.get(p)
            if p_ws:
                try:
                    await p_ws.send_text(start_payload)
                except Exception:
                    pass

        # Clear FFA waiting lobby for next queue
        if self.ffa_lobbies.get(exercise_id, {}).get("match_id") == match_id:
            del self.ffa_lobbies[exercise_id]

        print(f"🚀 FFA Match #{room_id} (Room #{room_number}) officially started for '{exercise_id}' with {len(players)} athletes: {players}")

        # Start authoritative server-side match timer task for FFA
        async def ffa_timer_task(m_id: str):
            await asyncio.sleep(MATCH_DURATION + 35)
            m = self.get_match(m_id)
            if m and m.get("status") in ("waiting", "ready", "in_progress"):
                await self.finish_ffa_match(m_id)

        match_obj["timer_task"] = asyncio.create_task(ffa_timer_task(match_id))

    async def finish_ffa_match(self, match_id: str):
        """Authoritatively ends an FFA match from server side and broadcasts results."""
        match = self.get_match(match_id)
        if not match or match.get("status") == "completed":
            return

        match["status"] = "completed"
        leaderboard = [
            {"username": pid, "score": sc}
            for pid, sc in match["scores"].items()
        ]
        leaderboard.sort(key=lambda x: x["score"], reverse=True)

        end_payload = json.dumps({
            "type": "ffa_game_end",
            "match_id": match_id,
            "leaderboard": leaderboard,
            "sender": "server",
        })

        for pid in match.get("players", []):
            p_ws = self.connection_mgr.get(pid)
            if p_ws:
                try:
                    await p_ws.send_text(end_payload)
                except Exception:
                    pass

        async def delayed_ffa_cleanup(m_id: str):
            await asyncio.sleep(60)
            m = self.get_match(m_id)
            if m and m.get("status") == "completed":
                await self.remove_match(m_id, reason="ffa_completed")

        asyncio.create_task(delayed_ffa_cleanup(match_id))

    async def finish_1v1_match(self, match_id: str):
        """Authoritatively ends a 1v1 match from server side and broadcasts final scores."""
        match = self.get_match(match_id)
        if not match or match.get("status") == "completed":
            return

        match["status"] = "completed"
        p1_id = match.get("player1_id")
        p2_id = match.get("player2_id")
        final_p1_score = match.get("player1_score", 0)
        final_p2_score = match.get("player2_score", 0)

        end_payload = json.dumps({
            "type": "game_end",
            "match_id": match_id,
            "player1_score": final_p1_score,
            "player2_score": final_p2_score,
            "sender": "server",
        })

        for pid in (p1_id, p2_id):
            if pid:
                p_ws = self.connection_mgr.get(pid)
                if p_ws:
                    try:
                        await p_ws.send_text(end_payload)
                    except Exception:
                        pass

        async def delayed_1v1_cleanup(m_id: str):
            await asyncio.sleep(60)
            m = self.get_match(m_id)
            if m and m.get("status") == "completed":
                await self.remove_match(m_id, reason="match_completed")

        asyncio.create_task(delayed_1v1_cleanup(match_id))

    def join_queue(self, user_id: str, exercise_id: str):
        """Adds a player to a standard 1v1 queue. If 2 live players are present, creates a new unique incremental match."""
        self.leave_queue(user_id)
        self.player_matches.pop(user_id, None)

        clean_ex = str(exercise_id).strip()
        queue = self.queues.setdefault(clean_ex, [])

        # Filter out dead / disconnected sockets before adding
        active_queue = []
        for uid in queue:
            if uid != user_id and self.connection_mgr.get(uid) is not None:
                active_queue.append(uid)
        active_queue.append(user_id)
        self.queues[clean_ex] = active_queue
        self.queued_users.add(user_id)
        self.exercise_counts[clean_ex] = len(active_queue)
        print(f"👤 {user_id} joined queue for exercise '{clean_ex}' (active queue length: {len(active_queue)})")

        while len(self.queues[clean_ex]) >= 2:
            p1_id = self.queues[clean_ex].pop(0)
            p1_ws = self.connection_mgr.get(p1_id)
            if not p1_ws:
                self.queued_users.discard(p1_id)
                continue

            p2_id = self.queues[clean_ex].pop(0)
            p2_ws = self.connection_mgr.get(p2_id)
            if not p2_ws:
                self.queued_users.discard(p2_id)
                self.queues[clean_ex].insert(0, p1_id)
                continue

            self.queued_users.discard(p1_id)
            self.queued_users.discard(p2_id)
            self.exercise_counts[clean_ex] = len(self.queues[clean_ex])

            match_id, room_id, room_num = self.generate_match_room(clean_ex, mode="1v1")
            now = time.time()

            # Authoritative match state with proper lifecycle and timing
            match_obj = {
                "match_id": match_id,
                "room_id": room_id,
                "room_number": room_num,
                "exercise_id": clean_ex,
                "mode": "1v1",
                "player1_id": p1_id,
                "player2_id": p2_id,
                "player1_score": 0,
                "player2_score": 0,
                "player1_ready": False,
                "player2_ready": False,
                "status": "waiting",  # waiting -> in_progress (on ready) -> completed
                "created_at": now,
                "started_at": now,
                "ends_at": now + MATCH_DURATION + 30,  # 30s setup + 120s match
                "rematch_votes": set(),
                "last_update_p1": now,
                "last_update_p2": now,
            }
            self.matches[match_id] = match_obj

            # Map both players to this match_id
            self.player_matches[p1_id] = match_id
            self.player_matches[p2_id] = match_id

            # Start authoritative server-side match timer task for 1v1
            async def match_timer_task(m_id: str):
                await asyncio.sleep(MATCH_DURATION + 35)
                m = self.get_match(m_id)
                if m and m.get("status") in ("waiting", "ready", "in_progress"):
                    await self.finish_1v1_match(m_id)

            match_obj["timer_task"] = asyncio.create_task(match_timer_task(match_id))

            print(f"🔗 Authoritative Match #{room_id} (Room #{room_num}) created for '{clean_ex}' between {p1_id} and {p2_id}")
            return match_id, p1_id, p2_id, room_id, room_num

        return None, None, None, None, None

    def get_match_id(self, user_id: str) -> str | None:
        """Retrieves match_id for a player dynamically, resolving Player 1 and Player 2 alike."""
        return self.player_matches.get(user_id)

    def get_match(self, match_id: str) -> dict | None:
        return self.matches.get(match_id)

    def leave_queue(self, user_id: str, exercise_id: str | None = None):
        """Removes user from matchmaking queue only (does not touch active matches)."""
        self.queued_users.discard(user_id)
        if exercise_id:
            clean_ex = str(exercise_id).strip()
            q = self.queues.get(clean_ex, [])
            self.queues[clean_ex] = [u for u in q if u != user_id]
            self.exercise_counts[clean_ex] = len(self.queues[clean_ex])
            # Also remove from waiting FFA lobby if applicable
            ffa = self.ffa_lobbies.get(clean_ex)
            if ffa and user_id in ffa.get("players", []):
                ffa["players"] = [p for p in ffa["players"] if p != user_id]
                ffa.get("scores", {}).pop(user_id, None)
                if not ffa["players"]:
                    if ffa.get("task"):
                        ffa["task"].cancel()
                    self.ffa_lobbies.pop(clean_ex, None)
        else:
            for ex_id, q in list(self.queues.items()):
                self.queues[ex_id] = [u for u in q if u != user_id]
                self.exercise_counts[ex_id] = len(self.queues[ex_id])
            for ex_id, ffa in list(self.ffa_lobbies.items()):
                if user_id in ffa.get("players", []):
                    ffa["players"] = [p for p in ffa["players"] if p != user_id]
                    ffa.get("scores", {}).pop(user_id, None)
                    if not ffa["players"]:
                        if ffa.get("task"):
                            ffa["task"].cancel()
                        self.ffa_lobbies.pop(ex_id, None)

    async def remove_match(self, match_id: str, reason: str = "ended", leaving_user_id: str | None = None):
        """Dedicated cleanup for active matches (both 1v1 and FFA)."""
        match = self.matches.pop(match_id, None)
        if not match:
            return

        is_ffa = match.get("mode") == "ffa"

        if is_ffa:
            players = match.get("players", [])
            for p in players:
                self.player_matches.pop(p, None)
                if p != leaving_user_id:
                    p_ws = self.connection_mgr.get(p)
                    if p_ws:
                        try:
                            await p_ws.send_text(json.dumps({
                                "type": "player_left_ffa",
                                "match_id": match_id,
                                "sender": leaving_user_id or "system",
                                "players": [x for x in players if x != leaving_user_id],
                            }))
                        except Exception:
                            pass
        else:
            p1_id = match.get("player1_id")
            p2_id = match.get("player2_id")

            if p1_id:
                self.player_matches.pop(p1_id, None)
            if p2_id:
                self.player_matches.pop(p2_id, None)

            opponent_id = p2_id if leaving_user_id == p1_id else p1_id
            if opponent_id:
                opponent_ws = self.connection_mgr.get(opponent_id)
                if opponent_ws:
                    try:
                        await opponent_ws.send_text(json.dumps({
                            "type": "opponent_left",
                            "reason": reason,
                            "match_id": match_id,
                            "sender": leaving_user_id or "system",
                        }))
                    except Exception as err:
                        print(f"⚠️ Failed to notify opponent {opponent_id} of match exit: {err}")

        print(f"🗑️ Match #{match_id} cleaned up (reason: {reason})")

    async def handle_leave(self, user_id: str, exercise_id: str | None = None):
        """Lifecycle handler for player exit."""
        match_id = self.player_matches.get(user_id)
        if match_id:
            await self.remove_match(match_id, reason="player_left", leaving_user_id=user_id)
        else:
            self.leave_queue(user_id, exercise_id)

conn_manager = ConnectionManager()
matchmaker = MatchmakingManager(conn_manager)

@app.get("/api/online")
async def get_online_count():
    return JSONResponse(matchmaker.get_counts())

@app.websocket("/ws/presence")
async def presence_websocket(ws: WebSocket):
    await ws.accept()
    user_id = f"anon_{uuid.uuid4().hex[:8]}"
    try:
        init = await ws.receive_text()
        try:
            data = json.loads(init)
            user_id = data.get("user_id", user_id)
        except Exception:
            pass

        await matchmaker.add_presence(user_id, ws)

        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        await matchmaker.remove_presence(user_id, ws)
        print(f"\n🔌 User {user_id} disconnected from presence")

ALLOWED_MESSAGE_TYPES = {
    "join",
    "score",
    "peer_ready",
    "frame",
    "rematch_request",
    "rematch_accepted",
    "rematch_declined",
    "game_end",
    "leave",
    "match_leave",
    "ping",
}

async def dispatch_1v1_matched(match_id: str, p1_id: str, p2_id: str, exercise_id: str, room_id: str, room_num: int):
    p1_ws = conn_manager.get(p1_id)
    p2_ws = conn_manager.get(p2_id)
    if p1_ws:
        await p1_ws.send_text(json.dumps({
            "type": "matched",
            "match_id": match_id,
            "room_id": room_id,
            "room_number": room_num,
            "exercise_id": exercise_id,
            "mode": "1v1",
            "role": "player1",
            "opponent": p2_id,
        }))
    if p2_ws:
        await p2_ws.send_text(json.dumps({
            "type": "matched",
            "match_id": match_id,
            "room_id": room_id,
            "room_number": room_num,
            "exercise_id": exercise_id,
            "mode": "1v1",
            "role": "player2",
            "opponent": p1_id,
        }))

@app.websocket("/ws/match")
async def match_websocket(ws: WebSocket):
    await ws.accept()
    user_id = f"anon_{uuid.uuid4().hex[:8]}"
    exercise_id = "1"

    try:
        init = await ws.receive_text()
        try:
            data = json.loads(init)
            user_id = data.get("user_id", user_id)
            exercise_id = str(data.get("exercise_id", "1"))
        except Exception:
            pass

        conn_manager.register(user_id, ws)
        await ws.send_text(json.dumps({"type": "joined", "user_id": user_id}))

        is_ffa_request = exercise_id.endswith("_ffa") or exercise_id.startswith("ffa_")

        if is_ffa_request:
            await matchmaker.join_ffa_lobby(user_id, exercise_id)
        else:
            match_id, p1_id, p2_id, room_id, room_num = matchmaker.join_queue(user_id, exercise_id)
            if match_id:
                await dispatch_1v1_matched(match_id, p1_id, p2_id, exercise_id, room_id, room_num)

        # Message Handling Loop
        while True:
            raw_msg = await ws.receive_text()
            try:
                msg = json.loads(raw_msg)
            except Exception as e:
                print(f"⚠️ Invalid JSON from {user_id}: {raw_msg} ({e})")
                continue

            msg_type = msg.get("type")
            if msg_type not in ALLOWED_MESSAGE_TYPES:
                print(f"⚠️ Unauthorized message type '{msg_type}' from {user_id}")
                continue

            if msg_type == "join":
                join_ex_id = str(msg.get("exercise_id", exercise_id))
                exercise_id = join_ex_id
                is_ffa_request = exercise_id.endswith("_ffa") or exercise_id.startswith("ffa_")
                if is_ffa_request:
                    await matchmaker.join_ffa_lobby(user_id, exercise_id)
                else:
                    match_id, p1_id, p2_id, room_id, room_num = matchmaker.join_queue(user_id, exercise_id)
                    if match_id:
                        await dispatch_1v1_matched(match_id, p1_id, p2_id, exercise_id, room_id, room_num)
                continue

            if msg_type in ("leave", "match_leave"):
                await matchmaker.handle_leave(user_id, exercise_id)
                break

            if msg_type == "ping":
                await ws.send_text(json.dumps({"type": "pong", "time": time.time()}))
                continue

            # Resolve match dynamically via authoritative server-side player_matches mapping
            active_match_id = matchmaker.get_match_id(user_id)
            if not active_match_id:
                # Player not in an active match yet
                continue

            match = matchmaker.get_match(active_match_id)
            if not match:
                continue

            # Check if match has exceeded authoritative deadline
            now_ts = time.time()
            if match.get("status") == "in_progress" and now_ts >= match.get("ends_at", now_ts + 1):
                if match.get("mode") == "ffa":
                    await matchmaker.finish_ffa_match(active_match_id)
                else:
                    await matchmaker.finish_1v1_match(active_match_id)
                continue

            is_ffa = (match.get("mode") == "ffa")

            if is_ffa:
                players = match.get("players", [])
                if user_id not in players:
                    print(f"⚠️ Security: User {user_id} attempted action on unassigned FFA match #{active_match_id}")
                    continue

                if msg_type == "score":
                    try:
                        raw_score = int(msg.get("score"))
                    except (TypeError, ValueError):
                        continue

                    # Only accept scores during active gameplay (waiting/setup or in_progress)
                    if match.get("status") == "completed":
                        continue

                    # Reject negative or backwards score updates
                    prev_score = match["scores"].get(user_id, 0)
                    if raw_score < prev_score:
                        continue

                    score_val = min(1000, raw_score)
                    match["scores"][user_id] = score_val

                    # Generate sorted live leaderboard: highest score / reps first
                    leaderboard = [
                        {"username": pid, "score": sc}
                        for pid, sc in match["scores"].items()
                    ]
                    leaderboard.sort(key=lambda x: x["score"], reverse=True)

                    # Broadcast live FFA leaderboard to all participants in this room
                    board_payload = json.dumps({
                        "type": "ffa_leaderboard",
                        "match_id": active_match_id,
                        "leaderboard": leaderboard,
                        "sender": user_id,
                        "score": score_val,
                    })

                    for pid in players:
                        p_ws = conn_manager.get(pid)
                        if p_ws:
                            try:
                                await p_ws.send_text(board_payload)
                            except Exception:
                                pass

                elif msg_type == "peer_ready":
                    ready_players = match.setdefault("ready_players", set())
                    ready_players.add(user_id)
                    all_ready = len(ready_players) >= len(players)

                    if all_ready and match.get("status") == "waiting":
                        match["status"] = "in_progress"
                        now_start = time.time()
                        match["started_at"] = now_start
                        match["ends_at"] = now_start + MATCH_DURATION + 30

                    ready_payload = json.dumps({
                        "type": "ffa_ready_update",
                        "match_id": active_match_id,
                        "sender": user_id,
                        "ready_count": len(ready_players),
                        "total_players": len(players),
                        "all_ready": all_ready,
                    })
                    for pid in players:
                        p_ws = conn_manager.get(pid)
                        if p_ws:
                            try:
                                await p_ws.send_text(ready_payload)
                            except Exception:
                                pass

                elif msg_type == "game_end":
                    # Client game_end is treated as a completion request: finish match authoritatively
                    if match.get("status") != "completed":
                        await matchmaker.finish_ffa_match(active_match_id)

            else:
                # Standard 1v1 Match Logic
                p1_id = match["player1_id"]
                p2_id = match["player2_id"]
                if user_id != p1_id and user_id != p2_id:
                    print(f"⚠️ Security: User {user_id} attempted action on unassigned match #{active_match_id}")
                    continue

                is_p1 = (user_id == p1_id)
                opponent_id = p2_id if is_p1 else p1_id
                opponent_ws = conn_manager.get(opponent_id)

                if not opponent_ws:
                    continue

                if msg_type == "score":
                    try:
                        raw_score = int(msg.get("score"))
                    except (TypeError, ValueError):
                        continue

                    if match.get("status") == "completed":
                        continue

                    previous = match.get("player1_score", 0) if is_p1 else match.get("player2_score", 0)
                    if raw_score < previous:
                        continue

                    score_val = min(1000, raw_score)
                    now = time.time()
                    if is_p1:
                        match["player1_score"] = score_val
                        match["last_update_p1"] = now
                    else:
                        match["player2_score"] = score_val
                        match["last_update_p2"] = now

                    await opponent_ws.send_text(json.dumps({
                        "type": "score",
                        "score": score_val,
                        "match_id": active_match_id,
                        "sender": user_id,
                    }))

                elif msg_type == "peer_ready":
                    if is_p1:
                        match["player1_ready"] = True
                    else:
                        match["player2_ready"] = True

                    # Transition to in_progress and reset authoritative timer once both players are ready
                    if match.get("player1_ready") and match.get("player2_ready") and match.get("status") == "waiting":
                        match["status"] = "in_progress"
                        now_start = time.time()
                        match["started_at"] = now_start
                        match["ends_at"] = now_start + MATCH_DURATION + 30

                    await opponent_ws.send_text(json.dumps({
                        "type": "peer_ready",
                        "match_id": active_match_id,
                        "sender": user_id,
                    }))

                elif msg_type == "frame":
                    frame_data = msg.get("data")
                    if frame_data and isinstance(frame_data, str):
                        try:
                            await opponent_ws.send_text(json.dumps({
                                "type": "frame",
                                "match_id": active_match_id,
                                "data": frame_data,
                            }))
                        except Exception:
                            pass

                elif msg_type == "game_end":
                    # Client game_end is treated as a request: trigger authoritative match finish
                    if match.get("status") != "completed":
                        await matchmaker.finish_1v1_match(active_match_id)

                elif msg_type in ("rematch_request", "rematch_accepted", "rematch_declined"):
                    rematch_votes = match.setdefault("rematch_votes", set())

                    if msg_type == "rematch_request":
                        rematch_votes.add(user_id)
                    elif msg_type == "rematch_accepted":
                        rematch_votes.add(user_id)
                        # Require both players to have accepted before restarting match
                        if len(rematch_votes) >= 2:
                            rematch_votes.clear()
                            now = time.time()
                            match["player1_score"] = 0
                            match["player2_score"] = 0
                            match["player1_ready"] = False
                            match["player2_ready"] = False
                            match["status"] = "waiting"
                            match["started_at"] = now
                            match["ends_at"] = now + MATCH_DURATION + 30
                    elif msg_type == "rematch_declined":
                        rematch_votes.clear()

                    await opponent_ws.send_text(json.dumps({
                        "type": msg_type,
                        "match_id": active_match_id,
                        "sender": user_id,
                    }))

    except WebSocketDisconnect:
        conn_manager.unregister(user_id, ws)
        await matchmaker.handle_leave(user_id, exercise_id)
        print(f"\n🔌 User {user_id} disconnected from matchmaking")

# ============= STREAMING SYSTEM (/{username} path) =============

class StreamManager:
    def __init__(self):
        self.streams: dict[str, dict] = {}

    def add_sender(self, username, ws):
        if username not in self.streams:
            self.streams[username] = {"senders": [], "viewers": []}
        self.streams[username]["senders"].append(ws)
        print(f"📺 Sender registered: {username}")

    def add_viewer(self, username, ws):
        if username not in self.streams:
            self.streams[username] = {"senders": [], "viewers": []}
        self.streams[username]["viewers"].append(ws)
        print(f"👁️  Viewer registered for stream: {username}")

    def remove_connection(self, username, ws):
        if username not in self.streams:
            return
        self.streams[username]["senders"] = [w for w in self.streams[username]["senders"] if w is not ws]
        self.streams[username]["viewers"] = [w for w in self.streams[username]["viewers"] if w is not ws]
        if not self.streams[username]["senders"] and not self.streams[username]["viewers"]:
            del self.streams[username]

    async def broadcast_to_viewers(self, username, msg):
        if username not in self.streams:
            return
        viewers = list(self.streams[username]["viewers"])
        dead_viewers = []
        for viewer_ws in viewers:
            try:
                await viewer_ws.send_text(msg)
            except Exception:
                dead_viewers.append(viewer_ws)

        for dead_ws in dead_viewers:
            self.remove_connection(username, dead_ws)

stream_manager = StreamManager()

@app.websocket("/ws/stream/{username}")
async def stream_websocket(ws: WebSocket, username: str):
    await ws.accept()
    role = None

    try:
        init = await ws.receive_text()
        data = json.loads(init)
        role = data.get("role", "sender")

        if role == "sender":
            stream_manager.add_sender(username, ws)
            await ws.send_text(json.dumps({"type": "stream_started", "username": username}))
        elif role == "viewer":
            stream_manager.add_viewer(username, ws)
            await ws.send_text(json.dumps({"type": "viewing", "username": username}))

        while True:
            msg = await ws.receive_text()
            if role == "sender":
                await stream_manager.broadcast_to_viewers(username, msg)
            else:
                await ws.send_text(json.dumps({"type": "error", "msg": "Viewers cannot send stream data"}))
    except WebSocketDisconnect:
        stream_manager.remove_connection(username, ws)
        print(f"\n🔌 User {username} ({role}) disconnected from stream")
    except Exception as e:
        print(f"\nStream error: {e}")
        stream_manager.remove_connection(username, ws)

if __name__ == "__main__":
    import uvicorn
    import subprocess
    import atexit

    TUNNEL_TOKEN = os.getenv("CLOUDFLARE_TUNNEL_TOKEN", "")

    tunnel_proc = None
    if TUNNEL_TOKEN:
        try:
            print("=" * 50)
            print("🚀 Starting Cloudflare Tunnel...")
            print("=" * 50)
            print("🔗 Public URL: https://app.codequestpro.in")
            print("🏠 Local server: http://localhost:8000")
            print("-" * 50)

            tunnel_proc = subprocess.Popen([
                "cloudflared",
                "tunnel",
                "run",
                "--token",
                TUNNEL_TOKEN
            ])

            def cleanup_tunnel():
                if tunnel_proc and tunnel_proc.poll() is None:
                    print("\nStopping Cloudflare tunnel...")
                    tunnel_proc.terminate()
                    tunnel_proc.wait()

            atexit.register(cleanup_tunnel)
        except Exception as e:
            print(f"⚠️ Could not start Cloudflare tunnel: {e}")
    else:
        print("ℹ️ No CLOUDFLARE_TUNNEL_TOKEN set. Running locally on port 8000.")

    try:
        uvicorn.run(app, host="0.0.0.0", port=8000)
    finally:
        if tunnel_proc and tunnel_proc.poll() is None:
            tunnel_proc.terminate()
