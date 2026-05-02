from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect, Query
import asyncio
from typing import Dict
from schemas.training_schema import TrainingParamsSchema, TrainingRequestSchema
from services.training_config import load_training_config, save_training_config
from services.training_service import (
    pause_training,
    start_training_async,
    get_training_status,
    get_training_logs,
    stop_training,
    validate_model_name,
    get_training_metrics,
    resume_training,
    pause_training
)


router = APIRouter(prefix="/api/training", tags=["Training"])


@router.get("/config")
async def get_config(workspace_path: str = Query(None)):
    try:
        return load_training_config(workspace_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/config")
async def update_config(data: TrainingParamsSchema, workspace_path: str = Query(None)):
    try:
        save_training_config(data, workspace_path)
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


@router.post("/start")
async def start_training(request: TrainingRequestSchema):
    try:
        task_id = start_training_async(request)
        return {"status": "success", "task_id": task_id, "message": "Обучение запущено"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{task_id}")
async def training_status(task_id: str):
    status = get_training_status(task_id)
    if not status:
        raise HTTPException(status_code=404, detail="Task not found")
    return status


@router.get("/logs/{task_id}")
async def training_logs(task_id: str, limit: int = 100):
    logs = get_training_logs(task_id, limit)
    return {"task_id": task_id, "logs": logs, "count": len(logs)}


@router.post("/stop/{task_id}")
async def stop_training_endpoint(task_id: str):
    """Остановить обучение"""
    try:
        result = stop_training(task_id)
        if result:
            return {"status": "success", "message": "Обучение остановлено"}
        else:
            raise HTTPException(status_code=404, detail="Task not found or already stopped")
    except Exception as e:
        print(f"Error in stop_training_endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, list[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, task_id: str):
        await websocket.accept()
        if task_id not in self.active_connections:
            self.active_connections[task_id] = []
        self.active_connections[task_id].append(websocket)
    
    def disconnect(self, websocket: WebSocket, task_id: str):
        if task_id in self.active_connections:
            if websocket in self.active_connections[task_id]:
                self.active_connections[task_id].remove(websocket)
            if not self.active_connections[task_id]:
                del self.active_connections[task_id]
    
    async def send_status(self, task_id: str, status_data: dict):
        if task_id in self.active_connections:
            connections = self.active_connections[task_id].copy()
            for connection in connections:
                try:
                    import json
                    json.dumps(status_data)
                    await connection.send_json(status_data)
                except TypeError as e:
                    print(f"[WS] JSON serialization error: {e}")
                    print(f"[WS] Problematic data: {status_data}")
                    def convert_dates(obj):
                        if isinstance(obj, dict):
                            return {k: convert_dates(v) for k, v in obj.items()}
                        elif isinstance(obj, list):
                            return [convert_dates(item) for item in obj]
                        elif hasattr(obj, 'isoformat'):
                            return obj.isoformat()
                        return obj

                    clean_data = convert_dates(status_data)
                    try:
                        await connection.send_json(clean_data)
                    except Exception as e2:
                        print(f"[WS] Still failed to send: {e2}")
                except Exception as e:
                    print(f"[WS] Error sending to connection: {e}")
                    if connection in self.active_connections.get(task_id, []):
                        self.active_connections[task_id].remove(connection)
    
    async def send_ping(self, task_id: str):
        """Отправляет ping для поддержания соединения"""
        if task_id in self.active_connections:
            for connection in self.active_connections[task_id].copy():
                try:
                    await connection.send_text("ping")
                except:
                    pass


manager = ConnectionManager()

@router.websocket("/ws/{task_id}")
async def websocket_endpoint(websocket: WebSocket, task_id: str):
    """WebSocket для real-time обновлений статуса обучения"""
    await manager.connect(websocket, task_id)
    try:
        status = get_training_status(task_id)
        if status:
            status_dict = status.model_dump()
            if 'started_at' in status_dict and status_dict['started_at']:
                status_dict['started_at'] = status_dict['started_at'].isoformat()
            if 'updated_at' in status_dict and status_dict['updated_at']:
                status_dict['updated_at'] = status_dict['updated_at'].isoformat()
            
            if websocket.client_state.name != "DISCONNECTED":
                await manager.send_status(task_id, status_dict)
            print(f"[WS] Initial status sent for {task_id}: {status.status}")
        
        last_status = None
        last_progress = -1
        last_epoch = -1
        
        while True:
            try:
                if websocket.client_state.name == "DISCONNECTED":
                    print(f"[WS] Client disconnected for task {task_id}")
                    break
                
                status = get_training_status(task_id)
                if status:
                    status_dict = status.model_dump()
                    if 'started_at' in status_dict and status_dict['started_at']:
                        status_dict['started_at'] = status_dict['started_at'].isoformat()
                    if 'updated_at' in status_dict and status_dict['updated_at']:
                        status_dict['updated_at'] = status_dict['updated_at'].isoformat()
                    
                    current_progress = status_dict.get('progress', 0)
                    current_epoch = status_dict.get('current_epoch', 0)
                    
                    if (status_dict != last_status or 
                        current_progress != last_progress or 
                        current_epoch != last_epoch):
                        
                        if websocket.client_state.name != "DISCONNECTED":
                            await manager.send_status(task_id, status_dict)
                        last_status = status_dict.copy()
                        last_progress = current_progress
                        last_epoch = current_epoch
                        print(f"[WS] Sent status for {task_id}: epoch={current_epoch}, progress={current_progress}%, status={status_dict.get('status')}")
                    
                    if status.status in ["completed", "failed", "stopped"]:
                        print(f"[WS] Task {task_id} finished with status {status.status}")
                        await asyncio.sleep(0.5)
                        break
                else:
                    print(f"[WS] Task {task_id} not found")
                    break
                
                await asyncio.sleep(0.5)
                
            except asyncio.CancelledError:
                print(f"[WS] Task cancelled for {task_id}")
                break
            except Exception as e:
                print(f"[WS] Error in loop for {task_id}: {e}")
                break
            
    except WebSocketDisconnect:
        print(f"[WS] WebSocket disconnected for task {task_id}")
    except Exception as e:
        print(f"[WS] WebSocket error for task {task_id}: {e}")
        import traceback
        traceback.print_exc()
    finally:
        try:
            if websocket.client_state.name != "DISCONNECTED":
                await websocket.close(code=1000, reason="Training completed")
                print(f"[WS] Closed gracefully for task {task_id}")
        except Exception as e:
            print(f"[WS] Error during graceful close: {e}")
        finally:
            manager.disconnect(websocket, task_id)
            print(f"[WS] Connection cleaned up for task {task_id}")

@router.get("/metrics/{task_id}")
async def training_metrics(task_id: str):
    """
    Возвращает метрики обучения (история по эпохам, последние, лучшие).
    """
    try:
        metrics = get_training_metrics(task_id)
        if metrics is None:
            raise HTTPException(status_code=404, detail="Task not found or no metrics yet")
        return metrics
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    

@router.post("/pause/{task_id}")
async def pause_training_endpoint(task_id: str):
    result = pause_training(task_id)
    if not result:
        raise HTTPException(status_code=400, detail="Не удалось поставить обучение на паузу")
    return {"status": "success", "message": "Обучение приостановлено"}

@router.post("/resume/{task_id}")
async def resume_training_endpoint(task_id: str):
    result = resume_training(task_id)
    if not result:
        raise HTTPException(status_code=400, detail="Не удалось возобновить обучение")
    return {"status": "success", "task_id": task_id, "message": "Обучение возобновлено"}