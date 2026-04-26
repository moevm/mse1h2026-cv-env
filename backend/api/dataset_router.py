import json
import uuid
import mimetypes
import os
import re
import shutil
import random
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import quote

import yaml
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from core.paths import DATASETS_DIR
from schemas.annotation_schema import SaveAnnotationRequest

router = APIRouter(prefix="/api/datasets", tags=["Datasets"])

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".webp", ".tif", ".tiff", ".JPG", ".JPEG"}
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


def _resolve_dataset_subpath(dataset_name: str, base_dir_name: str, nested_path: str) -> str:
    safe_dataset_name = _sanitize_dataset_name(dataset_name)
    dataset_root = (Path(DATASETS_DIR).resolve() / safe_dataset_name / base_dir_name).resolve()
    requested_path = Path(*[part for part in PurePosixPath(nested_path).parts if part not in {"", ".", ".."}])
    resolved_path = (dataset_root / requested_path).resolve()

    if dataset_root not in resolved_path.parents and resolved_path != dataset_root:
        raise HTTPException(status_code=400, detail="Некорректный путь к файлу")

    return str(resolved_path)


def _load_uuid_mapping(dataset_dir: Path) -> dict:
    """Загружает маппинг UUID -> original_name, split."""
    mapping_file = dataset_dir / "uuid_mapping.json"
    if not mapping_file.exists():
        return {}
    with open(mapping_file, "r", encoding="utf-8") as f:
        return json.load(f)


def _save_uuid_mapping(dataset_dir: Path, mapping: dict) -> None:
    """Сохраняет маппинг UUID."""
    with open(dataset_dir / "uuid_mapping.json", "w", encoding="utf-8") as f:
        json.dump(mapping, f, indent=2, ensure_ascii=False)


def _collect_image_entries(dataset_name: str, dataset_dir: str) -> list[dict[str, Any]]:
    """Сбор информации об изображениях – поддерживает плоскую структуру (images/) и split-папки (train/val/test)."""
    dataset_root = Path(dataset_dir)
    uuid_mapping = _load_uuid_mapping(dataset_root)
    entries = []

    if uuid_mapping:
        # ---- НОВЫЙ UUID-ФОРМАТ ----
        # Сначала проверяем, разложены ли файлы по сплитам
        has_splits = any((dataset_root / split / "images").exists() for split in ["train", "val", "test"])
        if has_splits:
            for split_name in ("train", "val", "test"):
                split_img_dir = dataset_root / split_name / "images"
                split_lbl_dir = dataset_root / split_name / "labels"
                if not split_img_dir.exists():
                    continue
                for img in split_img_dir.iterdir():
                    if img.suffix.lower() not in IMAGE_EXTENSIONS:
                        continue
                    uid = img.stem
                    orig = uuid_mapping.get(uid, {}).get("original_name", uid)
                    lbl = split_lbl_dir / f"{uid}.txt"
                    ann_txt = _read_text_file(str(lbl)) if lbl.exists() else ""
                    stored = f"{split_name}/images/{img.name}"
                    entries.append({
                        "name": uid,
                        "originalName": orig,
                        "relativePath": uid,
                        "storedPath": stored,
                        "split": split_name,
                        "url": f"/api/datasets/{quote(dataset_name)}/files/{_quote_path_parts(stored)}",
                        "annotationText": ann_txt,
                        "uuid": uid,
                    })
        else:
            # Плоская структура – все файлы в images/ и labels/
            img_dir = dataset_root / "images"
            lbl_dir = dataset_root / "labels"
            if img_dir.exists():
                for img in img_dir.iterdir():
                    if img.suffix.lower() not in IMAGE_EXTENSIONS:
                        continue
                    uid = img.stem
                    orig = uuid_mapping.get(uid, {}).get("original_name", uid)
                    split = uuid_mapping.get(uid, {}).get("split", None)
                    lbl = lbl_dir / f"{uid}.txt"
                    ann_txt = _read_text_file(str(lbl)) if lbl.exists() else ""
                    stored = f"images/{img.name}"
                    entries.append({
                        "name": uid,
                        "originalName": orig,
                        "relativePath": uid,
                        "storedPath": stored,
                        "split": split,
                        "url": f"/api/datasets/{quote(dataset_name)}/files/{_quote_path_parts(stored)}",
                        "annotationText": ann_txt,
                        "uuid": uid,
                    })
        entries.sort(key=lambda x: x["name"])
        return entries

    # ---- LEGACY-ФОРМАТ (старый, без UUID) ----
    for split_name in ("train", "val"):
        img_dir = dataset_root / split_name / "images"
        lbl_dir = dataset_root / split_name / "labels"
        if not img_dir.is_dir():
            continue
        for img in sorted(img_dir.rglob("*"), key=lambda p: str(p).lower()):
            if not img.is_file() or img.suffix.lower() not in IMAGE_EXTENSIONS:
                continue
            rel = img.relative_to(img_dir).as_posix()
            stored = img.relative_to(dataset_root).as_posix()
            lbl = lbl_dir / rel.replace(img.suffix, ".txt")
            ann_txt = _read_text_file(str(lbl)) if lbl.exists() else ""
            entries.append({
                "name": img.name,
                "relativePath": rel,
                "storedPath": stored,
                "split": split_name,
                "url": f"/api/datasets/{quote(dataset_name)}/files/{_quote_path_parts(stored)}",
                "annotationText": ann_txt,
            })
    if entries:
        return entries

    # Fallback: flat images/ + labels/
    img_root = dataset_root / "images"
    lbl_root = dataset_root / "labels"
    if img_root.is_dir():
        for img in sorted(img_root.rglob("*"), key=lambda p: str(p).lower()):
            if not img.is_file() or img.suffix.lower() not in IMAGE_EXTENSIONS:
                continue
            rel = img.relative_to(img_root).as_posix()
            stored = img.relative_to(dataset_root).as_posix()
            lbl = lbl_root / rel.replace(img.suffix, ".txt")
            ann_txt = _read_text_file(str(lbl)) if lbl.exists() else ""
            entries.append({
                "name": img.name,
                "relativePath": rel,
                "storedPath": stored,
                "split": None,
                "url": f"/api/datasets/{quote(dataset_name)}/files/{_quote_path_parts(stored)}",
                "annotationText": ann_txt,
            })
    return entries


def _clamp_train_percent(train_percent: int | float | None) -> int:
    try:
        numeric_value = int(round(float(train_percent if train_percent is not None else DEFAULT_TRAIN_PERCENT)))
    except (TypeError, ValueError):
        numeric_value = DEFAULT_TRAIN_PERCENT
    return max(1, min(99, numeric_value))


def _build_split_plan(items: list[dict[str, Any]], train_percent: int) -> list[dict[str, Any]]:
    normalized_items = []
    for item in items:
        relative_path = _normalize_relative_path(
            item.get("relativePath"),
            item.get("originalFileName") or "image",
        )
        normalized_items.append({**item, "normalizedRelativePath": relative_path})

    sorted_items = sorted(
        normalized_items,
        key=lambda entry: entry["normalizedRelativePath"].lower(),
    )

    if len(sorted_items) <= 1:
        return [{**item, "split": "train"} for item in sorted_items]

    train_count = int(round(len(sorted_items) * (train_percent / 100)))
    train_count = max(1, min(len(sorted_items) - 1, train_count))

    split_plan = []
    for index, item in enumerate(sorted_items):
        split_plan.append({**item, "split": "train" if index < train_count else "val"})

    return split_plan


@router.get("")
def list_datasets():
    datasets = []
    if not os.path.isdir(DATASETS_DIR):
        return {"datasets": datasets}

    for entry in sorted(os.scandir(DATASETS_DIR), key=lambda e: e.name.lower(), reverse=True):
        if not entry.is_dir():
            continue
        name = entry.name
        path = entry.path
        images = _collect_image_entries(name, path)
        created = datetime.fromtimestamp(Path(path).stat().st_mtime).isoformat()
        train_cnt = sum(1 for i in images if i.get("split") == "train")
        val_cnt = sum(1 for i in images if i.get("split") == "val")
        test_cnt = sum(1 for i in images if i.get("split") == "test")
        total_split = train_cnt + val_cnt + test_cnt
        train_percent = _clamp_train_percent(round(train_cnt * 100 / total_split)) if total_split else DEFAULT_TRAIN_PERCENT

        datasets.append({
            "id": name,
            "datasetName": name,
            "datasetYamlPath": str(Path(path) / "dataset.yaml"),
            "name": name,
            "date": created,
            "imageCount": len(images),
            "trainSplitPercent": train_percent,
            "valSplitPercent": 100 - train_percent,
            "images": images,
        })
    return {"datasets": datasets}


@router.delete("/{dataset_name}")
def delete_dataset(dataset_name: str):
    safe = _sanitize_dataset_name(dataset_name)
    path = os.path.join(DATASETS_DIR, safe)
    if not os.path.isdir(path):
        raise HTTPException(status_code=404, detail="Коллекция не найдена")
    shutil.rmtree(path)
    return {"status": "success", "dataset_name": safe}


@router.get("/{dataset_name}/yaml-path")
def get_config(dataset_name: str):
    safe = _sanitize_dataset_name(dataset_name)
    path = os.path.join(DATASETS_DIR, safe)
    if not os.path.isdir(path):
        raise HTTPException(status_code=404, detail="Датасет не найден")
    yaml_path = os.path.join(path, "dataset.yaml")
    if not os.path.isfile(yaml_path):
        raise HTTPException(status_code=404, detail="Файл dataset.yaml не найден")
    return {"dataset_name": safe, "yaml_path": yaml_path, "exists": True}


@router.get("/{dataset_name}/files/{file_path:path}")
def get_dataset_file(dataset_name: str, file_path: str):
    abs_path = _resolve_dataset_subpath(dataset_name, "", file_path)
    if not os.path.isfile(abs_path):
        raise HTTPException(status_code=404, detail="Файл не найден")
    return FileResponse(abs_path, media_type=_detect_media_type(abs_path), filename=Path(abs_path).name)


@router.post("/export")
async def export_dataset(
    collection_name: str = Form(...),
    metadata_json: str = Form(...),
    files: list[UploadFile] = File(...),
):
    try:
        meta = json.loads(metadata_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(400, f"Некорректный JSON: {exc}")
    classes = meta.get("classes", [])
    items = meta.get("items", [])
    train_percent = _clamp_train_percent(meta.get("trainPercent"))
    if not isinstance(classes, list) or not all(isinstance(c, str) for c in classes):
        raise HTTPException(400, "classes должен быть списком строк")
    if not items:
        raise HTTPException(400, "Нет данных для экспорта")
    dataset_name = _sanitize_dataset_name(collection_name)
    dataset_dir = os.path.join(DATASETS_DIR, dataset_name)
    dataset_abs = os.path.abspath(dataset_dir)
    if os.path.isdir(dataset_dir):
        shutil.rmtree(dataset_dir)
    os.makedirs(dataset_dir, exist_ok=True)
    root = Path(dataset_dir)
    split_dirs = {
        s: {"images": root / s / "images", "labels": root / s / "labels"} for s in ("train", "val")
    }
    for paths in split_dirs.values():
        paths["images"].mkdir(parents=True, exist_ok=True)
        paths["labels"].mkdir(parents=True, exist_ok=True)

    plan = _build_split_plan(items, train_percent)
    saved = 0
    counts = {"train": 0, "val": 0}
    try:
        for item in plan:
            idx = item.get("uploadIndex")
            if not isinstance(idx, int) or idx < 0 or idx >= len(files):
                raise HTTPException(400, "Некорректный uploadIndex")
            up = files[idx]
            rel = item["normalizedRelativePath"]
            split = item["split"]
            ann = (item.get("annotationTxt") or "").strip()
            img_path = split_dirs[split]["images"] / rel
            lbl_path = split_dirs[split]["labels"] / rel.replace(img_path.suffix, ".txt")
            img_path.parent.mkdir(parents=True, exist_ok=True)
            lbl_path.parent.mkdir(parents=True, exist_ok=True)
            data = await up.read()
            with open(img_path, "wb") as f:
                f.write(data)
            with open(lbl_path, "w", encoding="utf-8") as f:
                f.write(ann)
                if ann: f.write("\n")
            saved += 1
            counts[split] += 1
        _write_dataset_yaml(os.path.join(dataset_dir, "dataset.yaml"), classes, dataset_abs)
        with open(os.path.join(dataset_dir, "classes.txt"), "w", encoding="utf-8") as f:
            f.write("\n".join(classes) + ("\n" if classes else ""))
        return {
            "status": "success",
            "dataset_name": dataset_name,
            "dataset_path": dataset_dir,
            "dataset_abs_path": dataset_abs,
            "dataset_yaml_path": os.path.join(dataset_dir, "dataset.yaml"),
            "images_saved": saved,
            "classes_saved": len(classes),
            "train_percent": train_percent,
            "val_percent": 100 - train_percent,
            "split_counts": counts,
        }
    except HTTPException:
        if os.path.isdir(dataset_dir): shutil.rmtree(dataset_dir, ignore_errors=True)
        raise
    except Exception as e:
        if os.path.isdir(dataset_dir): shutil.rmtree(dataset_dir, ignore_errors=True)
        raise HTTPException(500, f"Ошибка экспорта: {e}")


@router.post("/upload-raw")
async def upload_raw_dataset(
    dataset_name: str = Form(...),
    files: list[UploadFile] = File(...),
):
    safe = _sanitize_dataset_name(dataset_name)
    dataset_dir = Path(DATASETS_DIR) / safe
    if dataset_dir.exists():
        raise HTTPException(400, "Датасет уже существует")
    dataset_dir.mkdir(parents=True)
    images_dir = dataset_dir / "images"
    labels_dir = dataset_dir / "labels"
    images_dir.mkdir()
    labels_dir.mkdir()
    images_by_stem = {}
    labels_by_stem = {}
    for f in files:
        stem = Path(f.filename).stem.lower()
        ext = Path(f.filename).suffix.lower()
        if ext in IMAGE_EXTENSIONS:
            images_by_stem[stem] = f
        elif ext == ".txt":
            labels_by_stem[stem] = f
    mapping = {}
    for stem, img_file in images_by_stem.items():
        uid = str(uuid.uuid4())
        ext = Path(img_file.filename).suffix.lower()
        if ext not in IMAGE_EXTENSIONS:
            ext = ".jpg"
        img_path = images_dir / f"{uid}{ext}"
        content = await img_file.read()
        with open(img_path, "wb") as f:
            f.write(content)
        lbl_path = labels_dir / f"{uid}.txt"
        if stem in labels_by_stem:
            label_content = await labels_by_stem[stem].read()
            with open(lbl_path, "wb") as f:
                f.write(label_content)
        else:
            lbl_path.write_text("", encoding="utf-8")
        mapping[uid] = {"original_name": img_file.filename, "split": None, "extension": ext}
    _save_uuid_mapping(dataset_dir, mapping)
    return {"status": "success", "dataset_id": safe, "images_count": len(mapping)}


# ---------- SPLIT ENDPOINT (с поддержкой train/val/test) ----------
class SplitRequest(BaseModel):
    train_percent: float
    test_percent: float
    seed: int = 42

@router.post("/{dataset_name}/split")
async def apply_split(
    dataset_name: str,
    request: SplitRequest,
):
    safe = _sanitize_dataset_name(dataset_name)
    dataset_dir = Path(DATASETS_DIR) / safe
    if not dataset_dir.exists():
        raise HTTPException(404, "Датасет не найден")

    mapping = _load_uuid_mapping(dataset_dir)
    if not mapping:
        raise HTTPException(400, "Маппинг UUID не найден")

    uuids = list(mapping.keys())
    if not uuids:
        raise HTTPException(400, "Нет изображений")

    train_pct = max(0, min(100, request.train_percent))
    test_pct = max(0, min(100, request.test_percent))
    val_pct = 100 - train_pct - test_pct
    if val_pct < 0:
        raise HTTPException(400, "Сумма процентов превышает 100")

    sorted_uuids = sorted(uuids)
    random.seed(request.seed)
    random.shuffle(sorted_uuids)

    n = len(sorted_uuids)
    train_cnt = int(round(n * train_pct / 100))
    test_cnt = int(round(n * test_pct / 100))
    val_cnt = n - train_cnt - test_cnt

    # подстраховка при малых числах
    if train_cnt == 0:
        train_cnt = 1
        if val_cnt > 0: val_cnt -= 1
        else: test_cnt -= 1
    if test_cnt < 0: test_cnt = 0
    if val_cnt < 0: val_cnt = 0

    train_uuids = set(sorted_uuids[:train_cnt])
    val_uuids = set(sorted_uuids[train_cnt:train_cnt + val_cnt])
    test_uuids = set(sorted_uuids[train_cnt + val_cnt:])

    # создаём директории
    for split in ("train", "val", "test"):
        (dataset_dir / split / "images").mkdir(parents=True, exist_ok=True)
        (dataset_dir / split / "labels").mkdir(parents=True, exist_ok=True)

    # перемещаем файлы
    for uid, data in mapping.items():
        ext = data.get("extension", ".jpg")
        src_img = dataset_dir / "images" / f"{uid}{ext}"
        src_txt = dataset_dir / "labels" / f"{uid}.txt"
        if uid in train_uuids:
            dest = "train"
        elif uid in val_uuids:
            dest = "val"
        elif uid in test_uuids:
            dest = "test"
        else:
            continue
        dst_img = dataset_dir / dest / "images" / f"{uid}{ext}"
        dst_txt = dataset_dir / dest / "labels" / f"{uid}.txt"
        if src_img.exists():
            shutil.move(str(src_img), str(dst_img))
        if src_txt.exists():
            shutil.move(str(src_txt), str(dst_txt))
        data["split"] = dest

    _save_uuid_mapping(dataset_dir, mapping)

    # удаляем старые папки, если пустые
    for folder in ("images", "labels"):
        fdir = dataset_dir / folder
        if fdir.exists() and not any(fdir.iterdir()):
            shutil.rmtree(fdir, ignore_errors=True)

    # обновляем dataset.yaml
    classes_file = dataset_dir / "classes.txt"
    if classes_file.exists():
        with open(classes_file, "r", encoding="utf-8") as f:
            classes = [line.strip() for line in f if line.strip()]
        _write_dataset_yaml(str(dataset_dir / "dataset.yaml"), classes, str(dataset_dir.resolve()))

    return {
        "status": "success",
        "train_count": len(train_uuids),
        "val_count": len(val_uuids),
        "test_count": len(test_uuids),
        "seed": request.seed,
    }


# ---------- ANNOTATION ENDPOINTS (сохраняем в нужную папку) ----------
@router.post("/{dataset_name}/annotations/class")
async def add_annotation_class(dataset_name: str, class_name: str):
    safe = _sanitize_dataset_name(dataset_name)
    dataset_dir = Path(DATASETS_DIR) / safe
    if not dataset_dir.exists():
        raise HTTPException(404, "Датасет не найден")
    classes_file = dataset_dir / "classes.txt"
    existing = []
    if classes_file.exists():
        existing = [line.strip() for line in classes_file.read_text(encoding="utf-8").split("\n") if line.strip()]
    if class_name.strip() not in existing:
        existing.append(class_name.strip())
        classes_file.write_text("\n".join(existing) + "\n", encoding="utf-8")
        _write_dataset_yaml(str(dataset_dir / "dataset.yaml"), existing, str(dataset_dir.resolve()))
    return {
        "status": "success",
        "class_name": class_name.strip(),
        "class_index": existing.index(class_name.strip()),
        "all_classes": existing,
    }


@router.post("/{dataset_name}/annotations/save")
async def save_annotation(dataset_name: str, request: SaveAnnotationRequest):
    safe = _sanitize_dataset_name(dataset_name)
    dataset_dir = Path(DATASETS_DIR) / safe
    if not dataset_dir.exists():
        raise HTTPException(404, "Датасет не найден")
    # Определяем, где лежат labels (сплит или flat)
    mapping = _load_uuid_mapping(dataset_dir)
    split_for_uuid = mapping.get(request.image_uuid, {}).get("split") if mapping else None
    if split_for_uuid:
        labels_dir = dataset_dir / split_for_uuid / "labels"
    else:
        labels_dir = dataset_dir / "labels"
        if not labels_dir.exists():
            labels_dir.mkdir(parents=True, exist_ok=True)
    label_file = labels_dir / f"{request.image_uuid}.txt"
    label_file.write_text(request.content, encoding="utf-8")
    # обновляем classes.txt, если переданы новые классы
    if request.classes:
        classes_file = dataset_dir / "classes.txt"
        existing = []
        if classes_file.exists():
            existing = [line.strip() for line in classes_file.read_text(encoding="utf-8").split("\n") if line.strip()]
        updated = False
        for cls in request.classes:
            if cls.strip() and cls.strip() not in existing:
                existing.append(cls.strip())
                updated = True
        if updated:
            classes_file.write_text("\n".join(existing) + "\n", encoding="utf-8")
            _write_dataset_yaml(str(dataset_dir / "dataset.yaml"), existing, str(dataset_dir.resolve()))
    return {"status": "success", "image_uuid": request.image_uuid}


@router.get("/{dataset_name}/annotations/{image_uuid}")
async def get_annotation(dataset_name: str, image_uuid: str):
    safe = _sanitize_dataset_name(dataset_name)
    dataset_dir = Path(DATASETS_DIR) / safe
    # ищем файл в возможных местах
    candidates = [
        dataset_dir / "labels" / f"{image_uuid}.txt",
        dataset_dir / "train" / "labels" / f"{image_uuid}.txt",
        dataset_dir / "val" / "labels" / f"{image_uuid}.txt",
        dataset_dir / "test" / "labels" / f"{image_uuid}.txt",
    ]
    for cand in candidates:
        if cand.exists():
            return {"content": cand.read_text(encoding="utf-8"), "exists": True}
    return {"content": "", "exists": False}


@router.get("/{dataset_name}/classes")
async def get_classes(dataset_name: str):
    safe = _sanitize_dataset_name(dataset_name)
    dataset_dir = Path(DATASETS_DIR) / safe
    classes_file = dataset_dir / "classes.txt"
    if classes_file.exists():
        classes = [line.strip() for line in classes_file.read_text(encoding="utf-8").split("\n") if line.strip()]
        return {"classes": classes}
    return {"classes": []}