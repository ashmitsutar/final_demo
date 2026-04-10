import cv2
import os
import csv
import time
from datetime import datetime

# Configure storage
DATASET_DIR = "gaze_intent_dataset"
IMAGE_DIR = os.path.join(DATASET_DIR, "images")
LABEL_FILE = os.path.join(DATASET_DIR, "labels.csv")

# Create directories
os.makedirs(IMAGE_DIR, exist_ok=True)

def collect_data():
    """
    Captures webcam frames and allows labeling of 'intent' in real-time.
    Press 'i' to toggle Intent (Selection Intent).
    Press 'q' to quit.
    """
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("Error: Could not open webcam.")
        return

    print("--- DATA COLLECTION MODE ---")
    print("Instructions:")
    print("1. Look at your UI as if you are going to select something.")
    print("2. Press and HOLD 'i' when you have the INTENT to select.")
    print("3. Release 'i' when you are just browsing.")
    print("4. Press 'q' to stop and save.")

    # Prepare CSV
    file_exists = os.path.isfile(LABEL_FILE)
    with open(LABEL_FILE, mode='a', newline='') as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(["timestamp", "image_path", "intent_label"])

        intent_active = 0
        count = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            # Check keys
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                break
            
            # Simple toggle/hold logic for intent
            # Note: For better precision, one could use a more complex event loop
            # Here we just check if 'i' is pressed in this loop iteration
            # In OpenCV waitKey(1) isn't great for 'hold', but we'll use a toggle for simplicity
            if key == ord('i'):
                intent_active = 1 - intent_active
                status_color = (0, 255, 0) if intent_active else (0, 0, 255)
                print(f"Intent Toggled: {'ACTIVE' if intent_active else 'OFF'}")

            # Save image
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            img_filename = f"frame_{timestamp}.jpg"
            img_path = os.path.join(IMAGE_DIR, img_filename)
            cv2.imwrite(img_path, frame)

            # Log to CSV
            writer.writerow([timestamp, img_filename, intent_active])
            
            # --- VISUAL FEEDBACK ---
            display_frame = frame.copy()
            status_text = "MODE: SELECTION INTENT (1)" if intent_active else "MODE: BROWSING (0)"
            color = (0, 255, 0) if intent_active else (0, 0, 255)
            
            # Add a thick border to make it very obvious
            cv2.rectangle(display_frame, (0, 0), (display_frame.shape[1], display_frame.shape[0]), color, 20)
            
            # Display Instructions
            cv2.putText(display_frame, status_text, (40, 60), cv2.FONT_HERSHEY_DUPLEX, 1, color, 2)
            cv2.putText(display_frame, "Press 'i' to TOGGLE Label", (40, 410), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
            cv2.putText(display_frame, "Press 'q' to SAVE & QUIT", (40, 440), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
            
            cv2.imshow("GazeIntent Data Collection", display_frame)
            count += 1

    cap.release()
    cv2.destroyAllWindows()
    print(f"Collection finished. Saved {count} frames to {DATASET_DIR}")

if __name__ == "__main__":
    collect_data()
