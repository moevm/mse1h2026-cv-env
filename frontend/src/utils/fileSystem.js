export const serializeFolders = (nodes) => {
  return nodes.map(node => ({
    name: node.name,
    path: node.path,
    absolutePath: node.absolutePath,
    isEnabled: node.isEnabled,
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