from pydantic import BaseModel

class ExportPayload(BaseModel):
    collection_name: str
    sub_folder_name: str = "default"
    workspace_path: str = ""
    classes: list[str] = []
    items: list[dict] = []
    trainPercent: int = 80
    valPercent: int = 10
    testPercent: int = 10
    split_mode: str = "split"  # "split" или "flat"

class AutosavePayload(BaseModel):
    image_abs_path: str
    relative_path: str = ""
    content: str
    workspace_path: str
    classes: list[str]
