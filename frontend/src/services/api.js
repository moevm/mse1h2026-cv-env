const API_BASE_URL = "http://localhost:8000";

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

export async function createRawDataset(datasetName, files) {
  const formData = new FormData();
  formData.append("dataset_name", datasetName);
  
  for (const file of files) {
    formData.append("files", file);
  }
  
  const response = await fetch("http://localhost:8000/api/datasets/upload-raw", {
    method: "POST",
    body: formData,
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || "Failed to upload dataset");
  }
  
  return response.json();
}

// Annotations
export const addAnnotationClass = async (datasetName, className) => {
  const res = await fetch(`${API_BASE_URL}/api/datasets/${encodeURIComponent(datasetName)}/annotations/class`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ class_name: className }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || "Ошибка добавления класса");
  }

  return await res.json();
};

export const saveAnnotation = async (datasetName, imageUuid, annotationContent, classes = []) => {
  const res = await fetch(`${API_BASE_URL}/api/datasets/${encodeURIComponent(datasetName)}/annotations/save`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_uuid: imageUuid,
      content: annotationContent,
      classes: classes,
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || "Ошибка сохранения разметки");
  }

  return await res.json();
};

// Сохранение разметки на бэкенд
export async function saveAnnotationToBackend(datasetName, imageUuid, annotationContent, classesList) {
  try {
    const response = await fetch(`http://localhost:8000/api/datasets/${datasetName}/annotations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_uuid: imageUuid,
        content: annotationContent,
        classes: classesList,
      }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to save annotation');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error saving annotation to backend:', error);
    return null;
  }
}

// Загрузка разметки с бэкенда
export async function loadAnnotationFromBackend(datasetName, imageUuid) {
  try {
    const response = await fetch(`http://localhost:8000/api/datasets/${datasetName}/annotations/${imageUuid}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail || 'Failed to load annotation');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error loading annotation from backend:', error);
    return { content: '', exists: false };
  }
}

// Загрузка классов с бэкенда
export async function loadClassesFromBackend(datasetName) {
  try {
    const response = await fetch(`http://localhost:8000/api/datasets/${datasetName}/classes`);
    
    if (!response.ok) {
      throw new Error('Failed to load classes');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error loading classes from backend:', error);
    return { classes: [] };
  }
}

export const performDatasetSplit = async (datasetName, { train_percent, test_percent, seed = 42 }) => {
  const res = await fetch(`${API_BASE_URL}/api/datasets/${encodeURIComponent(datasetName)}/split`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ train_percent, test_percent, seed }),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || "Ошибка при выполнении сплита");
  }
  return await res.json();
};