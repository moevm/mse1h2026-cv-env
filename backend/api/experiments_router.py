from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict
import shutil
from pathlib import Path
from fastapi.responses import FileResponse
from core.paths import get_project_paths
from schemas.experiment_schema import RunExperimentRequest, ExperimentSummary, CompareResponse
from services.experiment_service import ExperimentService

router = APIRouter(prefix="/api/experiments", tags=["experiments"])

@router.post("/run", response_model=dict)
async def run_experiment(req: RunExperimentRequest):
    exp_id = await ExperimentService.run_validation(req)
    return {"experiment_id": exp_id, "message": "Experiment started"}

@router.get("", response_model=List[ExperimentSummary])
async def list_experiments(workspace_path: str = Query(None), sort_by: str = "map50", order: str = "desc"):
    return ExperimentService.get_experiments(workspace_path, sort_by, order)

@router.post("/compare", response_model=CompareResponse)
async def compare_experiments(exp_ids: List[str], workspace_path: str = Query(None)):
    data = ExperimentService.get_comparison_data(workspace_path, exp_ids)
    if not data:
        raise HTTPException(status_code=404, detail="No valid experiments found")
    return CompareResponse(experiments=data)

@router.get("/models", response_model=List[Dict[str, str]])
async def get_trained_models(workspace_path: str = Query(None)):
    return ExperimentService.get_trained_models(workspace_path)

@router.delete("/{exp_id}")
async def delete_experiment(exp_id: str, workspace_path: str = Query(None)):
    metadata = ExperimentService._load_metadata(workspace_path)
    if exp_id not in metadata:
        raise HTTPException(status_code=404, detail="Experiment not found")

    paths = get_project_paths(workspace_path)
    exp_dir = Path(paths["experiments"]) / exp_id
    if exp_dir.exists():
        shutil.rmtree(exp_dir, ignore_errors=True)

    del metadata[exp_id]
    ExperimentService._save_metadata(workspace_path, metadata)
    return {"status": "success", "message": f"Experiment {exp_id} deleted"}

@router.get("/graphics/{exp_id}/{filename}")
async def get_graphic(exp_id: str, filename: str, workspace_path: str = Query(None)):
    paths = get_project_paths(workspace_path)
    file_path = Path(paths["experiments"]) / exp_id / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Graphic not found")
    return FileResponse(file_path)
