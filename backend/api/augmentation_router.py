from fastapi import APIRouter, HTTPException, Query
from schemas.augmentation_schema import AugmentationSchema, SaveAugVersionPayload, SwitchAugVersionPayload
from services.augmentation_config import load_augmentation_config, save_augmentation_config
from services import aug_version_service

router = APIRouter(prefix="/api/augmentation", tags=["Augmentation"])


@router.get("/config", response_model=AugmentationSchema)
async def get_config(workspace_path: str = Query(None)):
    try:
        return load_augmentation_config(workspace_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/config")
async def update_config(data: AugmentationSchema, workspace_path: str = Query(None)):
    try:
        save_augmentation_config(data, workspace_path)
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/versions")
def get_aug_versions(workspace_path: str = Query(None)):
    return {"versions": aug_version_service.list_aug_versions(workspace_path or "")}


@router.post("/versions/save")
def save_aug_version(payload: SaveAugVersionPayload):
    try:
        version = aug_version_service.save_aug_version(
            payload.workspace_path, payload.name, payload.params
        )
        return {"status": "success", "version": version}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/versions/switch")
def switch_aug_version(payload: SwitchAugVersionPayload):
    try:
        version = aug_version_service.switch_aug_version(payload.workspace_path, payload.version_id)
        return {"status": "success", "version": version}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/versions/{version_id}")
def delete_aug_version(version_id: str, workspace_path: str = Query(None)):
    ok = aug_version_service.delete_aug_version(workspace_path or "", version_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Версия не найдена")
    return {"status": "success"}