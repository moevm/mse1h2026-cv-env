from fastapi import FastAPI
from core.paths import ensure_directories
from api import augmentation_router, dataset_router
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # можно потом сузить до localhost
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
ensure_directories()  # создаёт storage при старте

app.include_router(augmentation_router.router)
app.include_router(dataset_router.router)
