// src/utils/fileSystem.js
export async function getAllFilesFromDirectory(dirHandle, relativePath = '') {
  let files = [];
  for await (const [name, handle] of dirHandle.entries()) {
    const currentPath = relativePath ? `${relativePath}/${name}` : name;
    if (handle.kind === 'file') {
      const file = await handle.getFile();
      file.relativePath = currentPath; // attach relative path for later use
      files.push(file);
    } else if (handle.kind === 'directory') {
      const subFiles = await getAllFilesFromDirectory(handle, currentPath);
      files.push(...subFiles);
    }
  }
  return files;
}

export async function buildFolderTree(dirHandle, relativePath = '') {
  const children = [];
  
  for await (const [name, handle] of dirHandle.entries()) {
    const currentPath = relativePath ? `${relativePath}/${name}` : name;
    
    if (handle.kind === 'directory') {
      const subChildren = await buildFolderTree(handle, currentPath);
      children.push({
        name,
        path: currentPath,
        handle,
        isEnabled: true,
        children: subChildren,
      });
    }
  }
  
  return children.sort((a, b) => a.name.localeCompare(b.name));
}

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