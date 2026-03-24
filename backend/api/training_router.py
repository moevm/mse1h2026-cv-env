from fastapi import APIRouter, HTTPException
from typing import Dict
from schemas.training_schema import TrainingParamsSchema, TrainingRequestSchema
from services.training_config import load_training_config, save_training_config

router = APIRouter(prefix="/api/training", tags=["Training"])

@router.get("/config")
async def get_config():
    try:
        return load_training_config()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/config")
async def update_config(data: TrainingParamsSchema):
    try:
        save_training_config(data)
        return {"status": "success", "message": "Конфигурация сохранена"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))