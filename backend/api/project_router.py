from fastapi import APIRouter, HTTPException
import asyncio
import os
import yaml
import datetime
from schemas.project_schema import ProjectInitRequest, ProjectUpdateRequest
from services.project_service import pick_directory_dialog, init_project_workspace

router = APIRouter(prefix="/api", tags=["Projects"])

@router.get("/utils/pick-directory")
async def pick_directory():
    try:
        folder_path = await asyncio.to_thread(pick_directory_dialog)
        
        return {"path": folder_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка выбора папки: {str(e)}")


@router.post("/projects/init")
async def init_project(request: ProjectInitRequest):
    try:
        result = init_project_workspace(request.name, request.path, request.id) 
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/projects/update")
async def update_project(request: ProjectUpdateRequest):
    try:
        yaml_path = os.path.join(request.path, f"{request.name}.yaml")
        project_config = request.dict()
        project_config["last_modified"] = datetime.datetime.now().isoformat()
        
        with open(yaml_path, 'w', encoding='utf-8') as f:
            yaml.dump(project_config, f, allow_unicode=True, sort_keys=False)
            
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))