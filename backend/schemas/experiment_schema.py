from pydantic import BaseModel
from typing import List, Dict, Optional, Any
from datetime import datetime

class RunExperimentRequest(BaseModel):
    model_path: str
    data_yaml: str
    conf_threshold: float = 0.25
    iou_threshold: float = 0.45
    name: Optional[str] = None

class ExperimentSummary(BaseModel):
    id: str
    name: str
    model_path: str
    map50: float
    precision: float
    recall: float
    f1: float
    status: str
    created_at: datetime

class ExperimentDetail(ExperimentSummary):
    conf_threshold: float
    iou_threshold: float
    data_yaml: str
    curves: Dict[str, List[List[float]]] = {}
    graphics_urls: Dict[str, str] = {}          # <-- добавить
    confusion_matrix_url: str = ""

class CompareResponse(BaseModel):
    experiments: Dict[str, ExperimentDetail]
