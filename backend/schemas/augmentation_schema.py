from pydantic import BaseModel, Field


class SaveAugVersionPayload(BaseModel):
    workspace_path: str = ""
    name: str
    params: dict


class SwitchAugVersionPayload(BaseModel):
    workspace_path: str = ""
    version_id: str


class AugmentationSchema(BaseModel):
    # Цветовые (HSV)
    hsv_h: float = Field(0.015, ge=0, le=1)
    hsv_s: float = Field(0.7, ge=0, le=1)
    hsv_v: float = Field(0.4, ge=0, le=1)
    
    # Геометрия
    degrees: float = Field(0.0, ge=-180, le=180)
    translate: float = Field(0.1, ge=0, le=1)
    scale: float = Field(0.5, ge=0, le=1)
    shear: float = Field(0.0, ge=-180, le=180)
    perspective: float = Field(0.0, ge=0, le=0.001)
    
    # Флипы и спец-методы
    flipud: float = Field(0.0, ge=0, le=1)
    fliplr: float = Field(0.5, ge=0, le=1)
    mosaic: float = Field(1.0, ge=0, le=1)
    mixup: float = Field(0.0, ge=0, le=1)