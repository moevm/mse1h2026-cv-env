from pydantic import BaseModel, Field
from typing import Optional, List, Any, Dict

class ProjectInitRequest(BaseModel):
    id: str = Field(..., description="Уникальный идентификатор проекта")
    name: str = Field(..., description="Имя проекта")
    created_at: Optional[str] = None
    path: str = Field(..., description="Абсолютный путь к рабочей папке проекта")
    folders: Optional[List[Dict[str, Any]]] = Field(default=[])
    classes: Optional[List[Dict[str, Any]]] = Field(default=[])
    train_split_percent: Optional[int] = 80
    val_split_percent: Optional[int] = 10
    test_split_percent: Optional[int] = 10

class ProjectUpdateRequest(BaseModel):
    id: str
    name: str
    created_at: Optional[str] = None
    path: str
    folders: List[Dict[str, Any]] = []
    classes: Optional[List[Dict[str, Any]]] = []
    train_split_percent: Optional[int] = 80
    val_split_percent: Optional[int] = 10
    test_split_percent: Optional[int] = 10