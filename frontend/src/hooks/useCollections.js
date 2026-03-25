import { useState } from "react";
import { getAllFilesFromDirectory } from "../utils/fileSystem";

function buildImagesWithAnnotations(files) {
  const allFiles = Array.from(files);
  const imageFiles = allFiles.filter((file) => file.type.startsWith("image/"));
  const txtFiles = allFiles.filter(
    (file) => file.name.toLowerCase().endsWith(".txt") && !file.type.startsWith("image/"),
  );

  const txtByStem = new Map(
    txtFiles.map((file) => [
      (file.relativePath || file.name)
        .replace(/\\/g, "/")
        .replace(/\.txt$/i, "")
        .toLowerCase(),
      file,
    ]),
  );

  const sortedImageFiles = imageFiles.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );

  return sortedImageFiles.map((file) => {
    const relativePath = file.webkitRelativePath || file.relativePath || file.name;
    const stemKey = relativePath.replace(/\\/g, "/").replace(/\.[^.]+$/u, "").toLowerCase();

    return {
      file,
      name: file.name,
      type: file.type,
      size: file.size,
      relativePath,
      annotationFile: txtByStem.get(stemKey) || null,
    };
  });
}

function useCollections() {
  const [collections, setCollections] = useState([]);

  const addCollection = (files, collectionName, directoryHandle) => {
    const images = buildImagesWithAnnotations(files);

    const newCollection = {
      id: Date.now().toString(),
      name: collectionName || `Коллекция от ${new Date().toLocaleString()}`,
      date: new Date().toISOString(),
      images,
      imageCount: images.length,
      directoryHandle,
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

  const syncCollection = async (collectionId) => {
    const collection = collections.find((c) => c.id === collectionId);
    if (!collection || !collection.directoryHandle) {
      throw new Error("No directory handle for this collection");
    }

    const allFiles = await getAllFilesFromDirectory(collection.directoryHandle);
    const images = buildImagesWithAnnotations(allFiles);

    setCollections((prev) =>
      prev.map((c) =>
        c.id === collectionId ? { ...c, images, imageCount: images.length } : c,
      ),
    );

    return images;
  };

  return {
    collections,
    addCollection,
    removeCollection,
    getCollection,
    updateCollection,
    syncCollection,
  };
}

export default useCollections;
