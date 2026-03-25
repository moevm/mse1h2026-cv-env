// Augmentation
export const getAugmentations = async () => {
  const res = await fetch(`http://localhost:8000/api/augmentation/config`);
  if (!res.ok) {
    throw new Error("Ошибка загрузки конфигурации");
  }
  return await res.json();
};

export const saveAugmentations = async (data) => {
  const res = await fetch("http://localhost:8000/api/augmentation/config", {
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
  const res = await fetch(`http://localhost:8000/api/training/config`);
  if (!res.ok) {
    throw new Error("Ошибка загрузки конфигурации обучения");
  }
  return await res.json();
};

export const saveTrainingConfig = async (data) => {
  const res = await fetch(`http://localhost:8000/api/training/config`, {
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
  const res = await fetch(`http://localhost:8000/api/training/start`, {
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
  const res = await fetch(`http://localhost:8000/api/training/validate-model`, {
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
  const res = await fetch(`http://localhost:8000/api/training/status/${taskId}`);
  if (!res.ok) {
    throw new Error("Ошибка получения статуса обучения");
  }
  return await res.json();
};

export const stopTraining = async (taskId) => {
  const res = await fetch(`http://localhost:8000/api/training/stop/${taskId}`, {
    method: "POST",
  });

  if (!res.ok) {
    throw new Error("Ошибка остановки обучения");
  }

  return await res.json();
};

export const exportDataset = async ({ collectionName, classes, items }) => {
  const formData = new FormData();
  formData.append("collection_name", collectionName);

  const metadata = {
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

  const res = await fetch("http://localhost:8000/api/datasets/export", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new Error(error.detail || "Ошибка экспорта датасета");
  }

  return await res.json();
};
