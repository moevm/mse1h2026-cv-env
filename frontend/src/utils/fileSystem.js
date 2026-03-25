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
