import os
import json
import shutil
import asyncio
import uuid
import yaml
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Optional, Any
from ultralytics import YOLO

from core.paths import EXPERIMENTS_DIR, STATIC_DIR, TRAINING_DIR
from schemas.experiment_schema import RunExperimentRequest, ExperimentSummary, ExperimentDetail

METADATA_FILE = os.path.join(EXPERIMENTS_DIR, "experiments_metadata.json")

class ExperimentService:
    @staticmethod
    def _init_storage():
        """Создаёт директории и файл метаданных, если их нет (использует Path для создания)"""
        exp_path = Path(EXPERIMENTS_DIR)
        static_path = Path(STATIC_DIR)
        exp_path.mkdir(parents=True, exist_ok=True)
        static_path.mkdir(parents=True, exist_ok=True)
        metadata_path = Path(METADATA_FILE)
        if not metadata_path.exists():
            metadata_path.write_text("{}")

    @staticmethod
    def _load_metadata() -> Dict[str, Any]:
        ExperimentService._init_storage()
        with open(METADATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)

    @staticmethod
    def _save_metadata(metadata: Dict[str, Any]):
        with open(METADATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2, default=str)

    @staticmethod
    async def run_validation(req: RunExperimentRequest) -> str:
        exp_id = str(uuid.uuid4())[:8]   # ВАЖНО: добавить эту строку
        metadata = ExperimentService._load_metadata()
        metadata[exp_id] = {
            "id": exp_id,
            "name": req.name or f"Experiment_{exp_id}",
            "model_path": req.model_path,
            "data_yaml": req.data_yaml,
            "conf_threshold": req.conf_threshold,
            "iou_threshold": req.iou_threshold,
            "status": "running",
            "created_at": datetime.now().isoformat(),
            "final_metrics": {},
            "curves": {},
            "confusion_matrix_url": ""
        }
        ExperimentService._save_metadata(metadata)

        asyncio.create_task(ExperimentService._run_validation_task(exp_id, req))
        return exp_id

    @staticmethod
    def _map_graphic_files(save_dir: Path, exp_id: str) -> Dict[str, str]:
        """
        Маппинг реальных файлов из Ultralytics в фиксированные имена.
        Поддерживает разные версии YOLO и типы задач (детекция, сегментация, позы).
        """
        # Паттерны для поиска файлов (регистронезависимо)
        patterns = {
            'pr_curve': ['pr_curve', 'boxpr_curve', 'maskpr_curve', 'pose_pr_curve'],
            'precision_curve': ['p_curve', 'boxp_curve', 'precision_curve'],
            'recall_curve': ['r_curve', 'boxr_curve', 'recall_curve'],
            'f1_curve': ['f1_curve', 'boxf1_curve', 'f1_curve'],
            'confusion_matrix': ['confusion_matrix', 'confusion_matrix_normalized'],
        }
        
        graphics_urls = {key: "" for key in patterns.keys()}
        
        if not save_dir.exists():
            print(f"WARNING: save_dir {save_dir} does not exist")
            return graphics_urls
        
        # Собираем все PNG файлы
        all_pngs = list(save_dir.glob("*.png"))
        print(f"[DEBUG] Found PNGs in {save_dir}: {[f.name for f in all_pngs]}")
        
        # Для каждого типа графика ищем подходящий файл
        for graphic_key, possible_names in patterns.items():
            for png_path in all_pngs:
                file_stem = png_path.stem.lower()
                for pattern in possible_names:
                    if pattern in file_stem:
                        # Копируем с фиксированным именем
                        fixed_filename = f"{exp_id}_{graphic_key}.png"
                        dst_path = Path(STATIC_DIR) / fixed_filename
                        shutil.copy2(png_path, dst_path)
                        graphics_urls[graphic_key] = f"/static/{fixed_filename}"
                        print(f"[DEBUG] Mapped {png_path.name} -> {graphic_key}")
                        break
                if graphics_urls[graphic_key]:
                    break
        
        # Если какие-то графики не найдены, выводим предупреждение
        missing = [key for key, url in graphics_urls.items() if not url]
        if missing:
            print(f"[WARNING] Missing graphics for experiment {exp_id}: {missing}")
        
        return graphics_urls

    @staticmethod
    async def _run_validation_task(exp_id: str, req: RunExperimentRequest):
        try:
            model = YOLO(req.model_path)
            results = model.val(
                data=req.data_yaml,
                conf=req.conf_threshold,
                iou=req.iou_threshold,
                plots=True,
                save_json=False,
            )

            # Финальные метрики
            map50 = float(results.box.map50) if results.box and results.box.map50 is not None else 0.0
            map_ = float(results.box.map) if results.box and results.box.map is not None else 0.0
            precision = float(results.box.mp) if results.box and results.box.mp is not None else 0.0
            recall = float(results.box.mr) if results.box and results.box.mr is not None else 0.0
            f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0

            # Копирование PNG с маппингом в фиксированные имена
            save_dir = Path(results.save_dir)
            graphics_urls = ExperimentService._map_graphic_files(save_dir, exp_id)

            # Сохраняем метаданные
            metadata = ExperimentService._load_metadata()
            metadata[exp_id].update({
                "status": "completed",
                "final_metrics": {
                    "map50": map50,
                    "map50_95": map_,
                    "precision": precision,
                    "recall": recall,
                    "f1": f1
                },
                "graphics_urls": graphics_urls,
                "confusion_matrix_url": graphics_urls.get('confusion_matrix', ''),
                "curves": {},
            })
            ExperimentService._save_metadata(metadata)
            
            print(f"[DEBUG] Experiment {exp_id} completed. Graphics: {graphics_urls}")

        except Exception as e:
            print(f"[ERROR] Experiment {exp_id} failed: {e}")
            import traceback
            traceback.print_exc()
            metadata = ExperimentService._load_metadata()
            metadata[exp_id]["status"] = "failed"
            metadata[exp_id]["error"] = str(e)
            ExperimentService._save_metadata(metadata)

    @staticmethod
    def get_experiments(sort_by: str = "map50", order: str = "desc") -> List[ExperimentSummary]:
        metadata = ExperimentService._load_metadata()
        experiments = []
        for exp_id, data in metadata.items():
            if data["status"] == "completed":
                metrics = data.get("final_metrics", {})
                experiments.append(ExperimentSummary(
                    id=exp_id,
                    name=data["name"],
                    model_path=data["model_path"],
                    map50=metrics.get("map50", 0.0),
                    precision=metrics.get("precision", 0.0),
                    recall=metrics.get("recall", 0.0),
                    f1=metrics.get("f1", 0.0),
                    status=data["status"],
                    created_at=datetime.fromisoformat(data["created_at"])
                ))
        reverse = (order == "desc")
        experiments.sort(key=lambda x: getattr(x, sort_by, 0.0), reverse=reverse)
        return experiments

    @staticmethod
    def get_comparison_data(exp_ids: List[str]) -> Dict[str, ExperimentDetail]:
        metadata = ExperimentService._load_metadata()
        result = {}
        for exp_id in exp_ids:
            data = metadata.get(exp_id)
            if not data or data["status"] != "completed":
                continue
            metrics = data.get("final_metrics", {})
            result[exp_id] = ExperimentDetail(
                id=exp_id,
                name=data["name"],
                model_path=data["model_path"],
                map50=metrics.get("map50", 0.0),
                precision=metrics.get("precision", 0.0),
                recall=metrics.get("recall", 0.0),
                f1=metrics.get("f1", 0.0),
                status=data["status"],
                created_at=datetime.fromisoformat(data["created_at"]),
                conf_threshold=data["conf_threshold"],
                iou_threshold=data["iou_threshold"],
                data_yaml=data["data_yaml"],
                curves=data.get("curves", {}),
                graphics_urls=data.get("graphics_urls", {}),
                confusion_matrix_url=data.get("confusion_matrix_url", "")
            )
        return result

    @staticmethod
    def get_trained_models() -> List[Dict[str, str]]:
        models = []
        training_root = Path(TRAINING_DIR)
        if not training_root.exists():
            return models

        for run_dir in training_root.iterdir():
            if not run_dir.is_dir():
                continue
            weights_dir = run_dir / "weights"
            best_pt = weights_dir / "best.pt"
            if best_pt.exists():
                # Пытаемся прочитать имя модели из config.yaml
                model_name = run_dir.name
                config_path = run_dir / "config.yaml"
                if config_path.exists():
                    try:
                        with open(config_path, 'r') as f:
                            config = yaml.safe_load(f)
                            if config and 'modelName' in config:
                                model_name = config['modelName']
                            elif config and 'model' in config:
                                model_name = config['model']
                    except:
                        pass
                models.append({
                    "value": str(best_pt),
                    "label": f"{model_name} (best.pt)",
                    "experiment_id": run_dir.name
                })
        models.sort(key=lambda x: x["label"])
        return models
