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
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from core.paths import get_project_paths, ensure_project_directories
from schemas.dataset_schema import ExportPayload, AutosavePayload, SaveVersionPayload, SwitchVersionPayload, ImportDatasetPayload
from services import version_service
from services.project_service import scan_dataset_structure

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
    if not parts: parts = [_sanitize_filename(fallback_name)]
    sanitized_parts = []
    for index, part in enumerate(parts):
        cleaned = re.sub(r"[^a-zA-Zа-яА-Я0-9._()\- ]+", "_", part).strip()
        cleaned = cleaned.strip("._") or ("image" if index == len(parts) - 1 else "folder")
        sanitized_parts.append(cleaned)
    return str(PurePosixPath(*sanitized_parts))

def _build_dataset_yaml(classes: list[str], dataset_abs_path: str, has_test: bool = False) -> dict[str, Any]:
    return {
        "path": dataset_abs_path, 
        "train": "train/images", 
        "val": "val/images", 
        "test": "test/images" if has_test else None, 
        "names": {index: class_name for index, class_name in enumerate(classes)}
    }

def _write_dataset_yaml(file_path: str, classes: list[str], dataset_abs_path: str, has_test: bool = False) -> None:
    dataset_yaml = _build_dataset_yaml(classes, dataset_abs_path, has_test)
    yaml_content = yaml.safe_dump(dataset_yaml, allow_unicode=True, sort_keys=False).replace("test: null", "test:")
    with open(file_path, "w", encoding="utf-8") as yaml_file: yaml_file.write(yaml_content)

def _read_text_file(file_path: str) -> str:
    try:
        with open(file_path, "r", encoding="utf-8") as source: return source.read()
    except OSError: return ""

def _detect_media_type(file_path: str) -> str:
    guessed_type, _ = mimetypes.guess_type(file_path)
    return guessed_type or "application/octet-stream"

def _quote_path_parts(path_value: str) -> str:
    return "/".join(quote(part) for part in PurePosixPath(path_value).parts)

def _load_uuid_mapping(dataset_dir: Path) -> dict:
    mapping_file = dataset_dir / "uuid_mapping.json"
    if not mapping_file.exists(): return {}
    with open(mapping_file, "r", encoding="utf-8") as f: return json.load(f)

def _collect_image_entries(dataset_name: str, dataset_dir: str, workspace_path: str = "") -> list[dict[str, Any]]:
    dataset_root = Path(dataset_dir)
    uuid_mapping = _load_uuid_mapping(dataset_root)
    entries = []
    
    if uuid_mapping:
        images_dir = dataset_root / "images"
        labels_dir = dataset_root / "labels"
        if not images_dir.exists():
            for split_name in ("train", "val", "test", "all"):
                if (dataset_root / split_name / "images").exists():
                    images_dir = dataset_root / split_name / "images"
                    labels_dir = dataset_root / split_name / "labels"
                    break

        if images_dir.exists():
            for image_file in images_dir.iterdir():
                if not image_file.is_file() or image_file.suffix.lower() not in IMAGE_EXTENSIONS: continue
                uid = image_file.stem 
                original_name = uuid_mapping.get(uid, {}).get("original_name", uid)
                split = uuid_mapping.get(uid, {}).get("split")
                label_file = labels_dir / f"{uid}.txt"
                annotation_text = _read_text_file(str(label_file)) if label_file.exists() else ""
                stored_path = f"{images_dir.name}/{image_file.name}"
                if split and split != "all": stored_path = f"{split}/{stored_path}"
                entries.append({
                    "name": uid, "originalName": original_name, "relativePath": uid, "storedPath": stored_path, "split": split,
                    "url": f"/api/datasets/{quote(dataset_name)}/files/{_quote_path_parts(stored_path)}", "annotationText": annotation_text, "uuid": uid,
                })
            entries.sort(key=lambda x: x["name"])
            return entries

    # Fallback (old format)
    for split_name in ("train", "val", "all"):
        image_source = dataset_root / split_name / "images"
        label_source = dataset_root / split_name / "labels"
        if not image_source.is_dir(): continue
        for image_path in sorted(image_source.rglob("*"), key=lambda item: str(item).lower()):
            if not image_path.is_file() or image_path.suffix.lower() not in IMAGE_EXTENSIONS: continue
            relative_in_group = image_path.relative_to(image_source).as_posix()
            stored_image_path = image_path.relative_to(dataset_root).as_posix()
            label_path = (label_source / relative_in_group).with_suffix(".txt")
            annotation_text = _read_text_file(str(label_path)) if label_path.is_file() else ""
            wp_param = f"?workspace_path={quote(workspace_path)}" if workspace_path else ""
            entries.append({
                "name": image_path.name, "relativePath": relative_in_group, "storedPath": stored_image_path, "split": split_name,
                "url": f"/api/datasets/files/{_quote_path_parts(stored_image_path)}{wp_param}", "annotationText": annotation_text,
            })
    return entries

def _clamp_train_percent(train_percent: int | float | None) -> int:
    try: numeric_value = int(round(float(train_percent if train_percent is not None else DEFAULT_TRAIN_PERCENT)))
    except (TypeError, ValueError): numeric_value = DEFAULT_TRAIN_PERCENT
    return max(1, min(99, numeric_value))

def _build_split_plan(items: list[dict[str, Any]], train_percent: int, val_percent: int) -> list[dict[str, Any]]:
    normalized_items = []
    for item in items:
        relative_path = _normalize_relative_path(item.get("relativePath"), item.get("originalFileName") or "image")
        normalized_items.append({**item, "normalizedRelativePath": relative_path})

    sorted_items = sorted(normalized_items, key=lambda entry: entry["normalizedRelativePath"].lower())
    total_items = len(sorted_items)
    
    if total_items <= 1: 
        return [{**item, "split": "train"} for item in sorted_items]

    train_count = int(round(total_items * (train_percent / 100)))
    val_count = int(round(total_items * (val_percent / 100)))
    
    if train_count == 0 and train_percent > 0: train_count = 1
    if val_count == 0 and val_percent > 0 and total_items > train_count: val_count = 1

    for index, item in enumerate(sorted_items):
        if index < train_count:
            item["split"] = "train"
        elif index < train_count + val_count:
            item["split"] = "val"
        else:
            item["split"] = "test"
            
    return sorted_items


@router.get("/versions")
def get_versions(workspace_path: str = Query(None)):
    try:
        versions = version_service.list_versions(workspace_path or "")
        return {"versions": versions}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/versions/save")
def save_version(payload: SaveVersionPayload):
    if not payload.name or not payload.name.strip():
        raise HTTPException(status_code=400, detail="Название версии не может быть пустым")
    try:
        metadata = version_service.save_version(payload.workspace_path or "", payload.name.strip())
        return {"status": "success", "version": metadata}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/versions/switch")
def switch_version(payload: SwitchVersionPayload):
    if not payload.version_id:
        raise HTTPException(status_code=400, detail="version_id обязателен")
    try:
        metadata = version_service.switch_version(payload.workspace_path or "", payload.version_id)
        return {"status": "success", "version": metadata}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("/versions/{version_id}")
def delete_version(version_id: str, workspace_path: str = Query(None)):
    try:
        ok = version_service.delete_version(workspace_path or "", version_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Версия не найдена")
        return {"status": "success"}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/import-folder")
def import_dataset_folder(payload: ImportDatasetPayload):
    """Копирует внешнюю YOLO-папку в {workspace}/datasets/{name}/ и возвращает список файлов."""
    source = Path(payload.source_path)
    if not source.is_dir():
        raise HTTPException(status_code=400, detail=f"Папка не найдена: {payload.source_path}")

    project_paths = ensure_project_directories(payload.workspace_path)
    safe_name = _sanitize_dataset_name(payload.dataset_name)
    dest = Path(project_paths["datasets"]) / safe_name

    try:
        if dest.exists():
            shutil.rmtree(dest)
        shutil.copytree(str(source), str(dest))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Ошибка копирования: {exc}")

    try:
        result = scan_dataset_structure(str(dest), safe_name)
    except Exception:
        result = {"files": [], "tree": [], "classes": []}

    return {
        "status": "success",
        "dataset_name": safe_name,
        "dataset_path": str(dest),
        "files": result.get("files", []),
        "classes": result.get("classes", []),
    }


@router.get("/scan-workspace")
def scan_workspace_datasets(workspace_path: str = Query(None)):
    """Сканирует папку datasets/ рабочего пространства и возвращает файлы с аннотациями.

    datasets/ содержит подпапки (по одной на каждый экспортированный датасет).
    Каждая подпапка имеет структуру train/val/test с images/ и labels/.
    """
    datasets_dir = get_project_paths(workspace_path or "")["datasets"]
    if not os.path.isdir(datasets_dir):
        return {"files": [], "tree": [], "classes": []}
    try:
        datasets_root = Path(datasets_dir)
        subdirs = sorted([d for d in datasets_root.iterdir() if d.is_dir()])

        if not subdirs:
            return {"files": [], "tree": [], "classes": []}

        all_files: list = []
        all_classes: set = set()
        all_tree: list = []

        for subdir in subdirs:
            try:
                result = scan_dataset_structure(str(subdir), subdir.name)
                all_files.extend(result.get("files", []))
                all_classes.update(result.get("classes", []))
                all_tree.extend(result.get("tree", []))
            except Exception:
                pass

        return {"files": all_files, "tree": all_tree, "classes": sorted(all_classes)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/autosave")
async def autosave_annotation(payload: AutosavePayload):
    if payload.image_abs_path and payload.workspace_path and os.path.exists(payload.workspace_path):
        autosave_dir = Path(get_project_paths(payload.workspace_path)["autosave"])
        if payload.relative_path:
            rel = Path(payload.relative_path).with_suffix(".txt")
            txt_path = autosave_dir / rel
        else:
            txt_path = autosave_dir / f"{Path(payload.image_abs_path).stem}.txt"
        txt_path.parent.mkdir(parents=True, exist_ok=True)
        if payload.content.strip():
            txt_path.write_text(payload.content, encoding="utf-8")
        elif txt_path.exists():
            txt_path.unlink()

    if payload.workspace_path and os.path.exists(payload.workspace_path):
        classes_path = Path(payload.workspace_path) / "classes.txt"
        if payload.classes:
            classes_path.write_text("\n".join(payload.classes) + "\n", encoding="utf-8")

    return {"status": "success"}


@router.get("/all-annotations")
def get_all_annotations(workspace_path: str = Query(...)):
    result = {}
    paths = get_project_paths(workspace_path)

    # Сначала autosave (низкий приоритет)
    autosave_dir = Path(paths["autosave"])
    if autosave_dir.is_dir():
        for txt_file in autosave_dir.rglob("*.txt"):
            content = txt_file.read_text(encoding="utf-8").strip()
            if content:
                rel_key = txt_file.relative_to(autosave_dir).with_suffix("").as_posix().lower()
                result[rel_key] = content

    # Потом datasets (высокий приоритет — перезаписывает autosave)
    datasets_dir = Path(paths["datasets"])
    if datasets_dir.is_dir():
        for ds_subdir in datasets_dir.iterdir():
            if not ds_subdir.is_dir():
                continue
            mapping_file = ds_subdir / "uuid_mapping.json"
            uuid_mapping = {}
            if mapping_file.exists():
                try:
                    uuid_mapping = json.loads(mapping_file.read_text(encoding="utf-8"))
                except Exception:
                    pass
            for label_file in ds_subdir.rglob("labels/*.txt"):
                if label_file.name == "classes.txt":
                    continue
                content = label_file.read_text(encoding="utf-8").strip()
                if not content:
                    continue
                info = uuid_mapping.get(label_file.stem, {})
                orig_path = info.get("original_path", "")
                if orig_path:
                    orig = Path(orig_path)
                    if orig.is_absolute():
                        result[orig.stem.lower()] = content
                    else:
                        key_orig = orig.with_suffix("").as_posix().lower()
                        result[key_orig] = content

    return {"annotations": result}

@router.delete("/clear")
def delete_workspace_datasets(workspace_path: str = Query(None)):
    datasets_dir = get_project_paths(workspace_path)["datasets"]
    if os.path.isdir(datasets_dir):
        shutil.rmtree(datasets_dir, ignore_errors=True)
    return {"status": "success", "message": "Данные воркспейса очищены"}

@router.get("/workspace-classes")
async def get_workspace_classes(workspace_path: str = Query(...)):
    if not workspace_path or not os.path.exists(workspace_path):
        return {"classes": []}
    classes_file = Path(workspace_path) / "classes.txt"
    if classes_file.exists():
        classes = [line.strip() for line in classes_file.read_text(encoding="utf-8").split("\n") if line.strip()]
        return {"classes": classes}
    return {"classes": []}

    return FileResponse(full_path, media_type=_detect_media_type(full_path))

@router.post("/export")
async def export_dataset(payload: ExportPayload):
    classes = payload.classes
    items = payload.items
    train_percent = _clamp_train_percent(payload.trainPercent)
    project_paths = ensure_project_directories(payload.workspace_path)
    safe_subfolder = _sanitize_dataset_name(payload.sub_folder_name)
    dataset_dir = Path(project_paths["datasets"]) / safe_subfolder
    dataset_abs_path = str(dataset_dir.resolve())

    if dataset_dir.is_dir(): shutil.rmtree(dataset_dir)
    dataset_dir.mkdir(parents=True, exist_ok=True)

    if payload.split_mode == "flat":
        split_dirs = {
            "all": {"images": dataset_dir / "images", "labels": dataset_dir / "labels"}
        }
        for paths in split_dirs.values():
            paths["images"].mkdir(parents=True, exist_ok=True)
            paths["labels"].mkdir(parents=True, exist_ok=True)
        split_plan = [{"split": "all", **item} for item in items]
    else:
        split_dirs = {
            split_name: {"images": dataset_dir / split_name / "images", "labels": dataset_dir / split_name / "labels"}
            for split_name in ("train", "val", "test") # ДОБАВЛЕН test
        }
        for paths in split_dirs.values():
            paths["images"].mkdir(parents=True, exist_ok=True)
            paths["labels"].mkdir(parents=True, exist_ok=True)
        split_plan = _build_split_plan(items, payload.trainPercent, payload.valPercent)

    try:
        images_saved = 0
        split_counts = {"train": 0, "val": 0, "test": 0, "all": 0}
        uuid_mapping = {}

        for item in split_plan:
            source_abs_path = item.get("absolutePath")
            split_name = item["split"]
            annotation_txt = (item.get("annotationTxt") or "").strip()

            file_uuid = str(uuid.uuid4())
            ext = Path(source_abs_path).suffix.lower() if source_abs_path else ".jpg"

            image_path = (split_dirs[split_name]["images"] / f"{file_uuid}{ext}").resolve()
            label_path = (split_dirs[split_name]["labels"] / f"{file_uuid}.txt").resolve()

            if source_abs_path and os.path.exists(source_abs_path):
                shutil.copy2(source_abs_path, image_path)
            else:
                continue

            with open(label_path, "w", encoding="utf-8") as label_file:
                label_file.write(annotation_txt)
                if annotation_txt: label_file.write("\n")

            uuid_mapping[file_uuid] = {"original_path": item.get("relativePath") or item.get("absolutePath"), "split": split_name}
            images_saved += 1
            split_counts[split_name] += 1

        with open(dataset_dir / "uuid_mapping.json", "w", encoding="utf-8") as map_file:
            json.dump(uuid_mapping, map_file, indent=2, ensure_ascii=False)

        has_test_files = split_counts.get("test", 0) > 0
        _write_dataset_yaml(str(dataset_dir / "dataset.yaml"), classes, dataset_abs_path, has_test_files)
        with open(dataset_dir / "classes.txt", "w", encoding="utf-8") as classes_file:
            classes_file.write("\n".join(classes) + "\n")

        return {
            "status": "success", "dataset_name": safe_subfolder, "dataset_path": str(dataset_dir), "dataset_abs_path": dataset_abs_path,
            "dataset_yaml_path": str(dataset_dir / "dataset.yaml"), "images_saved": images_saved, "classes_saved": len(classes),
            "train_percent": payload.trainPercent if payload.split_mode == "split" else 100, 
            "val_percent": payload.valPercent if payload.split_mode == "split" else 0, 
            "test_percent": payload.testPercent if payload.split_mode == "split" else 0, 
            "split_counts": split_counts,
        }
    
    except Exception as exc:
        if dataset_dir.is_dir(): shutil.rmtree(dataset_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Не удалось экспортировать датасет: {exc}") from exc


@router.get("")
def list_datasets(workspace_path: str = Query(None)):
    datasets_dir = get_project_paths(workspace_path)["datasets"]
    datasets: list[dict[str, Any]] = []
    if not os.path.isdir(datasets_dir): return {"datasets": datasets}

    for entry in sorted(os.scandir(datasets_dir), key=lambda item: item.name.lower(), reverse=True):
        if not entry.is_dir(): continue
        dataset_name = entry.name
        dataset_dir_path = entry.path
        images = _collect_image_entries(dataset_name, dataset_dir_path, workspace_path or "")
        created_at = datetime.fromtimestamp(Path(dataset_dir_path).stat().st_mtime).isoformat()
        train_count = sum(1 for image in images if image.get("split") == "train")
        val_count = sum(1 for image in images if image.get("split") == "val")
        total_split_images = train_count + val_count
        train_percent = _clamp_train_percent(round(train_count * 100 / total_split_images)) if total_split_images else DEFAULT_TRAIN_PERCENT

        datasets.append({
            "id": dataset_name, "datasetName": dataset_name, "datasetYamlPath": str(Path(dataset_dir_path) / "dataset.yaml"),
            "name": dataset_name, "date": created_at, "imageCount": len(images), "trainSplitPercent": train_percent, "valSplitPercent": 100 - train_percent, "images": images,
        })
    return {"datasets": datasets}

@router.delete("/clear")
def delete_workspace_datasets(workspace_path: str = Query(None)):
    datasets_dir = get_project_paths(workspace_path)["datasets"]
    if os.path.isdir(datasets_dir): shutil.rmtree(datasets_dir, ignore_errors=True)
    return {"status": "success", "message": "Данные воркспейса очищены"}

@router.get("/files/{file_path:path}")
def get_dataset_file(file_path: str, workspace_path: str = Query(None)):
    datasets_dir = get_project_paths(workspace_path)["datasets"]
    full_path = os.path.normpath(os.path.join(datasets_dir, file_path))
    if not full_path.startswith(os.path.abspath(datasets_dir)): raise HTTPException(status_code=400, detail="Некорректный путь")
    if not os.path.isfile(full_path): raise HTTPException(status_code=404, detail="Файл не найден")
    return FileResponse(full_path, media_type=_detect_media_type(full_path))
