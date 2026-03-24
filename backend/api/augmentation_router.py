from fastapi import APIRouter, HTTPException
from schemas.augmentation_schema import AugmentationSchema
from services.augmentation_config import load_augmentation_config, save_augmentation_config

router = APIRouter(prefix="/api/augmentation", tags=["Augmentation"])

@router.get("/config", response_model=AugmentationSchema)
async def get_config():
    try:
        return load_augmentation_config()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/config")
async def update_config(data: AugmentationSchema):
    try:
        save_augmentation_config(data)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))