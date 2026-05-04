import json
import uuid
from datetime import datetime
from pathlib import Path

from core.paths import get_project_paths
from services.augmentation_config import load_augmentation_config, save_augmentation_config
from schemas.augmentation_schema import AugmentationSchema


def _versions_dir(workspace_path: str) -> Path:
    storage = get_project_paths(workspace_path)["storage"]
    return Path(storage) / ".aug_versions"


def save_aug_version(workspace_path: str, name: str, params: dict) -> dict:
    vdir = _versions_dir(workspace_path)
    vdir.mkdir(parents=True, exist_ok=True)

    version_id = str(uuid.uuid4())
    metadata = {
        "id": version_id,
        "name": name,
        "created_at": datetime.now().isoformat(),
        "params": params,
    }
    (vdir / f"{version_id}.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return metadata


def list_aug_versions(workspace_path: str) -> list[dict]:
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


def switch_aug_version(workspace_path: str, version_id: str) -> dict:
    vdir = _versions_dir(workspace_path)
    meta_path = vdir / f"{version_id}.json"
    if not meta_path.exists():
        raise ValueError(f"Версия {version_id} не найдена")

    metadata = json.loads(meta_path.read_text(encoding="utf-8"))
    schema = AugmentationSchema(**metadata["params"])
    save_augmentation_config(schema, workspace_path)
    return metadata


def delete_aug_version(workspace_path: str, version_id: str) -> bool:
    meta_path = _versions_dir(workspace_path) / f"{version_id}.json"
    if not meta_path.exists():
        return False
    meta_path.unlink(missing_ok=True)
    return True
