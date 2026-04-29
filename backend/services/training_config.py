import os
import yaml
from core.paths import get_project_paths
from schemas.training_schema import TrainingParamsSchema

def get_config_path(workspace_path: str = None) -> str:
    configs_dir = get_project_paths(workspace_path)["configs"]
    os.makedirs(configs_dir, exist_ok=True)
    return os.path.join(configs_dir, "training.yaml")

def load_training_config(workspace_path: str = None) -> dict:
    data = TrainingParamsSchema().model_dump()
    config_path = get_config_path(workspace_path)
    
    if os.path.exists(config_path):
        with open(config_path, "r", encoding="utf-8") as f:
            content = yaml.safe_load(f) or {}
            data.update(content.get("training", {}))
            
    return data

def save_training_config(data: TrainingParamsSchema, workspace_path: str = None):
    config_path = get_config_path(workspace_path)
    config_to_save = {"training": data.model_dump()}
    
    with open(config_path, "w", encoding="utf-8") as f:
        yaml.dump(config_to_save, f, default_flow_style=False)