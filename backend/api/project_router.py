from fastapi import APIRouter, HTTPException
import asyncio
import os
import uuid
from fastapi.responses import FileResponse
from schemas.project_schema import ProjectInitRequest, ProjectUpdateRequest
from services.project_service import (
    pick_directory_dialog,
    init_project_workspace,
    update_project_workspace,
    load_project_workspace,
    scan_folder_structure,
    scan_dataset_structure,
)

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
        project_id = request.id
        if not project_id or project_id.isdigit():
            project_id = str(uuid.uuid4())

        result = init_project_workspace(request.name, request.path, project_id) 
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

@router.get("/projects/scan-folder-dataset")
async def scan_folder_dataset(path: str, virtual_name: str):
    try:
        result = await asyncio.to_thread(scan_dataset_structure, path, virtual_name)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/utils/image")
async def serve_image(path: str):
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Файл не найден на диске")
    
    return FileResponse(path)

@router.get("/utils/read-text")
async def read_text_file(path: str):
    if os.path.exists(path) and os.path.isfile(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                return {"content": f.read()}
        except Exception:
            pass
    return {"content": ""}
