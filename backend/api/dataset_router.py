import json
import uuid
import mimetypes
import os
import re
import shutil
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import quote
import yaml
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, Query
from schemas.dataset_schema import ExportPayload
from fastapi.responses import FileResponse

from core.paths import get_project_paths, ensure_project_directories

router = APIRouter(prefix="/api/datasets", tags=["Datasets"])

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".webp", ".tif", ".tiff"}
DEFAULT_TRAIN_PERCENT = 80

def _sanitize_dataset_name(name: str) -> str:
    cleaned = re.sub(r"[^a-zA-Zа-яА-Я0-9._-]+", "_", (name or "dataset").strip())
    cleaned = cleaned.strip("._-")
    return cleaned or "dataset"

def _sanitize_filename(filename: str) -> str:
    return Path(filename or "image").name

def _normalize_relative_path(relative_path: str | None, fallback_name: str) -> str:
    raw_path = (relative_path or fallback_name or "image").replace("\\", "/").strip()
    parts = [part for part in PurePosixPath(raw_path).parts if part not in {"", ".", ".."}]
    if not parts:
        parts = [_sanitize_filename(fallback_name)]
    sanitized_parts = []
    for index, part in enumerate(parts):
        cleaned = re.sub(r"[^a-zA-Zа-яА-Я0-9._()\- ]+", "_", part).strip()
        cleaned = cleaned.strip("._") or ("image" if index == len(parts) - 1 else "folder")
        sanitized_parts.append(cleaned)
    return str(PurePosixPath(*sanitized_parts))

def _build_dataset_yaml(classes: list[str], dataset_abs_path: str) -> dict[str, Any]:
    return {
        "path": dataset_abs_path,
        "train": "train/images",
        "val": "val/images",
        "test": None,
        "names": {index: class_name for index, class_name in enumerate(classes)},
    }

def _write_dataset_yaml(file_path: str, classes: list[str], dataset_abs_path: str) -> None:
    dataset_yaml = _build_dataset_yaml(classes, dataset_abs_path)
    yaml_content = yaml.safe_dump(dataset_yaml, allow_unicode=True, sort_keys=False)
    yaml_content = yaml_content.replace("test: null", "test:")
    with open(file_path, "w", encoding="utf-8") as yaml_file:
        yaml_file.write(yaml_content)

def _read_text_file(file_path: str) -> str:
    try:
        with open(file_path, "r", encoding="utf-8") as source:
            return source.read()
    except OSError:
        return ""

def _detect_media_type(file_path: str) -> str:
    guessed_type, _ = mimetypes.guess_type(file_path)
    return guessed_type or "application/octet-stream"

def _quote_path_parts(path_value: str) -> str:
    return "/".join(quote(part) for part in PurePosixPath(path_value).parts)

def _resolve_dataset_subpath(datasets_dir: str, dataset_name: str, base_dir_name: str, nested_path: str) -> str:
    safe_dataset_name = _sanitize_dataset_name(dataset_name)
    dataset_root = (Path(datasets_dir).resolve() / safe_dataset_name / base_dir_name).resolve()
    requested_path = Path(*[part for part in PurePosixPath(nested_path).parts if part not in {"", ".", ".."}])
    resolved_path = (dataset_root / requested_path).resolve()

    if dataset_root not in resolved_path.parents and resolved_path != dataset_root:
        raise HTTPException(status_code=400, detail="Некорректный путь к файлу")
    return str(resolved_path)

def _collect_image_entries(dataset_name: str, dataset_dir: str, workspace_path: str = "") -> list[dict[str, Any]]:
    dataset_root = Path(dataset_dir)
    
    uuid_mapping = _load_uuid_mapping(dataset_root)
    
    if uuid_mapping:
        entries = []
        images_dir = dataset_root / "images"
        labels_dir = dataset_root / "labels"
        
        if not images_dir.exists():
            return entries
        
        for image_file in images_dir.iterdir():
            if not image_file.is_file() or image_file.suffix.lower() not in IMAGE_EXTENSIONS:
                continue
            
            uid = image_file.stem 
            
            original_name = uuid_mapping.get(uid, {}).get("original_name", uid)
            split = uuid_mapping.get(uid, {}).get("split")  # может быть None
            
            # Путь к файлу разметки
            label_file = labels_dir / f"{uid}.txt"
            annotation_text = _read_text_file(str(label_file)) if label_file.exists() else ""
            
            # Формируем путь для URL
            stored_path = f"images/{image_file.name}"
            
            entries.append({
                "name": uid, 
                "originalName": original_name,
                "relativePath": uid,
                "storedPath": stored_path,
                "split": split,
                "url": f"/api/datasets/{quote(dataset_name)}/files/{_quote_path_parts(stored_path)}",
                "annotationText": annotation_text,
                "uuid": uid,
            })
        
        # Сортируем по UUID для консистентности
        entries.sort(key=lambda x: x["name"])
        return entries
    
    collected: list[dict[str, Any]] = []

    for split_name in ("train", "val"):
        image_source = dataset_root / split_name / "images"
        label_source = dataset_root / split_name / "labels"
        if not image_source.is_dir():
            continue

        for image_path in sorted(image_source.rglob("*"), key=lambda item: str(item).lower()):
            if not image_path.is_file() or image_path.suffix.lower() not in IMAGE_EXTENSIONS:
                continue

            relative_in_group = image_path.relative_to(image_source).as_posix()
            stored_image_path = image_path.relative_to(dataset_root).as_posix()
            label_path = (label_source / relative_in_group).with_suffix(".txt")
            annotation_text = _read_text_file(str(label_path)) if label_path.is_file() else ""
            
            wp_param = f"?workspace_path={quote(workspace_path)}" if workspace_path else ""

            collected.append(
                {
                    "name": image_path.name,
                    "relativePath": relative_in_group,
                    "storedPath": stored_image_path,
                    "split": split_name,
                    "url": f"/api/datasets/files/{_quote_path_parts(stored_image_path)}{wp_param}",
                    "annotationText": annotation_text,
                }
            )
    return collected

def _clamp_train_percent(train_percent: int | float | None) -> int:
    try:
        numeric_value = int(round(float(train_percent if train_percent is not None else DEFAULT_TRAIN_PERCENT)))
    except (TypeError, ValueError):
        numeric_value = DEFAULT_TRAIN_PERCENT
    return max(1, min(99, numeric_value))

def _build_split_plan(items: list[dict[str, Any]], train_percent: int) -> list[dict[str, Any]]:
    normalized_items = []
    for item in items:
        relative_path = _normalize_relative_path(item.get("relativePath"), item.get("originalFileName") or "image")
        normalized_items.append({**item, "normalizedRelativePath": relative_path})

    sorted_items = sorted(normalized_items, key=lambda entry: entry["normalizedRelativePath"].lower())

    if len(sorted_items) <= 1:
        return [{**item, "split": "train"} for item in sorted_items]

    train_count = int(round(len(sorted_items) * (train_percent / 100)))
    train_count = max(1, min(len(sorted_items) - 1, train_count))

    split_plan = []
    for index, item in enumerate(sorted_items):
        split_plan.append({**item, "split": "train" if index < train_count else "val"})

    return split_plan

@router.get("")
def list_datasets(workspace_path: str = Query(None)):
    datasets_dir = get_project_paths(workspace_path)["datasets"]
    datasets: list[dict[str, Any]] = []

    if not os.path.isdir(datasets_dir):
        return {"datasets": datasets}

    for entry in sorted(os.scandir(datasets_dir), key=lambda item: item.name.lower(), reverse=True):
        if not entry.is_dir():
            continue

        dataset_name = entry.name
        dataset_dir_path = entry.path
        images = _collect_image_entries(dataset_name, dataset_dir_path, workspace_path or "")
        created_at = datetime.fromtimestamp(Path(dataset_dir_path).stat().st_mtime).isoformat()
        
        train_count = sum(1 for image in images if image.get("split") == "train")
        val_count = sum(1 for image in images if image.get("split") == "val")
        total_split_images = train_count + val_count
        train_percent = _clamp_train_percent(round(train_count * 100 / total_split_images)) if total_split_images else DEFAULT_TRAIN_PERCENT

        datasets.append({
            "id": dataset_name,
            "datasetName": dataset_name,
            "datasetYamlPath": str(Path(dataset_dir_path) / "dataset.yaml"),
            "name": dataset_name,
            "date": created_at,
            "imageCount": len(images),
            "trainSplitPercent": train_percent,
            "valSplitPercent": 100 - train_percent,
            "images": images,
        })

    return {"datasets": datasets}

@router.delete("/clear")
def delete_workspace_datasets(workspace_path: str = Query(None)):
    datasets_dir = get_project_paths(workspace_path)["datasets"]
    if os.path.isdir(datasets_dir):
        shutil.rmtree(datasets_dir, ignore_errors=True)
    return {"status": "success", "message": "Данные воркспейса очищены"}

@router.get("/files/{file_path:path}")
def get_dataset_file(file_path: str, workspace_path: str = Query(None)):
    datasets_dir = get_project_paths(workspace_path)["datasets"]

    full_path = os.path.normpath(os.path.join(datasets_dir, file_path))
    
    if not full_path.startswith(os.path.abspath(datasets_dir)):
         raise HTTPException(status_code=400, detail="Некорректный путь")

    if not os.path.isfile(full_path):
        raise HTTPException(status_code=404, detail="Файл не найден")

    return FileResponse(full_path, media_type=_detect_media_type(full_path))

@router.post("/export")
async def export_dataset(payload: ExportPayload):
    classes = payload.classes
    items = payload.items
    train_percent = _clamp_train_percent(payload.trainPercent)

    project_paths = ensure_project_directories(payload.workspace_path)
    safe_subfolder = _sanitize_dataset_name(payload.sub_folder_name)
    dataset_dir = os.path.join(project_paths["datasets"], safe_subfolder)
    dataset_abs_path = os.path.abspath(dataset_dir)

    if os.path.isdir(dataset_dir):
        shutil.rmtree(dataset_dir)

    os.makedirs(dataset_dir, exist_ok=True)
    dataset_root = Path(dataset_dir)
    split_dirs = {
        split_name: {
            "images": dataset_root / split_name / "images",
            "labels": dataset_root / split_name / "labels",
        }
        for split_name in ("train", "val")
    }
    for paths in split_dirs.values():
        paths["images"].mkdir(parents=True, exist_ok=True)
        paths["labels"].mkdir(parents=True, exist_ok=True)

    split_plan = _build_split_plan(items, train_percent)

    try:
        images_saved = 0
        split_counts = {"train": 0, "val": 0}

        for item in split_plan:
            source_abs_path = item.get("absolutePath")
            relative_path = item["normalizedRelativePath"]
            split_name = item["split"]
            annotation_txt = (item.get("annotationTxt") or "").strip()

            image_path = (split_dirs[split_name]["images"] / relative_path).resolve()
            label_path = (split_dirs[split_name]["labels"] / relative_path).with_suffix(".txt").resolve()
            image_path.parent.mkdir(parents=True, exist_ok=True)
            label_path.parent.mkdir(parents=True, exist_ok=True)

            if source_abs_path and os.path.exists(source_abs_path):
                shutil.copy2(source_abs_path, image_path)
            else:
                raise ValueError(f"Исходный файл не найден: {source_abs_path}")

            with open(label_path, "w", encoding="utf-8") as label_file:
                label_file.write(annotation_txt)
                if annotation_txt:
                    label_file.write("\n")

            images_saved += 1
            split_counts[split_name] += 1

        _write_dataset_yaml(os.path.join(dataset_dir, "dataset.yaml"), classes, dataset_abs_path)

        with open(os.path.join(dataset_dir, "classes.txt"), "w", encoding="utf-8") as classes_file:
            classes_file.write("\n".join(classes))
            if classes:
                classes_file.write("\n")

        return {
            "status": "success",
            "dataset_name": safe_subfolder,
            "dataset_path": dataset_dir,
            "dataset_abs_path": dataset_abs_path,
            "dataset_yaml_path": os.path.join(dataset_dir, "dataset.yaml"),
            "images_saved": images_saved,
            "classes_saved": len(classes),
            "train_percent": train_percent,
            "val_percent": 100 - train_percent,
            "split_counts": split_counts,
        }
    except Exception as exc:
        if os.path.isdir(dataset_dir):
            shutil.rmtree(dataset_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(exc))
