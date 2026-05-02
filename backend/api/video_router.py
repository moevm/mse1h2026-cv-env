import asyncio
import os
import re
import shutil
import tempfile
from pathlib import Path

import cv2
from fastapi import APIRouter, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse

from core.paths import get_project_paths

router = APIRouter(prefix="/api/video", tags=["Video"])

VIDEO_EXTENSIONS = {".mp4", ".avi", ".mov", ".mkv", ".webm", ".flv", ".wmv", ".m4v"}


def _sanitize_name(name: str) -> str:
    cleaned = re.sub(r"[^a-zA-Zа-яА-Я0-9._-]+", "_", (name or "video").strip())
    return cleaned.strip("._-") or "video"


def _extract_frames(
    video_path: str,
    output_dir: Path,
    frame_interval: int,
    max_frames: int | None,
) -> list[dict]:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError("Не удалось открыть видеофайл")

    frames = []
    frame_index = 0
    saved_index = 0

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            if frame_index % frame_interval == 0:
                if max_frames is not None and saved_index >= max_frames:
                    break

                filename = f"frame_{saved_index:06d}.jpg"
                out_path = output_dir / filename
                cv2.imwrite(str(out_path), frame)
                frames.append({"frame_number": frame_index, "path": str(out_path.resolve())})
                saved_index += 1

            frame_index += 1
    finally:
        cap.release()

    return frames


@router.get("/scan-folder")
async def scan_video_folder(
    path: str = Query(...),
    virtual_name: str = Query(...),
    workspace_path: str = Query(""),
    frame_interval: int = Query(30),
):
    if not os.path.isdir(path):
        raise HTTPException(status_code=400, detail="Папка не найдена")
    if frame_interval < 1:
        raise HTTPException(status_code=400, detail="frame_interval должен быть >= 1")

    project_paths = get_project_paths(workspace_path or None)
    frames_root = Path(project_paths["frames"])

    folder_key = _sanitize_name(Path(path).name)
    scan_dir = frames_root / folder_key
    if scan_dir.exists():
        shutil.rmtree(scan_dir)
    scan_dir.mkdir(parents=True)

    video_files = sorted(
        entry for entry in Path(path).rglob("*")
        if entry.is_file() and entry.suffix.lower() in VIDEO_EXTENSIONS
    )

    if not video_files:
        raise HTTPException(status_code=404, detail="Видеофайлы не найдены в папке")

    all_files = []
    tree_children = []

    for video_path in video_files:
        video_stem = _sanitize_name(video_path.stem)
        video_dir = scan_dir / video_stem
        video_dir.mkdir(parents=True, exist_ok=True)

        try:
            frames = await asyncio.to_thread(
                _extract_frames, str(video_path), video_dir, frame_interval, None
            )
        except Exception:
            shutil.rmtree(video_dir, ignore_errors=True)
            continue

        for frame in frames:
            frame_path = Path(frame["path"])
            rel = frame_path.relative_to(scan_dir).as_posix()
            all_files.append({
                "name": frame_path.name,
                "absolute_path": frame["path"],
                "relativePath": f"{virtual_name}/{rel}",
                "size": frame_path.stat().st_size,
                "type": "image/jpeg",
            })

        tree_children.append({
            "name": video_path.name,
            "path": f"{virtual_name}/{video_stem}",
            "absolute_path": str(video_dir),
            "isEnabled": True,
            "children": [],
        })

    return {
        "files": all_files,
        "tree": tree_children,
        "frames_dir": str(scan_dir.resolve()),
        "absolute_root": path,
        "virtual_root": virtual_name,
    }


@router.post("/extract-frames")
async def extract_frames(
    video: UploadFile,
    frame_interval: int = Form(1),
    max_frames: int | None = Form(None),
    workspace_path: str = Form(""),
):
    suffix = Path(video.filename or "video").suffix.lower()
    if suffix not in VIDEO_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Неподдерживаемый формат видео: {suffix}")

    if frame_interval < 1:
        raise HTTPException(status_code=400, detail="frame_interval должен быть >= 1")

    project_paths = get_project_paths(workspace_path or None)
    frames_root = Path(project_paths["frames"])
    frames_root.mkdir(parents=True, exist_ok=True)

    video_stem = _sanitize_name(Path(video.filename or "video").stem)
    output_dir = frames_root / video_stem
    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True)

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=suffix)
    try:
        os.close(tmp_fd)
        content = await video.read()
        with open(tmp_path, "wb") as f:
            f.write(content)

        frames = _extract_frames(tmp_path, output_dir, frame_interval, max_frames)
    except ValueError as exc:
        shutil.rmtree(output_dir, ignore_errors=True)
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        shutil.rmtree(output_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Ошибка при обработке видео: {exc}") from exc
    finally:
        os.unlink(tmp_path)

    return {
        "status": "success",
        "video_name": video_stem,
        "frames_dir": str(output_dir.resolve()),
        "frames_count": len(frames),
        "frames": frames,
    }


@router.get("/frames/{video_name}/{filename}")
def get_frame(video_name: str, filename: str, workspace_path: str = ""):
    project_paths = get_project_paths(workspace_path or None)
    frames_root = Path(project_paths["frames"])
    safe_video = _sanitize_name(video_name)
    safe_file = Path(filename).name
    full_path = (frames_root / safe_video / safe_file).resolve()

    if not str(full_path).startswith(str(frames_root.resolve())):
        raise HTTPException(status_code=400, detail="Некорректный путь")
    if not full_path.is_file():
        raise HTTPException(status_code=404, detail="Файл не найден")

    return FileResponse(str(full_path), media_type="image/jpeg")


@router.delete("/frames/{video_name}")
def delete_frames(video_name: str, workspace_path: str = ""):
    project_paths = get_project_paths(workspace_path or None)
    frames_root = Path(project_paths["frames"])
    safe_video = _sanitize_name(video_name)
    target = (frames_root / safe_video).resolve()

    if not str(target).startswith(str(frames_root.resolve())):
        raise HTTPException(status_code=400, detail="Некорректный путь")
    if target.exists():
        shutil.rmtree(target)

    return {"status": "success"}
