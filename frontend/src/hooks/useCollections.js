import { useCallback, useEffect, useState } from "react";
import { getAllFilesFromDirectory } from "../utils/fileSystem";
import { deleteStoredDataset, getStoredDatasets } from "../services/api";

const DEFAULT_TRAIN_SPLIT_PERCENT = 80;

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
    (a.webkitRelativePath || a.relativePath || a.name).localeCompare(
      b.webkitRelativePath || b.relativePath || b.name,
      undefined,
      { numeric: true, sensitivity: "base" },
    ),
  );

  return sortedImageFiles.map((file) => {
    const relativePath = file.webkitRelativePath || file.relativePath || file.name;
    const stemKey = relativePath.replace(/\\/g, "/").replace(/\.[^.]+$/u, "").toLowerCase();

    return {
      file,
      url: null,
      name: file.name,
      type: file.type,
      size: file.size,
      relativePath,
      split: null,
      annotationFile: txtByStem.get(stemKey) || null,
      annotationText: null,
    };
  });
}

function buildStoredCollection(dataset) {
  const images = Array.isArray(dataset.images)
    ? dataset.images.map((image) => ({
        file: null,
        url: image.url ? `http://localhost:8000${image.url}` : null,
        name: image.name,
        type: "image/*",
        size: null,
        relativePath: image.relativePath || image.name,
        storedPath: image.storedPath || null,
        split: image.split || null,
        annotationFile: null,
        annotationText: image.annotationText || "",
      }))
    : [];

  const trainSplitPercent = Number.isFinite(dataset.trainSplitPercent)
    ? dataset.trainSplitPercent
    : DEFAULT_TRAIN_SPLIT_PERCENT;

  return {
    id: dataset.id || dataset.datasetName || dataset.name,
    datasetName: dataset.datasetName || dataset.id || dataset.name,
    datasetYamlPath: dataset.datasetYamlPath || null,
    name: dataset.name || dataset.datasetName || "Коллекция",
    date: dataset.date || new Date().toISOString(),
    images,
    imageCount: typeof dataset.imageCount === "number" ? dataset.imageCount : images.length,
    directoryHandle: null,
    persisted: true,
    trainSplitPercent,
    valSplitPercent: Number.isFinite(dataset.valSplitPercent)
      ? dataset.valSplitPercent
      : 100 - trainSplitPercent,
  };
}

function useCollections() {
  const [collections, setCollections] = useState([]);
  const [isLoadingCollections, setIsLoadingCollections] = useState(true);

  const loadStoredCollections = useCallback(async () => {
    setIsLoadingCollections(true);
    try {
      const response = await getStoredDatasets();
      const restored = Array.isArray(response.datasets)
        ? response.datasets.map(buildStoredCollection)
        : [];
      setCollections((prev) => {
        const localOnly = prev.filter((collection) => !collection.persisted);
        return [...localOnly, ...restored];
      });
    } catch (error) {
      console.error("Не удалось загрузить сохранённые коллекции:", error);
    } finally {
      setIsLoadingCollections(false);
    }
  }, []);

  useEffect(() => {
    loadStoredCollections();
  }, [loadStoredCollections]);

  const addCollection = (files, collectionName, directoryHandle) => {
    const images = buildImagesWithAnnotations(files);

    const newCollection = {
      id: Date.now().toString(),
      name: collectionName || `Коллекция от ${new Date().toLocaleString()}`,
      date: new Date().toISOString(),
      images,
      imageCount: images.length,
      directoryHandle,
      persisted: false,
      trainSplitPercent: DEFAULT_TRAIN_SPLIT_PERCENT,
      valSplitPercent: 100 - DEFAULT_TRAIN_SPLIT_PERCENT,
    };

    setCollections((prev) => [newCollection, ...prev]);
    return newCollection.id;
  };

  const removeCollection = async (collectionId) => {
    const collection = collections.find((c) => c.id === collectionId);
    if (!collection) {
      return false;
    }

    if (collection.persisted) {
      await deleteStoredDataset(collection.datasetName || collection.id);
    }

    setCollections((prev) => prev.filter((c) => c.id !== collectionId));
    return true;
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
    isLoadingCollections,
    loadStoredCollections,
    addCollection,
    removeCollection,
    getCollection,
    updateCollection,
    syncCollection,
  };
}

export default useCollections;
