"""
TableSense camera connector.

Reads an existing CCTV feed (RTSP URL, video file or webcam), finds people with a
YOLO model, works out which table each person is at, and sends the counts to the
TableSense server. It only sends numbers; no video leaves the restaurant.

    pip install -r requirements.txt
    python detector.py --config tables.json

See README.md in this folder for drawing table zones with calibrate.py.
"""
import argparse
import json
import time
import urllib.request

import cv2
import numpy as np
from ultralytics import YOLO


def load_config(path):
    with open(path) as f:
        cfg = json.load(f)
    for t in cfg["tables"]:
        t["poly"] = np.array(t["polygon"], dtype=np.int32)
    return cfg


def is_staff(frame, box, staff_hsv):
    """Optional uniform check: share of the torso matching the staff uniform colour."""
    if not staff_hsv:
        return False
    x1, y1, x2, y2 = map(int, box)
    h = y2 - y1
    torso = frame[max(0, y1 + h // 5): max(0, y1 + h // 2), max(0, x1): max(0, x2)]
    if torso.size == 0:
        return False
    hsv = cv2.cvtColor(torso, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, np.array(staff_hsv["low"]), np.array(staff_hsv["high"]))
    return mask.mean() / 255 >= staff_hsv.get("min_share", 0.35)


class Debounce:
    """Only report seated/empty after it has held for a while, so a passer-by doesn't seat a table."""

    def __init__(self, seat_after, leave_after):
        self.seat_after, self.leave_after = seat_after, leave_after
        self.stable, self.change_since = 0, None

    def update(self, people, now=None):
        now = time.time() if now is None else now
        if (people > 0) == (self.stable > 0):
            self.stable, self.change_since = people, None  # same state: just refresh the head count
            return self.stable
        if self.change_since is None:
            self.change_since = now
        wait = self.seat_after if people > 0 else self.leave_after
        if now - self.change_since >= wait:
            self.stable, self.change_since = people, None
        return self.stable


def send(cfg, reports):
    body = json.dumps({"tables": reports}).encode()
    req = urllib.request.Request(
        cfg["server"].rstrip("/") + "/api/camera", data=body, method="POST",
        headers={"content-type": "application/json", "x-camera-key": cfg["camera_key"]},
    )
    with urllib.request.urlopen(req, timeout=5) as r:
        return r.status


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="tables.json")
    ap.add_argument("--show", action="store_true", help="show the video with zones (needs a screen)")
    args = ap.parse_args()
    cfg = load_config(args.config)

    model = YOLO(cfg.get("model", "yolov8n.pt"))  # downloads the small model on first run
    src = cfg["source"]
    cap = cv2.VideoCapture(int(src) if str(src).isdigit() else src)
    deb = {t["id"]: Debounce(cfg.get("seat_after_sec", 20), cfg.get("leave_after_sec", 60)) for t in cfg["tables"]}
    every = cfg.get("send_every_sec", 3)
    last_send = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            print("Camera frame missed, reconnecting in 5 s")
            time.sleep(5)
            cap = cv2.VideoCapture(int(src) if str(src).isdigit() else src)
            continue

        result = model(frame, classes=[0], conf=cfg.get("confidence", 0.4), verbose=False)[0]
        counts = {t["id"]: 0 for t in cfg["tables"]}
        staff = {t["id"]: False for t in cfg["tables"]}
        for box in result.boxes.xyxy.cpu().numpy():
            x1, y1, x2, y2 = box
            # A seated person's hips sit roughly 70% down the box; use that point to pick the table.
            point = (float((x1 + x2) / 2), float(y1 + (y2 - y1) * 0.7))
            for t in cfg["tables"]:
                if cv2.pointPolygonTest(t["poly"], point, False) >= 0:
                    if is_staff(frame, box, cfg.get("staff_uniform_hsv")):
                        staff[t["id"]] = True
                    else:
                        counts[t["id"]] += 1
                    break

        if time.time() - last_send >= every:
            reports = [{"tableId": tid, "people": deb[tid].update(n), "staffNearby": staff[tid]} for tid, n in counts.items()]
            try:
                send(cfg, reports)
            except Exception as e:  # keep running if the server is briefly down
                print("Could not reach the server:", e)
            last_send = time.time()

        if args.show:
            for t in cfg["tables"]:
                c = (60, 200, 90) if deb[t["id"]].stable == 0 else (40, 140, 240)
                cv2.polylines(frame, [t["poly"]], True, c, 2)
                cv2.putText(frame, f'{t["id"]} {deb[t["id"]].stable}', tuple(t["poly"][0]), cv2.FONT_HERSHEY_SIMPLEX, .7, c, 2)
            cv2.imshow("TableSense", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break


if __name__ == "__main__":
    main()
