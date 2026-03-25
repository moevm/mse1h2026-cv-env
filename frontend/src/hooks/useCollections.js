// hooks/useCollections.js
import { useState } from "react";
import { getAllFilesFromDirectory } from "../utils/fileSystem"; // adjust path as needed

function useCollections() {
  const [collections, setCollections] = useState([]);

  const addCollection = (files, collectionName, directoryHandle) => {
    const imageFiles = Array.from(files).filter((file) =>
      file.type.startsWith("image/")
    );

    const sortedImageFiles = imageFiles.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );

    const images = sortedImageFiles.map((file) => ({
      file,
      name: file.name,
      type: file.type,
      size: file.size,
      relativePath: file.webkitRelativePath || file.relativePath || file.name,
    }));

    const newCollection = {
      id: Date.now().toString(),
      name: collectionName || `Коллекция от ${new Date().toLocaleString()}`,
      date: new Date().toISOString(),
      images: images,
      imageCount: images.length,
      directoryHandle, // store the handle for future sync
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
      prev.map((c) => (c.id === collectionId ? { ...c, ...updatedData } : c))
    );
  };

  const syncCollection = async (collectionId) => {
    const collection = collections.find((c) => c.id === collectionId);
    if (!collection || !collection.directoryHandle) {
      throw new Error("No directory handle for this collection");
    }

    // Read all files from the stored directory handle
    const allFiles = await getAllFilesFromDirectory(collection.directoryHandle);
    const imageFiles = allFiles.filter((file) => file.type.startsWith("image/"));

    const sortedImageFiles = imageFiles.sort((a, b) =>
      a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      })
    );

    const images = sortedImageFiles.map((file) => ({
      file,
      name: file.name,
      type: file.type,
      size: file.size,
      relativePath: file.relativePath,
    }));

    // Update the collection with new images
    setCollections((prev) =>
      prev.map((c) =>
        c.id === collectionId
          ? { ...c, images, imageCount: images.length }
          : c
      )
    );

    return images;
  };

  return {
    collections,
    addCollection,
    removeCollection,
    getCollection,
    updateCollection,
    syncCollection, // expose sync method
  };
}

export default useCollections;
