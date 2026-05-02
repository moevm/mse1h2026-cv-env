from datetime import datetime
from typing import Dict, List

# глобальное хранилище логов – оставляем здесь
_training_logs: Dict[str, List[str]] = {}

def add_training_log(task_id: str, message: str):
    """Добавляет лог в хранилище"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    log_entry = f"[{timestamp}] {message}"
    
    if task_id not in _training_logs:
        _training_logs[task_id] = []
    
    _training_logs[task_id].append(log_entry)
    
    if len(_training_logs[task_id]) > 1000:
        _training_logs[task_id] = _training_logs[task_id][-500:]

def get_training_logs(task_id: str, limit: int = 100) -> List[str]:
    """Возвращает последние логи"""
    logs = _training_logs.get(task_id, [])
    return logs[-limit:] if limit > 0 else logs