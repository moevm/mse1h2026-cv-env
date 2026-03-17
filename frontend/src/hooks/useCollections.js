import { useState } from "react";

function useCollections() {
  const [collections, setCollections] = useState([]);

  const addCollection = (files, collectionName) => {
    const imageFiles = Array.from(files).filter((file) =>
      file.type.startsWith("image/"),
    );

    const images = imageFiles.map((file) => ({
      file,
      name: file.name,
      type: file.type,
      size: file.size,
    }));

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

