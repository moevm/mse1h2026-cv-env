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

def load_project_workspace(workspace_path: str) -> Dict:
    yaml_path = os.path.join(workspace_path, "project.yaml")
    if not os.path.exists(yaml_path):
        raise ValueError("Файл project.yaml не найден в выбранной папке")
    
    with open(yaml_path, 'r', encoding='utf-8') as f:
        config = yaml.safe_load(f)
        
    project_name = config.get("name", "unknown")
    datasets_dir = os.path.join(workspace_path, "datasets", project_name)
    annotated_images = {}
    
    if os.path.exists(datasets_dir):
        for root, _, files in os.walk(datasets_dir):
            for file in files:
                if file.endswith('.txt') and file != 'classes.txt':
                    try:
                        with open(os.path.join(root, file), 'r', encoding='utf-8') as tf:
                            content = tf.read().strip()
                            if content:
                                stem = os.path.splitext(file)[0].lower()
                                annotated_images[stem] = content
                    except:
                        pass
                        
    return {
        "config": config,
        "annotated_images": annotated_images
    }

def scan_folder_structure(root_path: str, virtual_root_name: str) -> Dict:
    if not os.path.exists(root_path):
        raise ValueError(f"Папка {root_path} не найдена на диске")

    files_list = []

    def build_tree(current_path: str, current_rel_path: str):
        children = []
        try:
            entries = sorted(os.scandir(current_path), key=lambda e: e.name)
        except PermissionError:
            return []

        for entry in entries:
            rel_path = f"{current_rel_path}/{entry.name}" if current_rel_path else entry.name

            if entry.is_dir():
                sub_children = build_tree(entry.path, rel_path)
                children.append({
                    "name": entry.name,
                    "path": f"{virtual_root_name}/{rel_path}", 
                    "absolute_path": entry.path,
                    "isEnabled": True,
                    "children": sub_children
                })
            elif entry.is_file():
                ext = entry.name.lower().split('.')[-1]
                if ext in ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'txt']:
                    file_info = {
                        "name": entry.name,
                        "absolute_path": entry.path,
                        "relativePath": f"{virtual_root_name}/{rel_path}",
                        "size": entry.stat().st_size,
                        "type": "text/plain" if ext == 'txt' else f"image/{ext}"
                    }
                    files_list.append(file_info)

        return children

    tree = build_tree(root_path, "")

    return {
        "files": files_list,
        "tree": tree,
        "absolute_root": root_path,
        "virtual_root": virtual_root_name
    }