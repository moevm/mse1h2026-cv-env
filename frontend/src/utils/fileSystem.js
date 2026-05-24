export const serializeFolders = (nodes) => {
  return nodes.map(node => ({
    name: node.name,
    path: node.path,
    absolutePath: node.absolutePath,
    isEnabled: node.isEnabled,
    // Сохраняем folderType/видео-поля, иначе при перечитывании project.yaml видео-папки теряют тип и сканируются как фото.
    ...(node.folderType ? { folderType: node.folderType } : {}),
    ...(node.framesDir ? { framesDir: node.framesDir } : {}),
    ...(node.frameInterval != null ? { frameInterval: node.frameInterval } : {}),
    children: node.children ? serializeFolders(node.children) : []
  }));
};

export function getDisabledFolderPaths(folders) {
  const disabledPaths = [];
  
  const traverse = (nodes) => {
    if (!nodes) return;
    for (const node of nodes) {
      if (!node.isEnabled) {
        disabledPaths.push(node.path);
      } else {
        traverse(node.children);
      }
    }
  };
  
  traverse(folders);
  return disabledPaths;
}