import json
import os
import shutil
import uuid
from datetime import datetime
from pathlib import Path

from core.paths import get_project_paths

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".webp", ".tif", ".tiff"}

# Файлы в корне workspace, которые версионируем вместе с датасетом
ROOT_FILES = ("project.yaml", "classes.txt")


def _versions_dir(workspace_path: str) -> Path:
    return Path(get_project_paths(workspace_path)["storage"]) / ".dataset_versions"


def _snapshots_dir(workspace_path: str) -> Path:
    return Path(get_project_paths(workspace_path)["storage"]) / "_snapshots"


def _count_images(datasets_dir: str) -> int:
    total = 0
    root = Path(datasets_dir)
    if not root.exists():
        return 0
    for img in root.rglob("*"):
        if img.is_file() and img.suffix.lower() in IMAGE_EXTENSIONS:
            if "_snapshots" not in img.parts and ".dataset_versions" not in img.parts:
                total += 1
    return total


def _count_autosave_annotations(autosave_dir: str) -> int:
    root = Path(autosave_dir)
    if not root.exists():
        return 0
    return sum(1 for f in root.rglob("*.txt") if f.stat().st_size > 0)


def _collect_classes(datasets_dir: str) -> list[str]:
    all_classes: set[str] = set()
    root = Path(datasets_dir)
    if not root.exists():
        return []
    for classes_file in root.rglob("classes.txt"):
        try:
            for line in classes_file.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if line:
                    all_classes.add(line)
        except Exception:
            pass
    return sorted(all_classes)


def _link_or_copy(src: Path, dst: Path) -> None:
    """Картинки (большие, неизменяемые) — хардлинк без копирования байт.
    Мелкие изменяемые файлы (labels/yaml/json/txt) — копия, чтобы правки на месте
    не ломали уже сохранённые версии. Хардлинк недоступен (другой том) → копия."""
    dst.parent.mkdir(parents=True, exist_ok=True)
    if src.suffix.lower() in IMAGE_EXTENSIONS:
        try:
            os.link(src, dst)
            return
        except OSError:
            pass
    shutil.copy2(src, dst)


def _transfer_tree(src: Path, dst: Path) -> None:
    """Переносит дерево src -> dst по правилам _link_or_copy (картинки линком, остальное копией)."""
    if not src.exists():
        return
    for item in src.rglob("*"):
        if item.is_file():
            _link_or_copy(item, dst / item.relative_to(src))


def save_version(workspace_path: str, name: str) -> dict:
    paths = get_project_paths(workspace_path)
    root = Path(paths["storage"])
    datasets_dir = Path(paths["datasets"])
    autosave_dir = Path(paths["autosave"])

    datasets_dir.mkdir(parents=True, exist_ok=True)

    version_id = str(uuid.uuid4())
    _versions_dir(workspace_path).mkdir(parents=True, exist_ok=True)

    image_count = _count_images(str(datasets_dir))
    if image_count == 0:
        image_count = _count_autosave_annotations(str(autosave_dir))
    classes = _collect_classes(str(datasets_dir))

    snap = _snapshots_dir(workspace_path) / version_id
    snap.mkdir(parents=True, exist_ok=True)

    # Картинки — хардлинком (без копирования байт), мелочь — копией.
    # Папку датасета создаём всегда (даже пустую), чтобы switch не падал.
    (snap / "datasets").mkdir(parents=True, exist_ok=True)
    _transfer_tree(datasets_dir, snap / "datasets")
    _transfer_tree(autosave_dir, snap / "autosave")

    # project.yaml и classes.txt из корня workspace — чтобы переключение возвращало полное состояние
    for fname in ROOT_FILES:
        src = root / fname
        if src.is_file():
            shutil.copy2(src, snap / fname)

    metadata = {
        "id": version_id,
        "name": name,
        "created_at": datetime.now().isoformat(),
        "image_count": image_count,
        "classes": classes,
        "storage_type": "snapshot",
    }

    meta_path = _versions_dir(workspace_path) / f"{version_id}.json"
    meta_path.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")

    return metadata


def list_versions(workspace_path: str) -> list[dict]:
    vdir = _versions_dir(workspace_path)
    if not vdir.exists():
        return []
    versions = []
    for f in vdir.glob("*.json"):
        try:
            versions.append(json.loads(f.read_text(encoding="utf-8")))
        except Exception:
            pass
    versions.sort(key=lambda v: v.get("created_at", ""), reverse=True)
    return versions


def switch_version(workspace_path: str, version_id: str) -> dict:
    vdir = _versions_dir(workspace_path)
    meta_path = vdir / f"{version_id}.json"
    if not meta_path.exists():
        raise ValueError(f"Версия {version_id} не найдена")

    metadata = json.loads(meta_path.read_text(encoding="utf-8"))
    paths = get_project_paths(workspace_path)
    root = Path(paths["storage"])
    datasets_dir = Path(paths["datasets"])
    autosave_dir = Path(paths["autosave"])
    snap = _snapshots_dir(workspace_path) / version_id

    if not snap.exists():
        raise ValueError(f"Снапшот для версии {version_id} не найден")

    # Восстанавливаем датасет (картинки — хардлинком из снапшота, мелочь — копией)
    snap_datasets = snap / "datasets"
    if datasets_dir.exists():
        shutil.rmtree(datasets_dir)
    datasets_dir.mkdir(parents=True, exist_ok=True)
    _transfer_tree(snap_datasets, datasets_dir)

    # Восстанавливаем разметку (autosave)
    snap_autosave = snap / "autosave"
    if snap_autosave.exists():
        if autosave_dir.exists():
            shutil.rmtree(autosave_dir)
        _transfer_tree(snap_autosave, autosave_dir)

    # Восстанавливаем project.yaml и classes.txt
    for fname in ROOT_FILES:
        snap_file = snap / fname
        if snap_file.is_file():
            shutil.copy2(snap_file, root / fname)

    return metadata


def delete_version(workspace_path: str, version_id: str) -> bool:
    meta_path = _versions_dir(workspace_path) / f"{version_id}.json"
    if not meta_path.exists():
        return False

    snap = _snapshots_dir(workspace_path) / version_id
    if snap.exists():
        shutil.rmtree(snap, ignore_errors=True)

    meta_path.unlink(missing_ok=True)
    return True
    
def _parse_yolo_annotation(content: str) -> dict[int, int]:
    counts = {}
    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = line.split()
        if not parts:
            continue
        try:
            class_id = int(parts[0])
            counts[class_id] = counts.get(class_id, 0) + 1
        except ValueError:
            continue
    return counts
    
import logging
logger = logging.getLogger(__name__)

def get_version_stats(workspace_path: str, version_id: str) -> dict:
    vdir = _versions_dir(workspace_path)
    meta_path = vdir / f"{version_id}.json"
    if not meta_path.exists():
        raise ValueError(f"Версия {version_id} не найдена")

    metadata = json.loads(meta_path.read_text(encoding="utf-8"))
    if metadata.get("storage_type") != "snapshot":
        raise ValueError("Статистика доступна только для snapshot-версий")

    snap_base = _snapshots_dir(workspace_path) / version_id
    if not snap_base.exists():
        raise ValueError(f"Снапшот для версии {version_id} не найден")

    datasets_dir = snap_base / "datasets"
    autosave_dir = snap_base / "autosave"

    total_images = 0
    annotated_images = 0
    class_counts_by_name: dict[str, int] = {}

    def scan_dir_for_images_and_labels(root_dir: Path):
        nonlocal total_images, annotated_images, class_counts_by_name

        for images_dir in root_dir.rglob("images"):
            if not images_dir.is_dir():
                continue
            labels_dir = images_dir.parent / "labels"
            dataset_root = images_dir.parent.parent 
            if not (dataset_root / "classes.txt").exists():
                dataset_root = images_dir.parent   
            classes_file = dataset_root / "classes.txt"
            class_names = {}
            if classes_file.exists():
                lines = classes_file.read_text(encoding="utf-8").splitlines()
                for idx, name in enumerate(lines):
                    class_names[idx] = name.strip()

            for ext in IMAGE_EXTENSIONS:
                for img_path in images_dir.glob(f"*{ext}"):
                    total_images += 1
                    label_path = labels_dir / f"{img_path.stem}.txt"
                    if label_path.exists():
                        content = label_path.read_text(encoding="utf-8").strip()
                        if content:
                            annotated_images += 1
                            for line in content.splitlines():
                                parts = line.split()
                                if not parts:
                                    continue
                                try:
                                    class_id = int(parts[0])
                                    class_name = class_names.get(class_id, f"class_{class_id}")
                                    class_counts_by_name[class_name] = class_counts_by_name.get(class_name, 0) + 1
                                except ValueError:
                                    pass

    if datasets_dir.exists():
        scan_dir_for_images_and_labels(datasets_dir)

    classes = sorted(class_counts_by_name.keys())
    class_counts = {name: class_counts_by_name[name] for name in classes}
    return {
        "total_images": total_images,
        "annotated_images": annotated_images,
        "classes": classes,
        "class_counts": class_counts,
    }

