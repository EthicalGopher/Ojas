"""
GPU-Accelerated Tree Pose Form Classifier (Correct Pose vs Wrong Pose)
======================================================================
Trains an image classification neural network (ResNet50 / MobileNet) to
distinguish between:
  0: CORRECT_POSE (Foot safely placed high on inner thigh or calf)
  1: WRONG_POSE   (Foot pressing directly against the knee joint / bad alignment)

Dataset:
  dataset/
    ├── correct_pose/   (Positive Tree Pose images)
    └── wrong_pose/     (Tree poses with foot resting on knee joint / flawed posture)

Features:
- PyTorch GPU Training with CUDA acceleration (NVIDIA RTX 4060)
- Advanced Yoga Data Augmentations (Horizontal flips, affine rotations, scale crops, jitter)
- Cross-Entropy Loss with automatic class balancing
- Exports fine-tuned weights to 'trained_tree_pose_model.pth'
"""

import os
import sys
import time
import copy
import argparse
import numpy as np

import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import DataLoader, random_split
from torchvision import datasets, transforms, models

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
DATASET_DIR = "dataset"
SAVE_MODEL_PATH = "trained_tree_pose_model.pth"


def get_data_transforms():
    """Augmentations tailored to expand small posture datasets into robust classifiers."""
    train_transforms = transforms.Compose([
        transforms.Resize((256, 256)),
        transforms.RandomResizedCrop(224, scale=(0.80, 1.0)),
        transforms.RandomHorizontalFlip(p=0.5),  # Learns both Left-leg & Right-leg standing poses
        transforms.RandomRotation(degrees=10),
        transforms.ColorJitter(brightness=0.25, contrast=0.25, saturation=0.25),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])

    val_transforms = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])

    return train_transforms, val_transforms


def build_model(num_classes=2):
    """Initializes pre-trained ResNet with custom classification head."""
    model = models.resnet50(weights=models.ResNet50_Weights.DEFAULT)
    in_features = model.fc.in_features
    model.fc = nn.Sequential(
        nn.Dropout(0.3),
        nn.Linear(in_features, 256),
        nn.ReLU(),
        nn.Dropout(0.2),
        nn.Linear(256, num_classes)
    )
    return model


def train_model(epochs=15, batch_size=4, lr=1e-4):
    print("=" * 70)
    print(f"   TREE POSE NEURAL CLASSIFIER TRAINING (Device: {DEVICE.upper()})   ")
    print("=" * 70)

    train_tf, val_tf = get_data_transforms()
    full_dataset = datasets.ImageFolder(root=DATASET_DIR, transform=train_tf)
    classes = full_dataset.classes
    class_to_idx = full_dataset.class_to_idx

    print(f"[INFO] Target Classes ({len(classes)}): {classes}")
    for cls_name, cls_id in class_to_idx.items():
        count = sum(1 for _, label in full_dataset.samples if label == cls_id)
        print(f"  - '{cls_name}': {count} source images")

    # Due to small seed dataset, create oversampled train data loaders with rich augmentations
    train_loader = DataLoader(full_dataset, batch_size=batch_size, shuffle=True, drop_last=False)

    model = build_model(num_classes=len(classes)).to(DEVICE)

    # Balanced class weights
    labels = [label for _, label in full_dataset.samples]
    counts = np.bincount(labels, minlength=len(classes))
    weights = len(labels) / (len(classes) * np.maximum(counts, 1.0))
    weights_tensor = torch.tensor(weights, dtype=torch.float32).to(DEVICE)

    criterion = nn.CrossEntropyLoss(weight=weights_tensor)
    optimizer = optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-2)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs)

    best_acc = 0.0
    best_weights = copy.deepcopy(model.state_dict())

    print("\n[INFO] Starting training epochs...")
    for epoch in range(epochs):
        model.train()
        running_loss = 0.0
        running_correct = 0
        total = 0

        for inputs, targets in train_loader:
            inputs = inputs.to(DEVICE)
            targets = targets.to(DEVICE)

            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, targets)
            loss.backward()
            optimizer.step()

            running_loss += loss.item() * inputs.size(0)
            preds = torch.argmax(outputs, dim=1)
            running_correct += torch.sum(preds == targets).item()
            total += targets.size(0)

        scheduler.step()
        epoch_loss = running_loss / max(1, total)
        epoch_acc = (running_correct / max(1, total)) * 100.0

        print(f"Epoch [{epoch + 1:02d}/{epochs:02d}] - Loss: {epoch_loss:.4f} - Accuracy: {epoch_acc:.1f}%")

        if epoch_acc >= best_acc:
            best_acc = epoch_acc
            best_weights = copy.deepcopy(model.state_dict())

    # Save trained checkpoint
    torch.save({
        "model_state_dict": best_weights,
        "classes": classes,
        "class_to_idx": class_to_idx,
        "model_type": "resnet50_pose_classifier"
    }, SAVE_MODEL_PATH)

    print("-" * 70)
    print(f"[SUCCESS] Trained model saved to: '{SAVE_MODEL_PATH}' with {best_acc:.1f}% peak accuracy!\n")


def main():
    parser = argparse.ArgumentParser(description="Train Tree Pose Form Neural Classifier")
    parser.add_argument("--epochs", type=int, default=15, help="Epochs (default 15)")
    parser.add_argument("--batch-size", type=int, default=4, help="Batch size (default 4)")
    parser.add_argument("--lr", type=float, default=1e-4, help="Learning rate (default 1e-4)")
    args = parser.parse_args()

    train_model(epochs=args.epochs, batch_size=args.batch_size, lr=args.lr)


if __name__ == "__main__":
    main()
