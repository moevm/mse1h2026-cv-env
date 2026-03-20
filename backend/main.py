from fastapi import FastAPI
from core.paths import ensure_directories
from api import augmentation_router

app = FastAPI()

ensure_directories()  # создаёт storage при старте

app.include_router(augmentation_router.router)