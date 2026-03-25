import json
import os
import re
import shutil
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from core.paths import DATASETS_DIR

router = APIRouter(prefix="/api/datasets", tags=["Datasets"])


def _sanitize_dataset_name(name: str) -> str:
    cleaned = re.sub(r"[^a-zA-Zа-яА-Я0-9._-]+", "_", (name or "dataset").strip())
    cleaned = cleaned.strip("._-")
    return cleaned or "dataset"


def _sanitize_filename(filename: str) -> str:
    return Path(filename or "image").name


def _build_dataset_yaml(dataset_dir: str, classes: list[str]) -> dict[str, Any]:
    _ = dataset_dir
    return {
        "path": ".",
        "train": "images",
        "val": "images",
        "test": None,
        "names": {index: class_name for index, class_name in enumerate(classes)},
    }


def _write_dataset_yaml(file_path: str, dataset_dir: str, classes: list[str]) -> None:
    dataset_yaml = _build_dataset_yaml(dataset_dir, classes)
    yaml_content = yaml.safe_dump(dataset_yaml, allow_unicode=True, sort_keys=False)
    yaml_content = yaml_content.replace("test: null", "test:")

    with open(file_path, "w", encoding="utf-8") as yaml_file:
        yaml_file.write(yaml_content)


@router.post("/export")
async def export_dataset(
    collection_name: str = Form(...),
    metadata_json: str = Form(...),
    files: list[UploadFile] = File(...),
):
    try:
        metadata = json.loads(metadata_json)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"Некорректный metadata_json: {exc}") from exc

    classes = metadata.get("classes") or []
    items = metadata.get("items") or []

    if not isinstance(classes, list) or not all(isinstance(item, str) for item in classes):
        raise HTTPException(status_code=400, detail="Поле classes должно быть списком строк")

    if not isinstance(items, list) or not items:
        raise HTTPException(status_code=400, detail="Нет данных для экспорта")

    dataset_name = _sanitize_dataset_name(collection_name)
    dataset_dir = os.path.join(DATASETS_DIR, dataset_name)

    if os.path.isdir(dataset_dir):
        shutil.rmtree(dataset_dir)

    os.makedirs(dataset_dir, exist_ok=True)
    image_dir = os.path.join(dataset_dir, "images")
    label_dir = os.path.join(dataset_dir, "labels")
    os.makedirs(image_dir, exist_ok=True)
    os.makedirs(label_dir, exist_ok=True)

    try:
        for item in items:
            upload_index = item.get("uploadIndex")
            if not isinstance(upload_index, int) or upload_index < 0 or upload_index >= len(files):
                raise HTTPException(status_code=400, detail="Некорректный uploadIndex в metadata")

            upload = files[upload_index]
            filename = _sanitize_filename(item.get("originalFileName") or upload.filename)
            label_filename = f"{Path(filename).stem}.txt"
            annotation_txt = (item.get("annotationTxt") or "").strip()

            image_path = os.path.join(image_dir, filename)
            label_path = os.path.join(label_dir, label_filename)

            file_bytes = await upload.read()
            with open(image_path, "wb") as image_file:
                image_file.write(file_bytes)

            with open(label_path, "w", encoding="utf-8") as label_file:
                label_file.write(annotation_txt)
                if annotation_txt:
                    label_file.write("\n")

        _write_dataset_yaml(
            os.path.join(dataset_dir, "dataset.yaml"),
            dataset_dir,
            classes,
        )

        with open(os.path.join(dataset_dir, "classes.txt"), "w", encoding="utf-8") as classes_file:
            classes_file.write("\n".join(classes))
            if classes:
                classes_file.write("\n")

        with open(os.path.join(dataset_dir, "dataset_meta.json"), "w", encoding="utf-8") as meta_file:
            json.dump(metadata, meta_file, ensure_ascii=False, indent=2)

        return {
            "status": "success",
            "dataset_name": dataset_name,
            "dataset_path": dataset_dir,
            "images_saved": len(items),
            "classes_saved": len(classes),
        }
    except HTTPException:
        if os.path.isdir(dataset_dir):
            shutil.rmtree(dataset_dir, ignore_errors=True)
        raise
    except Exception as exc:
        if os.path.isdir(dataset_dir):
            shutil.rmtree(dataset_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Не удалось экспортировать датасет: {exc}") from exc
