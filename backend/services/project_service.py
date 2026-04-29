import os
import yaml
import datetime
import tkinter as tk
from tkinter import filedialog
from typing import Dict
import json

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
    val_split_percent: int = 10,   # Изменили дефолт на 10
    test_split_percent: int = 10   # ДОБАВИЛИ АРГУМЕНТ
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
            "test_split_percent": test_split_percent, # ДОБАВИЛИ В YAML
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
        
    datasets_dir = os.path.join(workspace_path, "datasets")
    annotated_images = {}
    
    if os.path.exists(datasets_dir):
        # Проходим по всем подпапкам датасетов
        for ds_name in os.listdir(datasets_dir):
            ds_path = os.path.join(datasets_dir, ds_name)
            if not os.path.isdir(ds_path):
                continue
                
            # Загружаем uuid_mapping
            mapping_file = os.path.join(ds_path, "uuid_mapping.json")
            uuid_mapping = {}
            if os.path.exists(mapping_file):
                try:
                    with open(mapping_file, 'r', encoding='utf-8') as f:
                        uuid_mapping = json.load(f)
                except Exception:
                    pass

            for root, _, files in os.walk(ds_path):
                for file in files:
                    if file.endswith('.txt') and file != 'classes.txt':
                        try:
                            with open(os.path.join(root, file), 'r', encoding='utf-8') as tf:
                                content = tf.read().strip()
                                if content:
                                    stem = os.path.splitext(file)[0].lower()
                                    
                                    # Достаем оригинальный путь из маппинга
                                    info = uuid_mapping.get(stem, {})
                                    orig_path = info.get("original_path", "")
                                    
                                    if orig_path:
                                        key_orig = os.path.splitext(orig_path)[0].replace("\\", "/").lower()
                                        key_base = key_orig.split("/")[-1] # Имя файла без пути
                                        
                                        # Сохраняем разметку по всем возможным ключам для фронта
                                        annotated_images[key_orig] = content
                                        annotated_images[key_base] = content
                                        
                                    annotated_images[stem] = content
                        except Exception:
                            pass
                            
    return {
        "config": config,
        "annotated_images": annotated_images
    }

def scan_folder_structure(root_path: str, virtual_root_name: str) -> Dict:
    if not os.path.exists(root_path):
        raise ValueError(f"Папка '{root_path}' не найдена на диске")

    files_list = []

    def build_tree(current_path: str, current_rel_path: str):
        children = []
        entries_data = []

        # 1. Собираем данные безопасно внутри контекстного менеджера `with`, 
        # чтобы итератор scandir не закрылся раньше времени (критично для WSL)
        try:
            with os.scandir(current_path) as it:
                for entry in it:
                    try:
                        is_dir = entry.is_dir()
                        is_file = entry.is_file()
                        # Сразу забираем размер, пока ОС дает доступ
                        size = entry.stat().st_size if is_file else 0
                        
                        entries_data.append({
                            "name": entry.name,
                            "path": entry.path,
                            "is_dir": is_dir,
                            "is_file": is_file,
                            "size": size
                        })
                    except Exception:
                        continue # Игнорируем файлы/папки с ошибкой прав доступа
        except Exception as e:
            print(f"Пропуск папки {current_path}: {e}")
            return []

        # 2. Теперь, когда все данные в памяти, безопасно сортируем их
        entries_data.sort(key=lambda x: x["name"])

        # 3. Строим дерево
        for data in entries_data:
            rel_path = f"{current_rel_path}/{data['name']}" if current_rel_path else data['name']

            if data["is_dir"]:
                sub_children = build_tree(data["path"], rel_path)
                children.append({
                    "name": data["name"],
                    "path": f"{virtual_root_name}/{rel_path}", 
                    "absolute_path": data["path"],
                    "isEnabled": True,
                    "children": sub_children
                })
            elif data["is_file"]:
                ext = data["name"].lower().split('.')[-1]
                if ext in ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'txt']:
                    file_info = {
                        "name": data["name"],
                        "absolute_path": data["path"],
                        "relativePath": f"{virtual_root_name}/{rel_path}",
                        "size": data["size"],
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