from fastapi import FastAPI
from core.paths import ensure_directories
from api import dataset_router, augmentation_router, training_router, project_router, experiments_router
from fastapi.middleware.cors import CORSMiddleware
import asyncio
from contextlib import asynccontextmanager
from dotenv import load_dotenv

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager для управления жизненным циклом приложения"""
    print("[STARTUP] Server starting...")
    
    from services.training_service import training_tasks, training_events, stop_all_trainings
    
    if training_tasks or training_events:
        print("[STARTUP] Found active tasks from previous session, cleaning up...")
        await asyncio.to_thread(stop_all_trainings)
    
    yield
    
    print("[SHUTDOWN] Server shutting down...")
    
    from services.training_service import stop_all_trainings
    await asyncio.to_thread(stop_all_trainings)
    
    print("[SHUTDOWN] All trainings stopped")

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

ensure_directories()

app.include_router(dataset_router.router)
app.include_router(augmentation_router.router)
app.include_router(training_router.router)
app.include_router(project_router.router)
app.include_router(experiments_router.router)
