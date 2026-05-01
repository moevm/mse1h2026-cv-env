import os
import json
import shutil
import asyncio
import uuid
import threading
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any
from ultralytics import YOLO
import yaml

from core.paths import get_project_paths
from schemas.experiment_schema import RunExperimentRequest, ExperimentSummary, ExperimentDetail

experiment_threads: Dict[str, threading.Thread] = {}
experiment_events: Dict[str, threading.Event] = {}

class ExperimentService:
    @staticmethod
    def _get_metadata_path(workspace_path: str) -> Path:
        paths = get_project_paths(workspace_path)
        exp_path = Path(paths["experiments"])
        exp_path.mkdir(parents=True, exist_ok=True)
        return exp_path / "experiments_metadata.json"

    @staticmethod
    def _load_metadata(workspace_path: str) -> Dict[str, Any]:
        meta_path = ExperimentService._get_metadata_path(workspace_path)
        if not meta_path.exists():
            return {}
        with open(meta_path, 'r', encoding='utf-8') as f:
            return json.load(f)

    @staticmethod
    def _save_metadata(workspace_path: str, metadata: Dict[str, Any]):
        meta_path = ExperimentService._get_metadata_path(workspace_path)
        with open(meta_path, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2, default=str)

    @staticmethod
    async def run_validation(req: RunExperimentRequest) -> str:
        exp_id = str(uuid.uuid4())[:8]
        metadata = ExperimentService._load_metadata(req.workspace_path)
        
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
        ExperimentService._save_metadata(req.workspace_path, metadata)
        
        thread = threading.Thread(
            target=ExperimentService._run_validation_sync,
            args=(exp_id, req),
            daemon=True
        )
        experiment_threads[exp_id] = thread
        thread.start()
        
        return exp_id

    @staticmethod
    def _run_validation_sync(exp_id: str, req: RunExperimentRequest):
        """Synchronous validation that runs in a separate thread"""
        try:
            paths = get_project_paths(req.workspace_path)
            model = YOLO(req.model_path)
            
            results = model.val(
                data=req.data_yaml,
                conf=req.conf_threshold,
                iou=req.iou_threshold,
                plots=True,
                save_json=False,
                project=paths["experiments"],
                name=exp_id
            )

            map50 = float(results.box.map50) if results.box and results.box.map50 is not None else 0.0
            map_ = float(results.box.map) if results.box and results.box.map is not None else 0.0
            precision = float(results.box.mp) if results.box and results.box.mp is not None else 0.0
            recall = float(results.box.mr) if results.box and results.box.mr is not None else 0.0
            f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0

            save_dir = Path(paths["experiments"]) / exp_id
            graphics_urls = ExperimentService._map_graphic_files(save_dir, exp_id)

            metadata = ExperimentService._load_metadata(req.workspace_path)
            metadata[exp_id].update({
                "status": "completed",
                "final_metrics": {
                    "map50": map50, "map50_95": map_, "precision": precision,
                    "recall": recall, "f1": f1
                },
                "graphics_urls": graphics_urls,
                "confusion_matrix_url": graphics_urls.get('confusion_matrix', ''),
            })
            ExperimentService._save_metadata(req.workspace_path, metadata)
            
            if exp_id in experiment_threads:
                del experiment_threads[exp_id]

        except Exception as e:
            metadata = ExperimentService._load_metadata(req.workspace_path)
            if exp_id in metadata:
                metadata[exp_id]["status"] = "failed"
                metadata[exp_id]["error"] = str(e)
                ExperimentService._save_metadata(req.workspace_path, metadata)
            
            if exp_id in experiment_threads:
                del experiment_threads[exp_id]

    @staticmethod
    def _map_graphic_files(save_dir: Path, exp_id: str) -> Dict[str, str]:
        patterns = {
            'pr_curve': ['pr_curve', 'boxpr_curve', 'maskpr_curve', 'pose_pr_curve'],
            'precision_curve': ['p_curve', 'boxp_curve', 'precision_curve'],
            'recall_curve': ['r_curve', 'boxr_curve', 'recall_curve'],
            'f1_curve': ['f1_curve', 'boxf1_curve', 'f1_curve'],
            'confusion_matrix': ['confusion_matrix', 'confusion_matrix_normalized'],
        }
        graphics_urls = {key: "" for key in patterns.keys()}
        if not save_dir.exists():
            return graphics_urls
        
        all_pngs = list(save_dir.glob("*.png"))
        for graphic_key, possible_names in patterns.items():
            for png_path in all_pngs:
                file_stem = png_path.stem.lower()
                for pattern in possible_names:
                    if pattern in file_stem:
                        fixed_filename = f"{exp_id}_{graphic_key}.png"
                        dst_path = save_dir / fixed_filename
                        shutil.copy2(png_path, dst_path)
                        graphics_urls[graphic_key] = f"/api/experiments/graphics/{exp_id}/{fixed_filename}"
                        break
                if graphics_urls[graphic_key]:
                    break
        return graphics_urls

    @staticmethod
    def get_experiments(workspace_path: str, sort_by: str = "map50", order: str = "desc") -> List[ExperimentSummary]:
        metadata = ExperimentService._load_metadata(workspace_path)
        experiments = []
        for exp_id, data in metadata.items():
            if data["status"] in ["completed", "running", "failed"]:
                metrics = data.get("final_metrics", {})
                experiments.append(ExperimentSummary(
                    id=exp_id, name=data["name"], model_path=data["model_path"],
                    map50=metrics.get("map50", 0.0), precision=metrics.get("precision", 0.0),
                    recall=metrics.get("recall", 0.0), f1=metrics.get("f1", 0.0),
                    status=data["status"], created_at=datetime.fromisoformat(data["created_at"])
                ))
        experiments.sort(key=lambda x: getattr(x, sort_by, 0.0), reverse=(order == "desc"))
        return experiments

    @staticmethod
    def get_comparison_data(workspace_path: str, exp_ids: List[str]) -> Dict[str, ExperimentDetail]:
        metadata = ExperimentService._load_metadata(workspace_path)
        result = {}
        for exp_id in exp_ids:
            data = metadata.get(exp_id)
            if not data or data["status"] != "completed": continue
            metrics = data.get("final_metrics", {})
            result[exp_id] = ExperimentDetail(
                id=exp_id, name=data["name"], model_path=data["model_path"],
                map50=metrics.get("map50", 0.0), precision=metrics.get("precision", 0.0),
                recall=metrics.get("recall", 0.0), f1=metrics.get("f1", 0.0),
                status=data["status"], created_at=datetime.fromisoformat(data["created_at"]),
                conf_threshold=data["conf_threshold"], iou_threshold=data["iou_threshold"],
                data_yaml=data["data_yaml"], curves=data.get("curves", {}),
                graphics_urls=data.get("graphics_urls", {}),
                confusion_matrix_url=data.get("confusion_matrix_url", "")
            )
        return result

    @staticmethod
    def get_trained_models(workspace_path: str) -> List[Dict[str, str]]:
        models = []
        paths = get_project_paths(workspace_path)
        training_root = Path(paths["training"])
        if not training_root.exists(): return models

        for run_dir in training_root.iterdir():
            if not run_dir.is_dir(): continue
            best_pt = run_dir / "weights" / "best.pt"
            if best_pt.exists():
                model_name = run_dir.name
                config_path = run_dir / "config.yaml"
                if config_path.exists():
                    try:
                        with open(config_path, 'r') as f:
                            config = yaml.safe_load(f)
                            model_name = config.get('modelName', config.get('model', model_name))
                    except: pass
                models.append({
                    "value": str(best_pt), "label": f"{model_name} (best.pt)", "experiment_id": run_dir.name
                })
        models.sort(key=lambda x: x["label"])
        return models
