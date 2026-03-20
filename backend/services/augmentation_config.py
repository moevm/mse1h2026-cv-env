import os
import yaml
from core.paths import CONFIGS_DIR
from schemas.augmentation_schema import AugmentationSchema

CONFIG_PATH = os.path.join(CONFIGS_DIR, "augmentations.yaml")


def load_augmentation_config() -> dict:
    data = AugmentationSchema().model_dump()

    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            content = yaml.safe_load(f) or {}
            data.update(content.get("augmentation", {}))

    return data


def save_augmentation_config(data: AugmentationSchema):
    os.makedirs(CONFIGS_DIR, exist_ok=True)

    config_to_save = {"augmentation": data.model_dump()}

    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        yaml.dump(config_to_save, f, default_flow_style=False)