import cv2
import numpy as np
import os
import sys
import time
import threading
import json
from dotenv import load_dotenv
from supabase import create_client, Client
from datetime import datetime, timedelta
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit


# ─── App Setup ────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

SNAPSHOT_DIR = os.path.join(os.path.dirname(__file__), "snapshots")
os.makedirs(SNAPSHOT_DIR, exist_ok=True)

# ─── State ────────────────────────────────────────────────────────────────────
detection_count = 0
detection_log   = []
is_running      = False
camera_thread   = None

load_dotenv()
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase: Client = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("[INFO] Supabase client initialized.")
    except Exception as e:
        print("[ERROR] Failed to initialize Supabase:", e)
else:
    print("[WARN] Supabase credentials not found in .env. Uploads will be skipped.")

def get_three_day_total():
    if not supabase:
        return 0
    try:
        # 3-day window: Today plus the 2 previous days
        start_date = (datetime.now() - timedelta(days=2)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        res = supabase.table("detections").select("id").gte("timestamp", start_date).execute()
        return len(res.data)
    except Exception as e:
        print("[ERROR] Supabase three_day_total query failed:", e)
        return 0


# ─── Tunable Parameters ───────────────────────────────────────────────────────
# Adjust these to match your camera setup.

# Minimum area (px²) to consider a contour as a possible mosquito.
# Increase if large background objects keep triggering.
MIN_AREA = 100

# Maximum area (px²). A mosquito up close won't be huge.
MAX_AREA = 2500

# Number of consecutive frames a contour must appear before we count it.
# Higher = more accurate but slightly slower to register.
PERSISTENCE_FRAMES = 4

# How dark (0-255) the detected region must be relative to the frame average.
# A value of 20 means the patch must be at least 20 units darker than the mean.
DARKNESS_MARGIN = 15

# Seconds between accepted detections to avoid double-counting.
COOLDOWN_SEC = 6.0

# Background subtractor sensitivity.  Higher = less sensitive (fewer false hits).
MOG2_THRESHOLD = 60

# Camera device index (0 = default webcam).
CAMERA_ID = 0


# ─── Detection Thread ────────────────────────────────────────────────────────-
def run_detection():
    global detection_count, detection_log, is_running

    cap = cv2.VideoCapture(CAMERA_ID)
    if not cap.isOpened():
        print("[ERROR] Cannot open camera. Is it connected?")
        is_running = False
        return

    fgbg = cv2.createBackgroundSubtractorMOG2(
        history=400,
        varThreshold=MOG2_THRESHOLD,
        detectShadows=False,
    )

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))

    # --- Persistence tracker ---
    # Maps a simple bucket key → consecutive frame count with a contour
    consecutive_hits = 0   # how many frames in a row had a qualifying contour
    last_detection_time = 0.0

    is_running = True
    print("[INFO] Camera started. Detection running.")
    print(f"[INFO] Min area={MIN_AREA}px²  Max area={MAX_AREA}px²  "
          f"Persistence={PERSISTENCE_FRAMES} frames  Cooldown={COOLDOWN_SEC}s")

    while is_running:
        ret, frame = cap.read()
        if not ret:
            time.sleep(0.05)
            continue

        # ── Pre-processing ────────────────────────────────────────────────────
        blurred = cv2.GaussianBlur(frame, (5, 5), 0)
        fg_mask = fgbg.apply(blurred)

        # Clean noise: erode then dilate
        fg_mask = cv2.morphologyEx(fg_mask, cv2.MORPH_OPEN, kernel, iterations=1)
        fg_mask = cv2.dilate(fg_mask, kernel, iterations=2)

        # ── Contour Scan ─────────────────────────────────────────────────────
        contours, _ = cv2.findContours(
            fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )

        # Frame-wide mean brightness (used for darkness check)
        gray  = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        frame_mean = float(gray.mean())

        found_qualifying = False

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if not (MIN_AREA < area < MAX_AREA):
                continue

            # ── Darkness check ────────────────────────────────────────────────
            x, y, w, h = cv2.boundingRect(cnt)

            # Add a small margin around the contour for sampling
            x0, y0 = max(x, 0), max(y, 0)
            x1, y1 = min(x + w, gray.shape[1]), min(y + h, gray.shape[0])
            patch = gray[y0:y1, x0:x1]

            if patch.size == 0:
                continue

            patch_mean = float(patch.mean())

            # The region must be noticeably darker than the overall frame
            if frame_mean - patch_mean < DARKNESS_MARGIN:
                continue   # Too bright — skip (light reflection, dust, etc.)

            # ── Qualifying contour found ──────────────────────────────────────
            found_qualifying = True

            # Draw bounding box for visual feedback (green while tracking,
            # red at the moment of confirmed count)
            color = (0, 200, 0)
            cv2.rectangle(frame, (x, y), (x + w, y + h), color, 2)
            cv2.putText(
                frame,
                f"tracking ({consecutive_hits + 1}/{PERSISTENCE_FRAMES})",
                (x, max(y - 6, 14)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                color,
                1,
            )
            break  # Only handle one qualifying contour per frame

        # ── Update persistence counter ────────────────────────────────────────
        if found_qualifying:
            consecutive_hits += 1
        else:
            consecutive_hits = 0   # reset — object disappeared

        now = time.time()

        # ── Trigger confirmed detection ───────────────────────────────────────
        if (
            consecutive_hits >= PERSISTENCE_FRAMES
            and (now - last_detection_time) >= COOLDOWN_SEC
        ):
            last_detection_time = now
            consecutive_hits    = 0   # reset after counting
            detection_count    += 1

            # Mark the bounding box red on the saved snapshot
            if found_qualifying:
                cv2.rectangle(frame, (x, y), (x + w, y + h), (0, 0, 255), 2)
                cv2.putText(
                    frame,
                    f"DETECTED #{detection_count}",
                    (x, max(y - 6, 14)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.55,
                    (0, 0, 255),
                    2,
                )

            # Prepare snapshot for Supabase (no local save)
            ts_str   = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
            filename = f"mosquito_{ts_str}.jpg"

            public_url = None
            if supabase:
                try:
                    # Encode frame to JPEG in memory
                    is_success, buffer = cv2.imencode(".jpg", frame)
                    if is_success:
                        res = supabase.storage.from_("snapshots").upload(
                            path=filename,
                            file=buffer.tobytes(),
                            file_options={"content-type": "image/jpeg"}
                        )
                        public_url = supabase.storage.from_("snapshots").get_public_url(filename)
                    
                    supabase.table("detections").insert({
                        "timestamp": datetime.now().isoformat(),
                        "mosquito_count": detection_count,
                        "snapshot_url": public_url,
                        "local_filename": filename
                    }).execute()
                    print(f"[INFO] Uploaded {filename} to Supabase")
                except Exception as e:
                    print(f"[ERROR] Supabase upload failed: {e}")
            event = {
                "id":        detection_count,
                "timestamp": datetime.now().isoformat(),
                "snapshot":  public_url if public_url else filename,
                "count":     detection_count,
                "three_day_total": get_three_day_total()
            }
            detection_log.insert(0, event)
            if len(detection_log) > 100:
                detection_log.pop()

            socketio.emit("mosquito_detected", event)
            print(
                f"[DETECTION] #{detection_count} confirmed at "
                f"{event['timestamp']}  ->  {filename}"
            )

        # ── Overlay status on frame ───────────────────────────────────────────
        cv2.putText(
            frame,
            f"Mosquitoes: {detection_count}  |  Hit streak: {consecutive_hits}/{PERSISTENCE_FRAMES}",
            (10, 28),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (0, 200, 80),
            2,
        )

        cv2.imshow("MOSTRAP — Live Detection  (press Q to quit)", frame)

        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cap.release()
    cv2.destroyAllWindows()
    is_running = False
    print("[INFO] Camera stopped.")


# ─── REST API ─────────────────────────────────────────────────────────────────

@app.route("/api/status")
def api_status():
    return jsonify({"running": is_running, "count": detection_count})

@app.route("/api/count")
def api_count():
    return jsonify({"count": detection_count})

@app.route("/api/detections")
def api_detections():
    return jsonify(detection_log)

@app.route("/api/history")
def api_history():
    if not supabase:
        return jsonify({})
    try:
        res = supabase.table("detections").select("timestamp").execute()
        daily_counts = {}
        for row in res.data:
            dt_str = row['timestamp'][:10]
            if dt_str not in daily_counts:
                daily_counts[dt_str] = {"mosquitoes": 0, "lastUpdated": row['timestamp']}
            daily_counts[dt_str]["mosquitoes"] += 1
            if row['timestamp'] > daily_counts[dt_str]["lastUpdated"]:
                daily_counts[dt_str]["lastUpdated"] = row['timestamp']
        
        # Format dates nicely
        for d in daily_counts.values():
            try:
                dt_obj = datetime.fromisoformat(d["lastUpdated"])
                d["lastUpdated"] = dt_obj.strftime("%m/%d/%Y, %I:%M:%S %p")
            except Exception:
                pass
                
        return jsonify(daily_counts)
    except Exception as e:
        print("[ERROR] Supabase history API query failed:", e)
        return jsonify({})


@app.route("/snapshots/<path:filename>")
def serve_snapshot(filename):
    return send_from_directory(SNAPSHOT_DIR, filename)


# ─── SocketIO Events ──────────────────────────────────────────────────────────

@socketio.on("connect")
def on_connect():
    print("[WS] Dashboard connected")
    emit("init", {"count": detection_count, "three_day_total": get_three_day_total(), "detections": detection_log[:20]})

@socketio.on("disconnect")
def on_disconnect():
    print("[WS] Dashboard disconnected")

@socketio.on("start_camera")
def on_start_camera():
    global camera_thread, is_running
    if not is_running:
        camera_thread = threading.Thread(target=run_detection, daemon=True)
        camera_thread.start()
        emit("camera_status", {"running": True})

@socketio.on("stop_camera")
def on_stop_camera():
    global is_running
    is_running = False
    emit("camera_status", {"running": False})

@socketio.on("reset_count")
def on_reset_count():
    global detection_count, detection_log
    detection_count = 0
    detection_log   = []
    socketio.emit("count_reset", {"count": 0})


# ─── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    camera_thread = threading.Thread(target=run_detection, daemon=True)
    camera_thread.start()

    print("=" * 55)
    print("  MOSTRAP Detection Server  ->  http://localhost:5000")
    print("  Camera window will open. Press Q to stop.")
    print("=" * 55)

    try:
        socketio.run(app, host="0.0.0.0", port=5000, debug=False, use_reloader=False, allow_unsafe_werkzeug=True)
    except KeyboardInterrupt:
        print("\n[INFO] Server stopped by user.")
        is_running = False
        sys.exit(0)
