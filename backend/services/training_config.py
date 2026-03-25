import os
import yaml
from core.paths import CONFIGS_DIR
from schemas.training_schema import TrainingParamsSchema

CONFIG_PATH = os.path.join(CONFIGS_DIR, "training.yaml")

def load_training_config() -> dict:
    data = TrainingParamsSchema().model_dump()
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            content = yaml.safe_load(f) or {}
            data.update(content.get("training", {}))
    return data

def save_training_config(data: TrainingParamsSchema):
    os.makedirs(CONFIGS_DIR, exist_ok=True)
    config_to_save = {"training": data.model_dump()}
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        yaml.dump(config_to_save, f, default_flow_style=False)