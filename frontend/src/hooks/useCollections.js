import { useCallback, useEffect, useState } from "react";
import { serializeFolders } from "../utils/fileSystem";
import { saveCollections, loadCollections } from "../utils/persistence";
import { deleteStoredDataset, getStoredDatasets, updateProjectOnBackend, scanFolderOnBackend, scanVideoFolderOnBackend, scanDatasetFolderOnBackend, getImageUrl } from "../services/api";

const DEFAULT_TRAIN_SPLIT_PERCENT = 80;
const DEFAULT_VAL_SPLIT_PERCENT = 10;
const DEFAULT_TEST_SPLIT_PERCENT = 10;

function mergeTrees(oldNodes = [], newNodes = []) {
  return newNodes.map(newNode => {
    const oldNode = oldNodes.find(n => n.path === newNode.path);
    if (oldNode) {
      return { ...newNode, isEnabled: oldNode.isEnabled, children: mergeTrees(oldNode.children, newNode.children) };
    }
    return { ...newNode, isEnabled: true };
  });
}

function buildImagesWithAnnotations(files, loadedAnnotations = {}) {
  const imageFiles = files.filter((f) => f.type.startsWith("image/"));
  const txtFiles = files.filter((f) => f.type === "text/plain");

  const txtByStem = new Map(
    txtFiles.map((file) => [file.relativePath.replace(/\\/g, "/").replace(/\.txt$/i, "").toLowerCase(), file])
  );

  return imageFiles.map((file) => {
    const stemKey = file.relativePath.replace(/\\/g, "/").replace(/\.[^.]+$/u, "").toLowerCase();
    const baseNameKey = stemKey.split("/").pop(); // Извлекаем чистый stem (без папок)
    
    const annotationTextFromBackend = loadedAnnotations[stemKey] || loadedAnnotations[baseNameKey] || null;
    // Для датасетов и видео аннотации приходят прямо в объекте файла
    const annotationText = annotationTextFromBackend ?? file.annotationText ?? null;

    return {
      file: file,
      absolutePath: file.absolute_path || file.absolutePath,
      url: getImageUrl(file.absolute_path || file.absolutePath),
      name: file.name,
      uuid: stemKey,
      type: file.type,
      size: file.size,
      relativePath: file.relativePath,
      split: file.split || null,
      annotationFile: txtByStem.get(stemKey) || null,
      annotationText,
    };
  });
}

function useCollections() {
  const [collections, setCollections] = useState([]);
  const [isLoadingCollections, setIsLoadingCollections] = useState(true);

  useEffect(() => {
    loadCollections().then(saved => {
      setCollections(saved || []);
      setIsLoadingCollections(false);
    }).catch(err => {
      console.error("Ошибка загрузки из IndexedDB:", err);
      setIsLoadingCollections(false);
    });
  }, []);

  useEffect(() => {
    if (!isLoadingCollections) saveCollections(collections);
  }, [collections, isLoadingCollections]);

  const addCollection = (projectName, workspacePath, customId = null) => {
    const newCollection = {
      id: customId || crypto.randomUUID(), // ИСПОЛЬЗУЕМ UUID
      name: projectName,
      workspacePath: workspacePath,
      date: new Date().toISOString(),
      images: [],
      folders: [],
      projectClasses: [], // Инициализируем классы
      trainSplitPercent: DEFAULT_TRAIN_SPLIT_PERCENT,
      valSplitPercent: DEFAULT_VAL_SPLIT_PERCENT,
      testSplitPercent: DEFAULT_TEST_SPLIT_PERCENT,
      imageCount: 0
    };
    setCollections(prev => [...prev, newCollection]);
    return newCollection.id;
  };

  const toggleFolderState = (collectionId, targetPath, newIsEnabled) => {
    setCollections((prev) => prev.map((col) => {
      if (col.id !== collectionId) return col;
      const setDescendants = (nodes, val) => nodes.map(n => ({ ...n, isEnabled: val, children: n.children ? setDescendants(n.children, val) : [] }));
      const updateTree = (nodes) => {
        return nodes.map(node => {
          if (node.path === targetPath) return { ...node, isEnabled: newIsEnabled, children: node.children ? setDescendants(node.children, newIsEnabled) : [] };
          if (targetPath.startsWith(node.path + '/')) {
            const updatedChildren = updateTree(node.children || []);
            const nextEnabled = newIsEnabled ? true : node.isEnabled;
            return { ...node, isEnabled: nextEnabled, children: updatedChildren };
          }
          return node;
        });
      };
      return { ...col, folders: updateTree(col.folders || []) };
    }));
  };

  const removeCollection = async (collectionId) => {
    const collection = collections.find((c) => c.id === collectionId);
    if (!collection) return false;
    setCollections((prev) => prev.filter((c) => c.id !== collectionId));
    return true;
  };

  const getCollection = (collectionId) => collections.find((c) => c.id === collectionId);

  const updateCollection = (collectionId, updatedData) => {
    setCollections((prev) => prev.map((c) => (c.id === collectionId ? { ...c, ...updatedData } : c)));
  };

  const syncCollection = async (collectionId, forceFolders = null) => {
    const collection = collections.find((c) => c.id === collectionId);
    if (!collection) return;
    const targetFolders = forceFolders || collection.folders;
    if (!targetFolders || targetFolders.length === 0) return;

    let allUpdatedFiles = [];
    const updatedFolders = [];

    for (const folderNode of targetFolders) {
      if (!folderNode.absolutePath) {
        updatedFolders.push(folderNode);
        continue;
      }
      let scanResult;
      if (folderNode.folderType === "videos" && folderNode.absolutePath) {
        scanResult = await scanVideoFolderOnBackend(folderNode.absolutePath, folderNode.path, collection.workspacePath || "", 1);
      } else if (folderNode.folderType === "dataset") {
        scanResult = await scanDatasetFolderOnBackend(folderNode.absolutePath, folderNode.path);
      } else {
        scanResult = await scanFolderOnBackend(folderNode.absolutePath, folderNode.path);
      }
      const mergedChildren = mergeTrees(folderNode.children || [], scanResult.tree || []);
      allUpdatedFiles.push(...scanResult.files);
      updatedFolders.push({ ...folderNode, children: mergedChildren });
    }

    const images = buildImagesWithAnnotations(allUpdatedFiles, collection.loadedAnnotations || {});
    setCollections((prev) => prev.map((c) => c.id === collectionId ? { ...c, images, imageCount: images.length, folders: updatedFolders } : c));
  };

  const debounceSync = useCallback((collection) => {
    if (!collection.workspacePath) return;
    // ПОЛНЫЙ PAYLOAD ДЛЯ YAML
    const payload = {
      id: collection.id, 
      name: collection.name, 
      created_at: collection.date, // Сохраняем дату
      path: collection.workspacePath, 
      folders: serializeFolders(collection.folders || []),
      classes: collection.projectClasses || [], // Сохраняем классы
      train_split_percent: collection.trainSplitPercent || 80, // Сохраняем сплит
      val_split_percent: collection.valSplitPercent || 10,  // Изменено
      test_split_percent: collection.testSplitPercent || 10 // Добавлено
    };
    updateProjectOnBackend(payload).catch(err => console.error("Ошибка фоновой синхронизации YAML:", err));
  }, []);

  useEffect(() => {
    if (isLoadingCollections || collections.length === 0) return;
    const timeoutId = setTimeout(() => { collections.forEach(col => debounceSync(col)); }, 1000);
    return () => clearTimeout(timeoutId);
  }, [collections, isLoadingCollections, debounceSync]);

  const loadProject = async (backendData) => {
    const { config, annotated_images } = backendData;
    let allUpdatedFiles = [];
    const updatedFolders = [];

    if (config.folders && config.folders.length > 0) {
      for (const folderNode of config.folders) {
        if (!folderNode.absolutePath) {
          updatedFolders.push(folderNode);
          continue;
        }
        try {
          let scanResult;
          if (folderNode.folderType === "videos" && folderNode.absolutePath) {
            scanResult = await scanVideoFolderOnBackend(folderNode.absolutePath, folderNode.path, config.path || "", 1);
          } else if (folderNode.folderType === "dataset") {
            scanResult = await scanDatasetFolderOnBackend(folderNode.absolutePath, folderNode.path);
          } else {
            scanResult = await scanFolderOnBackend(folderNode.absolutePath, folderNode.path);
          }
          const mergedChildren = mergeTrees(folderNode.children || [], scanResult.tree || []);
          allUpdatedFiles.push(...scanResult.files);
          updatedFolders.push({ ...folderNode, children: mergedChildren });
        } catch (error) {
          updatedFolders.push(folderNode);
        }
      }
    }

    const images = buildImagesWithAnnotations(allUpdatedFiles, annotated_images || {});
    
    const newCollection = {
      id: config.id, 
      name: config.name, 
      workspacePath: config.path, 
      date: config.created_at || new Date().toISOString(),
      folders: updatedFolders, 
      projectClasses: config.classes || [], 
      trainSplitPercent: config.train_split_percent || 80,
      valSplitPercent: config.val_split_percent || 10,   // Изменено
      testSplitPercent: config.test_split_percent || 10, // Добавлено
      images: images, 
      imageCount: images.length,
      loadedAnnotations: annotated_images || {}
    };
    
    setCollections(prev => {
      const filtered = prev.filter(c => c.id !== newCollection.id);
      return [...filtered, newCollection];
    });
    
    return newCollection.id;
  };

  return { collections, isLoadingCollections, addCollection, removeCollection, updateCollection, getCollection, syncCollection, toggleFolderState, loadProject };
}

export default useCollections;