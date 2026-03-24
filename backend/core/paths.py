import os

# Абсолютный путь к корню проекта
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Папка storage
STORAGE_DIR = os.path.join(BASE_DIR, "storage")

# Подпапки
CONFIGS_DIR = os.path.join(STORAGE_DIR, "configs")
DATASETS_DIR = os.path.join(STORAGE_DIR, "datasets")
EXPERIMENTS_DIR = os.path.join(STORAGE_DIR, "experiments")


def ensure_directories():
    """Создаёт необходимые папки при запуске"""
    os.makedirs(CONFIGS_DIR, exist_ok=True)
    os.makedirs(DATASETS_DIR, exist_ok=True)
    os.makedirs(EXPERIMENTS_DIR, exist_ok=True)