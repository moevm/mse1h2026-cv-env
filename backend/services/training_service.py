import os
from typing import Dict

def validate_model_name(model_name: str) -> Dict:
    """
    Проверяет существование модели с поддержкой кастомных путей
    """
    available_models = [
        # YOLOv8
        "yolov8n", "yolov8s", "yolov8m", "yolov8l", "yolov8x",
        "yolov8n-seg", "yolov8s-seg", "yolov8m-seg", "yolov8l-seg", "yolov8x-seg",
        "yolov8n-pose", "yolov8s-pose", "yolov8m-pose", "yolov8l-pose", "yolov8x-pose",
        
        # YOLOv5
        "yolov5nu", "yolov5su", "yolov5mu", "yolov5lu", "yolov5xu",
        
        # YOLOv9
        "yolov9t", "yolov9s", "yolov9m", "yolov9c", "yolov9e",
        
        # YOLOv10
        "yolov10n", "yolov10s", "yolov10m", "yolov10l", "yolov10x",
        
        # YOLOv11
        "yolov11n", "yolov11s", "yolov11m", "yolov11l", "yolov11x"
    ]
    
    is_custom = model_name.endswith('.pt') or '/' in model_name or '\\' in model_name
    
    if is_custom:
        if os.path.exists(model_name):
            return {"valid": True, "message": f"Пользовательская модель найдена: {model_name}"}
        else:
            return {"valid": False, "message": f"Файл модели не найден: {model_name}"}
    
    if model_name in available_models:
        return {"valid": True, "message": f"Модель {model_name} доступна"}
    else:
        similar = [m for m in available_models if model_name.lower() in m.lower()][:5]
        suggestion = f"\nВозможно вы имели в виду: {', '.join(similar)}" if similar else ""
        
        return {
            "valid": False,
            "message": f"Модель '{model_name}' не найдена. Доступные модели: {', '.join(available_models[:10])}...{suggestion}"
        }