import os
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

def init_project_workspace(name: str, workspace_path: str) -> Dict:
    if not workspace_path:
        raise ValueError("Путь к рабочей папке не может быть пустым")
        
    try:
        os.makedirs(workspace_path, exist_ok=True)
        
        return {
            "status": "success", 
            "message": f"Рабочая папка для проекта '{name}' успешно инициализирована",
            "path": workspace_path
        }
    except Exception as e:
        raise Exception(f"Не удалось создать директорию {workspace_path}: {str(e)}")