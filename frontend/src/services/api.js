export const API_BASE_URL = "http://localhost:8000";

const buildQuery = (value, key = "workspace_path") => {
  return value ? `?${key}=${encodeURIComponent(value)}` : "";
};

export const scanFolderOnBackend = async (path, virtualName) => {
  const res = await fetch(`${API_BASE_URL}/api/projects/scan-folder?path=${encodeURIComponent(path)}&virtual_name=${encodeURIComponent(virtualName)}`);
  if (!res.ok) throw new Error("Ошибка сканирования папки");
  return await res.json();
};

export const getImageUrl = (absolutePath) => {
  if (!absolutePath) return null;
  return `${API_BASE_URL}/api/utils/image?path=${encodeURIComponent(absolutePath)}`;
};

export const readTextFileSafe = async (absolutePath) => {
  if (!absolutePath) return "";
  try {
    const res = await fetch(`${API_BASE_URL}/api/utils/read-text?path=${encodeURIComponent(absolutePath)}`);
    if (res.ok) {
      const data = await res.json();
      return data.content;
    }
  } catch (e) {
    console.error("Ошибка при тихом чтении файла:", e);
  }
  return "";
};

export const pickWorkspacePath = async () => {
  const res = await fetch(`${API_BASE_URL}/api/utils/pick-directory`);
  if (!res.ok) throw new Error("Не удалось выбрать папку");
  const data = await res.json();
  return data.path;
};

export const initProjectOnBackend = async (payload) => {
  const res = await fetch(`${API_BASE_URL}/api/projects/init`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const errorData = await res.json(); 
    throw new Error(JSON.stringify(errorData.detail) || "Ошибка инициализации проекта");
  }
  return await res.json();
};

export const updateProjectOnBackend = async (payload) => {
  const res = await fetch(`${API_BASE_URL}/api/projects/update`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Ошибка обновления YAML");
  return await res.json();
};

export const loadProjectFromBackend = async (workspacePath) => {
  const res = await fetch(`${API_BASE_URL}/api/projects/load${buildQuery(workspacePath, "path")}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || "Не удалось загрузить проект");
  }
  return await res.json();
};

// Augmentation
export const getAugmentations = async (workspacePath) => {
  const res = await fetch(`${API_BASE_URL}/api/augmentation/config${buildQuery(workspacePath)}`);
  if (!res.ok) throw new Error("Ошибка загрузки конфигурации");
  return await res.json();
};

export const saveAugmentations = async (data, workspacePath) => {
  const res = await fetch(`${API_BASE_URL}/api/augmentation/config${buildQuery(workspacePath)}`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Ошибка сохранения конфигурации");
  return await res.json();
};

// Training
export const getTrainingConfig = async (workspacePath) => {
  const res = await fetch(`${API_BASE_URL}/api/training/config${buildQuery(workspacePath)}`);
  if (!res.ok) throw new Error("Ошибка загрузки конфигурации обучения");
  return await res.json();
};

export const saveTrainingConfig = async (data, workspacePath) => {
  const res = await fetch(`${API_BASE_URL}/api/training/config${buildQuery(workspacePath)}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Ошибка сохранения конфигурации обучения");
  return await res.json();
};

export const startTraining = async (data) => {
  const res = await fetch(`${API_BASE_URL}/api/training/start`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Ошибка запуска обучения");
  }
  return await res.json();
};

export const validateModel = async (modelName) => {
  const res = await fetch(`${API_BASE_URL}/api/training/validate-model`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model_name: modelName }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Ошибка валидации модели");
  }
  return await res.json();
};

export const getTrainingStatus = async (taskId) => {
  const res = await fetch(`${API_BASE_URL}/api/training/status/${taskId}`);
  if (!res.ok) throw new Error("Ошибка получения статуса обучения");
  return await res.json();
};

export const stopTraining = async (taskId) => {
  const res = await fetch(`${API_BASE_URL}/api/training/stop/${taskId}`, { method: "POST" });
  if (!res.ok) throw new Error("Ошибка остановки обучения");
  return await res.json();
};

export const getTrainingLogs = async (taskId, limit = 100) => {
  const res = await fetch(`${API_BASE_URL}/api/training/logs/${taskId}?limit=${limit}`);
  if (!res.ok) throw new Error("Ошибка получения логов обучения");
  return await res.json();
};

// Dataset
export const getStoredDatasets = async (workspacePath) => {
  const res = await fetch(`${API_BASE_URL}/api/datasets${buildQuery(workspacePath)}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || "Ошибка загрузки сохранённых датасетов");
  }
  return await res.json();
};

export const exportDataset = async ({ collectionName, workspacePath, subFolderName, classes, items, trainPercent, valPercent, testPercent, splitMode }) => {
  const payload = {
    collection_name: collectionName,
    workspace_path: workspacePath || "",
    sub_folder_name: subFolderName || "default",
    trainPercent,
    valPercent,
    testPercent,
    split_mode: splitMode || "split",
    classes,
    items: items.map((item) => ({
      absolutePath: item.absolutePath,
      relativePath: item.relativePath,
      annotationTxt: item.annotationTxt,
    })),
  };

  const res = await fetch(`${API_BASE_URL}/api/datasets/export`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || "Ошибка экспорта датасета");
  }
  return await res.json();
};

export const deleteStoredDataset = async (workspacePath) => {
  const res = await fetch(`${API_BASE_URL}/api/datasets/clear${buildQuery(workspacePath)}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Ошибка удаления данных");
  return await res.json();
};

// Annotations (Прямое автосохранение)
export const autosaveAnnotation = async (imageAbsPath, annotationContent, classes = [], workspacePath) => {
  const res = await fetch(`${API_BASE_URL}/api/datasets/autosave`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image_abs_path: imageAbsPath,
      content: annotationContent,
      classes: classes,
      workspace_path: workspacePath,
    }),
  });
  return await res.json();
};

export async function loadWorkspaceClasses(workspacePath) {
  const response = await fetch(`${API_BASE_URL}/api/datasets/workspace-classes?workspace_path=${encodeURIComponent(workspacePath)}`);
  return await response.json();
}

// ----- Experiments API -----
export const getExperiments = async (workspacePath, sortBy = 'map50', order = 'desc') => {
  const wpQuery = workspacePath ? `workspace_path=${encodeURIComponent(workspacePath)}&` : "";
  const res = await fetch(`${API_BASE_URL}/api/experiments?${wpQuery}sort_by=${sortBy}&order=${order}`);
  if (!res.ok) throw new Error("Ошибка загрузки списка экспериментов");
  return await res.json();
};

export const runExperiment = async (data, workspacePath) => {
  const payload = { ...data, workspace_path: workspacePath };
  const res = await fetch(`${API_BASE_URL}/api/experiments/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Ошибка запуска эксперимента");
  return await res.json();
};

export const compareExperiments = async (expIds, workspacePath) => {
  const res = await fetch(`${API_BASE_URL}/api/experiments/compare${buildQuery(workspacePath)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(expIds),
  });
  if (!res.ok) throw new Error("Ошибка сравнения");
  return await res.json();
};

export const getAvailableModels = async (workspacePath) => {
  const res = await fetch(`${API_BASE_URL}/api/experiments/models${buildQuery(workspacePath)}`);
  if (!res.ok) throw new Error("Ошибка загрузки списка моделей");
  return await res.json();
};

export const deleteExperiment = async (expId, workspacePath) => {
  const res = await fetch(`${API_BASE_URL}/api/experiments/${expId}${buildQuery(workspacePath)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Ошибка удаления эксперимента");
  return await res.json();
};

export const getTrainingMetrics = async (taskId) => {
  const res = await fetch(`${API_BASE_URL}/api/training/metrics/${taskId}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || "Ошибка получения метрик");
  }
  return await res.json();
};

export const pauseTraining = async (taskId) => {
  const res = await fetch(`${API_BASE_URL}/api/training/pause/${taskId}`, { method: "POST" });
  if (!res.ok) throw new Error("Ошибка паузы обучения");
  return await res.json();
};

export const resumeTraining = async (taskId) => {
  const res = await fetch(`${API_BASE_URL}/api/training/resume/${taskId}`, { method: "POST" });
  if (!res.ok) throw new Error("Ошибка возобновления обучения");
  return await res.json();
};