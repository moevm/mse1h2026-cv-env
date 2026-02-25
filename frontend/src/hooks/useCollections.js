import { useState } from "react";

function useCollections() {
  const [collections, setCollections] = useState([]);

  const loadImagesFromFiles = (fileList) => {
    const imageFiles = Array.from(fileList).filter((file) =>
      file.type.startsWith("image/"),
    );

    return Promise.all(
      imageFiles.map((file) => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            resolve({
              file,
              url: e.target.result,
              name: file.name,
              type: file.type,
              size: file.size,
            });
          };
          reader.readAsDataURL(file);
        });
      }),
    );
  };

  const addCollection = async (files, collectionName) => {
    const images = await loadImagesFromFiles(files);

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
