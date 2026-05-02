import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STORAGE_DIR = os.path.join(BASE_DIR, "storage")
DATASETS_DIR = os.path.join(STORAGE_DIR, "datasets")
EXPERIMENTS_DIR = os.path.join(STORAGE_DIR, "experiments")
TRAINING_DIR = os.path.join(STORAGE_DIR, "training")
CONFIGS_DIR = os.path.join(STORAGE_DIR, "configs")
FRAMES_DIR = os.path.join(STORAGE_DIR, "frames")

def get_project_paths(workspace_path: str = None):
    storage = workspace_path if (workspace_path and os.path.isabs(workspace_path)) else STORAGE_DIR
    return {
        "storage": storage,
        "datasets": os.path.join(storage, "datasets"),
        "configs": os.path.join(storage, "configs"),
        "training": os.path.join(storage, "training"),
        "experiments": os.path.join(storage, "experiments"),
        "frames": os.path.join(storage, "frames"),
    }

def ensure_project_directories(workspace_path: str):
    paths = get_project_paths(workspace_path)
    for p in paths.values():
        os.makedirs(p, exist_ok=True)
    return paths

def ensure_directories():
    os.makedirs(DATASETS_DIR, exist_ok=True)
    os.makedirs(TRAINING_DIR, exist_ok=True)
    os.makedirs(EXPERIMENTS_DIR, exist_ok=True)
    os.makedirs(CONFIGS_DIR, exist_ok=True)
    os.makedirs(FRAMES_DIR, exist_ok=True)
