from fastapi import APIRouter, HTTPException
import asyncio
from schemas.project_schema import ProjectInitRequest
from services.project_service import pick_directory_dialog, init_project_workspace

# Создаем роутер с префиксом /api
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
        result = init_project_workspace(request.name, request.path)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))