import os
import re
import uuid
import yaml
import threading
import json
from datetime import datetime
from typing import Dict, Optional, List
from ultralytics import YOLO
from core.paths import get_project_paths
from schemas.training_schema import TrainingRequestSchema, TrainingStatusSchema
import torch
import csv

training_tasks: Dict[str, TrainingStatusSchema] = {}
training_models: Dict[str, YOLO] = {}
training_logs: Dict[str, List[str]] = {}
training_events: Dict[str, threading.Event] = {}
training_threads: Dict[str, threading.Thread] = {}
training_exp_dirs: Dict[str, str] = {} 
training_requests: Dict[str, TrainingRequestSchema] = {}
training_pause_events: Dict[str, threading.Event] = {}


class TrainingCallback:
    """Колбэк для отслеживания прогресса обучения"""
    
    def __init__(self, task_id: str, stop_event: threading.Event):
        self.task_id = task_id
        self.stop_event = stop_event
        self.current_epoch = 0
        self.total_epochs = 0
        self.last_epoch = -1
        self.last_log_time = 0
    def on_train_epoch_start(self, trainer):
        try:
            if self.stop_event.is_set():
                trainer.stop_training = True
                return
            
            pause_event = training_pause_events.get(self.task_id)
            if pause_event and pause_event.is_set():
                # Модель уже сохранена в pause_training, просто прерываем
                raise PauseTrainingException("Training paused by user")
            
            self.current_epoch = trainer.epoch + 1
            self.total_epochs = trainer.epochs
            self._update_status(trainer)
        except Exception as e:
            if not isinstance(e, PauseTrainingException):
                print(f"[ERROR] Callback error for task {self.task_id}: {e}")
            raise
    def on_train_epoch_end(self, trainer):
        try:
            pause_event = training_pause_events.get(self.task_id)
            if pause_event and pause_event.is_set():
                if hasattr(trainer, 'save_model'):
                    trainer.save_model()  # сохраняем перед выходом
                raise PauseTrainingException("Training paused by user")  # ВЫБРАСЫВАЕМ ИСКЛЮЧЕНИЕ
            
            self.current_epoch = trainer.epoch
            self.total_epochs = trainer.epochs
            self._update_status(trainer)
        except Exception as e:
            if not isinstance(e, PauseTrainingException):
                print(f"[ERROR] Callback error for task {self.task_id}: {e}")
            raise
    
    def _update_status(self, trainer):
        """Обновляет статус обучения"""
        task = training_tasks.get(self.task_id)
        if not task:
            return
        
        task.current_epoch = self.current_epoch
        task.total_epochs = self.total_epochs
        
        if self.total_epochs > 0:
            progress = (self.current_epoch / self.total_epochs) * 100
            task.progress = min(progress, 100)
        
        if hasattr(trainer, 'metrics') and trainer.metrics:
            loss = None
            if 'loss' in trainer.metrics:
                loss = trainer.metrics['loss']
            elif 'box_loss' in trainer.metrics:
                loss = trainer.metrics['box_loss']
            
            if loss is not None:
                task.loss = float(loss)
        
        task.updated_at = datetime.now()
        
        if self.current_epoch != self.last_epoch:
            print(f"[DEBUG] Task {self.task_id} - Epoch {self.current_epoch}/{self.total_epochs}, Progress: {task.progress:.1f}%")
            
            if self.current_epoch % 5 == 0 or self.current_epoch == self.total_epochs:
                add_training_log(self.task_id, 
                    f"Эпоха {self.current_epoch}/{self.total_epochs}, Loss: {task.loss if task.loss else 'N/A'}")
            
            self.last_epoch = self.current_epoch


def add_training_log(task_id: str, message: str):
    """Добавляет лог в хранилище"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    log_entry = f"[{timestamp}] {message}"
    
    if task_id not in training_logs:
        training_logs[task_id] = []
    
    training_logs[task_id].append(log_entry)
    
    if len(training_logs[task_id]) > 1000:
        training_logs[task_id] = training_logs[task_id][-500:]


def validate_model_name(model_name: str) -> Dict:
    """Проверяет существование модели"""
    available_models = [
        "yolov8n", "yolov8s", "yolov8m", "yolov8l", "yolov8x",
        "yolov8n-seg", "yolov8s-seg", "yolov8m-seg", "yolov8l-seg", "yolov8x-seg",
        "yolov8n-pose", "yolov8s-pose", "yolov8m-pose", "yolov8l-pose", "yolov8x-pose",
        "yolov5nu", "yolov5su", "yolov5mu", "yolov5lu", "yolov5xu",
        "yolov9t", "yolov9s", "yolov9m", "yolov9c", "yolov9e",
        "yolov10n", "yolov10s", "yolov10m", "yolov10l", "yolov10x",
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
        return {"valid": False, "message": f'Модель "{model_name}" не найдена. {suggestion}'}


def run_dummy_training(task_id: str, request: TrainingRequestSchema):
    stop_event = training_events.get(task_id)
    
    try:
        add_training_log(task_id, "Запуск заглушечного обучения...")
        training_tasks[task_id].status = "running"
        training_tasks[task_id].updated_at = datetime.now()
        
        total_epochs = request.epochs if request.epochs >= 20 else 20
        if total_epochs > 20:
            add_training_log(task_id, f"Установлено {total_epochs} эпох для тестирования")
        
        for epoch in range(1, total_epochs + 1):
            if stop_event and stop_event.is_set():
                add_training_log(task_id, "Обучение остановлено пользователем")
                training_tasks[task_id].status = "stopped"
                return
            
            simulated_loss = 2.5 * (1 - epoch / total_epochs) + 0.5
            
            task = training_tasks[task_id]
            task.current_epoch = epoch
            task.total_epochs = total_epochs
            task.progress = (epoch / total_epochs) * 100
            task.loss = simulated_loss
            task.updated_at = datetime.now()
            
            if epoch % 5 == 0 or epoch == total_epochs:
                add_training_log(task_id, 
                    f"Эпоха {epoch}/{total_epochs}, Loss: {simulated_loss:.4f}")
            
            print(f"[DUMMY] Task {task_id} - Epoch {epoch}/{total_epochs}, Progress: {task.progress:.1f}%")
            
            import time
            time.sleep(0.5)
        
        add_training_log(task_id, "Обучение успешно завершено!")
        training_tasks[task_id].status = "completed"
        training_tasks[task_id].progress = 100
        training_tasks[task_id].updated_at = datetime.now()
        
    except Exception as e:
        add_training_log(task_id, f"Ошибка: {str(e)}")
        training_tasks[task_id].status = "failed"
        training_tasks[task_id].error = str(e)
        training_tasks[task_id].updated_at = datetime.now()


def run_real_training(task_id: str, request: TrainingRequestSchema, resume_flag: bool = False):
    """Реальное обучение YOLO"""
    stop_event = training_events.get(task_id)
    
    try:
        workspace_path = getattr(request.dataset, 'workspace_path', None)
        project_paths = get_project_paths(workspace_path)
        training_dir = project_paths["training"]

        add_training_log(task_id, f"Инициализация обучения на модели {request.model}")
        training_tasks[task_id].status = "running"
        training_tasks[task_id].updated_at = datetime.now()
        
        exp_dir = os.path.join(training_dir, task_id)
        os.makedirs(exp_dir, exist_ok=True)
        training_exp_dirs[task_id] = exp_dir

        use_coco8 = getattr(request.dataset, 'use_coco8', False)

        if use_coco8:
            run_data_yaml = "coco8.yaml"
        else:
            train_paths = []
            val_paths = []

            active_folders = getattr(request.dataset, 'active_folders', [])

            for folder_name in active_folders:
                safe_folder_name = re.sub(r"[^a-zA-Zа-яА-Я0-9._-]+", "_", folder_name).strip("._-")
                ds_dir = os.path.join(project_paths["datasets"], safe_folder_name)

                if os.path.exists(os.path.join(ds_dir, "train", "images")):
                    train_paths.append(os.path.join(ds_dir, "train", "images"))
                    val_paths.append(os.path.join(ds_dir, "val", "images"))

            if not train_paths:
                raise ValueError("Не найдено экспортированных изображений для выбранных папок! Сначала сохраните датасет.")

            run_data_yaml = os.path.join(exp_dir, "run_data.yaml")

            classes_dict = {i: name for i, name in enumerate(request.dataset.classes)}
            if not classes_dict and active_folders:
                first_folder = re.sub(r"[^a-zA-Zа-яА-Я0-9._-]+", "_", active_folders[0]).strip("._-")
                first_yaml_path = os.path.join(project_paths["datasets"], first_folder, "dataset.yaml")
                if os.path.exists(first_yaml_path):
                    with open(first_yaml_path, 'r', encoding='utf-8') as f:
                        ds_data = yaml.safe_load(f)
                        classes_dict = ds_data.get("names", {})

            yaml_content = {
                "path": "",
                "train": train_paths,
                "val": val_paths,
                "names": classes_dict
            }

            with open(run_data_yaml, 'w', encoding='utf-8') as f:
                yaml.dump(yaml_content, f, allow_unicode=True)

        config_path = os.path.join(exp_dir, "config.yaml")
        with open(config_path, 'w', encoding='utf-8') as f:
            yaml.dump(request.model_dump(), f, default_flow_style=False, allow_unicode=True)
        
        add_training_log(task_id, f"Загрузка модели {request.model}...")
        
        model = YOLO(request.model)
        training_models[task_id] = model
        
        device = request.device
        if device == "auto":
            device = "cuda" if torch.cuda.is_available() else "cpu"
        
        add_training_log(task_id, f"Используется устройство: {device}")
        
        callback = TrainingCallback(task_id, stop_event)
        
        try:
            model.add_callback("on_train_epoch_start", callback.on_train_epoch_start)
            model.add_callback("on_train_epoch_end", callback.on_train_epoch_end)
            add_training_log(task_id, "Callback успешно зарегистрирован")
            print(f"[DEBUG] Registered callbacks for task {task_id}")

        except Exception as e:
            add_training_log(task_id, f"Ошибка регистрации callback: {e}")
            print(f"[ERROR] Failed to register callbacks: {e}")
        
        train_params = {
            'data': run_data_yaml,
            'epochs': request.epochs,
            'batch': request.batch,
            'imgsz': request.imgsz,
            'device': device,
            'workers': request.workers,
            'patience': request.patience,
            'save': request.save,
            'save_period': request.save_period,
            'cache': request.cache,
            'optimizer': request.optimizer,
            'lr0': request.lr0,
            'lrf': request.lrf,
            'momentum': request.momentum,
            'weight_decay': request.weight_decay,
            'warmup_epochs': request.warmup_epochs,
            'warmup_momentum': request.warmup_momentum,
            'warmup_bias_lr': request.warmup_bias_lr,
            'resume': resume_flag,
            'save_period': request.save_period if request.save_period > 0 else 1,
            'project': training_dir,
            'name': task_id,
            'exist_ok': True,
            'verbose': True,
        }
        
        aug = request.augmentations
        if aug:
            train_params.update({
                'hsv_h': aug.hsv_h,
                'hsv_s': aug.hsv_s,
                'hsv_v': aug.hsv_v,
                'degrees': aug.degrees,
                'translate': aug.translate,
                'scale': aug.scale,
                'shear': aug.shear,
                'perspective': aug.perspective,
                'flipud': aug.flipud,
                'fliplr': aug.fliplr,
                'mosaic': aug.mosaic,
                'mixup': aug.mixup,
            })
        
        add_training_log(task_id, "Начинаем обучение...")

        print(f"[DEBUG] Starting training for task {task_id}")
        print(f"[DEBUG] Total epochs: {request.epochs}")
        
        results = model.train(**train_params)
        if stop_event and stop_event.is_set():
            task = training_tasks[task_id]
            if task.status != "paused":   # если пауза уже установлена callback'ом
                task.status = "stopped"
            task.updated_at = datetime.now()
            add_training_log(task_id, "Обучение остановлено")
        elif training_tasks[task_id].status == "running":
            training_tasks[task_id].status = "completed"

        print(f"[DEBUG] Training finished for task {task_id}")
        print(f"[DEBUG] Results: {results}")

        task = training_tasks.get(task_id)
        if task and task.status == "running":
            print(f"[DEBUG] Forcing completed status for task {task_id}")
            task.status = "completed"
            task.progress = 100
            task.current_epoch = request.epochs
            task.updated_at = datetime.now()
            add_training_log(task_id, "Обучение успешно завершено!")
        
        if stop_event and stop_event.is_set():
            add_training_log(task_id, "Обучение остановлено пользователем")
            training_tasks[task_id].status = "stopped"
        elif results:
            add_training_log(task_id, "Обучение успешно завершено!")
            
            task = training_tasks[task_id]
            task.status = "completed"
            task.progress = 100
            if task.current_epoch != request.epochs:
                task.current_epoch = request.epochs
            task.updated_at = datetime.now()
            
            save_training_results(task_id, exp_dir, request, results)
        else:
            add_training_log(task_id, "Обучение завершилось с ошибкой")
            training_tasks[task_id].status = "failed"
    except PauseTrainingException:
        add_training_log(task_id, "Обучение приостановлено пользователем")
        task = training_tasks.get(task_id)
        if task:
            task.status = "paused"
            task.updated_at = datetime.now()

    except Exception as e:
        error_msg = f"Ошибка обучения: {str(e)}"
        add_training_log(task_id, error_msg)
        training_tasks[task_id].status = "failed"
        training_tasks[task_id].error = str(e)
        training_tasks[task_id].updated_at = datetime.now()
        
        if 'experiments_dir' in locals():
            exp_dir = os.path.join(training_dir, task_id)
            os.makedirs(exp_dir, exist_ok=True)
            error_path = os.path.join(exp_dir, "error.log")
            with open(error_path, 'w', encoding='utf-8') as f:
                f.write(str(e))
    
    finally:
        add_training_log(task_id, "Очистка ресурсов завершена")


def save_training_results(task_id: str, exp_dir: str, request: TrainingRequestSchema, results):
    """Сохраняет результаты обучения"""
    try:
        metrics = {}
        if hasattr(results, 'results_dict'):
            metrics = results.results_dict
        elif hasattr(results, 'metrics'):
            metrics = results.metrics
        
        results_data = {
            'task_id': task_id,
            'model_name': request.modelName or request.model,
            'dataset': request.dataset.model_dump() if hasattr(request.dataset, 'model_dump') else request.dataset,
            'parameters': request.model_dump(exclude={'augmentations', 'dataset', 'timestamp'}),
            'augmentations': request.augmentations.model_dump() if request.augmentations else {},
            'started_at': request.timestamp.isoformat(),
            'completed_at': datetime.now().isoformat(),
            'status': training_tasks[task_id].status,
            'final_metrics': metrics
        }
        
        results_path = os.path.join(exp_dir, "results.json")
        with open(results_path, 'w', encoding='utf-8') as f:
            json.dump(results_data, f, indent=2, ensure_ascii=False)
        
        report_path = os.path.join(exp_dir, "report.txt")
        with open(report_path, 'w', encoding='utf-8') as f:
            f.write(f"Training Report - {task_id}\n")
            f.write(f"{'='*50}\n\n")
            f.write(f"Model: {results_data['model_name']}\n")
            f.write(f"Status: {results_data['status']}\n")
            f.write(f"Total Epochs: {training_tasks[task_id].total_epochs}\n")
            
    except Exception as e:
        print(f"Error saving results: {e}")


def run_training_worker(task_id: str, request: TrainingRequestSchema):
    """Запускает обучение в отдельном потоке"""
    stop_event = threading.Event()
    training_events[task_id] = stop_event
    
    use_dummy = os.environ.get('USE_DUMMY_TRAINING', 'false').lower() == 'true'
    
    if use_dummy:
        run_dummy_training(task_id, request)
    else:
        run_real_training(task_id, request)
    
    if task_id in training_events:
        del training_events[task_id]


def start_training_async(request: TrainingRequestSchema) -> str:
    """Асинхронный запуск обучения"""
    task_id = str(uuid.uuid4())
    
    training_tasks[task_id] = TrainingStatusSchema(
        task_id=task_id,
        status="pending",
        progress=0,
        current_epoch=0,
        total_epochs=request.epochs,
        started_at=datetime.now(),
        updated_at=datetime.now()
    )
    
    training_requests[task_id] = request
    training_logs[task_id] = []
    add_training_log(task_id, f"Задача создана, ID: {task_id}")
    
    thread = threading.Thread(
        target=run_training_worker,
        args=(task_id, request),
        daemon=True
    )
    thread.start()
    training_threads[task_id] = thread
    
    add_training_log(task_id, "Процесс обучения запущен")
    
    return task_id


def stop_training(task_id: str) -> bool:
    """Останавливает обучение"""
    print(f"[DEBUG] stop_training called for task: {task_id}")
    
    if task_id not in training_tasks:
        print(f"[DEBUG] Task {task_id} not found")
        return False
    
    status = training_tasks[task_id].status
    if status in ["completed", "failed", "stopped"]:
        print(f"[DEBUG] Task already {status}")
        return True
    
    if task_id in training_events:
        training_events[task_id].set()
        add_training_log(task_id, "Получена команда остановки обучения")
        training_tasks[task_id].status = "stopping"
        training_tasks[task_id].updated_at = datetime.now()
        return True
    
    return False


def get_training_status(task_id: str) -> Optional[TrainingStatusSchema]:
    """Возвращает статус обучения"""
    return training_tasks.get(task_id)


def get_training_logs(task_id: str, limit: int = 100) -> List[str]:
    """Возвращает последние логи"""
    logs = training_logs.get(task_id, [])
    if limit > 0:
        return logs[-limit:]
    return logs


def stop_all_trainings():
    """Останавливает все активные обучения"""
    for task_id in list(training_events.keys()):
        stop_training(task_id)
    
    for task_id, thread in training_threads.items():
        if thread.is_alive():
            thread.join(timeout=5)
    
    training_events.clear()
    training_threads.clear()


def get_training_metrics(task_id: str) -> dict:
    """Возвращает историю метрик из results.csv эксперимента"""
    exp_dir = training_exp_dirs.get(task_id)
    if not exp_dir:
        return {"history": [], "latest": None, "best": None}
    
    csv_path = os.path.join(exp_dir, "results.csv")
    if not os.path.exists(csv_path):
        return {"history": [], "latest": None, "best": None}
    
    import csv
    rows = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames  # сохраняем все имена колонок
        for row in reader:
            rows.append(row)
    
    history = []
    best_map50 = 0.0
    best_epoch = 0
    
    for row in rows:
        epoch = int(row.get('epoch', 0))
        
        # Все метрики
        metrics = {
            "epoch": epoch,
            "train/box_loss": _safe_float(row.get('train/box_loss')),
            "train/cls_loss": _safe_float(row.get('train/cls_loss')),
            "train/dfl_loss": _safe_float(row.get('train/dfl_loss')),
            "val/box_loss": _safe_float(row.get('val/box_loss')),
            "val/cls_loss": _safe_float(row.get('val/cls_loss')),
            "val/dfl_loss": _safe_float(row.get('val/dfl_loss')),
            "precision": _safe_float(row.get('metrics/precision(B)')),
            "recall": _safe_float(row.get('metrics/recall(B)')),
            "mAP50": _safe_float(row.get('metrics/mAP50(B)')),
            "mAP50-95": _safe_float(row.get('metrics/mAP50-95(B)')),
            "lr": _safe_float(row.get('lr/pg0')),
        }
        
        history.append(metrics)
        
        if metrics["mAP50"] and metrics["mAP50"] > best_map50:
            best_map50 = metrics["mAP50"]
            best_epoch = epoch
    
    latest = history[-1] if history else None
    
    # Вычисляем F1 из Precision и Recall
    f1 = None
    if latest and latest["precision"] and latest["recall"] and (latest["precision"] + latest["recall"]) > 0:
        f1 = 2 * (latest["precision"] * latest["recall"]) / (latest["precision"] + latest["recall"])
    
    return {
        "history": history,
        "latest": {**latest, "f1": f1} if latest else None,
        "best": {"mAP50": best_map50, "epoch": best_epoch} if best_epoch else None,
        "fieldnames": fieldnames
    }

def _safe_float(value):
    """Безопасное преобразование в float"""
    if value is None or value == '':
        return None
    try:
        return float(value)
    except (ValueError, TypeError):
        return None
    
def resume_training(task_id: str) -> bool:
    print(f"[RESUME] Called for {task_id}")
    if task_id not in training_tasks:
        print("[RESUME] Task not found")
        return False
    status = training_tasks[task_id].status
    print(f"[RESUME] Current status: {status}")
    if status not in ["stopped", "failed", "paused"]:
        print("[RESUME] Invalid status")
        return False
    
    print("[RESUME] Clearing pause/stop events")
    if task_id in training_pause_events:
        del training_pause_events[task_id]
    if task_id in training_events:
        del training_events[task_id]
    
    exp_dir = training_exp_dirs.get(task_id)
    print(f"[RESUME] exp_dir = {exp_dir}")
    if not exp_dir:
        print("[RESUME] No exp_dir")
        return False
    
    last_pt = os.path.join(exp_dir, "last.pt")
    print(f"[RESUME] last_pt = {last_pt}, exists = {os.path.exists(last_pt)}")
    if not os.path.exists(last_pt):
        print("[RESUME] last.pt not found")
        return False
    
    request = training_requests.get(task_id)
    print(f"[RESUME] request = {request is not None}")
    if not request:
        print("[RESUME] No request")
        return False
    
    # Удаляем старый stop_event, если есть (он уже сработал)
    if task_id in training_events:
        del training_events[task_id]
    
    stop_event = threading.Event()
    training_events[task_id] = stop_event
    
    # Обновляем статус
    training_tasks[task_id].status = "pending"
    training_tasks[task_id].error = None
    training_tasks[task_id].updated_at = datetime.now()
    
    thread = threading.Thread(
        target=run_real_training,
        args=(task_id, request, True),  # третий параметр - булево
        daemon=True
    )
    thread.start()
    training_threads[task_id] = thread
    return True

def pause_training(task_id: str) -> bool:
    if task_id not in training_tasks:
        return False
    task = training_tasks[task_id]
    if task.status != "running":
        return False
    
    # Принудительно сохраняем модель, чтобы потом возобновить
    model = training_models.get(task_id)
    exp_dir = training_exp_dirs.get(task_id)
    if model and exp_dir:
        last_path = os.path.join(exp_dir, "last.pt")
        model.save(last_path)
        add_training_log(task_id, f"Модель сохранена в {last_path}")
    
    pause_event = threading.Event()
    training_pause_events[task_id] = pause_event
    pause_event.set()
    add_training_log(task_id, "Получена команда паузы обучения")
    task.status = "pausing"
    task.updated_at = datetime.now()
    return True

class PauseTrainingException(Exception):
    """Исключение для остановки обучения при паузе."""
    pass