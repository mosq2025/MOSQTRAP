import cv2
import os
import sys
import time
import threading
import torch
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
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

# ─── Email Configuration ──────────────────────────────────────────────────────
EMAIL_SENDER   = os.environ.get("EMAIL_SENDER",   "")
EMAIL_PASSWORD = os.environ.get("EMAIL_PASSWORD", "")
# Recipients are pulled automatically from Supabase Auth (all signed-up users).
# No EMAIL_RECIPIENT needed in .env.

# Active monitoring windows: list of (start_hour, end_hour, label)
ACTIVE_WINDOWS = [
    (16, 18, "4:00 PM – 6:00 PM"),
    (21, 23, "9:00 PM – 11:00 PM"),
]

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


def get_today_total():
    """Return total detections recorded today from Supabase."""
    if not supabase:
        return detection_count  # fall back to in-memory count
    try:
        start_of_day = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
        res = supabase.table("detections").select("id").gte("timestamp", start_of_day).execute()
        return len(res.data)
    except Exception as e:
        print("[ERROR] Supabase today_total query failed:", e)
        return detection_count


def get_registered_emails():
    """
    Fetch all registered user emails from Supabase Auth.
    Uses the service-role key (SUPABASE_KEY) which has admin access.
    Returns a list of email strings.
    """
    if not supabase:
        return []
    try:
        # admin.list_users() returns a list of User objects
        response = supabase.auth.admin.list_users()
        emails = [
            user.email
            for user in response
            if user.email  # skip entries with no email
        ]
        print(f"[EMAIL] Found {len(emails)} registered user(s) to notify.")
        return emails
    except Exception as e:
        print(f"[EMAIL] Failed to fetch registered users: {e}")
        return []


def send_activation_email(window_label: str):
    """Send an HTML activation report email to all registered users."""
    if not EMAIL_SENDER or not EMAIL_PASSWORD:
        print("[EMAIL] Skipping — EMAIL_SENDER or EMAIL_PASSWORD not configured in .env")
        return

    recipients = get_registered_emails()
    if not recipients:
        print("[EMAIL] Skipping — no registered users found in Supabase Auth.")
        return

    now            = datetime.now()
    today_count    = get_today_total()
    three_day      = get_three_day_total()
    date_str       = now.strftime("%B %d, %Y")
    time_str       = now.strftime("%I:%M %p")

    # Determine risk level badge
    if three_day >= 20:
        risk_color, risk_label = "#ef4444", "HIGH"
    elif three_day >= 10:
        risk_color, risk_label = "#f59e0b", "MODERATE"
    else:
        risk_color, risk_label = "#22c55e", "LOW"

    html_body = f"""\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>MOSTRAP Activation Report</title>
</head>
<body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;color:#e2e8f0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#7c3aed,#2563eb);border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;">
            <div style="font-size:32px;margin-bottom:8px;">🦟</div>
            <h1 style="margin:0;font-size:24px;font-weight:700;color:#fff;letter-spacing:-0.5px;">MOSTRAP Activated</h1>
            <p style="margin:8px 0 0;font-size:14px;color:#c4b5fd;">{date_str} &nbsp;·&nbsp; {time_str}</p>
          </td>
        </tr>

        <!-- Window Banner -->
        <tr>
          <td style="background:#1e1b4b;padding:16px 40px;text-align:center;">
            <span style="display:inline-block;background:#312e81;border:1px solid #4338ca;border-radius:20px;padding:6px 18px;font-size:13px;color:#a5b4fc;">
              ⏰ Active Window: <strong style="color:#818cf8;">{window_label}</strong>
            </span>
          </td>
        </tr>

        <!-- Stats -->
        <tr>
          <td style="background:#1e293b;padding:32px 40px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td width="50%" style="padding-right:12px;">
                  <div style="background:#0f172a;border:1px solid #334155;border-radius:12px;padding:20px;text-align:center;">
                    <div style="font-size:36px;font-weight:800;color:#818cf8;">{today_count}</div>
                    <div style="font-size:12px;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:1px;">Today's Detections</div>
                  </div>
                </td>
                <td width="50%" style="padding-left:12px;">
                  <div style="background:#0f172a;border:1px solid #334155;border-radius:12px;padding:20px;text-align:center;">
                    <div style="font-size:36px;font-weight:800;color:#38bdf8;">{three_day}</div>
                    <div style="font-size:12px;color:#64748b;margin-top:4px;text-transform:uppercase;letter-spacing:1px;">3-Day Total</div>
                  </div>
                </td>
              </tr>
            </table>

            <!-- Risk Level -->
            <div style="margin-top:20px;background:#0f172a;border:1px solid {risk_color}44;border-radius:12px;padding:16px 20px;display:flex;align-items:center;">
              <span style="font-size:13px;color:#94a3b8;">Risk Level:</span>
              <span style="margin-left:10px;display:inline-block;background:{risk_color}22;border:1px solid {risk_color};border-radius:8px;padding:3px 12px;font-size:13px;font-weight:700;color:{risk_color};">{risk_label}</span>
            </div>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#0f172a;border:1px solid #1e293b;border-top:0;border-radius:0 0 16px 16px;padding:24px 40px;text-align:center;">
            <p style="margin:0 0 16px;font-size:13px;color:#64748b;">Monitoring is now active. Visit your dashboard for live detections.</p>
            <a href="http://localhost:5000" style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;text-decoration:none;border-radius:8px;padding:10px 24px;font-size:14px;font-weight:600;">Open Dashboard →</a>
            <p style="margin:20px 0 0;font-size:11px;color:#334155;">MOSTRAP Mosquito Trap Automated Report · Do not reply</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP("smtp.gmail.com", 587) as server:
            server.ehlo()
            server.starttls(context=context)
            server.login(EMAIL_SENDER, EMAIL_PASSWORD)

            for recipient in recipients:
                msg = MIMEMultipart("alternative")
                msg["Subject"] = f"🦟 MOSTRAP Activated — {window_label} | {date_str}"
                msg["From"]    = EMAIL_SENDER
                msg["To"]      = recipient
                msg.attach(MIMEText(html_body, "html"))
                server.sendmail(EMAIL_SENDER, recipient, msg.as_string())
                print(f"[EMAIL] Report sent to {recipient} for window: {window_label}")

    except Exception as e:
        print(f"[EMAIL] Failed to send activation report: {e}")


def activation_scheduler():
    """
    Background thread that fires one activation email per window per day.
    Active windows: 4:00 PM–6:00 PM and 9:00 PM–11:00 PM.
    Checks every 30 seconds; sends once at the start of each window.
    """
    sent_today = set()  # keys: (date_str, start_hour)
    print("[EMAIL] Activation scheduler started. Watching for active windows...")

    while True:
        now   = datetime.now()
        hour  = now.hour
        today = now.strftime("%Y-%m-%d")

        for start_hour, end_hour, label in ACTIVE_WINDOWS:
            key = (today, start_hour)
            # Fire at the exact start hour of the window (first 30-second tick inside it)
            if start_hour <= hour < end_hour and key not in sent_today:
                sent_today.add(key)
                # Run email in a separate thread so scheduler loop isn't blocked
                threading.Thread(
                    target=send_activation_email,
                    args=(label,),
                    daemon=True
                ).start()

        # Prune old keys to avoid set growing unboundedly
        stale = {k for k in sent_today if k[0] != today}
        sent_today -= stale

        time.sleep(30)


# ─── Tunable Parameters ───────────────────────────────────────────────────────

# YOLO confidence threshold (0.0–1.0). Only detections above this are counted.
CONFIDENCE_THRESHOLD = 0.25

# Number of consecutive frames a detection must appear before we count it.
PERSISTENCE_FRAMES = 4

# Number of consecutive frames with NO detection before we consider the mosquito gone.
# At ~30 fps a value of 60 means the mosquito must be absent for ~2 seconds.
ABSENT_FRAMES_THRESHOLD = 60

# Bounding Box Shrink Factor (0.0 to 1.0). 1.0 = original size, 0.6 = 60% size.
SHRINK_FACTOR = 0.1

# Camera device index (0 = default/built-in webcam, 1 = external/secondary webcam).
CAMERA_ID = 1

# Path to your trained YOLO model weights (ONNX format).
MODEL_PATH = os.path.join(os.path.dirname(__file__), "best.onnx")


# ─── Detection Thread ────────────────────────────────────────────────────────-
def run_detection():
    global detection_count, detection_log, is_running

    # Load YOLOv8/11 model via ultralytics package
    try:
        from ultralytics import YOLO
        model = YOLO(MODEL_PATH, task="detect")
        print(f"[INFO] YOLO model loaded from: {MODEL_PATH}")
    except Exception as e:
        print(f"[ERROR] Failed to load YOLO model: {e}")
        is_running = False
        return

    cap = cv2.VideoCapture(CAMERA_ID)
    if not cap.isOpened():
        print("[ERROR] Cannot open camera. Is it connected?")
        is_running = False
        return
        
    # Request Full HD resolution to use the entire camera sensor
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 860)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 520)
    
    # Force the camera's hardware/digital zoom to zoom all the way out
    cap.set(cv2.CAP_PROP_ZOOM, -200)

    consecutive_hits = 0
    absent_frames   = 0      # frames with no detection since last confirmed hit
    mosquito_present = False # True while a mosquito is still in the frame
    last_box = None          # store last detected bounding box for drawing
    last_label = "mosquito"  # store detected species/variant name

    is_running = True
    print("[INFO] Camera started. YOLO detection running.")
    print(f"[INFO] Confidence≥{CONFIDENCE_THRESHOLD}  Persistence={PERSISTENCE_FRAMES} frames  AbsentThreshold={ABSENT_FRAMES_THRESHOLD} frames")

    current_date = datetime.now().date()

    while is_running:
        # ── Midnight Reset Check ──────────────────────────────────────────────
        now_date = datetime.now().date()
        if now_date > current_date:
            print(f"[INFO] Midnight crossed. Resetting daily count from {detection_count} to 0.")
            detection_count = 0
            detection_log.clear()
            socketio.emit("count_reset", {"count": 0})
            current_date = now_date

        ret, frame = cap.read()
        if not ret:
            time.sleep(0.05)
            continue

        # ── YOLO Inference ─────────────────────────────────────────────────
        results = model(frame, conf=CONFIDENCE_THRESHOLD, verbose=False)

        found_qualifying = False

        if len(results) > 0 and len(results[0].boxes) > 0:
            boxes = results[0].boxes
            
            # Take the highest-confidence detection
            best_idx = int(boxes.conf.argmax().item())
            
            box = boxes[best_idx]
            coords = box.xyxy[0].cpu().numpy()
            x1, y1, x2, y2 = float(coords[0]), float(coords[1]), float(coords[2]), float(coords[3])
            
            # Shrink bounding box around the center
            if SHRINK_FACTOR != 1.0:
                w, h = x2 - x1, y2 - y1
                cx, cy = x1 + w / 2, y1 + h / 2
                x1 = cx - (w * SHRINK_FACTOR) / 2
                x2 = cx + (w * SHRINK_FACTOR) / 2
                y1 = cy - (h * SHRINK_FACTOR) / 2
                y2 = cy + (h * SHRINK_FACTOR) / 2

            x1, y1, x2, y2 = int(x1), int(y1), int(x2), int(y2)
            
            best_conf = float(box.conf[0].item())
            cls_idx = int(box.cls[0].item())
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

        # ── Update persistence counter & presence tracking ───────────────────
        if found_qualifying:
            consecutive_hits += 1
            absent_frames = 0          # reset absence timer while mosquito is visible
        else:
            consecutive_hits = 0
            last_box = None
            last_label = "mosquito"
            absent_frames += 1
            # Once absent long enough, mark the slot as free for the next mosquito
            if absent_frames >= ABSENT_FRAMES_THRESHOLD:
                if mosquito_present:
                    print("[INFO] Mosquito left the frame — ready for next entry.")
                mosquito_present = False
                absent_frames = 0

        # ── Trigger confirmed detection (new entry only) ──────────────────────
        if (
            consecutive_hits >= PERSISTENCE_FRAMES
            and not mosquito_present          # only count a fresh entry
        ):
            mosquito_present = True   # mark this mosquito as "currently in frame"
            consecutive_hits = 0
            detection_count += 1

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

    scheduler_thread = threading.Thread(target=activation_scheduler, daemon=True)
    scheduler_thread.start()

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
