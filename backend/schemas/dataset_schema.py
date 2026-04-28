from pydantic import BaseModel

class ExportPayload(BaseModel):
    collection_name: str
    sub_folder_name: str = "default"
    workspace_path: str = ""
    classes: list[str] = []
    items: list[dict] = []
    trainPercent: int = 80