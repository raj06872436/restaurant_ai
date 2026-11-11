"""
Draw a zone around each table on a still frame from the camera.

    python calibrate.py --source rtsp://user:pass@192.168.1.20/stream1 --tables T1 T2 T3 T4

Click the corners of the area around a table (chairs included), press Enter to move
to the next table, Backspace to undo a point. The zones are written to tables.json.
"""
import argparse
import json
import os

import cv2
import numpy as np


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True)
    ap.add_argument("--tables", nargs="+", required=True)
    ap.add_argument("--out", default="tables.json")
    args = ap.parse_args()

    cap = cv2.VideoCapture(int(args.source) if args.source.isdigit() else args.source)
    ok, frame = cap.read()
    if not ok:
        raise SystemExit("Could not read a frame from the camera. Check the URL.")

    zones, points = [], []
    current = {"i": 0}

    def on_click(event, x, y, *_):
        if event == cv2.EVENT_LBUTTONDOWN:
            points.append([x, y])

    cv2.namedWindow("calibrate")
    cv2.setMouseCallback("calibrate", on_click)
    while current["i"] < len(args.tables):
        img = frame.copy()
        for z in zones:
            cv2.polylines(img, [np.array(z["polygon"], dtype=np.int32)], True, (60, 200, 90), 2)
        for p in points:
            cv2.circle(img, tuple(p), 4, (40, 140, 240), -1)
        cv2.putText(img, f"Draw {args.tables[current['i']]}, Enter = next", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, .8, (255, 255, 255), 2)
        cv2.imshow("calibrate", img)
        k = cv2.waitKey(20) & 0xFF
        if k in (13, 10) and len(points) >= 3:
            zones.append({"id": args.tables[current["i"]], "polygon": list(points)})
            points.clear()
            current["i"] += 1
        elif k == 8 and points:
            points.pop()
        elif k == 27:
            raise SystemExit("Cancelled")

    cfg = {}
    if os.path.exists(args.out):
        with open(args.out) as f:
            cfg = json.load(f)
    cfg.setdefault("server", "http://localhost:3000")
    cfg.setdefault("camera_key", "change-me-camera-key")
    cfg["source"] = args.source
    cfg["tables"] = zones
    with open(args.out, "w") as f:
        json.dump(cfg, f, indent=2)
    print(f"Saved {len(zones)} table zones to {args.out}")


if __name__ == "__main__":
    main()
