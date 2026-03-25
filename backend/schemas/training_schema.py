from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from schemas.augmentation_schema import AugmentationSchema

class TrainingParamsSchema(BaseModel):
    model: str = Field("yolov8n", description="Базовая модель")
    modelName: Optional[str] = Field(None, description="Имя для новой модели")
    epochs: int = Field(100, ge=1, le=1000)
    batch: int = Field(16, ge=1, le=256)
    imgsz: int = Field(640, ge=32, le=1280)
    device: str = Field("auto")
    workers: int = Field(8, ge=0, le=32)
    patience: int = Field(50, ge=0)
    save: bool = True
    save_period: int = Field(-1, ge=-1)
    cache: bool = False
    optimizer: str = Field("SGD")
    lr0: float = Field(0.01, ge=0, le=1)
    lrf: float = Field(0.01, ge=0, le=1)
    momentum: float = Field(0.937, ge=0, le=1)
    weight_decay: float = Field(0.0005, ge=0, le=0.1)
    warmup_epochs: int = Field(3, ge=0, le=10)
    warmup_momentum: float = Field(0.8, ge=0, le=1)
    warmup_bias_lr: float = Field(0.1, ge=0, le=1)

class DatasetInfoSchema(BaseModel):
    id: str
    name: str
    versionId: str
    versionName: str
    yaml_path: str

class TrainingRequestSchema(TrainingParamsSchema):
    augmentations: AugmentationSchema
    dataset: DatasetInfoSchema
    timestamp: datetime = Field(default_factory=datetime.now)

class TrainingStatusSchema(BaseModel):
    task_id: str
    status: str
    progress: float = 0
    current_epoch: int = 0
    total_epochs: int = 0
    loss: Optional[float] = None
    error: Optional[str] = None
    started_at: datetime
    updated_at: datetime