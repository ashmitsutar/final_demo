import cv2
import mediapipe as mp
import time
import pandas as pd

# Initialize MediaPipe FaceMesh
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(refine_landmarks=True)

# Webcam
cap = cv2.VideoCapture(0)

# Data storage
data = []

# Eye landmark indices (important)
LEFT_EYE = [33, 160, 158, 133, 153, 144]
RIGHT_EYE = [362, 385, 387, 263, 373, 380]

# Simple blink detection threshold
BLINK_THRESHOLD = 0.02

# Current label (change using keyboard)
current_label = "ignore"

def get_eye_aspect_ratio(landmarks, eye_indices, w, h):
    points = [(int(landmarks[i].x * w), int(landmarks[i].y * h)) for i in eye_indices]
    
    # vertical distances
    v1 = abs(points[1][1] - points[5][1])
    v2 = abs(points[2][1] - points[4][1])
    
    # horizontal distance
    h_dist = abs(points[0][0] - points[3][0])
    
    ear = (v1 + v2) / (2.0 * h_dist)
    return ear

print("Press:")
print("1 → ignore | 2 → interested | 3 → select | q → quit")

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    h, w, _ = frame.shape
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    result = face_mesh.process(rgb)

    gaze_x, gaze_y, blink = 0, 0, 0

    if result.multi_face_landmarks:
        landmarks = result.multi_face_landmarks[0].landmark

        # Use nose tip as approximate gaze (simple start)
        gaze_x = landmarks[1].x
        gaze_y = landmarks[1].y

        # Blink detection
        left_ear = get_eye_aspect_ratio(landmarks, LEFT_EYE, w, h)
        right_ear = get_eye_aspect_ratio(landmarks, RIGHT_EYE, w, h)

        ear = (left_ear + right_ear) / 2.0

        if ear < BLINK_THRESHOLD:
            blink = 1

        # Draw info
        cv2.putText(frame, f"Label: {current_label}", (20, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0,255,0), 2)

    # Save data
    data.append({
        "timestamp": time.time(),
        "gaze_x": gaze_x,
        "gaze_y": gaze_y,
        "blink": blink,
        "label": current_label
    })

    cv2.imshow("Data Collection", frame)

    key = cv2.waitKey(1) & 0xFF

    if key == ord('1'):
        current_label = "ignore"
    elif key == ord('2'):
        current_label = "interested"
    elif key == ord('3'):
        current_label = "select"
    elif key == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()

# Save to CSV
df = pd.DataFrame(data)
df.to_csv("gaze_dataset.csv", index=False)

print("Data saved to gaze_dataset.csv")