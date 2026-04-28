from fastapi import APIRouter, HTTPException
import asyncio
import os
from fastapi.responses import FileResponse
from schemas.project_schema import ProjectInitRequest, ProjectUpdateRequest
from services.project_service import *

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
        project_data = request.model_dump()
        result = update_project_workspace(**project_data)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/projects/load")
async def load_project(path: str):
    try:
        result = load_project_workspace(path)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/projects/scan-folder")
async def scan_folder(path: str, virtual_name: str):
    try:
        result = await asyncio.to_thread(scan_folder_structure, path, virtual_name)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/utils/image")
async def serve_image(path: str):
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Файл не найден на диске")
    
    return FileResponse(path)