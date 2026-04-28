import os
import yaml
import datetime
import tkinter as tk
from tkinter import filedialog
from typing import Dict

def pick_directory_dialog() -> str:
    root = tk.Tk()
    root.withdraw()
    
    root.attributes('-topmost', True)
    
    folder_path = filedialog.askdirectory(title="Выберите рабочую папку для проекта")
    
    root.destroy()

    if not folder_path:
        return ""
    
    return folder_path

def init_project_workspace(name: str, workspace_path: str, project_id: str, 
                           folders: list = None, created_at: str = None) -> Dict:
    if not workspace_path:
        raise ValueError("Путь к рабочей папке не может быть пустым")
        
    try:
        os.makedirs(workspace_path, exist_ok=True)
        
        yaml_path = os.path.join(workspace_path, "project.yaml")

        created_at = created_at or datetime.datetime.now().isoformat()
    
        project_config = {
            "id": project_id,
            "name": name,
            "created_at": datetime.datetime.now().isoformat(),
            "workspace_path": workspace_path,
            "last_modified": datetime.datetime.now().isoformat(),
            "folders": folders or [],
        }
    
        with open(yaml_path, 'w', encoding='utf-8') as f:
            yaml.dump(project_config, f, allow_unicode=True, sort_keys=False)
        
        return {
            "status": "success",
            "config_file": yaml_path
        }
    except Exception as e:
        raise Exception(f"Не удалось инициализировать директорию {workspace_path}: {str(e)}")

def update_project_workspace(
    id: str, 
    name: str,
    created_at: str,
    path: str, 
    folders: list = None, 
    classes: list = None,
    train_split_percent: int = 80,
    val_split_percent: int = 20
) -> Dict:
    
    if not path:
        raise ValueError("Путь к рабочей папке не может быть пустым")
        
    try:
        os.makedirs(path, exist_ok=True)
        
        yaml_path = os.path.join(path, "project.yaml")
    
        project_config = {
            "id": id,
            "name": name,
            "created_at": created_at,
            "path": path,
            "train_split_percent": train_split_percent,
            "val_split_percent": val_split_percent,
            "folders": folders or [],
            "classes": classes or [],
            "last_modified": datetime.datetime.now().isoformat(),
        }
    
        with open(yaml_path, 'w', encoding='utf-8') as f:
            yaml.dump(project_config, f, allow_unicode=True, sort_keys=False)
        
        return {
            "status": "success",
            "config_file": yaml_path
        }
    except Exception as e:
        raise Exception(f"Не удалось обновить YAML файл в {path}: {str(e)}")