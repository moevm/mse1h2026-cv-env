from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from core.paths import ensure_directories, STATIC_DIR
from api import dataset_router, augmentation_router, training_router, experiments_router
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
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Создаём все необходимые папки (включая STATIC_DIR)
ensure_directories()

# Монтируем статику (чтоб файлы из папки static были доступны по URL /static/...)
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# Подключаем роутеры
app.include_router(dataset_router.router)
app.include_router(augmentation_router.router)
app.include_router(training_router.router)
app.include_router(experiments_router.router)
