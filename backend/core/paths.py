import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STORAGE_DIR = os.path.join(BASE_DIR, "storage")

CONFIGS_DIR = os.path.join(STORAGE_DIR, "configs")
DATASETS_DIR = os.path.join(STORAGE_DIR, "datasets")
EXPERIMENTS_DIR = os.path.join(STORAGE_DIR, "experiments")
TRAINING_DIR = os.path.join(STORAGE_DIR, "training_runs")
STATIC_DIR = os.path.join(BASE_DIR, "static")

def ensure_directories():
    os.makedirs(CONFIGS_DIR, exist_ok=True)
    os.makedirs(DATASETS_DIR, exist_ok=True)
    os.makedirs(EXPERIMENTS_DIR, exist_ok=True)
    os.makedirs(TRAINING_DIR, exist_ok=True)
    os.makedirs(STATIC_DIR, exist_ok=True)
