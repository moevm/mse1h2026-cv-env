import { useState } from "react";

function useCollections() {
  const [collections, setCollections] = useState([]);

  const addCollection = (files, collectionName) => {
    const allFiles = Array.from(files);

    const imageFiles = allFiles.filter((file) => file.type.startsWith("image/"));
    const txtFiles = allFiles.filter((file) => file.name.toLowerCase().endsWith(".txt"));

    const txtByRelativePath = new Map(
      txtFiles.map((file) => {
        const relativePath = file.webkitRelativePath || file.name;
        const txtKey = relativePath.replace(/\.txt$/i, "");
        return [txtKey, file];
      }),
    );

    // Сортировка по имени файла (с учётом локали для естественного порядка)
    const sortedImageFiles = imageFiles.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );

    const images = sortedImageFiles.map((file) => {
      const relativePath = file.webkitRelativePath || file.name;
      const imageKey = relativePath.replace(/\.[^.]+$/, "");

      return {
        file,
        annotationFile: txtByRelativePath.get(imageKey) || null,
        name: file.name,
        type: file.type,
        size: file.size,
        relativePath, // для уникальности
      };
    });

    const newCollection = {
      id: Date.now().toString(),
      name: collectionName || `Коллекция от ${new Date().toLocaleString()}`,
      date: new Date().toISOString(),
      images: images,
      imageCount: images.length,
    };

    setCollections((prev) => [newCollection, ...prev]);
    return newCollection.id;
  };

  const removeCollection = (collectionId) => {
    setCollections((prev) => prev.filter((c) => c.id !== collectionId));
  };

  const getCollection = (collectionId) => {
    return collections.find((c) => c.id === collectionId);
  };

  const updateCollection = (collectionId, updatedData) => {
    setCollections((prev) =>
      prev.map((c) => (c.id === collectionId ? { ...c, ...updatedData } : c)),
    );
  };

  return {
    collections,
    addCollection,
    removeCollection,
    getCollection,
    updateCollection,
  };
}

export default useCollections;

