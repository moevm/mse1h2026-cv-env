from pydantic import BaseModel

class SaveAnnotationRequest(BaseModel):
    image_uuid: str
    content: str  # содержимое .txt файла
    classes: list[str]  # список классов (опционально, для обновления classes.txt)

