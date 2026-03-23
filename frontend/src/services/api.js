export const getAugmentations = async () => {
  const res = await fetch("http://localhost:8000/api/augmentation/config");
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