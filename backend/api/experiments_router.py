from fastapi import APIRouter, HTTPException
from typing import List, Dict
from pathlib import Path
import shutil
from core.paths import EXPERIMENTS_DIR, STATIC_DIR
from schemas.experiment_schema import RunExperimentRequest, ExperimentSummary, CompareResponse
from services.experiment_service import ExperimentService

router = APIRouter(prefix="/api/experiments", tags=["experiments"])

@router.post("/run", response_model=dict)
async def run_experiment(req: RunExperimentRequest):
    exp_id = await ExperimentService.run_validation(req)
    return {"experiment_id": exp_id, "message": "Experiment started"}

@router.get("", response_model=List[ExperimentSummary])
async def list_experiments(sort_by: str = "map50", order: str = "desc"):
    return ExperimentService.get_experiments(sort_by, order)

@router.post("/compare", response_model=CompareResponse)
async def compare_experiments(exp_ids: List[str]):
    data = ExperimentService.get_comparison_data(exp_ids)
    if not data:
        raise HTTPException(status_code=404, detail="No valid experiments found")
    return CompareResponse(experiments=data)

@router.get("/models", response_model=List[Dict[str, str]])
async def get_trained_models():
    """Список обученных моделей из training_runs"""
    return ExperimentService.get_trained_models()

@router.delete("/{exp_id}")
async def delete_experiment(exp_id: str):
    metadata = ExperimentService._load_metadata()
    if exp_id not in metadata:
        raise HTTPException(status_code=404, detail="Experiment not found")

    # Удаляем статические файлы графиков этого эксперимента
    static_dir = Path(STATIC_DIR)
    for file in static_dir.glob(f"{exp_id}_*.png"):
        file.unlink()

    # Удаляем из метаданных
    del metadata[exp_id]
    ExperimentService._save_metadata(metadata)

    return {"status": "success", "message": f"Experiment {exp_id} deleted"}
