from fastapi import APIRouter, HTTPException
from typing import Dict
from schemas.training_schema import TrainingParamsSchema, TrainingRequestSchema
from services.training_config import load_training_config, save_training_config
from services.training_service import validate_model_name

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

@router.post("/validate-model")
async def validate_model(data: Dict):
    """Проверить существование модели"""
    try:
        model_name = data.get("model_name", "")
        if not model_name:
            raise HTTPException(status_code=400, detail="model_name is required")
        
        result = validate_model_name(model_name)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))