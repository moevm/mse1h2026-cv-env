import { useCallback, useEffect, useState } from "react";
import { serializeFolders } from "../utils/fileSystem";
import { saveCollections, loadCollections } from "../utils/persistence";
import { deleteStoredDataset, getStoredDatasets, updateProjectOnBackend, scanFolderOnBackend, getImageUrl } from "../services/api";

const DEFAULT_TRAIN_SPLIT_PERCENT = 80;

function mergeTrees(oldNodes = [], newNodes = []) {
  return newNodes.map(newNode => {
    const oldNode = oldNodes.find(n => n.path === newNode.path);
    
    if (oldNode) {
      return {
        ...newNode,
        isEnabled: oldNode.isEnabled,
        children: mergeTrees(oldNode.children, newNode.children)
      };
    }
    
    return {
      ...newNode,
      isEnabled: true, 
    };
  });
}

function buildImagesWithAnnotations(files, loadedAnnotations = {}) {
  const imageFiles = files.filter((f) => f.type.startsWith("image/"));
  const txtFiles = files.filter((f) => f.type === "text/plain");

  const txtByStem = new Map(
    txtFiles.map((file) => [
      file.relativePath.replace(/\\/g, "/").replace(/\.txt$/i, "").toLowerCase(),
      file,
    ])
  );

  return imageFiles.map((file) => {
    const stemKey = file.relativePath.replace(/\\/g, "/").replace(/\.[^.]+$/u, "").toLowerCase();
    const annotationTextFromBackend = loadedAnnotations[stemKey] || null;

    return {
      file: file,
      url: getImageUrl(file.absolute_path),
      name: file.name,
      type: file.type,
      size: file.size,
      relativePath: file.relativePath,
      split: null,
      annotationFile: txtByStem.get(stemKey) || null,
      annotationText: annotationTextFromBackend,
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
    if (!isLoadingCollections) {
      saveCollections(collections);
    }
  }, [collections, isLoadingCollections]);

  const addCollection = (projectName, workspacePath, customId = null) => {
    const newCollection = {
      id: customId || Date.now().toString(),
      name: projectName,
      workspacePath: workspacePath,
      date: new Date().toISOString(),
      images: [],
      folders: [],
      imageCount: 0
    };
    setCollections(prev => [...prev, newCollection]);
    return newCollection.id;
  };

  const toggleFolderState = (collectionId, targetPath, newIsEnabled) => {
    setCollections((prev) => prev.map((col) => {
      if (col.id !== collectionId) return col;

      const setDescendants = (nodes, val) => nodes.map(n => ({
        ...n,
        isEnabled: val,
        children: n.children ? setDescendants(n.children, val) : []
      }));

      const updateTree = (nodes) => {
        return nodes.map(node => {

          if (node.path === targetPath) {
            return {
              ...node,
              isEnabled: newIsEnabled,
              children: node.children ? setDescendants(node.children, newIsEnabled) : []
            };
          }

          if (targetPath.startsWith(node.path + '/')) {
            const updatedChildren = updateTree(node.children || []);

            const nextEnabled = newIsEnabled ? true : node.isEnabled;

            return {
              ...node,
              isEnabled: nextEnabled,
              children: updatedChildren
            };
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

  const getCollection = (collectionId) => {
    return collections.find((c) => c.id === collectionId);
  };

  const updateCollection = (collectionId, updatedData) => {
    setCollections((prev) =>
      prev.map((c) => (c.id === collectionId ? { ...c, ...updatedData } : c)),
    );
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
        console.warn("Папка старого формата (без absolutePath), пропуск:", folderNode.name);
        updatedFolders.push(folderNode);
        continue; 
      }

      const scanResult = await scanFolderOnBackend(folderNode.absolutePath, folderNode.path);
      const mergedChildren = mergeTrees(folderNode.children || [], scanResult.tree || []);

      allUpdatedFiles.push(...scanResult.files);
      updatedFolders.push({
        ...folderNode,
        children: mergedChildren
      });
    }

    const images = buildImagesWithAnnotations(allUpdatedFiles, collection.loadedAnnotations || {});

    setCollections((prev) =>
      prev.map((c) =>
        c.id === collectionId 
          ? { ...c, images, imageCount: images.length, folders: updatedFolders } 
          : c
      )
    );
  };

  const debounceSync = useCallback((collection) => {
    if (!collection.workspacePath) return;

    const payload = {
      id: collection.id,
      name: collection.name,
      created_at: collection.date,
      path: collection.workspacePath,
      folders: serializeFolders(collection.folders || []),
      classes: collection.projectClasses || [],
      train_split_percent: collection.trainSplitPercent || 80,
      val_split_percent: collection.valSplitPercent || 20
    };

    updateProjectOnBackend(payload).catch(err => {
      console.error("Ошибка фоновой синхронизации YAML:", err);
    });
  }, []);

  useEffect(() => {
    if (isLoadingCollections || collections.length === 0) return;

    const timeoutId = setTimeout(() => {
      collections.forEach(col => debounceSync(col));
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [collections, isLoadingCollections, debounceSync]);

  const loadProject = async (backendData) => {
    const { config, annotated_images } = backendData;
    
    let allUpdatedFiles = [];
    const updatedFolders = [];

    if (config.folders && config.folders.length > 0) {
      for (const folderNode of config.folders) {
        if (!folderNode.absolutePath) {
          console.warn("Папка старого формата, пропускаем автосканирование:", folderNode.name);
          updatedFolders.push(folderNode);
          continue;
        }

        try {
          const scanResult = await scanFolderOnBackend(folderNode.absolutePath, folderNode.path);
          
          const mergedChildren = mergeTrees(folderNode.children || [], scanResult.tree || []);
          
          allUpdatedFiles.push(...scanResult.files);
          updatedFolders.push({
            ...folderNode,
            children: mergedChildren
          });
        } catch (error) {
          console.error("Ошибка при автосканировании папки:", folderNode.name, error);
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
      valSplitPercent: config.val_split_percent || 20,
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

  return {
    collections,
    isLoadingCollections,
    addCollection,
    removeCollection,
    updateCollection,
    getCollection,
    syncCollection,
    toggleFolderState,
    loadProject,
  };
}

export default useCollections;
