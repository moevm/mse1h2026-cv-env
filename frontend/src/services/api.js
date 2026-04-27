const API_BASE_URL = "http://localhost:8000";

const buildQuery = (workspacePath) => {
  return workspacePath ? `?workspace_path=${encodeURIComponent(workspacePath)}` : "";
};

// Project
export const pickWorkspacePath = async () => {
  const res = await fetch(`${API_BASE_URL}/api/utils/pick-directory`);
  if (!res.ok) throw new Error("Не удалось выбрать папку");
  const data = await res.json();
  return data.path;
};

export const initProjectOnBackend = async (projectName, workspacePath) => {
  const res = await fetch(`${API_BASE_URL}/api/projects/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: projectName, path: workspacePath }),
  });
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
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
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
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Ошибка сохранения конфигурации обучения");
  return await res.json();
};

export const startTraining = async (data) => {
  const res = await fetch(`${API_BASE_URL}/api/training/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.message || "Ошибка запуска обучения");
  }
  return await res.json();
};

export const validateModel = async (modelName) => {
  const res = await fetch(`${API_BASE_URL}/api/training/validate-model`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model_name: modelName }),
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

export const exportDataset = async ({ collectionName, workspacePath, subFolderName, classes, items, trainPercent }) => {
  const formData = new FormData();
  formData.append("collection_name", collectionName);
  
  formData.append("workspace_path", workspacePath || "");

  formData.append("sub_folder_name", subFolderName || "default");

  const metadata = {
    collection_name: collectionName,
    trainPercent,
    classes,
    items: items.map((item, uploadIndex) => ({
      uploadIndex,
      originalFileName: item.file.name,
      relativePath: item.relativePath,
      annotationTxt: item.annotationTxt,
    })),
  };

  formData.append("metadata_json", JSON.stringify(metadata));
  items.forEach((item) => {
    formData.append("files", item.file, item.file.name);
  });

  const res = await fetch(`${API_BASE_URL}/api/datasets/export`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || "Ошибка экспорта датасета");
  }
  return await res.json();
};

export const deleteStoredDataset = async (datasetName, workspacePath) => {
  const res = await fetch(`${API_BASE_URL}/api/datasets/${encodeURIComponent(datasetName)}${buildQuery(workspacePath)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || "Ошибка удаления коллекции");
  }
  return await res.json();
};