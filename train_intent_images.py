import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms, models
import pandas as pd
import os
from PIL import Image

# --- DATASET CLASS ---
class GazeIntentImageDataset(Dataset):
    def __init__(self, csv_file, img_dir, transform=None):
        self.data = pd.read_csv(csv_file)
        self.img_dir = img_dir
        self.transform = transform

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        img_name = os.path.join(self.img_dir, self.data.iloc[idx, 1])
        image = Image.open(img_name).convert('RGB')
        label = int(self.data.iloc[idx, 2])
        
        if self.transform:
            image = self.transform(image)
            
        return image, torch.tensor(label, dtype=torch.float32)

# --- MODEL ARCHITECTURE (CNN for Intent) ---
class IntentCNN(nn.Module):
    def __init__(self):
        super(IntentCNN, self).__init__()
        # Using a pre-trained ResNet as the backbone
        self.backbone = models.resnet18(pretrained=True)
        # Replace the last layer for binary classification
        num_ftrs = self.backbone.fc.in_features
        self.backbone.fc = nn.Sequential(
            nn.Linear(num_ftrs, 1),
            nn.Sigmoid()
        )

    def forward(self, x):
        return self.backbone(x)

# --- TRAINING FUNCTION ---
def train_model():
    # Setup
    DATA_DIR = "gaze_intent_dataset"
    CSV_PATH = os.path.join(DATA_DIR, "labels.csv")
    IMG_DIR = os.path.join(DATA_DIR, "images")
    
    if not os.path.exists(CSV_PATH):
        print("Error: Dataset not found. Run dataset_creator.py first.")
        return

    # Image Transforms
    transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
    ])

    dataset = GazeIntentImageDataset(CSV_PATH, IMG_DIR, transform=transform)
    train_size = int(0.8 * len(dataset))
    test_size = len(dataset) - train_size
    train_dataset, test_dataset = torch.utils.data.random_split(dataset, [train_size, test_size])

    train_loader = DataLoader(train_dataset, batch_size=16, shuffle=True)
    test_loader = DataLoader(test_dataset, batch_size=16, shuffle=False)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")

    model = IntentCNN().to(device)
    criterion = nn.BCELoss()
    optimizer = optim.Adam(model.parameters(), lr=0.0001)

    # Training Loop
    epochs = 10
    print("Starting training on images...")
    for epoch in range(epochs):
        model.train()
        running_loss = 0.0
        for images, labels in train_loader:
            images, labels = images.to(device), labels.to(device).view(-1, 1)
            
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            
            running_loss += loss.item()
        
        print(f"Epoch {epoch+1}/{epochs}, Loss: {running_loss/len(train_loader):.4f}")

    # Save
    torch.save(model.state_dict(), "intent_image_model.pth")
    print("Model saved as intent_image_model.pth")

if __name__ == "__main__":
    train_model()
