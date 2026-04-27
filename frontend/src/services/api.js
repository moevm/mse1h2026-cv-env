export const API_BASE_URL = "http://localhost:8000";

// Augmentation
export const getAugmentations = async () => {
  const res = await fetch(`${API_BASE_URL}/api/augmentation/config`);
  if (!res.ok) {
    throw new Error("Ошибка загрузки конфигурации");
  }
  return await res.json();
};

export const saveAugmentations = async (data) => {
  const res = await fetch(`${API_BASE_URL}/api/augmentation/config`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error("Ошибка сохранения конфигурации");
  }

  return await res.json();
};

// Training
export const getTrainingConfig = async () => {
  const res = await fetch(`${API_BASE_URL}/api/training/config`);
  if (!res.ok) {
    throw new Error("Ошибка загрузки конфигурации обучения");
  }
  return await res.json();
};

export const saveTrainingConfig = async (data) => {
  const res = await fetch(`${API_BASE_URL}/api/training/config`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    throw new Error("Ошибка сохранения конфигурации обучения");
  }

  return await res.json();
};

export const startTraining = async (data) => {
  const res = await fetch(`${API_BASE_URL}/api/training/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
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
    headers: {
      "Content-Type": "application/json",
    },
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
  if (!res.ok) {
    throw new Error("Ошибка получения статуса обучения");
  }
  return await res.json();
};

export const stopTraining = async (taskId) => {
  const res = await fetch(`${API_BASE_URL}/api/training/stop/${taskId}`, {
    method: "POST",
  });

  if (!res.ok) {
    throw new Error("Ошибка остановки обучения");
  }

  return await res.json();
};

export const getTrainingLogs = async (taskId, limit = 100) => {
  const res = await fetch(`${API_BASE_URL}/api/training/logs/${taskId}?limit=${limit}`);
  if (!res.ok) {
    throw new Error("Ошибка получения логов обучения");
  }
  return await res.json();
};
export const getStoredDatasets = async () => {
  const res = await fetch(`${API_BASE_URL}/api/datasets`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || "Ошибка загрузки сохранённых датасетов");
  }

  return await res.json();
};

// Dataset
export const exportDataset = async ({ collectionName, classes, items, trainPercent }) => {
  const formData = new FormData();
  formData.append("collection_name", collectionName);

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

export const deleteStoredDataset = async (datasetName) => {
  const res = await fetch(`${API_BASE_URL}/api/datasets/${encodeURIComponent(datasetName)}`, {
    method: "DELETE",
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || "Ошибка удаления коллекции");
  }

  return await res.json();
};

export const getDataset = async (datasetName) => {
  const res = await fetch(`${API_BASE_URL}/api/datasets/${encodeURIComponent(datasetName)}/yaml-path`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || "Ошибка получения пути к dataset.yaml");
  }
  return await res.json();
};

// ----- Experiments API -----
export const getExperiments = async (sortBy = 'map50', order = 'desc') => {
  const res = await fetch(`${API_BASE_URL}/api/experiments?sort_by=${sortBy}&order=${order}`);
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || "Ошибка загрузки списка экспериментов");
  }
  return await res.json();
};

export const runExperiment = async (data) => {
  const res = await fetch(`${API_BASE_URL}/api/experiments/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || "Ошибка запуска эксперимента");
  }
  return await res.json();
};

export const compareExperiments = async (expIds) => {
  console.log('Sending POST to', `${API_BASE_URL}/api/experiments/compare`, expIds);
  const res = await fetch(`${API_BASE_URL}/api/experiments/compare`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(expIds),
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json();
};

export const getAvailableModels = async () => {
  const res = await fetch(`${API_BASE_URL}/api/experiments/models`);
  if (!res.ok) {
    throw new Error("Ошибка загрузки списка моделей");
  }
  return await res.json();
};

export const deleteExperiment = async (expId) => {
  const res = await fetch(`${API_BASE_URL}/api/experiments/${expId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || "Ошибка удаления эксперимента");
  }
  return await res.json();
};
