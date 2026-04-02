from faster_whisper import WhisperModel
import torch

device = "cuda" if torch.cuda.is_available() else "cpu"

model = WhisperModel(
    "large",
    device=device,
    compute_type="int8"
)


