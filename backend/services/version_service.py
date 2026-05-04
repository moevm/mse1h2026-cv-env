import json
import os
import shutil
import subprocess
import sys
import uuid
import yaml
from datetime import datetime
from pathlib import Path

from core.paths import STORAGE_DIR, get_project_paths

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DEFAULT_DVC_FILE = os.path.join(STORAGE_DIR, "datasets.dvc")

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".gif", ".webp", ".tif", ".tiff"}


def _run_dvc(args: list[str]) -> tuple[bool, str]:
    try:
        result = subprocess.run(
            [sys.executable, "-m", "dvc"] + args,
            cwd=PROJECT_ROOT,
            capture_output=True, text=True, timeout=180
        )
        return result.returncode == 0, (result.stdout + result.stderr).strip()
    except Exception as e:
        return False, str(e)


def _read_dvc_hash(dvc_file_path: str) -> str | None:
    try:
        with open(dvc_file_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        outs = data.get("outs", [])
        if outs:
            return outs[0].get("md5") or outs[0].get("hash")
    except Exception:
        pass
    return None


def _write_dvc_hash(dvc_file_path: str, md5_hash: str) -> bool:
    try:
        with open(dvc_file_path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f)
        if data and "outs" in data and data["outs"]:
            data["outs"][0]["md5"] = md5_hash
        with open(dvc_file_path, "w", encoding="utf-8") as f:
            yaml.safe_dump(data, f, sort_keys=False)
        return True
    except Exception:
        return False


def _count_images(datasets_dir: str) -> int:
    total = 0
    root = Path(datasets_dir)
    if not root.exists():
        return 0
    for img in root.rglob("*"):
        if img.is_file() and img.suffix.lower() in IMAGE_EXTENSIONS:
            # exclude snapshot directories
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


def _is_default_workspace(workspace_path: str) -> bool:
    paths = get_project_paths(workspace_path)
    return os.path.normpath(paths["storage"]) == os.path.normpath(STORAGE_DIR)


def _versions_dir(workspace_path: str) -> Path:
    return Path(get_project_paths(workspace_path)["storage"]) / ".dataset_versions"


def _snapshots_dir(workspace_path: str) -> Path:
    return Path(get_project_paths(workspace_path)["storage"]) / "_snapshots"


def _resolve(workspace_path: str) -> dict:
    paths = get_project_paths(workspace_path)
    datasets_dir = paths["datasets"]
    if _is_default_workspace(workspace_path):
        dvc_file = DEFAULT_DVC_FILE
    else:
        dvc_file = str(Path(datasets_dir).parent / "datasets.dvc")
    return {"datasets_dir": datasets_dir, "dvc_file": dvc_file}


def _copy_dir_if_exists(src: str, dst: str) -> None:
    if os.path.exists(src):
        shutil.copytree(src, dst, dirs_exist_ok=True)


def save_version(workspace_path: str, name: str) -> dict:
    paths = get_project_paths(workspace_path)
    resolved = _resolve(workspace_path)
    datasets_dir = resolved["datasets_dir"]
    autosave_dir = paths["autosave"]
    dvc_file = resolved["dvc_file"]

    os.makedirs(datasets_dir, exist_ok=True)

    version_id = str(uuid.uuid4())
    _versions_dir(workspace_path).mkdir(parents=True, exist_ok=True)

    # Считаем изображения: сначала в datasets/, потом в autosave/ если datasets пустой
    image_count = _count_images(datasets_dir)
    if image_count == 0:
        image_count = _count_autosave_annotations(autosave_dir)
    classes = _collect_classes(datasets_dir)

    storage_type = "snapshot"
    dvc_md5 = None

    if _is_default_workspace(workspace_path):
        rel_datasets = os.path.relpath(datasets_dir, PROJECT_ROOT)
        ok, out = _run_dvc(["add", rel_datasets])
        if ok:
            dvc_md5 = _read_dvc_hash(dvc_file)
            if dvc_md5:
                storage_type = "dvc"

    # Всегда сохраняем снапшот autosave (разметка) + datasets если DVC не сработал
    snap_path = _snapshots_dir(workspace_path) / version_id
    snap_path.mkdir(parents=True, exist_ok=True)
    if storage_type == "snapshot":
        _copy_dir_if_exists(datasets_dir, str(snap_path / "datasets"))
    _copy_dir_if_exists(autosave_dir, str(snap_path / "autosave"))

    metadata = {
        "id": version_id,
        "name": name,
        "created_at": datetime.now().isoformat(),
        "image_count": image_count,
        "classes": classes,
        "storage_type": storage_type,
        "dvc_md5": dvc_md5,
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
    resolved = _resolve(workspace_path)
    datasets_dir = resolved["datasets_dir"]
    autosave_dir = paths["autosave"]
    snap_base = _snapshots_dir(workspace_path) / version_id

    if metadata.get("storage_type") == "dvc":
        dvc_md5 = metadata.get("dvc_md5")
        if not dvc_md5:
            raise ValueError("DVC хэш не сохранён для этой версии")

        dvc_file = resolved["dvc_file"]
        if not os.path.exists(dvc_file):
            raise ValueError("DVC файл не найден")

        if not _write_dvc_hash(dvc_file, dvc_md5):
            raise ValueError("Не удалось обновить DVC файл")

        rel_dvc = os.path.relpath(dvc_file, PROJECT_ROOT)
        ok, out = _run_dvc(["checkout", rel_dvc])
        if not ok:
            raise ValueError(f"DVC checkout завершился с ошибкой: {out}")
    else:
        snap_datasets = snap_base / "datasets"
        if not snap_datasets.exists():
            raise ValueError(f"Снапшот для версии {version_id} не найден")
        if os.path.exists(datasets_dir):
            shutil.rmtree(datasets_dir)
        shutil.copytree(str(snap_datasets), datasets_dir)

    # Восстанавливаем autosave (разметку) из снапшота если он есть
    snap_autosave = snap_base / "autosave"
    if snap_autosave.exists():
        if os.path.exists(autosave_dir):
            shutil.rmtree(autosave_dir)
        shutil.copytree(str(snap_autosave), autosave_dir)

    return metadata


def delete_version(workspace_path: str, version_id: str) -> bool:
    meta_path = _versions_dir(workspace_path) / f"{version_id}.json"
    if not meta_path.exists():
        return False

    try:
        data = json.loads(meta_path.read_text(encoding="utf-8"))
        if data.get("storage_type") == "snapshot":
            snap = _snapshots_dir(workspace_path) / version_id
            if snap.exists():
                shutil.rmtree(snap)
    except Exception:
        pass

    meta_path.unlink(missing_ok=True)
    return True
