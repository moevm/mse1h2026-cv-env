from pydantic import BaseModel, Field

class ProjectInitRequest(BaseModel):
    name: str = Field(..., description="Имя проекта")
    path: str = Field(..., description="Абсолютный путь к рабочей папке проекта")