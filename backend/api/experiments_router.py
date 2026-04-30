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


