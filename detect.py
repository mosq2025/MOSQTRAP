import cv2
import os
import sys
import time
import threading
import torch
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
        start_date = (datetime.now() - timedelta(days=2)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        res = supabase.table("detections").select("id").gte("timestamp", start_date).execute()
        return len(res.data)
    except Exception as e:
        print("[ERROR] Supabase three_day_total query failed:", e)
        return 0


# ─── Tunable Parameters ───────────────────────────────────────────────────────

# YOLO confidence threshold (0.0–1.0). Only detections above this are counted.
CONFIDENCE_THRESHOLD = 0.25

# Number of consecutive frames a detection must appear before we count it.
PERSISTENCE_FRAMES = 4

# Seconds between accepted detections to avoid double-counting.
COOLDOWN_SEC = 6.0

# Camera device index (0 = default/built-in webcam, 1 = external/secondary webcam).
CAMERA_ID = 1

# Path to your trained YOLO model weights.
MODEL_PATH = os.path.join(os.path.dirname(__file__), "best.pt")


# ─── Detection Thread ────────────────────────────────────────────────────────-
def run_detection():
    global detection_count, detection_log, is_running

    # Load YOLOv5 model via torch.hub
    try:
        model = torch.hub.load(
            'ultralytics/yolov5',
            'custom',
            path=MODEL_PATH,
            force_reload=False,
            verbose=False
        )
        model.conf = CONFIDENCE_THRESHOLD  # set confidence threshold
        print(f"[INFO] YOLOv5 model loaded from: {MODEL_PATH}")
    except Exception as e:
        print(f"[ERROR] Failed to load YOLO model: {e}")
        is_running = False
        return

    cap = cv2.VideoCapture(CAMERA_ID)
    if not cap.isOpened():
        print("[ERROR] Cannot open camera. Is it connected?")
        is_running = False
        return

    consecutive_hits = 0
    last_detection_time = 0.0
    last_box = None    # store last detected bounding box for drawing
    last_label = "mosquito"  # store detected species/variant name

    is_running = True
    print("[INFO] Camera started. YOLO detection running.")
    print(f"[INFO] Confidence≥{CONFIDENCE_THRESHOLD}  Persistence={PERSISTENCE_FRAMES} frames  Cooldown={COOLDOWN_SEC}s")

    while is_running:
        ret, frame = cap.read()
        if not ret:
            time.sleep(0.05)
            continue

        # ── YOLOv5 Inference ─────────────────────────────────────────────────
        results = model(frame)
        # results.xyxy[0] → tensor of [x1, y1, x2, y2, conf, class]
        dets = results.xyxy[0].cpu().numpy()

        found_qualifying = False

        if len(dets) > 0:
            # Take the highest-confidence detection
            best_idx = int(dets[:, 4].argmax())
            x1, y1, x2, y2 = int(dets[best_idx][0]), int(dets[best_idx][1]), int(dets[best_idx][2]), int(dets[best_idx][3])
            best_conf = float(dets[best_idx][4])
            cls_idx = int(dets[best_idx][5])
            species = model.names[cls_idx] if model.names else "mosquito"
            last_box = (x1, y1, x2, y2)
            last_label = species
            found_qualifying = True

            # Draw tracking box (green while building streak)
            color = (0, 200, 0)
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)
            cv2.putText(
                frame,
                f"{species} ({consecutive_hits + 1}/{PERSISTENCE_FRAMES}) {best_conf:.0%}",
                (x1, max(y1 - 8, 14)),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.45,
                color,
                1,
            )

        # ── Update persistence counter ────────────────────────────────────────
        if found_qualifying:
            consecutive_hits += 1
        else:
            consecutive_hits = 0
            last_box = None
            last_label = "mosquito"

        now = time.time()

        # ── Trigger confirmed detection ───────────────────────────────────────
        if (
            consecutive_hits >= PERSISTENCE_FRAMES
            and (now - last_detection_time) >= COOLDOWN_SEC
        ):
            last_detection_time = now
            consecutive_hits    = 0
            detection_count    += 1

            # Draw red confirmed box on snapshot
            if last_box:
                x1, y1, x2, y2 = last_box
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
                cv2.putText(
                    frame,
                    f"#{detection_count} {last_label}",
                    (x1, max(y1 - 8, 14)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (0, 0, 255),
                    2,
                )

            # Upload snapshot to Supabase
            ts_str   = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]
            filename = f"mosquito_{ts_str}.jpg"

            public_url = None
            if supabase:
                try:
                    is_success, buffer = cv2.imencode(".jpg", frame)
                    if is_success:
                        supabase.storage.from_("snapshots").upload(
                            path=filename,
                            file=buffer.tobytes(),
                            file_options={"content-type": "image/jpeg"}
                        )
                        public_url = supabase.storage.from_("snapshots").get_public_url(filename)

                    supabase.table("detections").insert({
                        "timestamp": datetime.now().isoformat(),
                        "mosquito_count": detection_count,
                        "snapshot_url": public_url,
                        "local_filename": filename,
                        "species": last_label
                    }).execute()
                    print(f"[INFO] Uploaded {filename} to Supabase")
                except Exception as e:
                    print(f"[ERROR] Supabase upload failed: {e}")

            event = {
                "id":        detection_count,
                "timestamp": datetime.now().isoformat(),
                "snapshot":  public_url if public_url else filename,
                "count":     detection_count,
                "species":   last_label,
                "three_day_total": get_three_day_total()
            }
            detection_log.insert(0, event)
            if len(detection_log) > 100:
                detection_log.pop()

            socketio.emit("mosquito_detected", event)
            print(
                f"[DETECTION] #{detection_count} [{last_label}] confirmed at "
                f"{event['timestamp']}  ->  {filename}"
            )

        # ── Overlay status on frame ───────────────────────────────────────────
        cv2.putText(
            frame,
            f"Mosquitoes: {detection_count}  |  Streak: {consecutive_hits}/{PERSISTENCE_FRAMES}",
            (10, 28),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (0, 200, 80),
            2,
        )

        cv2.imshow("MOSTRAP — YOLO Detection  (press Q to quit)", frame)

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
