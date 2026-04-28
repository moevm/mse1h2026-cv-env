import { useCallback, useEffect, useState } from "react";
import { getAllFilesFromDirectory, buildFolderTree, serializeFolders } from "../utils/fileSystem";
import { saveCollections, loadCollections } from "../utils/persistence";
import { deleteStoredDataset, getStoredDatasets, updateProjectOnBackend } from "../services/api";

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

  const requestFolderAccess = async (folderNode) => {
    try {
      if (await folderNode.handle.queryPermission({ mode: 'read' }) === 'granted') return true;
      return await folderNode.handle.requestPermission({ mode: 'read' }) === 'granted';
    } catch (e) {
      console.error("Доступ к папке отклонен", e);
      return false;
    }
  };

  const toggleFolderState = (collectionId, targetPath, isEnabled) => {
    setCollections((prev) => prev.map((col) => {
      if (col.id !== collectionId) return col;

      const updateNode = (nodes) => nodes.map((node) => {
        if (node.path === targetPath) {
          const setChildrenState = (children) => children.map((c) => ({ 
            ...c, isEnabled, children: setChildrenState(c.children) 
          }));
          return { ...node, isEnabled, children: setChildrenState(node.children) };
        }
        if (node.children?.length) {
          return { ...node, children: updateNode(node.children) };
        }
        return node;
      });

      return { ...col, folders: updateNode(col.folders || []) };
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

  const syncCollection = async (collectionId) => {
    const collection = collections.find((c) => c.id === collectionId);
    if (!collection || !collection.folders) return;

    let allUpdatedFiles = [];
    const updatedFolders = [];

    for (const folderNode of collection.folders) {
      const hasAccess = await requestFolderAccess(folderNode);
      if (!hasAccess) {
        updatedFolders.push(folderNode);
        continue;
      }

      const freshFiles = await getAllFilesFromDirectory(folderNode.handle, folderNode.path);
      
      const freshTree = await buildFolderTree(folderNode.handle, folderNode.path);
      
      const mergedChildren = mergeTrees(folderNode.children || [], freshTree || []);

      allUpdatedFiles.push(...freshFiles);
      updatedFolders.push({
        ...folderNode,
        children: mergedChildren
      });
    }

    const images = buildImagesWithAnnotations(allUpdatedFiles);

    setCollections((prev) =>
      prev.map((c) =>
        c.id === collectionId 
          ? { ...c, images, imageCount: images.length, folders: updatedFolders } 
          : c
      ),
    );
  };

  const debounceSync = useCallback((collection) => {
    if (!collection.workspacePath) return;

    const payload = {
      id: collection.id,
      name: collection.name,
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

  return {
    collections,
    isLoadingCollections,
    addCollection,
    removeCollection,
    updateCollection,
    requestFolderAccess,
    getCollection,
    syncCollection,
    toggleFolderState,
  };
}

export default useCollections;
